// routes/whatsappTemplate.router.ts
import { Router } from 'express';
import WhatsAppTemplateController from '../controller/whatsappTemplate.controller';
import { authenticate, authorizeRoles, enforceTenant } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';

const whatsappTemplateRouter = Router();
const ctrl = new WhatsAppTemplateController();

// All routes require authentication + tenant isolation
whatsappTemplateRouter.use(authenticate, enforceTenant);

// ─── Config ──────────────────────────────────────────────────────────────────

// GET  /whatsapp-templates          → get full config (auto-seeds defaults on first call)
whatsappTemplateRouter.get(
  '/',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.getConfig.bind(ctrl)
);

// DELETE /whatsapp-templates        → soft-delete config (SuperAdmin only)
whatsappTemplateRouter.delete(
  '/',
  authorizeRoles([USER_ROLES.SUPER_ADMIN]),
  ctrl.deleteConfig.bind(ctrl)
);

// ─── Categories ───────────────────────────────────────────────────────────────

// POST   /whatsapp-templates/categories            → add a new category
whatsappTemplateRouter.post(
  '/categories',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.addCategory.bind(ctrl)
);

// PATCH  /whatsapp-templates/categories/reorder   → reorder categories
whatsappTemplateRouter.patch(
  '/categories/reorder',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.reorderCategories.bind(ctrl)
);

// PATCH  /whatsapp-templates/categories/:categoryId → update category metadata
whatsappTemplateRouter.patch(
  '/categories/:categoryId',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.updateCategory.bind(ctrl)
);

// DELETE /whatsapp-templates/categories/:categoryId → delete category + its templates
whatsappTemplateRouter.delete(
  '/categories/:categoryId',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.deleteCategory.bind(ctrl)
);

// ─── Templates ────────────────────────────────────────────────────────────────

// POST   /whatsapp-templates/categories/:categoryId/templates
whatsappTemplateRouter.post(
  '/categories/:categoryId/templates',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.addTemplate.bind(ctrl)
);

// PATCH  /whatsapp-templates/categories/:categoryId/templates/:templateId
whatsappTemplateRouter.patch(
  '/categories/:categoryId/templates/:templateId',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.updateTemplate.bind(ctrl)
);

// DELETE /whatsapp-templates/categories/:categoryId/templates/:templateId
whatsappTemplateRouter.delete(
  '/categories/:categoryId/templates/:templateId',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.deleteTemplate.bind(ctrl)
);

// POST   /whatsapp-templates/categories/:categoryId/templates/:templateId/duplicate
whatsappTemplateRouter.post(
  '/categories/:categoryId/templates/:templateId/duplicate',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  ctrl.duplicateTemplate.bind(ctrl)
);

export { whatsappTemplateRouter };