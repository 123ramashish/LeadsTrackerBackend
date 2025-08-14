"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = __importDefault(require("../controller/auth.controller"));
const router = (0, express_1.Router)();
const authController = new auth_controller_1.default();
router.post("/login-email", authController.loginWithEmail.bind(authController));
router.post("/login-phone", authController.loginWithPhone.bind(authController));
router.post("/refresh-token", authController.refreshToken.bind(authController));
router.post("/generate-otp", authController.generateOtp.bind(authController));
exports.default = router;
//# sourceMappingURL=auth.router.js.map