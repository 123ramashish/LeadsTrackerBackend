import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import AttendanceController from "../controller/attendance.controller";

const attendanceRouter = Router();

attendanceRouter.post("/", authenticate, AttendanceController.punchHandler);
attendanceRouter.get("/", authenticate, AttendanceController.getAttendance);
// attendanceRouter.put("/", authenticate, AttendanceController.checkActiveSession);
// attendanceRouter.patch("/", authenticate, AttendanceController.exportExcelData);
// attendanceRouter.delete("/", authenticate, AttendanceController.deleteImageKitFile);

export default attendanceRouter;
