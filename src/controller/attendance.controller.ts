import { Request, Response } from "express";
import ImageKit from "imagekit";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import attendanceSchema from "../DataBase/Schema/attendance.schema";
import User from "../DataBase/Schema/user.schema";
import leaveSchema from "../DataBase/Schema/leave.schema";
import attendanceChatSchema from "../DataBase/Schema/attendanceChat.schema";
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
        // First, punch out all previous records that only have punchIn for this user and company
        const incompletePunchIns = await attendanceSchema.find({
          user: new mongoose.Types.ObjectId(user.sub),
          company: user.company, // Assuming company is available in user object
          punchOut: { $exists: false },
        }).sort({ punchIn: -1 });

        // Process all incomplete punch-ins except the most recent one (today's record)
        if (incompletePunchIns.length > 1) {
          const previousRecords = incompletePunchIns.slice(1); // Skip the first (most recent) record

          for (const record of previousRecords) {
            const punchInDate = new Date(record.punchIn);
            // Set punch out time to 6 PM of the same day as punch in
            const systemPunchOutDate = new Date(punchInDate);
            systemPunchOutDate.setHours(18, 0, 0, 0); // 6 PM

            await attendanceSchema.findByIdAndUpdate(
              record._id,
              {
                punchOut: systemPunchOutDate,
                punchOutLocation: "System punchOut",
                punchOutInfo: {
                  ip: "System",
                  userAgent: "Auto punch-out",
                },
                updatedAt: DateTime.now().setZone(localTimeZone).toJSDate(),
              },
              { new: true }
            );
          }
        }

        // Now find the active record for today's punch-out
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
  // static async getMessage(req: AuthenticatedRequest, res: Response) {
  //   try {
  //     const user = req.user

  //     if (!user?.sub) {
  //       return res.status(401).json({ message: "Authentication required" });
  //     }
  //     console.log("users",user.sub)
  //     const { messageId } = req.query as any
  //     const result: any = await attendanceChatSchema.find({ _id: new mongoose.Types.ObjectId(messageId), company: new mongoose.Types.ObjectId(user.company) }).populate([
  //       {
  //         path: "messages.user",
  //         model: User,
  //         select: SAFE_USER_SELECT,
  //       },
  //     ])
  //     if (!result) {
  //       return res.status(400).send("Data to found!")
  //     }
  //     return res.status(200).json({ data: result || [] })
  //   } catch (error) {
  //     console.log("Error", error)
  //     return res.status(500).send("Something went wrong!")
  //   }
  // }
  static async getMessage(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      console.log("api hit")
      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { messageId } = req.query as any;

      const chat = await attendanceChatSchema
        .findOne({
          _id: new mongoose.Types.ObjectId(messageId),
          company: new mongoose.Types.ObjectId(user.company)
        })
        .populate([
          {
            path: "messages.user",
            model: User,
            select: SAFE_USER_SELECT,
          },
        ]);

      if (!chat) {
        return res.status(400).send("Data not found!");
      }

      const loggedInUserId = user.sub.toString();
      const returnChat = JSON.parse(JSON.stringify(chat));

      let needUpdate = false;
      chat.messages.forEach(msg => {
        console.log("msg.user", msg.user)
        if (msg.user._id.toString() !== loggedInUserId.toString() && msg.status !== "read") {
          msg.status = "read";
          needUpdate = true;
        }
      });

      if (needUpdate) chat.save();

      return res.status(200).json({ data: returnChat });

    } catch (error) {
      console.log("Error", error);
      return res.status(500).send("Something went wrong!");
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

  static async getReportWithFields(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { users, fromDate, toDate, fields } = req.body || req.query;


      const localTimeZone = DateTime.local().zoneName;

      const startDate: Date = fromDate
        ? DateTime.fromISO(fromDate, { zone: localTimeZone })
          .startOf('day')
          .toJSDate()
        : DateTime.now()
          .setZone(localTimeZone)
          .startOf('day')
          .toJSDate();

      const endDate: Date = toDate
        ? DateTime.fromISO(toDate, { zone: localTimeZone })
          .endOf('day')
          .toJSDate()
        : DateTime.now().setZone(localTimeZone).endOf('day').toJSDate();

      const query: Record<string, any> = {
        punchIn: { $gte: startDate, $lte: endDate },
        company: user.company,
      };

      let userIds: mongoose.Types.ObjectId[] = [];

      if (user.role === "staff") {
        query.user = new mongoose.Types.ObjectId(user.sub);
      } else if (user.role === "admin") {
        if (!users || users.length === 0) {
          const allUsers = await User.find({ company: user.company }, "_id");
          userIds = allUsers.map((u) => u._id);
        } else {
          let arrayOfUsers = Array.isArray(users) ? users : users.split(',')
          userIds = arrayOfUsers
            .map((id: string) => new mongoose.Types.ObjectId(id));
        }

        if (userIds.length > 0) {
          query.user = { $in: userIds };
        }
      } else {
        return res.status(403).json({ message: "Unauthorized access" });
      }

      // Build projection based on fields
      let projection: Record<string, number> = {
        _id: 1,
        user: 1,
        company: 1,
        punchIn: 1,
        punchOut: 1, // Always need for calculations
      };
      let Arrayfields = Array.isArray(fields) ? fields : fields.split(',')
      const includeAllFields = !Arrayfields || !Array.isArray(Arrayfields) || Arrayfields.length === 0;
      // User populate projection for name, email, phone
      let userSelectFields = SAFE_USER_SELECT;

      if (!includeAllFields) {
        // Track which nested objects we need
        let needsLunchInInfo = false;
        let needsLunchOutInfo = false;
        let needsUserFields = new Set<string>();

        Arrayfields.forEach((field: string) => {
          switch (field) {
            // User fields - will be handled in populate
            case "name":
              needsUserFields.add("name");
              break;
            case "email":
              needsUserFields.add("email");
              break;
            case "phone":
              needsUserFields.add("phone");
              break;

            // Attendance fields
            case "date":
              // Date is calculated from punchIn, already included
              break;
            case "punchIn":
              projection.punchIn = 1;
              break;
            case "punchOut":
              projection.punchOut = 1;
              break;
            case "punchInLocation":
              projection.punchInLocation = 1;
              break;
            case "punchOutLocation":
              projection.punchOutLocation = 1;
              break;

            // Calculated fields - need lunch info
            case "hoursWorked":
            case "totalLunch":
            case "productive":
            case "status":
              // These are calculated, no projection needed
              break;

            // Lunch fields
            case "lunchIn":
            case "lunchInLocation":
              needsLunchInInfo = true;
              break;
            case "lunchOut":
            case "lunchOutLocation":
              needsLunchOutInfo = true;
              break;

            default:
              projection[field] = 1;
          }
        });

        // Add nested objects if any of their fields were requested
        if (needsLunchInInfo) {
          projection.lunchInInfo = 1;
        }
        if (needsLunchOutInfo) {
          projection.lunchOutInfo = 1;
        }

        // Build user select string for populate
        if (needsUserFields.size > 0) {
          userSelectFields = Array.from(needsUserFields).join(" ");
        }
      } else {
        // If no fields specified, fetch everything
        projection = {};
        userSelectFields = SAFE_USER_SELECT;
      }

      console.log("projection", projection);
      console.log("userSelectFields", userSelectFields);

      const attendanceRecords = await attendanceSchema
        .find(query, Object.keys(projection).length > 0 ? projection : undefined)
        .populate({ path: "user", select: userSelectFields })
        .sort({ user: 1, punchIn: -1 })
        .lean();

      if (!attendanceRecords || attendanceRecords.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No records found for the specified criteria",
          data: {
            records: [],
            summary: {
              totalRecords: 0,
              totalUsers: 0,
              totalDays: 0,
            },
            dateRange: {
              from: startDate,
              to: endDate,
            },
          },
        });
      }

      // Helper function to calculate time difference in hours

      const calculateHours = (start: Date | null | undefined, end: Date | null | undefined): number => {
        if (!start || !end) return 0;

        try {
          // Convert the start and end Date objects to Luxon DateTime objects
          const startTime = DateTime.fromJSDate(new Date(start), { zone: localTimeZone });
          const endTime = DateTime.fromJSDate(new Date(end), { zone: localTimeZone });

          // Check if the DateTime objects are valid
          if (!startTime.isValid || !endTime.isValid) return 0;

          // Calculate the difference between start and end times
          const diff = endTime.diff(startTime, ["hours", "minutes"]);

          // Get the difference in hours and minutes
          const hours = diff.hours.toString();
          const minutes = diff.minutes.toFixed(0).toString();
          const time = Number(hours.concat('.').concat(minutes))
          return Math.max(0, time)
        } catch (error) {
          console.error("Error calculating hours:", error);
          return 0;
        }
      };

      // Helper function to determine status
      const determineStatus = (punchIn: Date | undefined, punchOut: Date | undefined): string => {
        if (!punchIn) return "Absent";
        if (punchIn && !punchOut) return "Present";
        if (punchIn && punchOut) return "Completed";
        return "Unknown";
      };

      // Format records with calculations
      const formattedRecords = attendanceRecords.map((record: any) => {
        const formattedRecord: Record<string, any> = {
          _id: record._id,
        };

        // Extract lunch times safely
        const lunchInTime = record.lunchInInfo?.time;
        const lunchOutTime = record.lunchOutInfo?.time;

        // Calculate time metrics (always calculated for summaries)
        const totalWorkingHours = calculateHours(record.punchIn, record.punchOut);
        const totalLunchTime = calculateHours(lunchInTime, lunchOutTime);
        const productiveHours = Math.max(0, totalWorkingHours - totalLunchTime);
        const status = determineStatus(record.punchIn, record.punchOut);

        if (includeAllFields) {
          // Include all available fields
          formattedRecord.user = record.user;
          formattedRecord.date = DateTime.fromJSDate(record.punchIn, { zone: localTimeZone }).toISODate();

          if (record.user?.name !== undefined) formattedRecord.name = record.user.name;
          if (record.user?.email !== undefined) formattedRecord.email = record.user.email;
          if (record.user?.phone !== undefined) formattedRecord.phone = record.user.phone;

          if (record.punchIn !== undefined) formattedRecord.punchIn = record.punchIn;
          if (record.punchOut !== undefined) formattedRecord.punchOut = record.punchOut;
          if (record.punchInLocation !== undefined) formattedRecord.punchInLocation = record.punchInLocation;
          if (record.punchOutLocation !== undefined) formattedRecord.punchOutLocation = record.punchOutLocation;

          if (lunchInTime !== undefined) formattedRecord.lunchIn = lunchInTime;
          if (lunchOutTime !== undefined) formattedRecord.lunchOut = lunchOutTime;
          if (record.lunchInInfo?.location !== undefined) formattedRecord.lunchInLocation = record.lunchInInfo.location;
          if (record.lunchOutInfo?.location !== undefined) formattedRecord.lunchOutLocation = record.lunchOutInfo.location;

          formattedRecord.hoursWorked = parseFloat(totalWorkingHours.toFixed(2));
          formattedRecord.totalLunch = parseFloat(totalLunchTime.toFixed(2));
          formattedRecord.productive = parseFloat(productiveHours.toFixed(2));
          formattedRecord.status = status;

          // Keep legacy field names for backward compatibility
          formattedRecord.totalWorkingHours = formattedRecord.hoursWorked;
          formattedRecord.totalLunchTime = formattedRecord.totalLunch;
          formattedRecord.productiveHours = formattedRecord.productive;
        } else {
          // Include only requested fields
          const fieldMapping: Record<string, () => void> = {
            user: () => { formattedRecord.user = record.user; },
            name: () => { if (record.user?.name !== undefined) formattedRecord.name = record.user.name; },
            email: () => { if (record.user?.email !== undefined) formattedRecord.email = record.user.email; },
            phone: () => { if (record.user?.phone !== undefined) formattedRecord.phone = record.user.phone; },
            date: () => { formattedRecord.date = DateTime.fromJSDate(record.punchIn, { zone: localTimeZone }).toISODate(); },
            punchIn: () => { if (record.punchIn !== undefined) formattedRecord.punchIn = record.punchIn; },
            punchOut: () => { if (record.punchOut !== undefined) formattedRecord.punchOut = record.punchOut; },
            punchInLocation: () => { if (record.punchInLocation !== undefined) formattedRecord.punchInLocation = record.punchInLocation; },
            punchOutLocation: () => { if (record.punchOutLocation !== undefined) formattedRecord.punchOutLocation = record.punchOutLocation; },
            lunchIn: () => { if (lunchInTime !== undefined) formattedRecord.lunchIn = lunchInTime; },
            lunchOut: () => { if (lunchOutTime !== undefined) formattedRecord.lunchOut = lunchOutTime; },
            lunchInLocation: () => { if (record.lunchInInfo?.location !== undefined) formattedRecord.lunchInLocation = record.lunchInInfo.location; },
            lunchOutLocation: () => { if (record.lunchOutInfo?.location !== undefined) formattedRecord.lunchOutLocation = record.lunchOutInfo.location; },
            hoursWorked: () => { formattedRecord.hoursWorked = parseFloat(totalWorkingHours.toFixed(2)); },
            totalLunch: () => { formattedRecord.totalLunch = parseFloat(totalLunchTime.toFixed(2)); },
            productive: () => { formattedRecord.productive = parseFloat(productiveHours.toFixed(2)); },
            status: () => { formattedRecord.status = status; },
          };

          Arrayfields?.forEach((field: string) => {
            if (fieldMapping[field]) {
              fieldMapping[field]();
            } else if (record[field] !== undefined) {
              formattedRecord[field] = record[field];
            }
          });

          // Always include calculated fields for summaries (internal use)
          formattedRecord.totalWorkingHours = parseFloat(totalWorkingHours.toFixed(2));
          formattedRecord.totalLunchTime = parseFloat(totalLunchTime.toFixed(2));
          formattedRecord.productiveHours = parseFloat(productiveHours.toFixed(2));
        }

        return formattedRecord;
      });

      // Calculate per-user summaries (all days for each user)
      const userSummaries: Record<string, any> = {};
      formattedRecords.forEach((record) => {
        const userId = record.user?._id?.toString() || record._id.toString();

        if (!userSummaries[userId]) {
          userSummaries[userId] = {
            user: record.user,
            totalWorkingHours: 0,
            totalLunchTime: 0,
            productiveHours: 0,
            daysWorked: 0,
            records: [],
          };
        }

        userSummaries[userId].totalWorkingHours += record.totalWorkingHours || 0;
        userSummaries[userId].totalLunchTime += record.totalLunchTime || 0;
        userSummaries[userId].productiveHours += record.productiveHours || 0;
        userSummaries[userId].daysWorked += 1;
        userSummaries[userId].records.push(record);
      });

      // Format user summaries
      const userSummariesArray = Object.values(userSummaries).map((summary: any) => ({
        user: summary.user,
        totalWorkingHours: parseFloat(summary.totalWorkingHours.toFixed(2)),
        totalLunchTime: parseFloat(summary.totalLunchTime.toFixed(2)),
        productiveHours: parseFloat(summary.productiveHours.toFixed(2)),
        daysWorked: summary.daysWorked,
        averageWorkingHours: parseFloat((summary.totalWorkingHours / summary.daysWorked).toFixed(2)),
        averageLunchTime: parseFloat((summary.totalLunchTime / summary.daysWorked).toFixed(2)),
        averageProductiveHours: parseFloat((summary.productiveHours / summary.daysWorked).toFixed(2)),
      }));

      // Sort user summaries by user name
      userSummariesArray.sort((a, b) => {
        const nameA = a.user?.name?.toLowerCase() || '';
        const nameB = b.user?.name?.toLowerCase() || '';
        return nameA.localeCompare(nameB);
      });

      // Calculate overall summary (all users, all days)
      const overallSummary = {
        totalWorkingHours: parseFloat(
          formattedRecords.reduce((sum, r) => sum + (r.totalWorkingHours || 0), 0).toFixed(2)
        ),
        totalLunchTime: parseFloat(
          formattedRecords.reduce((sum, r) => sum + (r.totalLunchTime || 0), 0).toFixed(2)
        ),
        productiveHours: parseFloat(
          formattedRecords.reduce((sum, r) => sum + (r.productiveHours || 0), 0).toFixed(2)
        ),
        totalRecords: formattedRecords.length,
        totalUsers: Object.keys(userSummaries).length,
        averageWorkingHoursPerDay: parseFloat(
          (formattedRecords.reduce((sum, r) => sum + (r.totalWorkingHours || 0), 0) / formattedRecords.length).toFixed(2)
        ),
        averageLunchTimePerDay: parseFloat(
          (formattedRecords.reduce((sum, r) => sum + (r.totalLunchTime || 0), 0) / formattedRecords.length).toFixed(2)
        ),
        averageProductiveHoursPerDay: parseFloat(
          (formattedRecords.reduce((sum, r) => sum + (r.productiveHours || 0), 0) / formattedRecords.length).toFixed(2)
        ),
      };

      // Sort formatted records by user name first, then by date
      formattedRecords.sort((a, b) => {
        const nameA = a.user?.name?.toLowerCase() || a.name?.toLowerCase() || '';
        const nameB = b.user?.name?.toLowerCase() || b.name?.toLowerCase() || '';
        const nameCompare = nameA.localeCompare(nameB);

        if (nameCompare !== 0) return nameCompare;

        // If same user, sort by date
        const dateA = a.date || DateTime.fromJSDate(a.punchIn, { zone: localTimeZone }).toISODate();
        const dateB = b.date || DateTime.fromJSDate(b.punchIn, { zone: localTimeZone }).toISODate();
        return dateA.localeCompare(dateB);
      });

      return res.status(200).json({
        success: true,
        message: "Report retrieved successfully",
        data: {
          records: formattedRecords,
          userSummaries: userSummariesArray,
          overallSummary: overallSummary,
          dateRange: {
            from: startDate,
            to: endDate,
            fromISO: DateTime.fromJSDate(startDate, { zone: localTimeZone }).toISODate(),
            toISO: DateTime.fromJSDate(endDate, { zone: localTimeZone }).toISODate(),
          },
        },
      });

    } catch (error: any) {
      console.error("Error fetching report:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
}
