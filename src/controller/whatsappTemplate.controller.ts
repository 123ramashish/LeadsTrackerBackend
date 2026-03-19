// controller/whatsappTemplate.controller.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import WhatsAppTemplateConfig from '../DataBase/Schema/whatsappTemplate.schema';

// ── Augmented Request (set by auth middleware) ─────────────────────────────────
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    companyId: string;
    isSuperAdmin?: boolean;
  };
}

// ── Utility: extract {variable} placeholders from message body ────────────────
function extractVars(tpl: string): string[] {
  const matches = [...tpl.matchAll(/\{(\w+)\}/g)];
  return [...new Set(matches.map(m => m[1]))];
}

// ── Utility: resolve companyId (SuperAdmin can pass ?companyId=xxx) ────────────
function resolveCompanyId(req: AuthRequest): string | null {
  const user = req.user!;
  if (user.isSuperAdmin && req.query.companyId) {
    const id = String(req.query.companyId);
    return mongoose.Types.ObjectId.isValid(id) ? id : null;
  }
  return user.companyId ?? null;
}

export default class WhatsAppTemplateController {

  // ───────────────────────────────────────────────────────────────────────────
  // GET /whatsapp-templates
  // Returns the full config (all categories + templates) for a company.
  // Creates a default config if none exists yet.
  // ───────────────────────────────────────────────────────────────────────────
  async getConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }

      let config = await WhatsAppTemplateConfig.findOne({ company: companyId, isDeleted: false }).lean();

      // Auto-seed default templates on first access
      if (!config) {
        const defaults = (WhatsAppTemplateConfig as any).getDefaultCategories();
        const created  = await WhatsAppTemplateConfig.create({
          company:    companyId,
          categories: defaults,
          createdBy:  req.user!.id,
          updatedBy:  req.user!.id,
        });
        config = created.toObject() as any;
      }

      res.json({ data: config });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to fetch templates', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /whatsapp-templates/categories
  // Add a new category to the company's config.
  // ───────────────────────────────────────────────────────────────────────────
  async addCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }

      const { key, label, emoji = '💬', order } = req.body as {
        key: string; label: string; emoji?: string; order?: number;
      };

      if (!key?.trim() || !label?.trim()) {
        res.status(400).json({ message: 'key and label are required' }); return;
      }
      if (!/^\w+$/.test(key)) {
        res.status(400).json({ message: 'key must be alphanumeric (no spaces)' }); return;
      }

      const config = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false,
          'categories.key': { $ne: key.toUpperCase() } },         // prevent duplicate category keys
        {
          $push: {
            categories: {
              key: key.toUpperCase(), label: label.trim(), emoji,
              templates: [], isActive: true,
              order: order ?? 999,
            } as any,
          },
          $set: { updatedBy: req.user!.id },
        },
        { new: true, upsert: true, runValidators: true }
      ).lean();

      if (!config) {
        res.status(409).json({ message: `Category with key "${key.toUpperCase()}" already exists` }); return;
      }

      const added = config.categories.find((c: any) => c.key === key.toUpperCase());
      res.status(201).json({ message: 'Category created', data: added });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to add category', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PATCH /whatsapp-templates/categories/:categoryId
  // Update a category's metadata (key, label, emoji, order, isActive).
  // ───────────────────────────────────────────────────────────────────────────
  async updateCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      const { categoryId } = req.params;

      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }
      if (!mongoose.Types.ObjectId.isValid(categoryId)) { res.status(400).json({ message: 'Invalid category ID' }); return; }

      const { label, emoji, order, isActive, key } = req.body as Partial<{
        key: string; label: string; emoji: string; order: number; isActive: boolean;
      }>;

      const setFields: Record<string, unknown> = { updatedBy: req.user!.id };
      if (label    !== undefined) setFields['categories.$.label']    = label.trim();
      if (emoji    !== undefined) setFields['categories.$.emoji']    = emoji;
      if (order    !== undefined) setFields['categories.$.order']    = order;
      if (isActive !== undefined) setFields['categories.$.isActive'] = isActive;
      if (key      !== undefined) {
        if (!/^\w+$/.test(key)) { res.status(400).json({ message: 'key must be alphanumeric' }); return; }
        setFields['categories.$.key'] = key.toUpperCase();
      }

      if (Object.keys(setFields).length === 1) { // only updatedBy
        res.status(400).json({ message: 'No valid fields to update' }); return;
      }

      const config = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false, 'categories._id': categoryId },
        { $set: setFields },
        { new: true, runValidators: true }
      ).lean();

      if (!config) { res.status(404).json({ message: 'Config or category not found' }); return; }

      const updated = config.categories.find((c: any) => String(c._id) === categoryId);
      res.json({ message: 'Category updated', data: updated });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to update category', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DELETE /whatsapp-templates/categories/:categoryId
  // Remove an entire category (and all its templates) from the config.
  // ───────────────────────────────────────────────────────────────────────────
  async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      const { categoryId } = req.params;

      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }
      if (!mongoose.Types.ObjectId.isValid(categoryId)) { res.status(400).json({ message: 'Invalid category ID' }); return; }

      const config = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $pull: { categories: { _id: new mongoose.Types.ObjectId(categoryId) } } as any,
          $set:  { updatedBy: req.user!.id },
        },
        { new: true }
      ).lean();

      if (!config) { res.status(404).json({ message: 'Config not found' }); return; }
      res.json({ message: 'Category deleted successfully' });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to delete category', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /whatsapp-templates/categories/:categoryId/templates
  // Add a new template to a specific category.
  // ───────────────────────────────────────────────────────────────────────────
  async addTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      const { categoryId } = req.params;

      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }
      if (!mongoose.Types.ObjectId.isValid(categoryId)) { res.status(400).json({ message: 'Invalid category ID' }); return; }

      const { key, desc = '', tpl } = req.body as { key: string; desc?: string; tpl: string };

      if (!key?.trim() || !tpl?.trim()) {
        res.status(400).json({ message: 'key and tpl are required' }); return;
      }
      if (!/^\w+$/.test(key)) {
        res.status(400).json({ message: 'key must be alphanumeric with underscores only' }); return;
      }
      if (tpl.length > 4096) {
        res.status(400).json({ message: 'Message body cannot exceed 4096 characters' }); return;
      }

      const vars = extractVars(tpl);
      const newTemplate = {
        key:      key.toUpperCase(),
        desc:     desc.trim(),
        tpl:      tpl.trim(),
        vars,
        isActive: true,
      };

      // Check for duplicate template key within the category
      const existing = await WhatsAppTemplateConfig.findOne({
        company:             companyId,
        isDeleted:           false,
        'categories._id':    categoryId,
        'categories.templates.key': key.toUpperCase(),
      });
      if (existing) {
        res.status(409).json({ message: `Template with key "${key.toUpperCase()}" already exists in this category` }); return;
      }

      const config = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false, 'categories._id': categoryId },
        {
          $push: { 'categories.$.templates': newTemplate } as any,
          $set:  { updatedBy: req.user!.id },
        },
        { new: true, runValidators: true }
      ).lean();

      if (!config) { res.status(404).json({ message: 'Config or category not found' }); return; }

      const category = config.categories.find((c: any) => String(c._id) === categoryId);
      const added    = category?.templates[category.templates.length - 1];
      res.status(201).json({ message: 'Template created', data: added });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to add template', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PATCH /whatsapp-templates/categories/:categoryId/templates/:templateId
  // Update a specific template's key, desc, tpl, or isActive.
  // ───────────────────────────────────────────────────────────────────────────
  async updateTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      const { categoryId, templateId } = req.params;

      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }
      if (!mongoose.Types.ObjectId.isValid(categoryId) || !mongoose.Types.ObjectId.isValid(templateId)) {
        res.status(400).json({ message: 'Invalid category or template ID' }); return;
      }

      const { key, desc, tpl, isActive } = req.body as Partial<{
        key: string; desc: string; tpl: string; isActive: boolean;
      }>;

      const setFields: Record<string, unknown> = { updatedBy: req.user!.id };

      if (key !== undefined) {
        if (!/^\w+$/.test(key)) { res.status(400).json({ message: 'key must be alphanumeric' }); return; }
        setFields['categories.$[cat].templates.$[tpl].key'] = key.toUpperCase();
      }
      if (desc     !== undefined) setFields['categories.$[cat].templates.$[tpl].desc']     = desc.trim();
      if (isActive !== undefined) setFields['categories.$[cat].templates.$[tpl].isActive'] = isActive;
      if (tpl      !== undefined) {
        if (tpl.length > 4096) { res.status(400).json({ message: 'Message cannot exceed 4096 chars' }); return; }
        setFields['categories.$[cat].templates.$[tpl].tpl']  = tpl.trim();
        setFields['categories.$[cat].templates.$[tpl].vars'] = extractVars(tpl);
      }

      if (Object.keys(setFields).length === 1) {
        res.status(400).json({ message: 'No valid fields to update' }); return;
      }

      const config = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        { $set: setFields },
        {
          new: true,
          runValidators: true,
          arrayFilters: [
            { 'cat._id': new mongoose.Types.ObjectId(categoryId) },
            { 'tpl._id': new mongoose.Types.ObjectId(templateId) },
          ],
        }
      ).lean();

      if (!config) { res.status(404).json({ message: 'Config, category, or template not found' }); return; }

      const category = config.categories.find((c: any) => String(c._id) === categoryId);
      const updated  = category?.templates.find((t: any) => String(t._id) === templateId);
      res.json({ message: 'Template updated', data: updated });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to update template', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DELETE /whatsapp-templates/categories/:categoryId/templates/:templateId
  // Remove a specific template from a category.
  // ───────────────────────────────────────────────────────────────────────────
  async deleteTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      const { categoryId, templateId } = req.params;

      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }
      if (!mongoose.Types.ObjectId.isValid(categoryId) || !mongoose.Types.ObjectId.isValid(templateId)) {
        res.status(400).json({ message: 'Invalid category or template ID' }); return;
      }

      const config = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $pull: { 'categories.$[cat].templates': { _id: new mongoose.Types.ObjectId(templateId) } } as any,
          $set:  { updatedBy: req.user!.id },
        },
        {
          new: true,
          arrayFilters: [{ 'cat._id': new mongoose.Types.ObjectId(categoryId) }],
        }
      ).lean();

      if (!config) { res.status(404).json({ message: 'Config or category not found' }); return; }
      res.json({ message: 'Template deleted successfully' });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to delete template', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /whatsapp-templates/categories/:categoryId/templates/:templateId/duplicate
  // Duplicate a template within the same category (appends _COPY to key).
  // ───────────────────────────────────────────────────────────────────────────
  async duplicateTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      const { categoryId, templateId } = req.params;

      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }
      if (!mongoose.Types.ObjectId.isValid(categoryId) || !mongoose.Types.ObjectId.isValid(templateId)) {
        res.status(400).json({ message: 'Invalid category or template ID' }); return;
      }

      const config = await WhatsAppTemplateConfig.findOne({
        company: companyId, isDeleted: false, 'categories._id': categoryId,
      });
      if (!config) { res.status(404).json({ message: 'Config or category not found' }); return; }

      const category = config.categories.find((c: any) => String(c._id) === categoryId);
      const source   = category?.templates.find((t: any) => String(t._id) === templateId);
      if (!source) { res.status(404).json({ message: 'Template not found' }); return; }

      // Resolve a unique key
      let newKey = source.key + '_COPY';
      let suffix = 1;
      const existingKeys = new Set(category!.templates.map(t => t.key));
      while (existingKeys.has(newKey)) { newKey = `${source.key}_COPY${++suffix}`; }

      const duplicate = {
        key:      newKey,
        desc:     source.desc ? `${source.desc} (copy)` : '',
        tpl:      source.tpl,
        vars:     source.vars,
        isActive: true,
      };

      config.categories = config.categories.map((c: any) => {
        if (String(c._id) !== categoryId) return c;
        (c.templates as any).push(duplicate);
        return c;
      }) as any;

      config.updatedBy = new mongoose.Types.ObjectId(req.user!.id) as any;
      await config.save();

      const saved = config.categories
        .find((c: any) => String(c._id) === categoryId)
        ?.templates.slice(-1)[0];

      res.status(201).json({ message: 'Template duplicated', data: saved });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to duplicate template', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PATCH /whatsapp-templates/categories/reorder
  // Reorder categories by submitting an array of { id, order } pairs.
  // ───────────────────────────────────────────────────────────────────────────
  async reorderCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }

      const { orders } = req.body as { orders: { id: string; order: number }[] };
      if (!Array.isArray(orders) || !orders.length) {
        res.status(400).json({ message: 'orders array is required' }); return;
      }

      const config = await WhatsAppTemplateConfig.findOne({ company: companyId, isDeleted: false });
      if (!config) { res.status(404).json({ message: 'Config not found' }); return; }

      orders.forEach(({ id, order }) => {
        const cat = config.categories.find((c: any) => String(c._id) === id);
        if (cat) cat.order = order;
      });

      config.updatedBy = new mongoose.Types.ObjectId(req.user!.id) as any;
      await config.save();

      res.json({ message: 'Categories reordered', data: config.categories });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to reorder categories', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DELETE /whatsapp-templates  (SuperAdmin only)
  // Soft-delete the entire config for a company.
  // ───────────────────────────────────────────────────────────────────────────
  async deleteConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid or missing company ID' }); return; }

      const config = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: req.user!.id } },
        { new: true }
      );

      if (!config) { res.status(404).json({ message: 'Config not found' }); return; }
      res.json({ message: 'WhatsApp template config deleted' });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to delete config', error: (err as Error).message });
    }
  }
}