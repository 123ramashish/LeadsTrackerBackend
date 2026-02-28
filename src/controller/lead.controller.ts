// src/controllers/leadController.ts
import { Request, Response, NextFunction } from 'express';
import mongoose, { Types } from 'mongoose';

import { ActivityType, LeadPriority, LeadSource, LeadStatus, LeadType, type ApiResponse } from '../types/index';
import Activity from '../DataBase/Schema/Activity.schema';
import { AppError } from '../middlewares/errorHandler';
import Company from '../DataBase/Schema/company.schema';
import Lead from '../DataBase/Schema/Leads.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN       = 'admin',
  USER        = 'user',
  EMPLOYEE    = 'employee',
}

interface AuthUser {
  id: string;
  role: UserRole;
  companyId: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

// Valid sort fields — used to whitelist the sortBy query param
const VALID_SORT_FIELDS = [
  'createdAt', 'updatedAt', 'name', 'score',
  'priority', 'nextFollowUp', 'lastContacted', 'estimatedValue',
] as const;

type SortField = typeof VALID_SORT_FIELDS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a Mongoose filter that hard-scopes every query to the caller's company. */
const companyScope = (user: AuthUser, extra: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = { isDeleted: false, ...extra };
  if (user.role !== UserRole.SUPER_ADMIN) {
    base.company = new Types.ObjectId(user.companyId);
  }
  return base;
};

/** Fire-and-forget activity logger — never throws. */
const logActivity = async (
  leadId: string,
  companyId: string,
  performedBy: string,
  type: ActivityType,
  title: string,
  opts: {
    description?: string;
    previousValue?: unknown;
    newValue?: unknown;
    metadata?: unknown;
  } = {}
): Promise<void> => {
  try {
    await Activity.create({
      leadId:      new Types.ObjectId(leadId),
      companyId:   new Types.ObjectId(companyId),
      performedBy: new Types.ObjectId(performedBy),
      type,
      title,
      activityDate: new Date(),
      ...opts,
    });
  } catch (err) {
    // Activity logging must never break the main request flow
    console.error('[Activity Log Error]', err);
  }
};

/** Parses and validates a MongoDB ObjectId; throws AppError on failure. */
const toObjectId = (value: string, fieldName = 'ID'): Types.ObjectId => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
  return new Types.ObjectId(value);
};

/** Validates an enum value; throws AppError on failure. */
const assertEnum = <T extends string>(
  value: unknown,
  enumObj: Record<string, T>,
  label: string
): T => {
  if (!value || !Object.values(enumObj).includes(value as T)) {
    throw new AppError(`Invalid ${label}: "${value}"`, 400);
  }
  return value as T;
};

// ─── CREATE LEAD ──────────────────────────────────────────────────────────────

export const createLead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const {
      name, email, phone, whatsapp, website, address, googleMapUrl,
      status    = LeadStatus.CREATED,
      type      = LeadType.LEAD,
      source    = LeadSource.OTHER,
      priority  = LeadPriority.MEDIUM,
      isFavorite = false,
      estimatedValue, actualValue,
      tags = [],
      customFields,
      assignedTo,
      nextFollowUp,
      companyName,
    } = req.body as Record<string, unknown>;

    if (!name) throw new AppError('Lead name is required', 400);

    // Validate enums up-front for clear error messages
    assertEnum(status,   LeadStatus,   'lead status');
    assertEnum(type,     LeadType,     'lead type');
    assertEnum(source,   LeadSource,   'lead source');
    assertEnum(priority, LeadPriority, 'priority');

    // Resolve companyId — super-admin may target a specific company
    let companyId = user.companyId;
    if (user.role === UserRole.SUPER_ADMIN && req.body.company) {
      const targetCompany = await Company.findById(req.body.company);
      if (!targetCompany || !(targetCompany as any).isActive) {
        throw new AppError('Invalid or inactive company', 400);
      }
      companyId = String(req.body.company);
    }

    const lead = await Lead.create({
      name,
      email:          email ? String(email).toLowerCase() : undefined,
      phone,
      whatsapp,
      website,
      address,
      googleMapUrl,
      status,
      type,
      source,
      priority,
      isFavorite,
      estimatedValue,
      actualValue,
      tags,
      customFields,
      companyName,
      company:     new Types.ObjectId(companyId),
      createdBy:   new Types.ObjectId(user.id),
      assignedTo:  assignedTo ? toObjectId(String(assignedTo), 'assignedTo') : undefined,
      nextFollowUp: nextFollowUp ? new Date(String(nextFollowUp)) : undefined,
      statusUpdatedAt: new Date(),
      lastActivityAt:  new Date(),
    });

    // Compute initial score using the schema instance method
    lead.computeScore();
    await lead.save();

    await logActivity(lead.id, companyId, user.id, ActivityType.LEAD_CREATED, `Lead "${name}" created`, {
      description: `New ${type} from ${source}`,
      metadata:    { source, priority, type },
    });

    const response: ApiResponse = { success: true, data: lead };
    res.status(201).json(response);
  } catch (err: any) {
    if (err.code === 11000) return next(new AppError('A lead with this email or phone already exists in your company', 409));
    next(err);
  }
};

// ─── GET LEADS (list with full filtering + pagination) ────────────────────────

export const getLeads = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const q    = req.query as Record<string, string | undefined>;

    // ── Pagination ──
    const page  = Math.max(1, parseInt(q.page  ?? '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '20', 10)));
    const skip  = (page - 1) * limit;

    // ── Base query with company isolation ──
    const filter = companyScope(user);

    // ── Enum filters ──
    if (q.status)   filter.status   = q.status;
    if (q.type)     filter.type     = q.type;
    if (q.source)   filter.source   = q.source;
    if (q.priority) filter.priority = q.priority;

    // ── Boolean filters ──
    if (q.isFavorite !== undefined) filter.isFavorite = q.isFavorite === 'true';

    // ── ObjectId filters ──
    if (q.assignedTo && mongoose.Types.ObjectId.isValid(q.assignedTo)) {
      filter.assignedTo = new Types.ObjectId(q.assignedTo);
    }

    // ── Tags ($in — accepts comma-separated or repeated query param) ──
    if (q.tags) {
      const tagList = String(q.tags).split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length) filter.tags = { $in: tagList };
    }

    // ── Numeric range filters ──
    if (q.minScore !== undefined || q.maxScore !== undefined) {
      const scoreRange: Record<string, number> = {};
      if (q.minScore) scoreRange.$gte = Number(q.minScore);
      if (q.maxScore) scoreRange.$lte = Number(q.maxScore);
      filter.score = scoreRange;
    }
    if (q.minValue !== undefined || q.maxValue !== undefined) {
      const valRange: Record<string, number> = {};
      if (q.minValue) valRange.$gte = Number(q.minValue);
      if (q.maxValue) valRange.$lte = Number(q.maxValue);
      filter.estimatedValue = valRange;
    }

    // ── Overdue follow-ups ──
    if (q.overdueFollowUp === 'true') {
      filter.nextFollowUp = { $lte: new Date() };
      filter.status = { $nin: [LeadStatus.WON, LeadStatus.LOST] };
    }

    // ── createdAt date range ──
    if (q.dateFrom || q.dateTo) {
      const dateRange: Record<string, Date> = {};
      if (q.dateFrom) dateRange.$gte = new Date(q.dateFrom);
      if (q.dateTo)   dateRange.$lte = new Date(q.dateTo);
      filter.createdAt = dateRange;
    }

    // ── Full-text search (uses the compound text index on name/email/companyName/address) ──
    if (q.search) {
      filter.$text = { $search: q.search };
    }

    // ── Sorting (whitelist guard) ──
    const sortField: SortField = VALID_SORT_FIELDS.includes(q.sortBy as SortField)
      ? (q.sortBy as SortField)
      : 'createdAt';
    const sortDir = q.sortOrder === 'asc' ? 1 : -1;

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .select('-isDeleted -deletedAt -deletedBy')
        .populate('company',    'name type')
        .populate('assignedTo', 'name email')
        .populate('createdBy',  'name email')
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),
      Lead.countDocuments(filter),
    ]);

    const response: ApiResponse = {
      success: true,
      data: leads,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── GET SINGLE LEAD (with optional activity timeline) ────────────────────────

export const getLeadById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;
    const includeTimeline = req.query.includeTimeline !== 'false'; // default: true

    toObjectId(id, 'lead ID'); // validation only

    const filter = companyScope(user, { _id: id });
    const lead = await Lead.findOne(filter)
      .populate('company',    'name type')
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy',  'name email')
      .populate('updatedBy',  'name email')
      .lean({ virtuals: true });

    if (!lead) throw new AppError('Lead not found', 404);

    let timeline = null;
    if (includeTimeline) {
      timeline = await Activity.find({ leadId: id })
        .sort({ activityDate: -1 })
        .limit(50)
        .populate('performedBy', 'name email')
        .lean();
    }

    const response: ApiResponse = { success: true, data: { lead, timeline } };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE LEAD (basic field edits) ─────────────────────────────────────────

export const updateLead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;

    toObjectId(id, 'lead ID');

    const ALLOWED_FIELDS = [
      'name', 'email', 'phone', 'whatsapp', 'website',
      'address', 'googleMapUrl', 'companyName',
      'estimatedValue', 'actualValue', 'tags', 'customFields',
    ] as const;

    // Fetch current doc to detect actual changes
    const filter  = companyScope(user, { _id: id });
    const current = await Lead.findOne(filter);
    if (!current) throw new AppError('Lead not found', 404);

    const updates: Record<string, unknown> = {};
    const changedFields: string[] = [];

    for (const key of ALLOWED_FIELDS) {
      if (!(key in req.body)) continue;
      const incoming = key === 'email'
        ? String(req.body[key]).toLowerCase()
        : req.body[key];

      // Only include fields that actually changed
      if (JSON.stringify((current as any)[key]) !== JSON.stringify(incoming)) {
        updates[key] = incoming;
        changedFields.push(key);
      }
    }

    if (!changedFields.length) {
      throw new AppError('No valid changes detected', 400);
    }

    updates.updatedBy      = new Types.ObjectId(user.id);
    updates.lastActivityAt = new Date();

    const updated = await Lead.findOneAndUpdate(
      filter,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean({ virtuals: true });

    await logActivity(id, user.companyId, user.id, ActivityType.LEAD_UPDATED, 'Lead information updated', {
      description: `Updated: ${changedFields.join(', ')}`,
      metadata:    { fields: changedFields },
    });

    const response: ApiResponse = { success: true, data: updated };
    res.json(response);
  } catch (err: any) {
    if (err.code === 11000) return next(new AppError('A lead with this email or phone already exists', 409));
    next(err);
  }
};

// ─── UPDATE STATUS ────────────────────────────────────────────────────────────

export const updateLeadStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;
    const { status, notes } = req.body as { status: LeadStatus; notes?: string };

    toObjectId(id, 'lead ID');
    assertEnum(status, LeadStatus, 'lead status');

    const filter  = companyScope(user, { _id: id });
    const current = await Lead.findOne(filter);
    if (!current) throw new AppError('Lead not found', 404);

    const previousStatus = current.status;

    // Mutate and let the pre-save middleware handle statusUpdatedAt / convertedAt / lostAt
    current.status    = status;
    current.updatedBy = new Types.ObjectId(user.id) as any;

    // Recompute score after the status change
    current.computeScore();
    await current.save();

    await logActivity(id, user.companyId, user.id, ActivityType.STATUS_CHANGED,
      `Status changed: ${previousStatus} → ${status}`, {
      description:    notes,
      previousValue:  previousStatus,
      newValue:       status,
    });

    const response: ApiResponse = { success: true, data: current };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE TYPE ──────────────────────────────────────────────────────────────

export const updateLeadType = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;
    const { type } = req.body as { type: LeadType };

    toObjectId(id, 'lead ID');
    assertEnum(type, LeadType, 'lead type');

    const filter  = companyScope(user, { _id: id });
    const current = await Lead.findOne(filter);
    if (!current) throw new AppError('Lead not found', 404);

    const previousType = current.type;

    const updated = await Lead.findOneAndUpdate(
      filter,
      { $set: { type, updatedBy: new Types.ObjectId(user.id), lastActivityAt: new Date() } },
      { new: true, runValidators: true }
    ).lean({ virtuals: true });

    await logActivity(id, user.companyId, user.id, ActivityType.TYPE_CHANGED,
      `Type changed: ${previousType} → ${type}`, {
      previousValue: previousType,
      newValue:      type,
    });

    const response: ApiResponse = { success: true, data: updated };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE PRIORITY ──────────────────────────────────────────────────────────

export const updateLeadPriority = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;
    const { priority } = req.body as { priority: LeadPriority };

    toObjectId(id, 'lead ID');
    assertEnum(priority, LeadPriority, 'priority');

    const filter  = companyScope(user, { _id: id });
    const current = await Lead.findOne(filter);
    if (!current) throw new AppError('Lead not found', 404);

    const previousPriority = current.priority;

    const updated = await Lead.findOneAndUpdate(
      filter,
      { $set: { priority, updatedBy: new Types.ObjectId(user.id), lastActivityAt: new Date() } },
      { new: true, runValidators: true }
    ).lean({ virtuals: true });

    await logActivity(id, user.companyId, user.id, ActivityType.PRIORITY_CHANGED,
      `Priority changed: ${previousPriority} → ${priority}`, {
      previousValue: previousPriority,
      newValue:      priority,
    });

    const response: ApiResponse = { success: true, data: updated };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── ASSIGN LEAD ──────────────────────────────────────────────────────────────

export const assignLead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;
    const { assignedTo } = req.body as { assignedTo: string };

    toObjectId(id, 'lead ID');
    const assigneeId = toObjectId(assignedTo, 'assignedTo');

    const filter  = companyScope(user, { _id: id });
    const current = await Lead.findOne(filter);
    if (!current) throw new AppError('Lead not found', 404);

    const previousAssignee = current.assignedTo;

    const updated = await Lead.findOneAndUpdate(
      filter,
      { $set: { assignedTo: assigneeId, updatedBy: new Types.ObjectId(user.id), lastActivityAt: new Date() } },
      { new: true }
    )
      .populate('assignedTo', 'name email')
      .lean({ virtuals: true });

    await logActivity(id, user.companyId, user.id, ActivityType.LEAD_ASSIGNED, 'Lead reassigned', {
      description:   `Assigned to ${(updated?.assignedTo as any)?.name ?? assignedTo}`,
      previousValue: previousAssignee,
      newValue:      assignedTo,
      metadata:      { assignedTo },
    });

    const response: ApiResponse = { success: true, data: updated };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── MARK CONTACTED ───────────────────────────────────────────────────────────

export const markLeadContacted = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;
    const { interactionType = 'general' } = req.body as { interactionType?: string };

    toObjectId(id, 'lead ID');

    const filter = companyScope(user, { _id: id });
    const lead   = await Lead.findOne(filter);
    if (!lead) throw new AppError('Lead not found', 404);

    // Increment engagement counter for the interaction type
    if (interactionType === 'email')   lead.emailsSent   += 1;
    if (interactionType === 'call')    lead.callsMade    += 1;
    if (interactionType === 'meeting') lead.meetingsHeld += 1;

    lead.updatedBy = new Types.ObjectId(user.id) as any;

    // Uses the schema instance method: stamps lastContacted, increments totalInteractions,
    // advances status CREATED → CONTACTED, and saves
    await lead.markContacted();

    // Recompute score after engagement counters updated
    lead.computeScore();
    await lead.save();

    await logActivity(id, user.companyId, user.id, ActivityType.STATUS_CHANGED, 'Lead marked as contacted', {
      metadata: { interactionType },
    });

    const response: ApiResponse = { success: true, data: lead };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── TOGGLE FAVORITE ─────────────────────────────────────────────────────────

export const toggleFavorite = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;
    const { isFavorite } = req.body as { isFavorite: boolean };

    toObjectId(id, 'lead ID');

    if (typeof isFavorite !== 'boolean') {
      throw new AppError('isFavorite must be a boolean', 400);
    }

    const filter  = companyScope(user, { _id: id });
    const updated = await Lead.findOneAndUpdate(
      filter,
      { $set: { isFavorite, updatedBy: new Types.ObjectId(user.id), lastActivityAt: new Date() } },
      { new: true }
    ).lean({ virtuals: true });

    if (!updated) throw new AppError('Lead not found', 404);

    const response: ApiResponse = {
      success: true,
      data: updated,
      message: isFavorite ? 'Lead added to favorites' : 'Lead removed from favorites',
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── SCHEDULE FOLLOW-UP ───────────────────────────────────────────────────────

export const scheduleFollowUp = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;
    const { followUpDate, notes } = req.body as { followUpDate: string; notes?: string };

    toObjectId(id, 'lead ID');

    if (!followUpDate) throw new AppError('followUpDate is required', 400);
    const followUpDt = new Date(followUpDate);
    if (isNaN(followUpDt.getTime())) throw new AppError('followUpDate is not a valid date', 400);
    if (followUpDt < new Date()) throw new AppError('followUpDate must be in the future', 400);

    const filter  = companyScope(user, { _id: id });
    const updated = await Lead.findOneAndUpdate(
      filter,
      { $set: { nextFollowUp: followUpDt, updatedBy: new Types.ObjectId(user.id), lastActivityAt: new Date() } },
      { new: true }
    ).lean({ virtuals: true });

    if (!updated) throw new AppError('Lead not found', 404);

    await logActivity(id, user.companyId, user.id, ActivityType.FOLLOW_UP_SCHEDULED, 'Follow-up scheduled', {
      description: notes ?? `Scheduled for ${followUpDt.toLocaleDateString()}`,
      metadata:    { followUpDate: followUpDt },
    });

    const response: ApiResponse = { success: true, data: updated };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── ADD NOTE ─────────────────────────────────────────────────────────────────

export const addNote = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;
    const { note } = req.body as { note: string };

    toObjectId(id, 'lead ID');
    if (!note?.trim()) throw new AppError('Note content is required', 400);

    const filter = companyScope(user, { _id: id });
    const lead   = await Lead.findOne(filter);
    if (!lead) throw new AppError('Lead not found', 404);

    lead.lastActivityAt = new Date();
    lead.updatedBy = new Types.ObjectId(user.id) as any;
    await lead.save();

    await logActivity(id, user.companyId, user.id, ActivityType.NOTE_ADDED, 'Note added', {
      description: note,
      metadata:    { noteLength: note.length },
    });

    const response: ApiResponse = { success: true, message: 'Note added successfully' };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────

export const deleteLead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params as any;

    const deletedById = toObjectId(id, 'lead ID');
    const filter      = companyScope(user, { _id: id });
    const lead        = await Lead.findOne(filter);

    if (!lead) throw new AppError('Lead not found', 404);

    // Uses the schema instance method: stamps isDeleted / deletedAt / deletedBy and saves
    await lead.softDelete(deletedById);

    const response: ApiResponse = { success: true, message: 'Lead moved to trash' };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── BULK STATUS UPDATE ───────────────────────────────────────────────────────

export const bulkUpdateStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const { leadIds, status } = req.body as { leadIds: string[]; status: LeadStatus };

    if (!Array.isArray(leadIds) || !leadIds.length) {
      throw new AppError('leadIds must be a non-empty array', 400);
    }
    assertEnum(status, LeadStatus, 'lead status');

    const objectIds = leadIds.map(lid => toObjectId(lid, 'leadId'));

    const filter: Record<string, unknown> = {
      _id:       { $in: objectIds },
      isDeleted: false,
    };
    if (user.role !== UserRole.SUPER_ADMIN) {
      filter.company = new Types.ObjectId(user.companyId);
    }

    const result = await Lead.updateMany(filter, {
      $set: {
        status,
        statusUpdatedAt: new Date(),
        lastActivityAt:  new Date(),
        updatedBy:       new Types.ObjectId(user.id),
      },
    });

    // Log for each affected lead (non-blocking)
    leadIds.forEach(lid =>
      logActivity(lid, user.companyId, user.id, ActivityType.STATUS_CHANGED,
        `Bulk status update → ${status}`, {
        newValue: status,
        metadata: { bulkOperation: true },
      })
    );

    const response: ApiResponse = {
      success: true,
      message: `${result.modifiedCount} lead(s) updated`,
      data: { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

export const getLeadAnalytics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const q    = req.query as Record<string, string | undefined>;

    const companyId =
      user.role === UserRole.SUPER_ADMIN && q.companyId
        ? q.companyId
        : user.companyId;

    const matchQuery: Record<string, unknown> = {
      company:   new Types.ObjectId(companyId),
      isDeleted: false,
    };

    if (q.dateFrom || q.dateTo) {
      const range: Record<string, Date> = {};
      if (q.dateFrom) range.$gte = new Date(q.dateFrom);
      if (q.dateTo)   range.$lte = new Date(q.dateTo);
      matchQuery.createdAt = range;
    }

    const groupAndSort = (field: string): mongoose.PipelineStage[] => [
      { $match: matchQuery },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];

    const [
      statusDist,
      typeDist,
      sourceDist,
      priorityDist,
      scoreBuckets,
      totals,
      overdueCount,
    ] = await Promise.all([
      Lead.aggregate([
        { $match: matchQuery },
        { $group: { _id: '$status', count: { $sum: 1 }, totalEstimatedValue: { $sum: '$estimatedValue' } } },
        { $sort: { count: -1 } },
      ]),
      Lead.aggregate(groupAndSort('type')),
      Lead.aggregate(groupAndSort('source')),
      Lead.aggregate(groupAndSort('priority')),
      Lead.aggregate([
        { $match: matchQuery },
        {
          $bucket: {
            groupBy:    '$score',
            boundaries: [0, 20, 40, 60, 80, 101],
            default:    'Unscored',
            output:     { count: { $sum: 1 }, avgValue: { $avg: '$estimatedValue' } },
          },
        },
      ]),
      Lead.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id:                   null,
            totalLeads:            { $sum: 1 },
            avgScore:              { $avg: '$score' },
            totalEstimatedValue:   { $sum: '$estimatedValue' },
            totalActualValue:      { $sum: '$actualValue' },
            avgInteractions:       { $avg: '$totalInteractions' },
            totalEmailsSent:       { $sum: '$emailsSent' },
            totalCallsMade:        { $sum: '$callsMade' },
            totalMeetingsHeld:     { $sum: '$meetingsHeld' },
          },
        },
      ]),
      Lead.countDocuments({
        ...matchQuery,
        nextFollowUp: { $lte: new Date() },
        status:       { $nin: [LeadStatus.WON, LeadStatus.LOST] },
      }),
    ]);

    const response: ApiResponse = {
      success: true,
      data: {
        overview:           totals[0] ?? {},
        statusDistribution: statusDist,
        typeDistribution:   typeDist,
        sourceDistribution: sourceDist,
        priorityDistribution: priorityDist,
        scoreDistribution:  scoreBuckets,
        overdueFollowUps:   overdueCount,
      },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── CONVERSION FUNNEL ────────────────────────────────────────────────────────

export const getConversionFunnel = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const q    = req.query as Record<string, string | undefined>;

    const companyId =
      user.role === UserRole.SUPER_ADMIN && q.companyId
        ? q.companyId
        : user.companyId;

    const matchQuery: Record<string, unknown> = {
      company:   new Types.ObjectId(companyId),
      isDeleted: false,
    };

    if (q.dateFrom || q.dateTo) {
      const range: Record<string, Date> = {};
      if (q.dateFrom) range.$gte = new Date(q.dateFrom);
      if (q.dateTo)   range.$lte = new Date(q.dateTo);
      matchQuery.createdAt = range;
    }

    const FUNNEL_STAGES: LeadStatus[] = [
      LeadStatus.CREATED,
      LeadStatus.CONTACTED,
      LeadStatus.QUALIFIED,
      LeadStatus.PROPOSAL_SENT,
      LeadStatus.NEGOTIATION,
      LeadStatus.WON,
    ];

    const [funnel, totalLeads, wonLeads, lostLeads] = await Promise.all([
      // One aggregation for all funnel stages
      Lead.aggregate([
        { $match: matchQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).then(rows => {
        const countMap = Object.fromEntries(rows.map((r: any) => [r._id, r.count]));
        return FUNNEL_STAGES.map(stage => ({ stage, count: countMap[stage] ?? 0 }));
      }),
      Lead.countDocuments(matchQuery),
      Lead.countDocuments({ ...matchQuery, status: LeadStatus.WON }),
      Lead.countDocuments({ ...matchQuery, status: LeadStatus.LOST }),
    ]);

    const conversionRate = totalLeads > 0 ? ((wonLeads  / totalLeads) * 100).toFixed(2) : '0.00';
    const lossRate       = totalLeads > 0 ? ((lostLeads / totalLeads) * 100).toFixed(2) : '0.00';

    const response: ApiResponse = {
      success: true,
      data: {
        funnel,
        summary: {
          totalLeads,
          wonLeads,
          lostLeads,
          activeLeads:    totalLeads - wonLeads - lostLeads,
          conversionRate,
          lossRate,
        },
      },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ─── OVERDUE FOLLOW-UPS ───────────────────────────────────────────────────────

export const getOverdueFollowUps = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const q    = req.query as Record<string, string | undefined>;

    // Leverage the schema static method; super-admin gets all companies
    const filter: Record<string, unknown> = {
      isDeleted:    false,
      nextFollowUp: { $lte: new Date() },
      status:       { $nin: [LeadStatus.WON, LeadStatus.LOST] },
    };

    if (user.role !== UserRole.SUPER_ADMIN) {
      filter.company = new Types.ObjectId(user.companyId);
    }

    if (q.assignedTo && mongoose.Types.ObjectId.isValid(q.assignedTo)) {
      filter.assignedTo = new Types.ObjectId(q.assignedTo);
    }

    const leads = await Lead.find(filter)
      .select('name email phone status priority nextFollowUp assignedTo score daysSinceLastContact')
      .populate('assignedTo', 'name email')
      .sort({ nextFollowUp: 1 })
      .limit(100)
      .lean({ virtuals: true });

    const response: ApiResponse = {
      success: true,
      data: { count: leads.length, leads },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};