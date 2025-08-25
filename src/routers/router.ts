import { Router } from "express";
import userRouter from "./user.router";
import registrationRouter from "./registration.router";
import authRouter from "./auth.router";
import taskRouter from "./task.router";
import goalRouter from "./goal.router";
import repeatTaskRouter from "./repeatTask.router";
import fileRouter from "./file.router";
import dashboardRouter from "./dashboard.router";
import attendanceRouter from "./attendance.router";
import leadRouter from "./lead.router";
import suggestionRouter from "./suggestions.router";
import feedbackRouter from "./feedback.router";
import leaveRouter from "./leave.router";
import notificationRouter from "./notification.router";

const router = Router();

router.use("/dashboard", dashboardRouter);
router.use("/attendance", attendanceRouter);
router.use("/suggestions", suggestionRouter);
router.use("/feedbacks", feedbackRouter);
router.use("/user", userRouter);
router.use("/leads", leadRouter);
router.use("/registration", registrationRouter);
router.use("/auth", authRouter);
router.use("/task", taskRouter);
router.use("/repeatTask", repeatTaskRouter);
router.use("/goal", goalRouter);
router.use("/file", fileRouter);
router.use("/notification", notificationRouter);
router.use("/", (req, res) => {
  res.status(200).json({ message: "Welcome to the Task Management API" });
});
export default router;
