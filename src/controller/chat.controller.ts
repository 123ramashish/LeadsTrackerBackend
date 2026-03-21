import { Request, Response, NextFunction } from 'express';
import mongoose, { Types } from 'mongoose';
import Chat, { IChat, MessageSender } from '../DataBase/Schema/Chat.schema';
import Lead from '../DataBase/Schema/Leads.schema';
import Activity, { ActivityType } from '../DataBase/Schema/Activity.schema';
import { AppError } from '../middlewares/errorHandler';
import { USER_ROLES, type ApiResponse } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  role: USER_ROLES;
  companyId: string;
}

interface AuthRequest extends Request {
  user?: AuthUser;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Validates a MongoDB ObjectId; throws AppError on failure. */
const toObjectId = (value: string, field = 'ID'): Types.ObjectId => {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${field}`, 400);
  return new Types.ObjectId(value);
};

/** Fire-and-forget activity logger — never throws. */
const logActivity = async (
  leadId:      string,
  companyId:   string,
  performedBy: string,
  type:        ActivityType,
  title:       string,
  opts: { description?: string; metadata?: unknown } = {}
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
    console.error('[Activity Log Error]', err);
  }
};

/** Builds a company-scoped query.  Super-admins bypass the company filter. */
const companyScope = (user: AuthUser, extra: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = { ...extra };
  if (user.role !== USER_ROLES.SUPER_ADMIN) {
    base.companyId = new Types.ObjectId(user.companyId);
  }
  return base;
};

/** Verifies a lead exists and is accessible for the calling user. Throws on failure. */
const assertLeadAccess = async (leadId: string, user: AuthUser) => {
  const query: Record<string, unknown> = { _id: leadId, isDeleted: false };
  if (user.role !== USER_ROLES.SUPER_ADMIN) {
    query.company = new Types.ObjectId(user.companyId);
  }
  const lead = await Lead.findOne(query).lean();
  if (!lead) throw new AppError('Lead not found or access denied', 404);
  return lead;
};

// ─── Controller ───────────────────────────────────────────────────────────────

export default class ChatController {

  // ── SEND MESSAGE (admin → lead) ────────────────────────────────────────────

  async createChat(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { leadId, content, fileUrls } = req.body as {
        leadId: string;
        content?: string;
        fileUrls?: string[];
      };

      // ── Validate ──
      if (!leadId) throw new AppError('leadId is required', 400);
      toObjectId(leadId, 'leadId');

      const trimmedContent = content?.trim();
      const validFiles     = Array.isArray(fileUrls)
        ? fileUrls.map(u => u?.trim()).filter(Boolean)
        : [];

      if (!trimmedContent && validFiles.length === 0) {
        throw new AppError('Message must contain either content or at least one file', 400);
      }

      // ── Access check ──
      const lead = await assertLeadAccess(leadId, user);

      // ── Create message ──
      const chat = await Chat.create({
        leadId:     new Types.ObjectId(leadId),
        companyId:  lead.company,
        sentBy:     new Types.ObjectId(user.id),   // always ObjectId — not a raw string
        senderType: MessageSender.ADMIN,
        content:    trimmedContent,
        fileUrls:   validFiles,
        sentAt:     new Date(),
      });

      // ── Update lead engagement counters ──
      await Lead.updateOne(
        { _id: leadId },
        {
          $set: {
            lastContacted:  new Date(),
            lastActivityAt: new Date(),
            updatedBy:      new Types.ObjectId(user.id),
          },
          $inc: {
            totalInteractions: 1,
            emailsSent:        1,
          },
        }
      );

      // Recompute score after engagement update
      const updatedLead = await Lead.findById(leadId);
      if (updatedLead) {
        updatedLead.computeScore();
        await updatedLead.save();
      }

      await logActivity(leadId, String(lead.company), user.id, ActivityType.MESSAGE_SENT,
        'Message sent to lead', {
        description: trimmedContent ? trimmedContent.substring(0, 100) : 'Sent files',
        metadata:    { hasContent: !!trimmedContent, fileCount: validFiles.length },
      });

      const response: ApiResponse = {
        success: true,
        message: 'Message sent successfully',
        data:    chat,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  // ── RECEIVE MESSAGE (lead → admin, webhook/integration) ───────────────────

  async receiveLeadMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { leadId, content, fileUrls, leadIdentifier } = req.body as {
        leadId?:         string;
        content?:        string;
        fileUrls?:       string[];
        leadIdentifier?: string;
      };

      // ── Resolve lead ──
      let lead;
      if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
        lead = await Lead.findOne({ _id: leadId, isDeleted: false });
      } else if (leadIdentifier) {
        lead = await Lead.findOne({
          $or: [
            { email: leadIdentifier.toLowerCase().trim() },
            { phone: leadIdentifier.trim() },
          ],
          isDeleted: false,
        });
      }

      if (!lead) throw new AppError('Lead not found', 404);

      // ── Validate content ──
      const trimmedContent = content?.trim();
      const validFiles     = Array.isArray(fileUrls)
        ? fileUrls.map(u => u?.trim()).filter(Boolean)
        : [];

      if (!trimmedContent && validFiles.length === 0) {
        throw new AppError('Message must contain either content or at least one file', 400);
      }

      // ── Create message ──
      const chat = await Chat.create({
        leadId:     lead._id,
        companyId:  lead.company,
        sentBy:     lead._id,             // lead is the sender; reuse their ObjectId
        senderType: MessageSender.LEAD,
        content:    trimmedContent,
        fileUrls:   validFiles,
        sentAt:     new Date(),
      });

      // ── Update lead activity ──
      await Lead.updateOne(
        { _id: lead._id },
        {
          $set: { lastActivityAt: new Date() },
          $inc: { totalInteractions: 1 },
        }
      );

      // Use a system/lead identifier for the activity log — not a user ObjectId
      await logActivity(
        String(lead._id),
        String(lead.company),
        String(lead._id),              // performedBy: lead itself
        ActivityType.MESSAGE_RECEIVED,
        'Message received from lead',
        {
          description: trimmedContent ? trimmedContent.substring(0, 100) : 'Received files',
          metadata:    { hasContent: !!trimmedContent, fileCount: validFiles.length },
        }
      );

      const response: ApiResponse = {
        success: true,
        message: 'Message received successfully',
        data:    chat,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  // ── GET CHAT HISTORY ──────────────────────────────────────────────────────

  async getChatHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user   = req.user!;
      const leadId = req.params.leadId as string;

      toObjectId(leadId, 'leadId');

      // Verify access — throws 404 if not found / not authorised
      const lead = await assertLeadAccess(leadId, user);

      // ── Pagination ──
      const page  = Math.max(1, parseInt((req.query.page  as string) ?? '1',  10));
      const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
      const skip  = (page - 1) * limit;

      // Scope chat query to company as well (defence-in-depth)
      const chatFilter = companyScope(user, { leadId: new Types.ObjectId(leadId) });

      const [messages, total, unreadCount] = await Promise.all([
        Chat.find(chatFilter)
          .sort({ sentAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Chat.countDocuments(chatFilter),
        Chat.getUnreadCount(leadId, user.id),
      ]);

      const response: ApiResponse = {
        success: true,
        data: {
          lead: {
            id:     lead._id,
            name:   lead.name,
            email:  lead.email,
            phone:  lead.phone,
            status: lead.status,
          },
          messages:   messages.reverse(),   // oldest-first for the client
          unreadCount,
          pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
          },
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }

  // ── MARK MESSAGES AS READ ─────────────────────────────────────────────────

  async markLeadMessagesAsRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user   = req.user!;
      const leadId = req.params.leadId as string;

      toObjectId(leadId, 'leadId');
      await assertLeadAccess(leadId, user);

      const result = await Chat.markAsRead(leadId, user.id);

      const response: ApiResponse = {
        success: true,
        message: 'Messages marked as read',
        data:    { markedCount: result.modifiedCount ?? 0 },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }

  // ── GET UNREAD COUNT ──────────────────────────────────────────────────────

  async getUnreadCount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;

      const matchQuery: Record<string, unknown> = {
        senderType: MessageSender.LEAD,
        'readBy.userId': { $ne: new Types.ObjectId(user.id) },
        ...( user.role !== USER_ROLES.SUPER_ADMIN
          ? { companyId: new Types.ObjectId(user.companyId) }
          : {}
        ),
      };

      const [totalUnread, unreadByLead] = await Promise.all([
        Chat.countDocuments(matchQuery),
        Chat.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id:         '$leadId',
              unreadCount: { $sum: 1 },
              lastMessage: { $max: '$sentAt' },
            },
          },
          { $sort: { lastMessage: -1 } },
          { $limit: 50 },
          {
            $lookup: {
              from:         'leads',
              localField:   '_id',
              foreignField: '_id',
              as:           'lead',
            },
          },
          { $unwind: '$lead' },
          {
            $project: {
              leadId:    '$_id',
              leadName:  '$lead.name',
              leadEmail: '$lead.email',
              leadPhone: '$lead.phone',
              unreadCount: 1,
              lastMessage: 1,
            },
          },
        ]),
      ]);

      const response: ApiResponse = {
        success: true,
        data: { totalUnread, unreadByLead },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }

  // ── SEARCH MESSAGES ───────────────────────────────────────────────────────
  //
  //  Uses MongoDB $text index (fast) for keyword search instead of $regex
  //  (which does a full collection scan).  Falls back to $regex only when
  //  the Chat schema has no text index defined.
  //

  async searchMessages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user  = req.user!;
      const query = req.query.query as string;
      const leadId = req.query.leadId as string | undefined;

      if (!query?.trim()) throw new AppError('query is required', 400);

      const matchQuery: Record<string, unknown> = {
        ...companyScope(user),
        $text: { $search: query.trim() },   // uses text index — no regex scan
      };

      if (leadId) {
        toObjectId(leadId, 'leadId');
        matchQuery.leadId = new Types.ObjectId(leadId);
      }

      const page  = Math.max(1, parseInt((req.query.page  as string) ?? '1',  10));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
      const skip  = (page - 1) * limit;

      const [messages, total] = await Promise.all([
        Chat.find(matchQuery, { score: { $meta: 'textScore' } })
          .populate('leadId', 'name email phone')
          .sort({ score: { $meta: 'textScore' }, sentAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Chat.countDocuments(matchQuery),
      ]);

      const response: ApiResponse = {
        success: true,
        data: {
          query,
          total,
          messages,
          pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
            limit,
          },
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }

  // ── GET CHAT STATISTICS ───────────────────────────────────────────────────

  async getChatStatistics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const q    = req.query as Record<string, string | undefined>;

      const companyId =
        user.role === USER_ROLES.SUPER_ADMIN && q.companyId
          ? q.companyId
          : user.companyId;

      const matchQuery: Record<string, unknown> = {
        companyId: new Types.ObjectId(companyId),
      };

      // Optional date range
      if (q.dateFrom || q.dateTo) {
        const range: Record<string, Date> = {};
        if (q.dateFrom) range.$gte = new Date(q.dateFrom);
        if (q.dateTo)   range.$lte = new Date(q.dateTo);
        matchQuery.sentAt = range;
      }

      const [overview, responseTimeStats, unreadCount, activeLeads] = await Promise.all([

        // Message type totals
        Chat.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id:               null,
              totalMessages:     { $sum: 1 },
              adminMessages:     { $sum: { $cond: [{ $eq: ['$senderType', MessageSender.ADMIN] }, 1, 0] } },
              leadMessages:      { $sum: { $cond: [{ $eq: ['$senderType', MessageSender.LEAD]  }, 1, 0] } },
              messagesWithFiles: { $sum: { $cond: [{ $gt:  [{ $size: '$fileUrls' }, 0] },          1, 0] } },
            },
          },
        ]),

        // Average admin response time (ms)
        Chat.aggregate([
          { $match: { ...matchQuery, senderType: MessageSender.LEAD } },
          {
            $lookup: {
              from: 'chats',
              let:  { leadId: '$leadId', sentAt: '$sentAt' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$leadId',     '$$leadId'] },
                        { $eq: ['$senderType', MessageSender.ADMIN] },
                        { $gt: ['$sentAt',     '$$sentAt'] },
                      ],
                    },
                  },
                },
                { $sort:  { sentAt: 1 } },
                { $limit: 1 },
              ],
              as: 'response',
            },
          },
          { $unwind: '$response' },
          {
            $project: {
              responseTime: { $subtract: ['$response.sentAt', '$sentAt'] },
            },
          },
          {
            $group: {
              _id:             null,
              avgResponseTime: { $avg: '$responseTime' },
              minResponseTime: { $min: '$responseTime' },
              maxResponseTime: { $max: '$responseTime' },
            },
          },
        ]),

        // Unread count for the calling user
        Chat.countDocuments({
          ...matchQuery,
          senderType:      MessageSender.LEAD,
          'readBy.userId': { $ne: new Types.ObjectId(user.id) },
        }),

        // Top 10 most-active leads
        Chat.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id:          '$leadId',
              messageCount: { $sum: 1 },
              lastMessage:  { $max: '$sentAt' },
            },
          },
          { $sort: { messageCount: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from:         'leads',
              localField:   '_id',
              foreignField: '_id',
              as:           'lead',
            },
          },
          { $unwind: '$lead' },
          {
            $project: {
              leadId:       '$_id',
              leadName:     '$lead.name',
              leadEmail:    '$lead.email',
              messageCount: 1,
              lastMessage:  1,
            },
          },
        ]),
      ]);

      const response: ApiResponse = {
        success: true,
        data: {
          overview: overview[0] ?? {
            totalMessages: 0, adminMessages: 0,
            leadMessages:  0, messagesWithFiles: 0,
          },
          responseTime:   responseTimeStats[0] ?? null,
          unreadMessages: unreadCount,
          activeLeads,
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }

  // ── DELETE MESSAGE (own messages, or super-admin) ─────────────────────────

  async deleteMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const id   = req.params.id as string;

      toObjectId(id, 'message ID');

      const message = await Chat.findById(id);
      if (!message) throw new AppError('Message not found', 404);

      // Company isolation
      if (
        user.role !== USER_ROLES.SUPER_ADMIN &&
        message.companyId.toString() !== user.companyId
      ) {
        throw new AppError('Access denied', 403);
      }

      // Only owner or super-admin may delete
      if (
        user.role !== USER_ROLES.SUPER_ADMIN &&
        message.sentBy.toString() !== user.id
      ) {
        throw new AppError('You can only delete your own messages', 403);
      }

      await Chat.findByIdAndDelete(id);

      const response: ApiResponse = {
        success: true,
        message: 'Message deleted successfully',
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
}