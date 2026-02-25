import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Lead, { ILead, LeadStatus, LeadType, LeadSource, LeadPriority } from '../DataBase/Schema/Leads.schema';
import Activity, { ActivityType } from '../DataBase/Schema/Activity.schema';
import Company from '../DataBase/Schema/company.schema';

// User roles enum (import from your user schema)
export enum USER_ROLES {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user',
  EMPLOYEE = 'employee'
}

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: USER_ROLES;
    companyId: string;
  };
}

export default class LeadController {
  // 🔒 COMPANY ISOLATION HELPER
  private buildCompanyQuery(currentUser: any, additionalFilters: any = {}) {
    const query: any = { isDeleted: false, ...additionalFilters };
    
    if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
      query.company = new mongoose.Types.ObjectId(currentUser.companyId);
    }
    return query;
  }

  // 📝 LOG ACTIVITY HELPER
  private async logActivity(
    leadId: string,
    companyId: string,
    type: ActivityType,
    title: string,
    performedBy: string,
    options: {
      description?: string;
      previousValue?: any;
      newValue?: any;
      metadata?: any;
    } = {}
  ) {
    try {
      await Activity.create({
        leadId: new mongoose.Types.ObjectId(leadId),
        companyId: new mongoose.Types.ObjectId(companyId),
        type,
        title,
        performedBy: new mongoose.Types.ObjectId(performedBy),
        description: options.description,
        previousValue: options.previousValue,
        newValue: options.newValue,
        metadata: options.metadata,
        activityDate: new Date()
      });
    } catch (error) {
      console.error('Activity logging error:', error);
      // Don't throw - activity logging should not break main flow
    }
  }

  // ➕ CREATE LEAD
  async createLead(req: AuthRequest, res: Response) {
    try {
      const { 
        name, email, phone, website, address, googleMapUrl, whatsapp,
        status = LeadStatus.CREATED, 
        type = LeadType.LEAD,
        source = LeadSource.OTHER,
        priority = LeadPriority.MEDIUM,
        isFavorite = false,
        estimatedValue,
        tags = [],
        assignedTo,
        nextFollowUp
      } = req.body;
      const currentUser = req.user!;

      // Validate required fields
      if (!name) {
        return res.status(400).json({ message: 'Lead name is required' });
      }

      // Enforce company ownership
      let companyId = currentUser.companyId;
      if (currentUser.role === USER_ROLES.SUPER_ADMIN && req.body.company) {
        const validCompany = await Company.findById(req.body.company);
        if (!validCompany?.isActive) {
          return res.status(400).json({ message: 'Invalid or inactive company' });
        }
        companyId = req.body.company;
      }
      // Validate enums
      if (!Object.values(LeadStatus).includes(status)) {
        return res.status(400).json({ message: 'Invalid lead status' });
      }
      if (!Object.values(LeadType).includes(type)) {
        return res.status(400).json({ message: 'Invalid lead type' });
      }
      if (!Object.values(LeadSource).includes(source)) {
        return res.status(400).json({ message: 'Invalid lead source' });
      }
      if (!Object.values(LeadPriority).includes(priority)) {
        return res.status(400).json({ message: 'Invalid priority level' });
      }

      // Create lead
      const newLead = await Lead.create({
        name,
        email: email?.toLowerCase(),
        phone,
        website,
        address,
        googleMapUrl,
        whatsapp,
        status,
        type,
        source,
        priority,
        isFavorite,
        estimatedValue,
        tags,
        assignedTo: assignedTo ? new mongoose.Types.ObjectId(assignedTo) : undefined,
        nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : undefined,
        company: new mongoose.Types.ObjectId(companyId),
        createdBy: new mongoose.Types.ObjectId(currentUser.id),
        statusUpdatedAt: new Date(),
        lastActivityAt: new Date()
      });

      // Calculate initial score
      // await newLead.updateScore();
      await newLead.save();

      // Log activity
      await this.logActivity(
        newLead._id.toString(),
        companyId,
        ActivityType.LEAD_CREATED,
        `Lead "${name}" created`,
        currentUser.id,
        {
          description: `New ${type} from ${source}`,
          metadata: { source, priority }
        }
      );

      res.status(201).json({
        message: 'Lead created successfully',
        lead: newLead
      });
    } catch (error: any) {
      if (error.code === 11000) {
        return res.status(409).json({ 
          message: 'Lead with this email or phone already exists in your company' 
        });
      }
      console.error('Lead creation error:', error);
      res.status(500).json({ 
        message: 'Failed to create lead',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // 📋 GET LEADS WITH ADVANCED FILTERING & PAGINATION
  async getLeads(req: AuthRequest, res: Response) {
    try {
      const { 
        status, type, source, priority, isFavorite, 
        assignedTo, tags, search,
        minScore, maxScore,
        minValue, maxValue,
        overdueFollowUp,
        dateFrom, dateTo,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = '1', 
        limit = '20' 
      } = req.query;
      const currentUser = req.user!;

      // Build base query with company isolation
      const query: any = this.buildCompanyQuery(currentUser);
      
      // Apply filters
      if (status) query.status = status;
      if (type) query.type = type;
      if (source) query.source = source;
      if (priority) query.priority = priority;
      if (isFavorite !== undefined) query.isFavorite = isFavorite === 'true';
      if (assignedTo) query.assignedTo = new mongoose.Types.ObjectId(assignedTo as string);
      
      // Tags filter
      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        query.tags = { $in: tagArray };
      }

      // Score range filter
      if (minScore !== undefined || maxScore !== undefined) {
        query.score = {};
        if (minScore !== undefined) query.score.$gte = Number(minScore);
        if (maxScore !== undefined) query.score.$lte = Number(maxScore);
      }

      // Value range filter
      if (minValue !== undefined || maxValue !== undefined) {
        query.estimatedValue = {};
        if (minValue !== undefined) query.estimatedValue.$gte = Number(minValue);
        if (maxValue !== undefined) query.estimatedValue.$lte = Number(maxValue);
      }

      // Overdue follow-ups
      if (overdueFollowUp === 'true') {
        query.nextFollowUp = { $lte: new Date() };
        query.status = { $nin: [LeadStatus.WON, LeadStatus.LOST] };
      }

      // Date range filter
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom as string);
        if (dateTo) query.createdAt.$lte = new Date(dateTo as string);
      }

      // Search functionality
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { website: { $regex: search, $options: 'i' } }
        ];
      }

      // Pagination
      const pageNum = Math.max(1, parseInt(page as string, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
      const skip = (pageNum - 1) * limitNum;

      // Sorting
      const sortOptions: any = {};
      const validSortFields = ['createdAt', 'updatedAt', 'name', 'score', 'priority', 'nextFollowUp', 'lastContacted'];
      if (validSortFields.includes(sortBy as string)) {
        sortOptions[sortBy as string] = sortOrder === 'asc' ? 1 : -1;
      } else {
        sortOptions.createdAt = -1;
      }

      // Execute query
      const [leads, total] = await Promise.all([
        Lead.find(query)
          .select('-isDeleted -__v')
          .populate('company', 'name type')
          .populate('assignedTo', 'name email')
          .populate('createdBy', 'name email')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Lead.countDocuments(query)
      ]);

      res.json({
        leads,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum
        }
      });
    } catch (error: any) {
      console.error('Lead fetch error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch leads',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 🔍 GET SINGLE LEAD WITH ACTIVITY TIMELINE
  async getLeadById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const { includeTimeline = 'true' } = req.query;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid lead ID' });
      }

      const query = this.buildCompanyQuery(currentUser, { _id: id });
      const lead = await Lead.findOne(query)
        .populate('company', 'name type')
        .populate('assignedTo', 'name email avatar')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .lean();

      if (!lead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      // Include activity timeline if requested
      let timeline = null;
      if (includeTimeline === 'true') {
        timeline = await Activity.find({ leadId: id })
          .sort({ activityDate: -1 })
          .limit(50)
          .populate('performedBy', 'name email')
          .populate('assignedTo', 'name email')
          .lean();
      }

      res.json({
        lead,
        timeline
      });
    } catch (error: any) {
      res.status(500).json({ 
        message: 'Failed to fetch lead',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // ✏️ UPDATE LEAD
  async updateLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const updateFields = req.body;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid lead ID' });
      }

      // Get current lead for change tracking
      const query = this.buildCompanyQuery(currentUser, { _id: id });
      const currentLead = await Lead.findOne(query);
      
      if (!currentLead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      // Only allow specific field updates
      const allowedFields = [
        'name', 'email', 'phone', 'website', 'address', 
        'googleMapUrl', 'whatsapp', 'estimatedValue', 'tags'
      ];
      
      const sanitizedUpdates: any = {};
      let changes: string[] = [];

      for (const key of Object.keys(updateFields)) {
        if (allowedFields.includes(key)) {
          const newValue = key === 'email' ? updateFields[key]?.toLowerCase() : updateFields[key];
          if (JSON.stringify(currentLead[key as keyof ILead]) !== JSON.stringify(newValue)) {
            sanitizedUpdates[key] = newValue;
            changes.push(key);
          }
        }
      }

      if (Object.keys(sanitizedUpdates).length === 0) {
        return res.status(400).json({ message: 'No valid changes detected' });
      }

      // Update lead
      sanitizedUpdates.updatedBy = new mongoose.Types.ObjectId(currentUser.id);
      sanitizedUpdates.lastActivityAt = new Date();

      const updatedLead = await Lead.findOneAndUpdate(
        query,
        { $set: sanitizedUpdates },
        { new: true, runValidators: true }
      ).lean();

      // Log activity
      await this.logActivity(
        id,
        currentUser.companyId,
        ActivityType.LEAD_UPDATED,
        'Lead information updated',
        currentUser.id,
        {
          description: `Updated fields: ${changes.join(', ')}`,
          metadata: { fields: changes }
        }
      );

      res.json({ 
        message: 'Lead updated successfully', 
        lead: updatedLead 
      });
    } catch (error: any) {
      if (error.code === 11000) {
        return res.status(409).json({ 
          message: 'Lead with this email or phone already exists' 
        });
      }
      console.error('Lead update error:', error);
      res.status(500).json({ 
        message: 'Failed to update lead',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 🚦 UPDATE STATUS
  async updateLeadStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const { status, notes } = req.body;
      const currentUser = req.user!;

      if (!status || !Object.values(LeadStatus).includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }

      const query = this.buildCompanyQuery(currentUser, { _id: id });
      const currentLead = await Lead.findOne(query);

      if (!currentLead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      const previousStatus = currentLead.status;
      
      // Update status
      const updateData: any = {
        status,
        statusUpdatedAt: new Date(),
        lastActivityAt: new Date(),
        updatedBy: new mongoose.Types.ObjectId(currentUser.id)
      };

      // Track conversion/loss dates
      if (status === LeadStatus.WON && previousStatus !== LeadStatus.WON) {
        updateData.convertedAt = new Date();
      } else if (status === LeadStatus.LOST && previousStatus !== LeadStatus.LOST) {
        updateData.lostAt = new Date();
      }

      const lead = await Lead.findOneAndUpdate(
        query,
        { $set: updateData },
        { new: true }
      );

      // Update score
      if (lead) {
        // await lead.updateScore();
        await lead.save();
      }

      // Log activity
      await this.logActivity(
        id,
        currentUser.companyId,
        ActivityType.STATUS_CHANGED,
        `Status changed: ${previousStatus} → ${status}`,
        currentUser.id,
        {
          description: notes,
          previousValue: previousStatus,
          newValue: status
        }
      );

      res.json({ 
        message: 'Status updated successfully', 
        lead 
      });
    } catch (error: any) {
      console.error('Status update error:', error);
      res.status(500).json({ 
        message: 'Failed to update status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 🏷️ UPDATE TYPE
  async updateLeadType(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const { type } = req.body;
      const currentUser = req.user!;

      if (!type || !Object.values(LeadType).includes(type)) {
        return res.status(400).json({ message: 'Invalid type value' });
      }

      const query = this.buildCompanyQuery(currentUser, { _id: id });
      const currentLead = await Lead.findOne(query);

      if (!currentLead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      const previousType = currentLead.type;

      const lead = await Lead.findOneAndUpdate(
        query,
        { 
          type, 
          lastActivityAt: new Date(),
          updatedBy: new mongoose.Types.ObjectId(currentUser.id) 
        },
        { new: true }
      ).lean();

      // Log activity
      await this.logActivity(
        id,
        currentUser.companyId,
        ActivityType.TYPE_CHANGED,
        `Type changed: ${previousType} → ${type}`,
        currentUser.id,
        {
          previousValue: previousType,
          newValue: type
        }
      );

      res.json({ message: 'Type updated successfully', lead });
    } catch (error: any) {
      res.status(500).json({ 
        message: 'Failed to update type',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 🎯 UPDATE PRIORITY
  async updateLeadPriority(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const { priority } = req.body;
      const currentUser = req.user!;

      if (!priority || !Object.values(LeadPriority).includes(priority)) {
        return res.status(400).json({ message: 'Invalid priority value' });
      }

      const query = this.buildCompanyQuery(currentUser, { _id: id });
      const currentLead = await Lead.findOne(query);

      if (!currentLead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      const previousPriority = currentLead.priority;

      const lead = await Lead.findOneAndUpdate(
        query,
        { 
          priority,
          lastActivityAt: new Date(),
          updatedBy: new mongoose.Types.ObjectId(currentUser.id) 
        },
        { new: true }
      ).lean();

      // Log activity
      await this.logActivity(
        id,
        currentUser.companyId,
        ActivityType.PRIORITY_CHANGED,
        `Priority changed: ${previousPriority} → ${priority}`,
        currentUser.id,
        {
          previousValue: previousPriority,
          newValue: priority
        }
      );

      res.json({ message: 'Priority updated successfully', lead });
    } catch (error: any) {
      res.status(500).json({ 
        message: 'Failed to update priority',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 👤 ASSIGN LEAD
  async assignLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const { assignedTo } = req.body;
      const currentUser = req.user!;

      if (!assignedTo || !mongoose.Types.ObjectId.isValid(assignedTo)) {
        return res.status(400).json({ message: 'Invalid user ID for assignment' });
      }

      const query = this.buildCompanyQuery(currentUser, { _id: id });
      const currentLead = await Lead.findOne(query);

      if (!currentLead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      const previousAssignee = currentLead.assignedTo;

      const lead = await Lead.findOneAndUpdate(
        query,
        { 
          assignedTo: new mongoose.Types.ObjectId(assignedTo),
          lastActivityAt: new Date(),
          updatedBy: new mongoose.Types.ObjectId(currentUser.id) 
        },
        { new: true }
      )
      .populate('assignedTo', 'name email')
      .lean();

      // Log activity
      await this.logActivity(
        id,
        currentUser.companyId,
        ActivityType.LEAD_ASSIGNED,
        'Lead reassigned',
        currentUser.id,
        {
          description: `Assigned to ${(lead?.assignedTo as any)?.name}`,
          previousValue: previousAssignee,
          newValue: assignedTo,
          metadata: { assignedTo }
        }
      );

      res.json({ message: 'Lead assigned successfully', lead });
    } catch (error: any) {
      res.status(500).json({ 
        message: 'Failed to assign lead',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // ⭐ TOGGLE FAVORITE
  async toggleFavorite(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { isFavorite } = req.body;
      const currentUser = req.user!;

      if (typeof isFavorite !== 'boolean') {
        return res.status(400).json({ message: 'isFavorite must be boolean' });
      }

      const query = this.buildCompanyQuery(currentUser, { _id: id });
      const lead = await Lead.findOneAndUpdate(
        query,
        { 
          isFavorite, 
          lastActivityAt: new Date(),
          updatedBy: new mongoose.Types.ObjectId(currentUser.id) 
        },
        { new: true }
      ).lean();

      if (!lead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      res.json({ 
        message: `Lead ${isFavorite ? 'added to' : 'removed from'} favorites`,
        lead 
      });
    } catch (error: any) {
      res.status(500).json({ 
        message: 'Failed to update favorite status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 📅 SCHEDULE FOLLOW-UP
  async scheduleFollowUp(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const { followUpDate, notes } = req.body;
      const currentUser = req.user!;

      if (!followUpDate) {
        return res.status(400).json({ message: 'Follow-up date is required' });
      }

      const followUpDateTime = new Date(followUpDate);
      if (followUpDateTime < new Date()) {
        return res.status(400).json({ message: 'Follow-up date must be in the future' });
      }

      const query = this.buildCompanyQuery(currentUser, { _id: id });
      const lead = await Lead.findOneAndUpdate(
        query,
        { 
          nextFollowUp: followUpDateTime,
          lastActivityAt: new Date(),
          updatedBy: new mongoose.Types.ObjectId(currentUser.id) 
        },
        { new: true }
      ).lean();

      if (!lead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      // Log activity
      await this.logActivity(
        id,
        currentUser.companyId,
        ActivityType.FOLLOW_UP_SCHEDULED,
        'Follow-up scheduled',
        currentUser.id,
        {
          description: notes || `Scheduled for ${followUpDateTime.toLocaleDateString()}`,
          metadata: { followUpDate: followUpDateTime }
        }
      );

      res.json({ 
        message: 'Follow-up scheduled successfully', 
        lead 
      });
    } catch (error: any) {
      res.status(500).json({ 
        message: 'Failed to schedule follow-up',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 📝 ADD NOTE
  async addNote(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const { note } = req.body;
      const currentUser = req.user!;

      if (!note || note.trim().length === 0) {
        return res.status(400).json({ message: 'Note content is required' });
      }

      const query = this.buildCompanyQuery(currentUser, { _id: id });
      const lead = await Lead.findOne(query);

      if (!lead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      // Update last activity
      lead.lastActivityAt = new Date();
      await lead.save();

      // Log activity
      await this.logActivity(
        id,
        currentUser.companyId,
        ActivityType.NOTE_ADDED,
        'Note added',
        currentUser.id,
        {
          description: note,
          metadata: { noteLength: note.length }
        }
      );

      res.json({ message: 'Note added successfully' });
    } catch (error: any) {
      res.status(500).json({ 
        message: 'Failed to add note',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 🗑️ SOFT DELETE
  async deleteLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid lead ID' });
      }

      const query = currentUser.role === USER_ROLES.SUPER_ADMIN 
        ? { _id: id, isDeleted: false } 
        : this.buildCompanyQuery(currentUser, { _id: id });

      const lead = await Lead.findOneAndUpdate(
        query,
        { 
          isDeleted: true, 
          deletedBy: new mongoose.Types.ObjectId(currentUser.id),
          deletedAt: new Date()
        },
        { new: true }
      );

      if (!lead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      res.json({ message: 'Lead moved to trash successfully' });
    } catch (error: any) {
      res.status(500).json({ 
        message: 'Failed to delete lead',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 📦 BULK STATUS UPDATE
  async bulkUpdateStatus(req: AuthRequest, res: Response) {
    try {
      const { leadIds, status } = req.body;
      const currentUser = req.user!;

      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: 'leadIds must be non-empty array' });
      }
      if (!status || !Object.values(LeadStatus).includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }

      const query: any = {
        _id: { $in: leadIds.map((id: string) => new mongoose.Types.ObjectId(id)) },
        isDeleted: false
      };
      
      if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        query.company = new mongoose.Types.ObjectId(currentUser.companyId);
      }

      const result = await Lead.updateMany(
        query,
        { 
          status,
          statusUpdatedAt: new Date(),
          lastActivityAt: new Date(),
          updatedBy: new mongoose.Types.ObjectId(currentUser.id)
        }
      );

      // Log activities for each lead
      for (const leadId of leadIds) {
        await this.logActivity(
          leadId,
          currentUser.companyId,
          ActivityType.STATUS_CHANGED,
          `Bulk status update to ${status}`,
          currentUser.id,
          {
            newValue: status,
            metadata: { bulkOperation: true }
          }
        );
      }

      res.json({
        message: 'Bulk status update successful',
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      });
    } catch (error: any) {
      console.error('Bulk update error:', error);
      res.status(500).json({ 
        message: 'Bulk update failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 📊 ANALYTICS - LEAD PIPELINE OVERVIEW
  async getLeadAnalytics(req: AuthRequest, res: Response) {
    try {
      const currentUser = req.user!;
      const { dateFrom, dateTo } = req.query;

      const companyId = currentUser.role === USER_ROLES.SUPER_ADMIN && req.query.companyId
        ? req.query.companyId
        : currentUser.companyId;

      const dateFilter: any = {};
      if (dateFrom) dateFilter.$gte = new Date(dateFrom as string);
      if (dateTo) dateFilter.$lte = new Date(dateTo as string);

      const matchQuery: any = {
        company: new mongoose.Types.ObjectId(companyId as string),
        isDeleted: false
      };

      if (Object.keys(dateFilter).length > 0) {
        matchQuery.createdAt = dateFilter;
      }

      // Aggregate pipeline analytics
      const [
        statusDistribution,
        typeDistribution,
        sourceDistribution,
        priorityDistribution,
        scoreDistribution
      ] = await Promise.all([
        // Status distribution
        Lead.aggregate([
          { $match: matchQuery },
          { $group: { _id: '$status', count: { $sum: 1 }, totalValue: { $sum: '$estimatedValue' } } },
          { $sort: { count: -1 } }
        ]),
        // Type distribution
        Lead.aggregate([
          { $match: matchQuery },
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        // Source distribution
        Lead.aggregate([
          { $match: matchQuery },
          { $group: { _id: '$source', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        // Priority distribution
        Lead.aggregate([
          { $match: matchQuery },
          { $group: { _id: '$priority', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        // Score ranges
        Lead.aggregate([
          { $match: matchQuery },
          {
            $bucket: {
              groupBy: '$score',
              boundaries: [0, 20, 40, 60, 80, 100],
              default: 'Other',
              output: { count: { $sum: 1 } }
            }
          }
        ])
      ]);

      // Get totals and averages
      const totals = await Lead.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalLeads: { $sum: 1 },
            avgScore: { $avg: '$score' },
            totalEstimatedValue: { $sum: '$estimatedValue' },
            totalActualValue: { $sum: '$actualValue' },
            avgInteractions: { $avg: '$totalInteractions' }
          }
        }
      ]);

      // Get overdue follow-ups count
      const overdueCount = await Lead.countDocuments({
        ...matchQuery,
        nextFollowUp: { $lte: new Date() },
        status: { $nin: [LeadStatus.WON, LeadStatus.LOST] }
      });

      res.json({
        overview: totals[0] || {},
        statusDistribution,
        typeDistribution,
        sourceDistribution,
        priorityDistribution,
        scoreDistribution,
        overdueFollowUps: overdueCount
      });
    } catch (error: any) {
      console.error('Analytics error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch analytics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 📈 GET CONVERSION FUNNEL
  async getConversionFunnel(req: AuthRequest, res: Response) {
    try {
      const currentUser = req.user!;
      const { dateFrom, dateTo } = req.query;

      const companyId = currentUser.role === USER_ROLES.SUPER_ADMIN && req.query.companyId
        ? req.query.companyId
        : currentUser.companyId;

      const dateFilter: any = {};
      if (dateFrom) dateFilter.$gte = new Date(dateFrom as string);
      if (dateTo) dateFilter.$lte = new Date(dateTo as string);

      const matchQuery: any = {
        company: new mongoose.Types.ObjectId(companyId as string),
        isDeleted: false
      };

      if (Object.keys(dateFilter).length > 0) {
        matchQuery.createdAt = dateFilter;
      }

      // Define funnel stages
      const funnelStages = [
        LeadStatus.CREATED,
        LeadStatus.CONTACTED,
        LeadStatus.QUALIFIED,
        LeadStatus.PROPOSAL_SENT,
        LeadStatus.NEGOTIATION,
        LeadStatus.WON
      ];

      const funnel = await Promise.all(
        funnelStages.map(async (stage) => {
          const count = await Lead.countDocuments({
            ...matchQuery,
            status: stage
          });
          return { stage, count };
        })
      );

      // Calculate conversion rates
      const totalLeads = await Lead.countDocuments(matchQuery);
      const wonLeads = await Lead.countDocuments({
        ...matchQuery,
        status: LeadStatus.WON
      });
      const lostLeads = await Lead.countDocuments({
        ...matchQuery,
        status: LeadStatus.LOST
      });

      const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
      const lossRate = totalLeads > 0 ? (lostLeads / totalLeads) * 100 : 0;

      res.json({
        funnel,
        summary: {
          totalLeads,
          wonLeads,
          lostLeads,
          activeLeads: totalLeads - wonLeads - lostLeads,
          conversionRate: conversionRate.toFixed(2),
          lossRate: lossRate.toFixed(2)
        }
      });
    } catch (error: any) {
      console.error('Funnel error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch conversion funnel',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 🎯 GET OVERDUE FOLLOW-UPS
  async getOverdueFollowUps(req: AuthRequest, res: Response) {
    try {
      const currentUser = req.user!;
      const { assignedTo } = req.query;

      const query: any = {
        isDeleted: false,
        nextFollowUp: { $lte: new Date() },
        status: { $nin: [LeadStatus.WON, LeadStatus.LOST] }
      };

      if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        query.company = new mongoose.Types.ObjectId(currentUser.companyId);
      }

      if (assignedTo) {
        query.assignedTo = new mongoose.Types.ObjectId(assignedTo as string);
      }

      const overdueLeads = await Lead.find(query)
        .select('name email phone status priority nextFollowUp assignedTo')
        .populate('assignedTo', 'name email')
        .sort({ nextFollowUp: 1 })
        .limit(100)
        .lean();

      res.json({
        count: overdueLeads.length,
        leads: overdueLeads
      });
    } catch (error: any) {
      console.error('Overdue follow-ups error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch overdue follow-ups',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }
}