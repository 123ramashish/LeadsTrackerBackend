import { Request, Response } from "express";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import attendanceSchema from "../DataBase/Schema/attendance.schema";
import User from "../DataBase/Schema/user.schema";
import leaveSchema from "../DataBase/Schema/leave.schema";
import attendanceChatSchema from "../DataBase/Schema/attendanceChat.schema";

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

const SAFE_USER_SELECT =
  "-password -otp -otpExpires -refreshToken -isDelete -lastLogin -__v";

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


  static async getAttendance(req: AuthenticatedRequest, res: Response) {
    try {
      const { user } = req;
      const {
        startDate: startDate_,
        endDate: endDate_,
        userId,
        lunchAbsent,
        lunchPresent,
        active,
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

      const startDate: Date = startDate_
        ? DateTime.fromISO(startDate_)
          .setZone(localTimeZone)
          .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
          .toJSDate()
        : DateTime.now()
          .setZone(localTimeZone)
          .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
          .toJSDate();

      const endDate: Date = endDate_
        ? DateTime.fromISO(endDate_)
          .setZone(localTimeZone)
          .endOf("day")
          .toJSDate()
        : DateTime.now().setZone(localTimeZone).endOf("day").toJSDate();

      const query: Record<string, any> = {
        punchIn: { $gte: startDate_, $lte: endDate },
        company: user.company,
      };

      let userIds: mongoose.Types.ObjectId[] = [];

      if (user.role === "staff") {
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
        query.$or = [{ $and: [{ lunchInInfo: { $exists: false } }] }];
      }
      if (lunchPresent === "true") {
        query.$or = [{ $and: [{ lunchInInfo: { $exists: true } }] }];
      }
      if (active === "true") {
        query.punchOut = { $exists: false };
      }

      const records = await attendanceSchema
        .find(query)
        .populate([
          {
            path: "user",
            model: User,
            select: SAFE_USER_SELECT,
          },
        ])
        .sort({ punchIn: -1 })
        .lean();

      const messageIds = records
        .map((r: any) => r?.messageId)
        .filter((id: any) => !!id) as mongoose.Types.ObjectId[];

      let sentCountsByChatId = new Map<string, number>();
      if (messageIds.length > 0) {
        const sentCounts = await attendanceChatSchema.aggregate<{ _id: mongoose.Types.ObjectId; sentCount: number }>([
          { $match: { _id: { $in: messageIds } } },
          {
            $project: {
              sentCount: {
                $size: {
                  $filter: {
                    input: "$messages",
                    as: "m",
                    cond: { $eq: ["$$m.status", "sent"] },
                  },
                },
              },
            },
          },
        ]);
        sentCountsByChatId = new Map(
          sentCounts.map((doc) => [doc._id.toString(), doc.sentCount]),
        );
      }

      const enrichedRecords = records.map((r: any) => ({
        ...r,
        messageId: r?.messageId,
        sentMessagesCount: r?.messageId
          ? sentCountsByChatId.get(r.messageId.toString()) ?? 0
          : 0,
      }));

      // --- Attendance Stats ---
      const presentStaffIds = new Set<string>();
      let totalHours = 0;

      enrichedRecords.forEach((record: any) => {
        if (record.user) {
          presentStaffIds.add(
            (record.user._id ?? record.user).toString(),
          );
        }
        if (record?.punchOut && record?.punchIn) {
          totalHours +=
            (new Date(record.punchOut).getTime() -
              new Date(record.punchIn).getTime()) /
            3_600_000;
        }
      });

      const presentCount = presentStaffIds.size;

      // --- Leave/WFH queries (unchanged; sanitize populate) ---
      const leaveQuery: Record<string, any> = {
        status: "Approved",
        leaveType: {
          $in: [
            "Sick Leave",
            "Casual Leave",
            "Planned Leave",
            "Leave Without Pay",
            "Half Day",
          ],
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

      if (user.role === "staff") {
        const uid = new mongoose.Types.ObjectId(user.sub);
        leaveQuery.user = uid;
        WFHQuery.user = uid;
      } else if (user.role === "admin" && userIds.length > 0) {
        leaveQuery.user = { $in: userIds };
        WFHQuery.user = { $in: userIds };
      } else if (user.role === "admin") {
        const companyUsers = await User.find({ company: user.company }, "_id");
        const companyUserIds = companyUsers.map((u) => u._id);
        leaveQuery.user = { $in: companyUserIds };
        WFHQuery.user = { $in: companyUserIds };
      }

      const leaveData = await leaveSchema
        .find(leaveQuery)
        .populate({ path: "user", select: SAFE_USER_SELECT })
        .lean();

      const wfhData = await leaveSchema
        .find(WFHQuery)
        .populate({ path: "user", select: SAFE_USER_SELECT })
        .lean();

      const leaveCount = new Set(
        leaveData.map((leave: any) => leave.user._id.toString()),
      ).size;
      const wfhCount = new Set(
        wfhData.map((wfh: any) => wfh.user._id.toString()),
      ).size;

      let totalUsers: mongoose.Types.ObjectId[] = [];
      if (user.role === "staff") {
        totalUsers = [new mongoose.Types.ObjectId(user.sub)];
      } else if (user.role === "admin" && userIds.length > 0) {
        totalUsers = userIds;
      } else {
        const allCompanyUsers = await User.find({ company: user.company }, "_id");
        totalUsers = allCompanyUsers.map((u) => u._id);
      }

      const totalUserCount = totalUsers.length;
      const absentCount = Math.max(
        totalUserCount - presentCount - leaveCount - wfhCount,
        0,
      );

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

      enrichedRecords.forEach((record: any) => {
        const uid =
          record.user?._id?.toString() || record.user?.toString();
        if (!uid) return;

        const dateKey = new Date(record.punchIn).toISOString().split("T")[0];

        if (!usersAttendance[uid]) usersAttendance[uid] = {};
        if (!usersAttendance[uid][dateKey])
          usersAttendance[uid][dateKey] = { punchDetails: [] };

        usersAttendance[uid][dateKey].punchDetails.push({
          attendanceId: record?._id,
          remarks: record?.remarks,
          messages: record?.messages,
          punchIn: record?.punchIn,
          punchOut: record?.punchOut,
          punchInLocation: record?.punchInLocation,
          punchOutLocation: record?.punchOutLocation,
          lunchInInfo: record?.lunchInInfo,
          lunchOutInfo: record?.lunchOutInfo,
          sentMessagesCount: record?.sentMessagesCount,
          messageId: record?.messageId,

        });
      });

      return res.status(200).json({
        data: {
          records: enrichedRecords,
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
            totalUsers: totalUserCount,
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


  static async addMessageOnAttendance(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { _id, content, files } = req.body;

      // Validate required fields
      if (!content) {
        return res.status(400).json({ message: "Message content is required" });
      }

      const attendanceRecord = await attendanceSchema.findById(_id);
      if (!attendanceRecord) {
        return res.status(404).json({ message: "Attendance record not found" });
      }

      // Create message object
      const newMessage = {
        _id: new mongoose.Types.ObjectId(),
        content: content,
        date: new Date(),
        files: files && files.length > 0 ? files : [],
        user: new mongoose.Types.ObjectId(user.sub),
        status: "sent"
      };

      const messageId = attendanceRecord.messageId || new mongoose.Types.ObjectId();

      // Use aggregation pipeline for update to avoid operator conflicts
      const result = await attendanceChatSchema.findOneAndUpdate(
        { _id: messageId },
        [
          {
            $set: {
              company: { $ifNull: ["$company", attendanceRecord.company] },
              messages: {
                $cond: {
                  if: { $isArray: "$messages" },
                  then: { $concatArrays: ["$messages", [newMessage]] },
                  else: [newMessage]
                }
              }
            }
          }
        ],
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true
        }
      );

      // If we created a new AttendanceChat, update the attendance record with the messageId
      if (!attendanceRecord.messageId) {
        await attendanceSchema.findByIdAndUpdate(
          _id,
          { messageId: result._id }
        );
      }

      return res.status(200).json({
        message: "Message added successfully",
        data: result
      });
    } catch (error: any) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  }
  static async getMessage(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user
      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const { messageId } = req.query as any
      const result: any = await attendanceChatSchema.find({ _id: new mongoose.Types.ObjectId(messageId), company: new mongoose.Types.ObjectId(user.company) }).populate([
        {
          path: "messages.user",
          model: User,
          select: SAFE_USER_SELECT,
        },
      ])
      if (!result) {
        return res.status(400).send("Data to found!")
      }
      return res.status(200).json({ data: result || [] })
    } catch (error) {
      console.log("Error", error)
      return res.status(500).send("Something went wrong!")
    }
  }
  static async updateMessageStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { messageId, subMessageId } = req.body as any;
      if (!messageId || !subMessageId) {
        return res.status(400).json({
          message: "Message ID and Sub Message ID are required"
        });
      }

      let subMessageIds: string[] = [];

      if (Array.isArray(subMessageId)) {
        subMessageIds = subMessageId;
      } else if (typeof subMessageId === 'string') {
        // Handle comma-separated string or single ID
        subMessageIds = subMessageId.split(',').map(id => id.trim()).filter(id => id);
      } else {
        return res.status(400).json({
          message: "Sub Message ID must be a string or array of strings"
        });
      }

      // Validate ObjectId format for all IDs
      const invalidIds = subMessageIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({
          message: `Invalid Sub Message ID format: ${invalidIds.join(', ')}`
        });
      }

      if (subMessageIds.length === 0) {
        return res.status(400).json({
          message: "No valid Sub Message IDs provided"
        });
      }

      // Convert to ObjectId array
      const subMessageObjectIds = subMessageIds.map(id => new mongoose.Types.ObjectId(id));

      // Update multiple messages status to "read" using bulk update
      const result = await attendanceChatSchema.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(messageId),
          "messages._id": { $in: subMessageObjectIds }
        },
        {
          $set: {
            "messages.$[elem].status": "read"
          }
        },
        {
          arrayFilters: [
            { "elem._id": { $in: subMessageObjectIds } }
          ],
          new: true,
          runValidators: true
        }
      );

      if (!result) {
        return res.status(404).json({
          message: "Message chat not found or no matching sub-messages found"
        });
      }

      // Get the updated messages for response
      const updatedMessages = result.messages.filter(msg =>
        subMessageObjectIds.some(id => id.equals(msg._id))
      );

      return res.status(200).json({
        message: `${updatedMessages.length} message(s) status updated successfully`,
        data: {
          chat: result,
          updatedCount: updatedMessages.length,
          updatedMessages: updatedMessages
        }
      });

    } catch (error: any) {
      console.log("Error updating message status:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message
      });
    }
  }

}
