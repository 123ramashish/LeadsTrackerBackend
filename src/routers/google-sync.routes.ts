import { Router } from 'express';
import GoogleSyncController from '../controller/google-sync.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';

const googleSyncRouter = Router();
const googleSyncController = new GoogleSyncController();

// All routes require authentication
googleSyncRouter.use(authenticate);

// ─── Google Configuration Routes ─────────────────────────────────────────────

// Get Google config for company
googleSyncRouter.get(
  '/config/:companyId',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  googleSyncController.getGoogleConfig.bind(googleSyncController)
);

// Save/Update Google config
googleSyncRouter.post(
  '/config',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  googleSyncController.saveGoogleConfig.bind(googleSyncController)
);

// Delete Google config
googleSyncRouter.delete(
  '/config/:companyId',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  googleSyncController.deleteGoogleConfig.bind(googleSyncController)
);

// Test Google API connection
googleSyncRouter.post(
  '/test-connection',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  googleSyncController.testGoogleConnection.bind(googleSyncController)
);

// Update rating cache from Google
googleSyncRouter.post(
  '/update-rating-cache',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  googleSyncController.updateRatingCache.bind(googleSyncController)
);

export { googleSyncRouter };