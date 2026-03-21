// ─────────────────────────────────────────────────────────────────────────────
// routes/whatsappTemplate.router.ts
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import WhatsAppTemplateController from '../controller/whatsappTemplate.controller';
import { authenticate, authorizeRoles, enforceTenant } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';

const whatsappTemplateRouter = Router();
const ctrl = new WhatsAppTemplateController();

// All routes require auth + tenant isolation
// whatsappTemplateRouter.use(authenticate, enforceTenant);

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * GET  /whatsapp-templates
 * Fetch full config (categories + templates). Auto-seeds defaults on first call.
 * Roles: SUPER_ADMIN, ADMIN
 */
whatsappTemplateRouter.get(
  '/',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.getConfig.bind(ctrl)
);

/**
 * DELETE /whatsapp-templates
 * Soft-delete entire config for a company.
 * Roles: SUPER_ADMIN only
 */
whatsappTemplateRouter.delete(
  '/',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN]),
  ctrl.deleteConfig.bind(ctrl)
);

// ── Categories ────────────────────────────────────────────────────────────────

/**
 * POST /whatsapp-templates/categories
 * Body: { key, label, emoji?, order? }
 */
whatsappTemplateRouter.post(
  '/categories',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.addCategory.bind(ctrl)
);

/**
 * PATCH /whatsapp-templates/categories/reorder
 * Body: { orders: [{ id, order }] }
 * NOTE: Must stay above /:categoryId to avoid Express matching "reorder" as an ID.
 */
whatsappTemplateRouter.patch(
  '/categories/reorder',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.reorderCategories.bind(ctrl)
);

/**
 * PATCH /whatsapp-templates/categories/:categoryId
 * Body: { key?, label?, emoji?, order?, isActive? }
 */
whatsappTemplateRouter.patch(
  '/categories/:categoryId',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.updateCategory.bind(ctrl)
);

/**
 * DELETE /whatsapp-templates/categories/:categoryId
 * Removes the category and all its templates.
 */
whatsappTemplateRouter.delete(
  '/categories/:categoryId',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.deleteCategory.bind(ctrl)
);

// ── Templates ─────────────────────────────────────────────────────────────────

/**
 * POST /whatsapp-templates/categories/:categoryId/templates
 * Body: { key, tpl, desc? }
 * FIX: was missing ctrl.addTemplate.bind(ctrl)
 */
whatsappTemplateRouter.post(
  '/categories/:categoryId/templates',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.addTemplate.bind(ctrl)
);

/**
 * POST /whatsapp-templates/categories/:categoryId/templates/:templateId/duplicate
 * NOTE: Must stay above /:templateId PATCH/DELETE to avoid "duplicate" being
 *       treated as a templateId param.
 */
whatsappTemplateRouter.post(
  '/categories/:categoryId/templates/:templateId/duplicate',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.duplicateTemplate.bind(ctrl)
);

/**
 * PATCH /whatsapp-templates/categories/:categoryId/templates/:templateId
 * Body: { key?, desc?, tpl?, isActive? }
 */
whatsappTemplateRouter.patch(
  '/categories/:categoryId/templates/:templateId',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.updateTemplate.bind(ctrl)
);

/**
 * DELETE /whatsapp-templates/categories/:categoryId/templates/:templateId
 * Removes a single template from the category.
 */
whatsappTemplateRouter.delete(
  '/categories/:categoryId/templates/:templateId',
  // authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.deleteTemplate.bind(ctrl)
);

export default whatsappTemplateRouter;