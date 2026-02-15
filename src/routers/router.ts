import { Router } from "express";
import userRouter from "./user.router";
import registrationRouter from "./registration.router";
import authRouter from "./auth.router";
import notificationRouter from "./notification.router";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.use("/users", userRouter);
router.use("/companies", registrationRouter);
router.use("/auth", authRouter);
router.use("/notifications", notificationRouter);

router.use("/", (req, res) => {
  res.status(200).json({ message: "Welcome to the Task Management API!" });
});
export default router;
