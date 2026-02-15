import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';
import AuthController from '../controller/auth.controller';

const router = Router();
const authController = new AuthController();

// Public routes
router.post('/login', authController.login.bind(authController));
router.post('/otp/request', authController.requestOTP.bind(authController));
router.post('/password/reset', authController.resetPassword.bind(authController));

// SuperAdmin setup (run once during deployment)
router.post(
  '/superadmin/init', 
  authorizeRoles([USER_ROLES.SUPER_ADMIN]), // Will fail until first SA created
  authController.createSuperAdmin.bind(authController)
);

// Protected routes
router.post('/logout', authenticate, authController.logout.bind(authController));
// router.get('/profile', authenticate, authController?.getProfile?.bind(authController) || ((req, res) => res.sendStatus(404))); // Placeholder if not in controller

export default router;