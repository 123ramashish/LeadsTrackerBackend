// src/controllers/messageController.ts
import { Request, Response, NextFunction } from 'express';
import type {
  ApiResponse,
  Channel,
  WAStatus,
  EmailStatus,
  FollowUpStatus,
  MessageFilterQuery,
} from '../types/index.js';
import { Message } from '../DataBase/Schema/message.schema.js';
import { Template } from '../DataBase/Schema/template.schema.js';
import { AppError } from '../middlewares/errorHandler.js';

// ─── Helper ───────────────────────────────────────────────────────────────────
const needsAutoFollowUpFilter = () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return {
    sentAt: { $lte: sevenDaysAgo },
    $or: [
      // WhatsApp: not seen or replied
      {
        channel: 'whatsapp',
        waStatus: { $nin: ['seen', 'replied'] },
      },
      // Email: not opened or replied
      {
        channel: 'email',
        emailStatus: { $nin: ['opened', 'replied'] },
      },
    ],
  };
};

// ── GET /messages ─────────────────────────────────────────────────────────────
export const getMessages = async (
  req: Request<{}, {}, {}, MessageFilterQuery>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)));
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (req.query.channel)        filter.channel        = req.query.channel;
    if (req.query.followUpStatus) filter.followUpStatus = req.query.followUpStatus;
    if (req.query.waStatus)       filter.waStatus       = req.query.waStatus;
    if (req.query.emailStatus)    filter.emailStatus    = req.query.emailStatus;

    if (req.query.isBulk !== undefined) {
      filter.isBulk = req.query.isBulk === 'true';
    }

    if (req.query.needsFollowUp === 'true') {
      Object.assign(filter, needsAutoFollowUpFilter());
    }

    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const [messages, total] = await Promise.all([
      Message.find(filter)
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('templateId', 'name channel')
        .lean({ virtuals: true }),
      Message.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── GET /messages/stats ───────────────────────────────────────────────────────
export const getStats = async (
  req: Request<{}, {}, {}, { channel?: Channel }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const channelFilter = req.query.channel ? { channel: req.query.channel } : {};
    const sevenDaysAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [aggregation] = await Message.aggregate([
      { $match: channelFilter },
      {
        $facet: {
          total:   [{ $count: 'count' }],
          replied: [
            {
              $match: {
                $or: [
                  { waStatus: 'replied' },
                  { emailStatus: 'replied' },
                ],
              },
            },
            { $count: 'count' },
          ],
          autoScheduled: [
            { $match: { followUpStatus: 'auto_scheduled' } },
            { $count: 'count' },
          ],
          needsFollowUp: [
            {
              $match: {
                sentAt: { $lte: sevenDaysAgo },
                $or: [
                  { channel: 'whatsapp', waStatus: { $nin: ['seen', 'replied'] } },
                  { channel: 'email',    emailStatus: { $nin: ['opened', 'replied'] } },
                ],
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ]);

    const toCount = (arr: Array<{ count: number }>) => arr[0]?.count ?? 0;

    res.json({
      success: true,
      data: {
        total:         toCount(aggregation.total),
        replied:       toCount(aggregation.replied),
        autoScheduled: toCount(aggregation.autoScheduled),
        needsFollowUp: toCount(aggregation.needsFollowUp),
      },
    } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── GET /messages/:id ─────────────────────────────────────────────────────────
export const getMessageById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const message = await Message.findById(req.params.id)
      .populate('templateId', 'name channel')
      .lean({ virtuals: true });

    if (!message) throw new AppError('Message not found', 404);
    res.json({ success: true, data: message } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── POST /messages ────────────────────────────────────────────────────────────
export const createMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as {
      leadId: string;
      leadName: string;
      leadEmail: string;
      leadPhone: string;
      channel: Channel;
      subject?: string;
      body: string;
      templateId?: string;
      waStatus?: WAStatus;
      emailStatus?: EmailStatus;
      sentAt?: string;
      followUpScheduledAt?: string;
      isBulk?: boolean;
      bulkCount?: number;
    };

    if (body.channel === 'email' && !body.subject?.trim()) {
      throw new AppError('Subject is required for email messages', 422);
    }

    // Increment template usage counter if a template was used
    if (body.templateId) {
      await Template.findByIdAndUpdate(body.templateId, { $inc: { usageCount: 1 } });
    }

    const message = await Message.create({
      ...body,
      sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
      followUpScheduledAt: body.followUpScheduledAt
        ? new Date(body.followUpScheduledAt)
        : undefined,
    });

    res.status(201).json({ success: true, data: message } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /messages/:id/status ────────────────────────────────────────────────
// Update delivery / read status (e.g. webhook from WhatsApp Cloud API or email provider)
export const updateMessageStatus = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { waStatus, emailStatus } = req.body as {
      waStatus?: WAStatus;
      emailStatus?: EmailStatus;
    };

    if (!waStatus && !emailStatus) {
      throw new AppError('Provide at least one of waStatus or emailStatus', 400);
    }

    const update: Record<string, unknown> = {};
    const now = new Date();

    if (waStatus) {
      update.waStatus = waStatus;
      if (waStatus === 'delivered') update.deliveredAt = now;
      if (waStatus === 'seen')      update.seenAt      = now;
      if (waStatus === 'replied')   update.repliedAt   = now;
    }
    if (emailStatus) {
      update.emailStatus = emailStatus;
      if (emailStatus === 'opened')  update.openedAt  = now;
      if (emailStatus === 'replied') update.repliedAt = now;
    }

    const message = await Message.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean({ virtuals: true });

    if (!message) throw new AppError('Message not found', 404);
    res.json({ success: true, data: message } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /messages/:id/follow-up ─────────────────────────────────────────────
// Update follow-up status and optional scheduled time
export const updateFollowUp = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { followUpStatus, followUpScheduledAt } = req.body as {
      followUpStatus: FollowUpStatus;
      followUpScheduledAt?: string;
    };

    const update: Record<string, unknown> = { followUpStatus };
    if (followUpScheduledAt) update.followUpScheduledAt = new Date(followUpScheduledAt);

    const message = await Message.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean({ virtuals: true });

    if (!message) throw new AppError('Message not found', 404);
    res.json({ success: true, data: message } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /messages/:id/reminder ─────────────────────────────────────────────
export const setReminder = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { reminderAt, reminderNote } = req.body as {
      reminderAt: string;
      reminderNote?: string;
    };

    if (!reminderAt) throw new AppError('reminderAt is required', 400);

    const message = await Message.findByIdAndUpdate(
      req.params.id,
      { $set: { reminderAt: new Date(reminderAt), reminderNote } },
      { new: true }
    ).lean({ virtuals: true });

    if (!message) throw new AppError('Message not found', 404);
    res.json({ success: true, data: message } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── POST /messages/:id/replies ────────────────────────────────────────────────
export const addReply = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { text, receivedAt } = req.body as { text: string; receivedAt?: string };
    if (!text?.trim()) throw new AppError('Reply text is required', 400);

    const reply = {
      text: text.trim(),
      receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
    };

    // Also mark channel status as replied
    const message = await Message.findByIdAndUpdate(
      req.params.id,
      {
        $push: { replies: reply },
        $set: {
          repliedAt: reply.receivedAt,
          waStatus: 'replied',     // harmless for email docs; only waStatus field is indexed
          emailStatus: 'replied',
          followUpStatus: 'done',
        },
      },
      { new: true }
    ).lean({ virtuals: true });

    if (!message) throw new AppError('Message not found', 404);
    res.status(201).json({ success: true, data: message } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── DELETE /messages/:id ──────────────────────────────────────────────────────
export const deleteMessage = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);
    if (!message) throw new AppError('Message not found', 404);
    res.json({ success: true, message: 'Message deleted' } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── POST /messages/bulk-follow-up ─────────────────────────────────────────────
// Trigger auto follow-up for all 7-day-overdue messages in a channel
export const triggerBulkFollowUp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { channel } = req.body as { channel?: Channel };

    const matchFilter = {
      ...(channel ? { channel } : {}),
      ...needsAutoFollowUpFilter(),
    };

    const result = await Message.updateMany(matchFilter, {
      $set: { followUpStatus: 'auto_scheduled' },
    });

    res.json({
      success: true,
      message: `${result.modifiedCount} message(s) scheduled for auto follow-up`,
      data: { modifiedCount: result.modifiedCount },
    } as ApiResponse);
  } catch (err) {
    next(err);
  }
};