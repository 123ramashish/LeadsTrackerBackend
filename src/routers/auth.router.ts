// routers/auth.router.ts
// ─── Auth Routes ──────────────────────────────────────────────────────────────
import { Router } from 'express';
import AuthController from '../controller/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const authRouter = Router();
const authController = new AuthController();

// Public
authRouter.post('/login', authController.login.bind(authController));
authRouter.post('/otp/request', authController.requestOTP.bind(authController));
authRouter.post('/password/reset', authController.resetPassword.bind(authController));

// One-time SuperAdmin initialisation (protect this endpoint in production!)
authRouter.post('/superadmin/init', authController.initSuperAdmin.bind(authController));

// Protected
authRouter.post('/logout', authenticate, authController.logout.bind(authController));

export { authRouter };