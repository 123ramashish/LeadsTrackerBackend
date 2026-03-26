"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const user_schema_1 = require("../DataBase/Schema/user.schema");
const auth_controller_1 = __importDefault(require("../controller/auth.controller"));
const router = (0, express_1.Router)();
const authController = new auth_controller_1.default();
// Public routes
router.post('/login', authController.login.bind(authController));
router.post('/otp/request', authController.requestOTP.bind(authController));
router.post('/password/reset', authController.resetPassword.bind(authController));
// SuperAdmin setup (run once during deployment)
router.post('/superadmin/init', (0, auth_middleware_1.authorizeRoles)([user_schema_1.USER_ROLES.SUPER_ADMIN]), // Will fail until first SA created
authController.createSuperAdmin.bind(authController));
// Protected routes
router.post('/logout', auth_middleware_1.authenticate, authController.logout.bind(authController));
// router.get('/profile', authenticate, authController?.getProfile?.bind(authController) || ((req, res) => res.sendStatus(404))); // Placeholder if not in controller
exports.default = router;
//# sourceMappingURL=auth.router.js.map