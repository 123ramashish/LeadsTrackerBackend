import { Router } from "express";
import AuthController from "../controller/auth.controller";

const router = Router();
const authController = new AuthController();

router.post("/login-email", authController.loginWithEmail.bind(authController));
router.post("/login-phone", authController.loginWithPhone.bind(authController));
router.post("/generate-otp",  authController.generateOtp.bind(authController));
router.post("/forgot-password",  authController.ForgotPassword.bind(authController));
router.post("/verify-otp",  authController.CheckOTP.bind(authController));
router.post("/reset-password",  authController.ResetPassword.bind(authController));

export default router;
