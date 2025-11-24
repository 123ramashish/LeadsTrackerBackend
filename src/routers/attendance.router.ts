import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import AttendanceController from "../controller/attendance.controller";
import multer from "multer";
import LeaveController from "../controller/leave.controller";
const attendanceRouter = Router();

attendanceRouter.post("/messages", authenticate, AttendanceController.addMessageOnAttendance);
attendanceRouter.patch("/messages", authenticate, AttendanceController.updateMessageStatus);
attendanceRouter.post("/", authenticate, AttendanceController.punchHandler);
attendanceRouter.get("/", authenticate, AttendanceController.getAttendance);
attendanceRouter.get("/messages", authenticate, AttendanceController.getMessage);
// attendanceRouter.put("/", authenticate, AttendanceController.checkActiveSession);
// attendanceRouter.patch("/", authenticate, AttendanceController.exportExcelData);
// attendanceRouter.delete("/", authenticate, AttendanceController.deleteImageKitFile);

// Use memory storage so we can forward buffers to ImageKit
const upload = multer({ storage: multer.memoryStorage() });

// JSON routes 
attendanceRouter.post("/leave", authenticate, LeaveController.createLeave);
attendanceRouter.get("/leave", authenticate, LeaveController.getLeaves);
attendanceRouter.put("/leave", authenticate, LeaveController.updateLeave);

// File-based routes
// Your original code used DELETE to upload HRM files – we keep parity:
attendanceRouter.delete("/leave", authenticate, upload.any(), LeaveController.uploadHRM);
// OPTIONS to list HRM files (kept for parity)
attendanceRouter.options("/leave", authenticate, LeaveController.getLeaveFiles);

// Comment with optional image
attendanceRouter.patch("/leave", authenticate, upload.any(), LeaveController.commentLeave);

// upload report 
attendanceRouter.post("/report", authenticate, upload.any(), LeaveController.uploadReport);
attendanceRouter.post("/report/email",  authenticate, upload.any(), LeaveController.uploadReportEmail);


export default attendanceRouter;
