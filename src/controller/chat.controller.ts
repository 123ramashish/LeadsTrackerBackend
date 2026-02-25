import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Chat, { IChat, MessageSender } from '../DataBase/Schema/Chat.schema';
import Lead from '../DataBase/Schema/Leads.schema';
import Activity, { ActivityType } from '../DataBase/Schema/Activity.schema';
import { USER_ROLES } from './lead.controller';

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: USER_ROLES;
    companyId: string;
  };
}

export default class ChatController {
  // 📝 LOG ACTIVITY HELPER
  private async logActivity(
    leadId: string,
    companyId: string,
    type: ActivityType,
    title: string,
    performedBy: string,
    options: {
      description?: string;
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
        metadata: options.metadata,
        activityDate: new Date()
      });
    } catch (error) {
      console.error('Activity logging error:', error);
    }
  }

  // ✉️ SEND MESSAGE TO LEAD
  async createChat(req: AuthRequest, res: Response) {
    try {
      const { leadId, content, fileUrls = [] } = req.body;
      const currentUser = req.user!;

      // Validate input
      if (!leadId) {
        return res.status(400).json({ message: 'Lead ID is required' });
      }

      if (!content && (!fileUrls || fileUrls.length === 0)) {
        return res.status(400).json({ 
          message: 'Message must contain either content or files' 
        });
      }

      if (!mongoose.Types.ObjectId.isValid(leadId)) {
        return res.status(400).json({ message: 'Invalid lead ID' });
      }

      // Verify lead exists and user has access
      const leadQuery: any = { _id: leadId, isDeleted: false };
      if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        leadQuery.company = new mongoose.Types.ObjectId(currentUser.companyId);
      }

      const lead = await Lead.findOne(leadQuery);
      if (!lead) {
        return res.status(404).json({ message: 'Lead not found or access denied' });
      }

      // Validate file URLs
      const validatedFileUrls = Array.isArray(fileUrls) 
        ? fileUrls.filter((url: string) => url && url.trim().length > 0)
        : [];

      // Create chat message
      const chat = await Chat.create({
        leadId: new mongoose.Types.ObjectId(leadId),
        companyId: lead.company,
        sentBy: currentUser.id,
        senderType: MessageSender.ADMIN,
        content: content?.trim(),
        fileUrls: validatedFileUrls,
        sentAt: new Date()
      });

      // Update lead's last contacted timestamp and interaction count
      await Lead.updateOne(
        { _id: leadId },
        { 
          $set: {
            lastContacted: new Date(),
            lastActivityAt: new Date(),
            updatedBy: new mongoose.Types.ObjectId(currentUser.id)
          },
          $inc: {
            totalInteractions: 1,
            emailsSent: 1
          }
        }
      );

      // Update lead score
      const updatedLead = await Lead.findById(leadId);
      if (updatedLead) {
        // await updatedLead.updateScore();
        await updatedLead.save();
      }

      // Log activity
      await this.logActivity(
        leadId,
        lead.company.toString(),
        ActivityType.MESSAGE_SENT,
        'Message sent to lead',
        currentUser.id,
        {
          description: content ? content.substring(0, 100) : 'Sent files',
          metadata: { 
            hasContent: !!content,
            fileCount: validatedFileUrls.length
          }
        }
      );

      res.status(201).json({
        message: 'Message sent successfully',
        chat
      });
    } catch (error: any) {
      console.error('Chat creation error:', error);
      res.status(500).json({ 
        message: 'Failed to send message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 📨 RECEIVE MESSAGE FROM LEAD (Webhook/Integration endpoint)
  async receiveLeadMessage(req: AuthRequest, res: Response) {
    try {
      const { leadId, content, fileUrls = [], leadIdentifier } = req.body;
      
      // Find lead by ID or identifier (email/phone)
      let lead;
      if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
        lead = await Lead.findOne({ _id: leadId, isDeleted: false });
      } else if (leadIdentifier) {
        lead = await Lead.findOne({
          $or: [
            { email: leadIdentifier.toLowerCase() },
            { phone: leadIdentifier }
          ],
          isDeleted: false
        });
      }

      if (!lead) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      // Validate message content
      if (!content && (!fileUrls || fileUrls.length === 0)) {
        return res.status(400).json({ 
          message: 'Message must contain either content or files' 
        });
      }

      // Create chat message from lead
      const chat = await Chat.create({
        leadId: lead._id,
        companyId: lead.company,
        sentBy: 'lead',
        senderType: MessageSender.LEAD,
        content: content?.trim(),
        fileUrls: Array.isArray(fileUrls) ? fileUrls : [],
        sentAt: new Date()
      });

      // Update lead's last activity and interaction count
      await Lead.updateOne(
        { _id: lead._id },
        { 
          $set: {
            lastActivityAt: new Date()
          },
          $inc: {
            totalInteractions: 1
          }
        }
      );

      // Log activity
      await this.logActivity(
        lead._id.toString(),
        lead.company.toString(),
        ActivityType.MESSAGE_RECEIVED,
        'Message received from lead',
        lead._id.toString(), // Lead is the performer
        {
          description: content ? content.substring(0, 100) : 'Received files',
          metadata: { 
            hasContent: !!content,
            fileCount: fileUrls.length
          }
        }
      );

      res.status(201).json({
        message: 'Message received successfully',
        chat
      });
    } catch (error: any) {
      console.error('Lead message receive error:', error);
      res.status(500).json({ 
        message: 'Failed to receive message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 📜 GET CHAT HISTORY FOR LEAD
  async getChatHistory(req: AuthRequest, res: Response) {
    try {
      const { leadId } = req.params as any;
      const { limit = 50, page = 1 } = req.query;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(leadId)) {
        return res.status(400).json({ message: 'Invalid lead ID' });
      }

      // Verify lead access with company isolation
      const leadQuery: any = { _id: leadId, isDeleted: false };
      if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        leadQuery.company = new mongoose.Types.ObjectId(currentUser.companyId);
      }

      const lead = await Lead.findOne(leadQuery).lean();
      if (!lead) {
        return res.status(404).json({ message: 'Lead not found or access denied' });
      }

      // Pagination
      const pageNum = Math.max(1, parseInt(page as string, 10));
      const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10)));
      const skip = (pageNum - 1) * limitNum;

      // Fetch messages
      const [messages, total, unreadCount] = await Promise.all([
        Chat.find({ leadId })
          .sort({ sentAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Chat.countDocuments({ leadId }),
        Chat.getUnreadCount(leadId, currentUser.id)
      ]);

      // Reverse to show oldest first
      const reversedMessages = messages.reverse();

      res.json({ 
        lead: { 
          id: lead._id, 
          name: lead.name, 
          email: lead.email,
          phone: lead.phone,
          status: lead.status
        },
        messages: reversedMessages,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum
        },
        unreadCount
      });
    } catch (error: any) {
      console.error('Chat history error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch chat history',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 👁️ MARK MESSAGES AS READ
  async markLeadMessagesAsRead(req: AuthRequest, res: Response) {
    try {
      const { leadId } = req.params as any;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(leadId)) {
        return res.status(400).json({ message: 'Invalid lead ID' });
      }

      // Verify lead access
      const leadQuery: any = { _id: leadId, isDeleted: false };
      if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        leadQuery.company = new mongoose.Types.ObjectId(currentUser.companyId);
      }

      const leadExists = await Lead.exists(leadQuery);
      if (!leadExists) {
        return res.status(404).json({ message: 'Lead not found or access denied' });
      }

      // Mark messages as read
      const result = await Chat.markAsRead(leadId, currentUser.id);

      res.json({
        message: 'Messages marked as read',
        markedCount: result.modifiedCount || 0
      });
    } catch (error: any) {
      console.error('Mark as read error:', error);
      res.status(500).json({ 
        message: 'Failed to mark messages as read',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 📊 GET CHAT STATISTICS
  async getChatStatistics(req: AuthRequest, res: Response) {
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
        companyId: new mongoose.Types.ObjectId(companyId as string)
      };

      if (Object.keys(dateFilter).length > 0) {
        matchQuery.sentAt = dateFilter;
      }

      // Aggregate statistics
      const stats = await Chat.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            adminMessages: {
              $sum: { $cond: [{ $eq: ['$senderType', MessageSender.ADMIN] }, 1, 0] }
            },
            leadMessages: {
              $sum: { $cond: [{ $eq: ['$senderType', MessageSender.LEAD] }, 1, 0] }
            },
            messagesWithFiles: {
              $sum: { $cond: [{ $gt: [{ $size: '$fileUrls' }, 0] }, 1, 0] }
            }
          }
        }
      ]);

      // Get average response time
      const responseTimeStats = await Chat.aggregate([
        { $match: { ...matchQuery, senderType: MessageSender.LEAD } },
        {
          $lookup: {
            from: 'chats',
            let: { leadId: '$leadId', sentAt: '$sentAt' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$leadId', '$$leadId'] },
                      { $eq: ['$senderType', MessageSender.ADMIN] },
                      { $gt: ['$sentAt', '$$sentAt'] }
                    ]
                  }
                }
              },
              { $sort: { sentAt: 1 } },
              { $limit: 1 }
            ],
            as: 'response'
          }
        },
        { $unwind: '$response' },
        {
          $project: {
            responseTime: {
              $subtract: ['$response.sentAt', '$sentAt']
            }
          }
        },
        {
          $group: {
            _id: null,
            avgResponseTime: { $avg: '$responseTime' },
            minResponseTime: { $min: '$responseTime' },
            maxResponseTime: { $max: '$responseTime' }
          }
        }
      ]);

      // Get unread messages count
      const unreadCount = await Chat.countDocuments({
        ...matchQuery,
        senderType: MessageSender.LEAD,
        'readBy.userId': { $ne: new mongoose.Types.ObjectId(currentUser.id) }
      });

      // Get most active leads
      const activeLeads = await Chat.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$leadId',
            messageCount: { $sum: 1 },
            lastMessage: { $max: '$sentAt' }
          }
        },
        { $sort: { messageCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'leads',
            localField: '_id',
            foreignField: '_id',
            as: 'lead'
          }
        },
        { $unwind: '$lead' },
        {
          $project: {
            leadId: '$_id',
            leadName: '$lead.name',
            leadEmail: '$lead.email',
            messageCount: 1,
            lastMessage: 1
          }
        }
      ]);

      res.json({
        overview: stats[0] || {
          totalMessages: 0,
          adminMessages: 0,
          leadMessages: 0,
          messagesWithFiles: 0
        },
        responseTime: responseTimeStats[0] || null,
        unreadMessages: unreadCount,
        activeLeads
      });
    } catch (error: any) {
      console.error('Chat statistics error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch chat statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 🔍 SEARCH MESSAGES
  async searchMessages(req: AuthRequest, res: Response) {
    try {
      const { query, leadId } = req.query;
      const currentUser = req.user!;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: 'Search query is required' });
      }

      const matchQuery: any = {
        content: { $regex: query, $options: 'i' }
      };

      // Company isolation
      if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        matchQuery.companyId = new mongoose.Types.ObjectId(currentUser.companyId);
      }

      // Filter by specific lead if provided
      if (leadId && mongoose.Types.ObjectId.isValid(leadId as string)) {
        matchQuery.leadId = new mongoose.Types.ObjectId(leadId as string);
      }

      const messages = await Chat.find(matchQuery)
        .populate('leadId', 'name email phone')
        .sort({ sentAt: -1 })
        .limit(50)
        .lean();

      res.json({
        query,
        count: messages.length,
        messages
      });
    } catch (error: any) {
      console.error('Message search error:', error);
      res.status(500).json({ 
        message: 'Failed to search messages',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 🗑️ DELETE MESSAGE (Admin only)
  async deleteMessage(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as any;
      const currentUser = req.user!;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid message ID' });
      }

      const message = await Chat.findById(id);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Verify company access
      if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        if (message.companyId.toString() !== currentUser.companyId) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }

      // Only allow deleting own messages or if super admin
      if (message.sentBy !== currentUser.id && currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        return res.status(403).json({ 
          message: 'You can only delete your own messages' 
        });
      }

      await Chat.findByIdAndDelete(id);

      res.json({ message: 'Message deleted successfully' });
    } catch (error: any) {
      console.error('Delete message error:', error);
      res.status(500).json({ 
        message: 'Failed to delete message',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }

  // 📬 GET UNREAD MESSAGES COUNT
  async getUnreadCount(req: AuthRequest, res: Response) {
    try {
      const currentUser = req.user!;

      const matchQuery: any = {
        senderType: MessageSender.LEAD,
        'readBy.userId': { $ne: new mongoose.Types.ObjectId(currentUser.id) }
      };

      if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        matchQuery.companyId = new mongoose.Types.ObjectId(currentUser.companyId);
      }

      const unreadCount = await Chat.countDocuments(matchQuery);

      // Group by lead
      const unreadByLead = await Chat.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$leadId',
            unreadCount: { $sum: 1 },
            lastMessage: { $max: '$sentAt' }
          }
        },
        { $sort: { lastMessage: -1 } },
        {
          $lookup: {
            from: 'leads',
            localField: '_id',
            foreignField: '_id',
            as: 'lead'
          }
        },
        { $unwind: '$lead' },
        {
          $project: {
            leadId: '$_id',
            leadName: '$lead.name',
            leadEmail: '$lead.email',
            unreadCount: 1,
            lastMessage: 1
          }
        }
      ]);

      res.json({
        totalUnread: unreadCount,
        unreadByLead
      });
    } catch (error: any) {
      console.error('Unread count error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch unread count',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }
}