import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import multer from "multer";
import LeaveController from "../controller/leave.controller";
const leaveRouter = Router();

// Use memory storage so we can forward buffers to ImageKit
const upload = multer({ storage: multer.memoryStorage() });

// JSON routes
leaveRouter.post("/", authenticate, LeaveController.createLeave);
leaveRouter.get("/", authenticate, LeaveController.getLeaves);
leaveRouter.put("/", authenticate, LeaveController.updateLeave);

// File-based routes
// Your original code used DELETE to upload HRM files – we keep parity:
leaveRouter.delete("/", authenticate, upload.any(), LeaveController.uploadHRM);
// OPTIONS to list HRM files (kept for parity)
leaveRouter.options("/", authenticate, LeaveController.getLeaveFiles);

// Comment with optional image
leaveRouter.patch("/", authenticate, upload.any(), LeaveController.commentLeave);

export default leaveRouter;
