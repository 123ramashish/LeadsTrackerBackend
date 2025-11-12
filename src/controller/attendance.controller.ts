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
    role: string;
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
        lunchIn,
        lunchOut,
        lunchInLocation,
        lunchOutLocation,
      }: {
        punchIn?: string;
        punchOut?: string;
        punchInLocation?: string;
        punchOutLocation?: string;
        lunchIn?: string;
        lunchOut?: string;
        lunchInLocation?: string;
        lunchOutLocation?: string;
      } = req.body;

      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const localTimeZone = DateTime.local().zoneName;
      // find existing active punch-in record
      if (punchIn || punchOut) {
        const existingRecord = await attendanceSchema.findOne({
          user: new mongoose.Types.ObjectId(user.sub),
          punchIn: { $gte: DateTime.now().setZone(localTimeZone).startOf('day').toJSDate() },
        }).sort({ punchIn: -1 });
        if (existingRecord && existingRecord?.punchIn && punchIn) {
          return res.status(400).json({ message: "You have already punched in for today." });
        }
        else if (existingRecord && existingRecord?.punchOut && punchOut) {
          return res.status(400).json({ message: "You have already punched out for today." });
        }
      }
      // Punch In
      if (punchIn) {
        const newRecord = await attendanceSchema.create({
          user: user.sub,
          punchIn: DateTime.fromISO(punchIn).setZone(localTimeZone).toJSDate(),
          punchInLocation: punchInLocation || "N/A",
          punchInInfo: {
            ip: req?.ip,
            userAgent: req?.headers["user-agent"],

          },
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
      // lunchIn
      else if (lunchIn) {
        const activeRecord = await attendanceSchema.findOne({
          user: new mongoose.Types.ObjectId(user.sub),
          punchIn: { $exists: true },
          punchOut: { $exists: false },
        }).sort({ punchIn: -1 });
        if (!activeRecord) {
          return res
            .status(404)
            .json({ message: "No active punch-in record found" });
        }
        const updated = await attendanceSchema.findByIdAndUpdate(
          activeRecord._id,
          {
            lunchInInfo: {
              time: DateTime.fromISO(lunchIn).setZone(localTimeZone).toJSDate(),
              location: lunchInLocation || "N/A",
              ip: req?.ip,
              userAgent: req?.headers["user-agent"],
            },
          },
          { new: true }
        );

        return res.status(200).json({
          message: `${user.name || "A user"} took lunch at ${DateTime.fromISO(lunchIn).setZone(localTimeZone).toFormat("hh:mm a")}`,
          location: updated?.lunchInLocation || "N/A",
          record: updated,
        });
      }
      // lunchOut
      else if (lunchOut) {
        const activeRecord = await attendanceSchema.findOne({
          user: new mongoose.Types.ObjectId(user.sub),
          punchIn: { $exists: true },
          lunchInInfo: { $exists: true },
          punchOut: { $exists: false },
        }).sort({ punchIn: -1 });

        if (!activeRecord) {
          return res
            .status(404)
            .json({ message: "No active punch-in/lunch-in record found" });
        }
        const updated = await attendanceSchema.findByIdAndUpdate(
          activeRecord._id,
          {
            lunchOutInfo: {
              time: DateTime.fromISO(lunchOut).setZone(localTimeZone).toJSDate(),
              location: lunchOutLocation || "N/A",
              ip: req?.ip,
              userAgent: req?.headers["user-agent"],
            },
          },
          { new: true }
        );
        return res.status(200).json({
          message: `${user.name || "A user"} ended lunch at ${DateTime.fromISO(lunchOut).setZone(localTimeZone).toFormat("hh:mm a")}`,
          location: updated?.lunchOutLocation || "N/A",
          record: updated,
        });
      }
      // Punch Out
      else if (punchOut) {
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
            punchOutInfo: {
              ip: req?.ip,
              userAgent: req?.headers["user-agent"],
            },
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
        userId,
        lunchAbsent,
        lunchPresent,
        active

      }: {
        startDate?: string;
        endDate?: string;
        userId?: string;
        lunchAbsent?: string;
        lunchPresent?: string;
        active?: string;
      } = req.query;

      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const localTimeZone = DateTime.local().zoneName;
      console.log("startDate_", startDate_, "endDate_", endDate_)

      const startDate = startDate_
        ? DateTime.fromISO(startDate_, { zone: 'utc' })
          .startOf("day")
          .toJSDate()
        : DateTime.now().startOf("day").toJSDate();

      const endDate = endDate_
        ? DateTime.fromISO(endDate_, { zone: 'utc' })
          .endOf("day")
          .toJSDate()
        : DateTime.now().endOf("day").toJSDate();

      console.log("startDate", startDate, "endDate", endDate)
      let query: Record<string, any> = {
        punchIn: { $gte: startDate, $lte: endDate },
        company: user.company,
      };

      let userIds: mongoose.Types.ObjectId[] = [];

      if (user.role === "staff") {
        // FIX: Use user.sub instead of user._id
        query.user = new mongoose.Types.ObjectId(user.sub);
      } else if (user.role === "admin") {
        if (!userId || userId.trim() === "") {
          const allUsers = await User.find({ company: user.company }, "_id");
          userIds = allUsers.map((u) => u._id);
        } else {
          userIds = userId
            .split(",")
            .map((id: string) => id.trim())
            .filter((id: string) => mongoose.isValidObjectId(id))
            .map((id: string) => new mongoose.Types.ObjectId(id));
        }

        if (userIds.length > 0) {
          query.user = { $in: userIds };
        }
      }
      if (lunchAbsent === "true") {
        query.$or = [
          { $and: [{ lunchInInfo: { $exists: false } }] },

        ];
      }
      if (lunchPresent === "true") {
        query.$or = [
          { $and: [{ lunchInInfo: { $exists: true } }] }
        ];
      }
      if (active === "true") {
        query.punchOut = { $exists: false };
      }
      console.log("query", query)
      const records = await attendanceSchema
        .find(query)
        .populate([{ path: "user", model: User }])
        .sort({ punchIn: -1 })
        .lean();

      // --- Attendance Stats ---
      const presentStaffIds = new Set<string>();
      let totalHours = 0;

      records.forEach((record: any) => {
        if (record.user) {
          presentStaffIds.add(record.user._id.toString());
        }
        if (record?.punchOut) {
          totalHours +=
            (record.punchOut.getTime() - record.punchIn.getTime()) / 3600000;
        }
      });

      const presentCount = presentStaffIds.size;

      // --- Leave Query ---
      const leaveQuery: Record<string, any> = {
        status: "Approved",
        leaveType: {
          $in: [
            "Sick Leave",
            "Casual Leave",
            "Planned Leave",
            "Leave Without Pay",
            "Half Day",
          ]
        },
        $or: [
          { startDate: { $gte: startDate, $lte: endDate } },
          { endDate: { $gte: startDate, $lte: endDate } },
          { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
        ],
      };

      const WFHQuery: Record<string, any> = {
        status: "Approved",
        leaveType: "Work From Home",
        $or: [
          { startDate: { $gte: startDate, $lte: endDate } },
          { endDate: { $gte: startDate, $lte: endDate } },
          { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
        ],
      };

      // FIX: Use proper user reference based on role
      if (user.role === "staff") {
        leaveQuery.user = new mongoose.Types.ObjectId(user.sub);
        WFHQuery.user = new mongoose.Types.ObjectId(user.sub);
      } else if (user.role === "admin" && userIds.length > 0) {
        leaveQuery.user = { $in: userIds };
        WFHQuery.user = { $in: userIds };
      } else if (user.role === "admin") {
        // If no specific users selected, get all company users
        const companyUsers = await User.find({ company: user.company }, "_id");
        const companyUserIds = companyUsers.map(u => u._id);
        leaveQuery.user = { $in: companyUserIds };
        WFHQuery.user = { $in: companyUserIds };
      }

      const leaveData = await leaveSchema.find(leaveQuery).populate("user").lean();
      const wfhData = await leaveSchema.find(WFHQuery).populate("user").lean();

      const leaveCount = new Set(leaveData.map(leave => leave.user._id.toString())).size;
      const wfhCount = new Set(wfhData.map(wfh => wfh.user._id.toString())).size;

      // Calculate total users for stats
      let totalUsers: mongoose.Types.ObjectId[] = [];
      if (user.role === "staff") {
        totalUsers = [new mongoose.Types.ObjectId(user.sub)];
      } else if (user.role === "admin" && userIds.length > 0) {
        totalUsers = userIds;
      } else {
        const allCompanyUsers = await User.find({ company: user.company }, "_id");
        totalUsers = allCompanyUsers.map(u => u._id);
      }

      const totalUserCount = totalUsers.length;
      const absentCount = Math.max(totalUserCount - presentCount - leaveCount - wfhCount, 0);
      // user attendance group wise
      // --- Group attendance by user and date ---
      const usersAttendance: Record<
        string,
        {
          [date: string]: {
            punchDetails: {
              punchIn: Date;
              punchOut?: Date;
              punchInLocation?: string;
              punchOutLocation?: string;
              [key: string]: any;
            }[];
          };
        }
      > = {};

      records.forEach((record: any) => {
        const userId = record.user?._id?.toString() || record.user?.toString();
        if (!userId) return;

        const dateKey = new Date(record.punchIn).toISOString().split("T")[0];

        if (!usersAttendance[userId]) usersAttendance[userId] = {};
        if (!usersAttendance[userId][dateKey]) usersAttendance[userId][dateKey] = { punchDetails: [] };

        usersAttendance[userId][dateKey].punchDetails.push({
          attendanceId: record?._id,
          remarks: record?.remarks,
          punchIn: record?.punchIn,
          punchOut: record?.punchOut,
          punchInLocation: record?.punchInLocation,
          punchOutLocation: record?.punchOutLocation,
          lunchInInfo: record?.lunchInInfo,
          lunchOutInfo: record?.lunchOutInfo,
        });
      });

      return res.status(200).json({
        data: {
          records,
          usersAttendance,
          leaveData,
          wfhData,
          summary: {
            totalHours: Number(totalHours.toFixed(2)),
            requiredHours: 9,
            incompleteHours: Math.max(9 - totalHours, 0),
          },
          attendanceStats: {
            presentCount,
            absentCount,
            leaveCount,
            wfhCount,
            totalUsers: totalUserCount
          },
        },
      });
    } catch (error: any) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }
  static async addRemarksOnAttendance(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user?.sub || user?.role !== 'admin') {
        return res.status(401).json({ message: "Authentication required" });
      }
      const { _id, remarks } = req.body;
      const result = await attendanceSchema.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(_id)
        },
        {
          remarks: remarks ? remarks : ''
        }
      );
      if (!result) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      return res.status(200).json({ message: "Remarks updated successfully" });
    } catch (error: any) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }

}
