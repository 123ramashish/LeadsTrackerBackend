import { Router } from "express";
import AuthController from "../controller/auth.controller";

const router = Router();
const authController = new AuthController();

router.post("/login-email", authController.loginWithEmail.bind(authController));
router.post("/login-phone", authController.loginWithPhone.bind(authController));
router.post("/refresh-token",  authController.refreshToken.bind(authController));
router.post("/generate-otp",  authController.generateOtp.bind(authController));

export default router;
