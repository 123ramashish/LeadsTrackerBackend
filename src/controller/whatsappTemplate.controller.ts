// controller/whatsappTemplate.controller.ts
import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import WhatsAppTemplateConfig, { ICategory } from '../DataBase/Schema/whatsappTemplate.schema';

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

// ── Typed request bodies ───────────────────────────────────────────────────────
interface AddCategoryBody {
  key: string;
  label: string;
  emoji?: string;
  order?: number;
}

interface UpdateCategoryBody {
  key?: string;
  label?: string;
  emoji?: string;
  order?: number;
  isActive?: boolean;
}

interface AddTemplateBody {
  key: string;
  desc?: string;
  tpl: string;
}

interface UpdateTemplateBody {
  key?: string;
  desc?: string;
  tpl?: string;
  isActive?: boolean;
}

interface ReorderBody {
  orders: { id: string; order: number }[];
}

// ── Utility: extract {variable} placeholders from message body ────────────────
function extractVars(template: string): string[] {
  const matches = [...template.matchAll(/\{(\w+)\}/g)];
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
      const companyId = '69bc5a2429f7f7c6bcd035a3'
      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }

      let config: any = await WhatsAppTemplateConfig
        .findOne({ company: companyId, isDeleted: false })
        .lean();

      // Auto-seed default templates on first access
      if (!config) {
        const defaults = (WhatsAppTemplateConfig as any).getDefaultCategories() as ICategory[];
        const created = await WhatsAppTemplateConfig.create({
          company:    companyId,
          categories: defaults,
          createdBy:  new Types.ObjectId('69bc5a2429f7f7c6bcd035a5'),
          updatedBy:  new Types.ObjectId('69bc5a2429f7f7c6bcd035a5'),
        });
        config = created.toObject();
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
      const companyId = '69bc5a2429f7f7c6bcd035a3'
      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }

      const { key, label, emoji = '💬', order } = req.body as AddCategoryBody;

      if (!key?.trim() || !label?.trim()) {
        res.status(400).json({ message: 'key and label are required' });
        return;
      }
      if (!/^\w+$/.test(key)) {
        res.status(400).json({ message: 'key must be alphanumeric (no spaces)' });
        return;
      }

      const normalizedKey = key.toUpperCase();

      // FIX: Removed upsert:true — it was masking 409s and could create orphan docs.
      // Instead: verify the config exists, then check for a duplicate key in-memory,
      // then push the new category in a separate update.
      const existing: any = await WhatsAppTemplateConfig
        .findOne({ company: companyId, isDeleted: false })
        .lean();

      if (!existing) {
        res.status(404).json({ message: 'Template config not found. Fetch GET /whatsapp-templates first to auto-create it.' });
        return;
      }

      const duplicate = existing.categories.some((c: any) => c.key === normalizedKey);
      if (duplicate) {
        res.status(409).json({ message: `Category with key "${normalizedKey}" already exists` });
        return;
      }

      const newCategory = {
        key:       normalizedKey,
        label:     label.trim(),
        emoji,
        templates: [],
        isActive:  true,
        order:     order ?? 999,
      };

      const config: any = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $push: { categories: newCategory } as any,
          $set:  { updatedBy: new Types.ObjectId('69bc5a2429f7f7c6bcd035a5') },
        },
        { new: true, runValidators: true }
      ).lean();

      if (!config) {
        res.status(404).json({ message: 'Config not found' });
        return;
      }

      const added = config.categories.find((c: any) => c.key === normalizedKey);
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

      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }
      if (!mongoose.Types.ObjectId.isValid(categoryId as string)) {
        res.status(400).json({ message: 'Invalid category ID' });
        return;
      }

      const { label, emoji, order, isActive, key } = req.body as UpdateCategoryBody;

      const setFields: Record<string, unknown> = {
        updatedBy: new Types.ObjectId(req.user!.id),
      };

      if (label    !== undefined) setFields['categories.$.label']    = label.trim();
      if (emoji    !== undefined) setFields['categories.$.emoji']    = emoji;
      if (order    !== undefined) setFields['categories.$.order']    = order;
      if (isActive !== undefined) setFields['categories.$.isActive'] = isActive;
      if (key      !== undefined) {
        if (!/^\w+$/.test(key)) {
          res.status(400).json({ message: 'key must be alphanumeric' });
          return;
        }
        setFields['categories.$.key'] = key.toUpperCase();
      }

      // Only updatedBy means nothing to change
      if (Object.keys(setFields).length === 1) {
        res.status(400).json({ message: 'No valid fields to update' });
        return;
      }

      const config: any = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false, 'categories._id': new Types.ObjectId(categoryId as string) } as any,
        { $set: setFields } as any,
        { new: true, runValidators: true }
      ).lean();

      if (!config) {
        res.status(404).json({ message: 'Config or category not found' });
        return;
      }

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

      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }
      if (!mongoose.Types.ObjectId.isValid(categoryId as string)) {
        res.status(400).json({ message: 'Invalid category ID' });
        return;
      }

      const config: any = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $pull: { categories: { _id: new Types.ObjectId(categoryId as string) } } as any,
          $set:  { updatedBy: new Types.ObjectId(req.user!.id) },
        },
        { new: true }
      ).lean();

      if (!config) {
        res.status(404).json({ message: 'Config not found' });
        return;
      }
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

      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }
      if (!mongoose.Types.ObjectId.isValid(categoryId as string)) {
        res.status(400).json({ message: 'Invalid category ID' });
        return;
      }

      const { key, desc = '', tpl } = req.body as AddTemplateBody;

      if (!key?.trim() || !tpl?.trim()) {
        res.status(400).json({ message: 'key and tpl are required' });
        return;
      }
      if (!/^\w+$/.test(key)) {
        res.status(400).json({ message: 'key must be alphanumeric with underscores only' });
        return;
      }
      if (tpl.length > 4096) {
        res.status(400).json({ message: 'Message body cannot exceed 4096 characters' });
        return;
      }

      const normalizedKey = key.toUpperCase();

      // Check for duplicate template key within category
      const existing = await WhatsAppTemplateConfig.findOne({
        company:                     companyId,
        isDeleted:                   false,
        'categories._id':            new mongoose.Types.ObjectId(categoryId as string),
        'categories.templates.key':  normalizedKey,
      } as any).lean();

      if (existing) {
        res.status(409).json({ message: `Template with key "${normalizedKey}" already exists in this category` });
        return;
      }

      const newTemplate = {
        key:      normalizedKey,
        desc:     desc.trim(),
        tpl:      tpl.trim(),
        vars:     extractVars(tpl),
        isActive: true,
      };

      const config: any = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false, 'categories._id': new Types.ObjectId(categoryId as string) } as any,
        {
          $push: { 'categories.$.templates': newTemplate } as any,
          $set:  { updatedBy: new Types.ObjectId(req.user!.id) },
        },
        { new: true, runValidators: true }
      ).lean();

      if (!config) {
        res.status(404).json({ message: 'Config or category not found' });
        return;
      }

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
  //
  // FIX: Renamed destructured body field `tpl` → `tplBody` to eliminate the
  //      name clash with the `$[tpl]` array-filter identifier used as an object
  //      key string. Without the rename TypeScript (strict mode) flags the
  //      re-use and code-readers are confused about which `tpl` is which.
  // ───────────────────────────────────────────────────────────────────────────
  async updateTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      const { categoryId, templateId } = req.params;

      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }
      if (
        !mongoose.Types.ObjectId.isValid(categoryId as string) ||
        !mongoose.Types.ObjectId.isValid(templateId as string)
      ) {
        res.status(400).json({ message: 'Invalid category or template ID' });
        return;
      }

      // Renamed `tpl` → `tplBody` to avoid collision with the `$[tpl]` filter alias
      const { key, desc, tpl: tplBody, isActive } = req.body as UpdateTemplateBody;

      const setFields: Record<string, unknown> = {
        updatedBy: new Types.ObjectId(req.user!.id),
      };

      if (key !== undefined) {
        if (!/^\w+$/.test(key)) {
          res.status(400).json({ message: 'key must be alphanumeric' });
          return;
        }
        setFields['categories.$[cat].templates.$[tpl].key'] = key.toUpperCase();
      }
      if (desc     !== undefined) setFields['categories.$[cat].templates.$[tpl].desc']     = desc.trim();
      if (isActive !== undefined) setFields['categories.$[cat].templates.$[tpl].isActive'] = isActive;
      if (tplBody  !== undefined) {
        if (tplBody.length > 4096) {
          res.status(400).json({ message: 'Message cannot exceed 4096 chars' });
          return;
        }
        setFields['categories.$[cat].templates.$[tpl].tpl']  = tplBody.trim();
        setFields['categories.$[cat].templates.$[tpl].vars'] = extractVars(tplBody);
      }

      if (Object.keys(setFields).length === 1) {
        res.status(400).json({ message: 'No valid fields to update' });
        return;
      }

      const config: any = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        { $set: setFields } as any,
        {
          new:          true,
          runValidators: true,
          arrayFilters: [
            { 'cat._id': new Types.ObjectId(categoryId as string) },
            { 'tpl._id': new Types.ObjectId(templateId as string) },
          ],
        } as any
      ).lean();

      if (!config) {
        res.status(404).json({ message: 'Config, category, or template not found' });
        return;
      }

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

      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }
      if (
        !mongoose.Types.ObjectId.isValid(categoryId as string) ||
        !mongoose.Types.ObjectId.isValid(templateId as string)
      ) {
        res.status(400).json({ message: 'Invalid category or template ID' });
        return;
      }

      const config: any = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $pull: { 'categories.$[cat].templates': { _id: new Types.ObjectId(templateId as string) } } as any,
          $set:  { updatedBy: new Types.ObjectId(req.user!.id) },
        },
        {
          new:          true,
          arrayFilters: [{ 'cat._id': new Types.ObjectId(categoryId as string) }],
        } as any
      ).lean();

      if (!config) {
        res.status(404).json({ message: 'Config or category not found' });
        return;
      }
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

      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }
      if (
        !mongoose.Types.ObjectId.isValid(categoryId as string) ||
        !mongoose.Types.ObjectId.isValid(templateId as string)
      ) {
        res.status(400).json({ message: 'Invalid category or template ID' });
        return;
      }

      const config = await WhatsAppTemplateConfig.findOne({
        company:          companyId,
        isDeleted:        false,
        'categories._id': new Types.ObjectId(categoryId as string),
      } as any);
      if (!config) {
        res.status(404).json({ message: 'Config or category not found' });
        return;
      }

      // FIX: Use explicit `any` casts only on sub-document access where Mongoose
      //      types don't expose the full shape. Avoids blanket `as any` on the
      //      whole categories array assignment.
      const category = config.categories.find(
        (c: any) => String(c._id) === categoryId
      ) as any;
      const source = category?.templates.find(
        (t: any) => String(t._id) === templateId
      ) as any;

      if (!source) {
        res.status(404).json({ message: 'Template not found' });
        return;
      }

      // Resolve a unique key (SOURCE_COPY, SOURCE_COPY2, SOURCE_COPY3 …)
      let newKey = `${source.key}_COPY`;
      let suffix = 1;
      const existingKeys = new Set<string>(category.templates.map((t: any) => t.key as string));
      while (existingKeys.has(newKey)) {
        newKey = `${source.key}_COPY${++suffix}`;
      }

      const duplicate = {
        key:      newKey,
        desc:     source.desc ? `${source.desc} (copy)` : '',
        tpl:      source.tpl  as string,
        vars:     source.vars as string[],
        isActive: true,
      };

      // Push duplicate into the matching category
      for (const cat of config.categories as any[]) {
        if (String(cat._id) === categoryId) {
          cat.templates.push(duplicate);
          break;
        }
      }

      config.updatedBy = new Types.ObjectId(req.user!.id) as any;
      await config.save();

      const savedCategory = config.categories.find(
        (c: any) => String(c._id) === categoryId
      ) as any;
      const saved = savedCategory?.templates.slice(-1)[0];

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
      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }

      const { orders } = req.body as ReorderBody;
      if (!Array.isArray(orders) || !orders.length) {
        res.status(400).json({ message: 'orders array is required' });
        return;
      }

      const config = await WhatsAppTemplateConfig.findOne({
        company:   companyId,
        isDeleted: false,
      });
      if (!config) {
        res.status(404).json({ message: 'Config not found' });
        return;
      }

      orders.forEach(({ id, order }) => {
        const cat = config.categories.find((c: any) => String(c._id) === id) as any;
        if (cat) cat.order = order;
      });

      config.updatedBy = new Types.ObjectId(req.user!.id) as any;
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
      if (!companyId) {
        res.status(400).json({ message: 'Invalid or missing company ID' });
        return;
      }

      const config = await WhatsAppTemplateConfig.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedBy: new Types.ObjectId(req.user!.id),
          },
        },
        { new: true }
      );

      if (!config) {
        res.status(404).json({ message: 'Config not found' });
        return;
      }
      res.json({ message: 'WhatsApp template config deleted' });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to delete config', error: (err as Error).message });
    }
  }
}