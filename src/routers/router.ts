import { Router } from "express";
import userRouter from "./user.router";
import registrationRouter from "./registration.router";
import authRouter from "./auth.router";
import taskRouter from "./task.router";

const router = Router();
router.use("/", (req, res) => {
  res.status(200).json({ message: "Welcome to the Task Management API" });
});
router.use("/user", userRouter);
router.use("/registration", registrationRouter);
router.use("/auth", authRouter);
router.use("/task", taskRouter);

export default router;
