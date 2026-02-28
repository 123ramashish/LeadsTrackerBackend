"use strict";
// import { Router } from 'express';
// import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
// import { USER_ROLES } from '../DataBase/Schema/user.schema';
// import AuthController from '../controller/auth.controller';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
// const router = Router();
// const authController = new AuthController();
// // Public routes
// router.post('/login', authController.login.bind(authController));
// router.post('/otp/request', authController.requestOTP.bind(authController));
// router.post('/password/reset', authController.resetPassword.bind(authController));
// // SuperAdmin setup (run once during deployment)
// router.post(
//   '/superadmin/init', 
//   authorizeRoles([USER_ROLES.SUPER_ADMIN]), // Will fail until first SA created
//   authController.createSuperAdmin.bind(authController)
// );
// // Protected routes
// router.post('/logout', authenticate, authController.logout.bind(authController));
// // router.get('/profile', authenticate, authController?.getProfile?.bind(authController) || ((req, res) => res.sendStatus(404))); // Placeholder if not in controller
// export default router;
// ─── Auth Routes ──────────────────────────────────────────────────────────────
const express_1 = require("express");
const auth_controller_1 = __importDefault(require("../controller/auth.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const authRouter = (0, express_1.Router)();
exports.authRouter = authRouter;
const authController = new auth_controller_1.default();
// Public
authRouter.post('/login', authController.login.bind(authController));
authRouter.post('/otp/request', authController.requestOTP.bind(authController));
authRouter.post('/password/reset', authController.resetPassword.bind(authController));
// One-time SuperAdmin initialisation (protect this endpoint in production!)
authRouter.post('/superadmin/init', authController.initSuperAdmin.bind(authController));
// Protected
authRouter.post('/logout', auth_middleware_1.authenticate, authController.logout.bind(authController));
