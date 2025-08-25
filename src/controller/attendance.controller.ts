import { Request, Response } from "express";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import attendanceSchema from "../DataBase/Schema/attendance.schema";
import User from "../DataBase/Schema/user.schema";
import leaveSchema from "../DataBase/Schema/leave.schema";

// Extend Express Request to include `user`
interface AuthenticatedRequest extends Request {
  user?: any & {
    _id: mongoose.Types.ObjectId;
    userRole: string;
    name?: string;
    company: mongoose.Types.ObjectId;
  };
}

const isSameDay = (date1: Date, date2: Date): boolean =>
  date1.getFullYear() === date2.getFullYear() &&
  date1.getMonth() === date2.getMonth() &&
  date1.getDate() === date2.getDate();

export default class AttendanceController {
  /** POST /attendance — Punch In/Out */
  static async punchHandler(req: AuthenticatedRequest, res: Response) {
    try {
      const { user } = req;
      const {
        punchIn,
        punchOut,
        punchInLocation,
        punchOutLocation,
      }: {
        punchIn?: string;
        punchOut?: string;
        punchInLocation?: string;
        punchOutLocation?: string;
      } = req.body;
      console.log("body", req.body, user);

      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const localTimeZone = DateTime.local().zoneName;

      // Punch In
      if (punchIn) {
        const newRecord = await attendanceSchema.create({
          user: user.sub,
          punchIn: DateTime.fromISO(punchIn).setZone(localTimeZone).toJSDate(),
          punchInLocation: punchInLocation || "N/A",
          createdAt: DateTime.now().setZone(localTimeZone).toJSDate(),
          company: user?.company,
        });

        const punchInTime = DateTime.fromISO(punchIn)
          .setZone(localTimeZone)
          .toFormat("hh:mm a");

        return res.status(201).json({
          message: `${user.name || "A user"} punched in at ${punchInTime}`,
          location: newRecord.punchInLocation,
          record: newRecord,
        });
      }

      // Punch Out
      if (punchOut) {
        const activeRecord = await attendanceSchema
          .findOne({
            user: new mongoose.Types.ObjectId(user.sub),
            punchOut: { $exists: false },
          })
          .sort({ punchIn: -1 });

        if (!activeRecord) {
          return res
            .status(404)
            .json({ message: "No active punch-in record found" });
        }

        const punchInDate = new Date(activeRecord.punchIn);
        const punchOutDate = new Date(punchOut);

        if (!isSameDay(punchInDate, punchOutDate)) {
          return res
            .status(400)
            .json({ message: "Punch-out must be on the same day as punch-in" });
        }

        const updated = await attendanceSchema.findByIdAndUpdate(
          activeRecord._id,
          {
            punchOut: punchOutDate,
            punchOutLocation: punchOutLocation || "N/A",
            updatedAt: DateTime.now().setZone(localTimeZone).toJSDate(),
          },
          { new: true }
        );

        const punchOutTime = DateTime.fromJSDate(punchOutDate)
          .setZone(localTimeZone)
          .toFormat("hh:mm a");
        const totalHours = (
          (punchOutDate.getTime() - punchInDate.getTime()) /
          3600000
        ).toFixed(2);

        return res.status(200).json({
          message: `${user.name || "A user"} punched out at ${punchOutTime}`,
          totalHours,
          location: updated?.punchOutLocation || "N/A",
          record: updated,
        });
      }

      return res
        .status(400)
        .json({ message: "No punchIn or punchOut data provided" });
    } catch (error: any) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }

  /** GET /attendance — Fetch Attendance */
  static async getAttendance(req: AuthenticatedRequest, res: Response) {
    try {
      const { user } = req;
      const {
        startDate: startDate_,
        endDate: endDate_,
        assignee,
      } = req.query as {
        startDate?: string;
        endDate?: string;
        assignee?: any;
      };

      console.log("query", req.query, "user", user);

      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const localTimeZone = DateTime.local().zoneName;

      const startDate = startDate_
        ? DateTime.fromISO(startDate_)
            .setZone(localTimeZone)
            .startOf("day")
            .toJSDate()
        : DateTime.now().setZone(localTimeZone).startOf("day").toJSDate();

      const endDate = endDate_
        ? DateTime.fromISO(endDate_)
            .setZone(localTimeZone)
            .endOf("day")
            .toJSDate()
        : DateTime.now().setZone(localTimeZone).endOf("day").toJSDate();

      let query: Record<string, any> = {
        punchIn: { $gte: startDate, $lte: endDate },
      };

      if (user.userRole === "staff") {
        query.user = user._id;
      } else {
        const assigneeArray = assignee
          .split(",")
          .map((id: string) => new mongoose.Types.ObjectId(id.trim()));

        query.user = { $in: assigneeArray };
      }

      if (user.userRole === "admin" || user.userRole === "teamLeader") {
        query.user = new mongoose.Types.ObjectId(user.sub);
      }

      const records = await attendanceSchema
        .find(query)
        .populate([{ path: "user", model: User }])
        .sort({ punchIn: -1 })
        .lean();
      console.log("records", records);
      const presentStaffIds = new Set<string>();
      let totalHours = 0;

      records.forEach((record: any) => {
        if (record.user?.userRole === "staff") {
          presentStaffIds.add(record.user._id.toString());
        }
        if (record?.punchOut) {
          totalHours +=
            (record.punchOut.getTime() - record.punchIn.getTime()) / 3600000;
        }
      });

      const presentCount = presentStaffIds.size;

      const leaveQuery: Record<string, any> = {
        status: "Approved",
        leaveType: [
          "Sick Leave",
          "Casual Leave",
          "Planned Leave",
          "Leave Without Pay",
          "Half Day",
        ],
        $or: [
          { startDate: { $gte: startDate, $lte: endDate } },
          { endDate: { $gte: startDate, $lte: endDate } },
          { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
        ],
      };

      const WFHQuery: Record<string, any> = {
        ...leaveQuery,
        leaveType: ["Work From Home"],
      };

      if (user.userRole === "staff") {
        leaveQuery.user = new mongoose.Types.ObjectId(user._id);
        WFHQuery.user = new mongoose.Types.ObjectId(user._id);
      }
      if (user.userRole === "admin" || user.userRole === "teamLeader") {
        leaveQuery.user = new mongoose.Types.ObjectId(user.sub);
        WFHQuery.user = new mongoose.Types.ObjectId(user.sub);
      }

      const leaveData = await leaveSchema
        .find(leaveQuery)
        .populate("user")
        .lean();
      const wfhData = await leaveSchema.find(WFHQuery).populate("user").lean();

      const leaveCount = leaveData.length;
      const wfhCount = wfhData.length;

      const totalDays =
        Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
      const absentCount = Math.max(totalDays - presentCount - leaveCount, 0);

      return res.status(200).json({
        data: {
          records,
          leaveData,
          wfhData,
          summary: {
            totalHours: Number(totalHours.toFixed(2)),
            requiredHours: 8,
            incompleteHours: Math.max(8 - totalHours, 0),
          },
          attendanceStats: { presentCount, absentCount, leaveCount, wfhCount },
        },
      });
    } catch (error: any) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }
}
