// src/controllers/templateController.ts
import { Request, Response, NextFunction } from 'express';
import { Template } from '../DataBase/Schema/template.schema.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { ApiResponse, Channel, PaginationQuery } from '../types/index.js';

// ── GET /templates ────────────────────────────────────────────────────────
export const getTemplates = async (
  req: Request<{}, {}, {}, PaginationQuery & { channel?: Channel; search?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)));
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.channel) filter.channel = req.query.channel;
    if (req.query.search)  filter.$text   = { $search: req.query.search };

    const [templates, total] = await Promise.all([
      Template.find(filter).sort({ usageCount: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Template.countDocuments(filter),
    ]);

    const response: ApiResponse = {
      success: true,
      data: templates,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

// ── GET /templates/:id ────────────────────────────────────────────────────
export const getTemplateById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const template = await Template.findById(req.params.id).lean();
    if (!template) throw new AppError('Template not found', 404);
    res.json({ success: true, data: template } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── POST /templates ───────────────────────────────────────────────────────
export const createTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, channel, subject, body } = req.body as {
      name: string;
      channel: Channel;
      subject?: string;
      body: string;
    };

    if (channel === 'email' && !subject?.trim()) {
      throw new AppError('Subject is required for email templates', 422);
    }

    const template = await Template.create({ name, channel, subject, body });
    res.status(201).json({ success: true, data: template } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── PUT /templates/:id ────────────────────────────────────────────────────
export const updateTemplate = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const allowed = ['name', 'channel', 'subject', 'body'] as const;
    const updates = Object.fromEntries(
      allowed.filter((k) => k in req.body).map((k) => [k, req.body[k]])
    );

    if ((updates.channel ?? undefined) === 'email' && !updates.subject) {
      throw new AppError('Subject is required for email templates', 422);
    }

    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!template) throw new AppError('Template not found', 404);
    res.json({ success: true, data: template } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── DELETE /templates/:id ─────────────────────────────────────────────────
export const deleteTemplate = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const template = await Template.findByIdAndDelete(req.params.id);
    if (!template) throw new AppError('Template not found', 404);
    res.json({ success: true, message: 'Template deleted' } as ApiResponse);
  } catch (err) {
    next(err);
  }
};

// ── POST /templates/:id/use ───────────────────────────────────────────────
// Increment usageCount when template is applied to a composed message
export const incrementTemplateUsage = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { $inc: { usageCount: 1 } },
      { new: true }
    ).lean();
    if (!template) throw new AppError('Template not found', 404);
    res.json({ success: true, data: template } as ApiResponse);
  } catch (err) {
    next(err);
  }
};