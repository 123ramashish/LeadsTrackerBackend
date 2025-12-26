import { Request, Response } from "express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import Task from "../DataBase/Schema/task.schema";
import User from "../DataBase/Schema/user.schema";
import { Notification_Create } from "../utils/notificationUtils";
import { sendPushNotification } from "../helper/notifications";
import Notification from "../DataBase/Schema/notification.schema";
import { stat } from "fs";
import RepeatTask from "../DataBase/Schema/repeatTask.schema";
import ImageKit from "imagekit";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY as string,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY as string,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
});

const localTimeZone = DateTime.local().zoneName;

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    company: string;
  };
}
const SAFE_USER_SELECT = "name email phone";

export default class TaskController {
  //  Create Task
  async createTask(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }
      const body = req.body;
      // ✅ Validate required fields
      if (
        !body.taskTitle ||
        !body.taskDate ||
        !body.dueDate ||
        !body.priority ||
        !body.location ||
        !body.estimatedTime ||
        !body.company
      ) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      //  Convert estimated time value to number
      const totalValue = Number(body.estimatedTime.value);
      const unit = body.estimatedTime.unit;

      //  If no assignee provided, assign all users in company
      if (!Array.isArray(body.assignee) || body.assignee.length === 0) {
        const users = await User.find({
          company: new mongoose.Types.ObjectId(body.company),
        });
        if (users.length === 0) {
          return res
            .status(400)
            .json({ message: "No users available to assign the task" });
        }
        body.assignee = users.map((u) => u._id.toString());
      }

      // ✅ Calculate estimated time per user
      const perUserValue = body.divide
        ? parseFloat((totalValue / body.assignee.length).toFixed(2))
        : Number(body.estimatedTime.value);
      const userEstimatedTime = body.assignee.map((userId: string) => ({
        user: userId,
        estimatedTime: { unit, value: perUserValue },
      }));

      //  Get local timezone and convert dates
      const localTimeZone = DateTime.local().zoneName;

      const startDate = new Date(
        DateTime.fromISO(body.taskDate).setZone(localTimeZone).toISO()!
      );
      const endDate = new Date(
        DateTime.fromISO(body.dueDate).setZone(localTimeZone).toISO()!
      );

      // ✅ user-specific start & end dates
      const userStartDate = body.assignee.map((userId: string) => ({
        user: userId,
        date: startDate,
      }));
      const userEndDate = body.assignee.map((userId: string) => ({
        user: userId,
        date: endDate,
      }));

      // ✅ user-specific dueDate array
      const dueDate = body.assignee.map((userId: string) => ({
        user: userId,
        date: [endDate],
      }));

      // ✅ Bucket logic
      let individualBucket: any[] = [];
      let companyBucket = false;

      if (body.bucket === "individual") {
        if (body.assignee.length == 0) {
          body.assignee = [user?.sub];
        }
        individualBucket = body.assignee.map((userId: string) => ({
          user: userId,
          individual: true,
        }));
      } else if (body.bucket === "company") {
        companyBucket = true;
      } else {
        individualBucket = body.assignee.map((userId: string) => ({
          user: userId,
          individual: false,
        }));
      }

      // ✅ Default status for each assignee
      const status = body.assignee.map((userId: string) => ({
        user: userId,
        status: "assignee",
      }));
      // ✅ Create task
      const task = new Task({
        taskTitle: body.taskTitle,
        taskDescription: body.taskDescription,
        taskDate: startDate,
        estimatedTime: { unit, value: totalValue },
        noOfEntry: body?.noOfEntry,
        entryTime: body?.entryTime,
        assignee: body.assignee,
        userEstimatedTime,
        priority: body.priority,
        location: body.location,
        address: body.address || null,
        startDate: userStartDate,
        endDate: userEndDate,
        dueDate: dueDate,
        createdBy: user.sub,
        tags: body.tags || [],
        notes: body.notes || "",
        status,
        company: new mongoose.Types.ObjectId(body.company),
        individualBucket,
        companyBucket,
        divideTime: body.divide,
      });
      await task.save();
      const message = `You have been assigned a task '${body.taskTitle}`;
      let userIds = body.assignee ? body.assignee : [];
      if (userIds) {
        const users = await User.find({}, "_id").lean();
        userIds = users.map((u: any) => u._id.toString());
      }
      // 🔔 Create notification in DB
      Notification.create({
        createFor: userIds,
        title: body.taskTitle,
        description: message,
      });

      // 📲 Send push notification
      sendPushNotification(userIds, body.taskTitle, message);
      await Notification_Create(body.assignee, body.taskTitle, message);

      return res.status(201).json({
        message: "Task created successfully",
        task,
      });
    } catch (error: any) {
      console.error("Error creating task:", error);
      return res.status(500).json({ message: error.message });
    }
  }
  async getAllTask(req: AuthRequest, res: Response) {
    try {
      const user: any = req.user;
      const normalize = (val: any) =>
        val && val !== "null" && val !== "undefined" && val !== "" ? val : null;

      //  Extract + normalize query params
      const {
        status,
        priority,
        assignee,
        createdBy,
        company,
        tags,
        search,
        limit,
        page,
        sortBy = "createdAt",
        order = "desc",
        dateRange,
        entryDoneRange,
        noOfEntryRange,
        individualBucket,
      } = req.query as any;
      const _status = normalize(status);
      const _priority = normalize(priority);
      const _assignee = normalize(assignee);
      const _createdBy = normalize(user.role === "admin" ? createdBy : user?.sub);
      const _tags = normalize(tags);
      const _company = normalize(company);
      const _search = normalize(search);
      const _dateRange = normalize(dateRange);
      const _entryDoneRange = normalize(entryDoneRange);
      const _noOfEntryRange = normalize(noOfEntryRange);
      const _individualBucket = normalize(individualBucket);

      const filter: any = {};
      const localTimeZone = DateTime.local().zoneName;
      // ✅ Multi-value fields
      if (_status) {
        filter["status.status"] = {
          $in: _status.split(",").map((s: any) => s.trim().toLowerCase()),
        };
      }
      if (_priority) {
        filter.priority = {
          $in: _priority.split(",").map((p: any) => p.trim().toLowerCase()),
        };
      }
      if (_assignee) {
        filter.assignee = {
          $in: _assignee.split(",").map((a: any) => a.trim().toLowerCase()),
        };
      }
      if (_createdBy) {
        const createdByArray = Array.isArray(_createdBy)
          ? _createdBy
          : String(_createdBy)
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c);

        filter.createdBy = { $in: createdByArray };
      }
      if (_tags) {
        filter.tags = { $in: _tags.split(",").map((t: any) => t.trim()) };
      }
      if (_company) {
        filter.company = user?.sub;
      }

      // ✅ Text search
      if (_search) {
        filter.$or = [
          { taskTitle: { $regex: _search, $options: "i" } },
          { taskDescription: { $regex: _search, $options: "i" } },
        ];
      }

      // ✅ Date range
      if (_dateRange) {
        const [queryStart, queryEnd] = _dateRange.split(",");
        if (queryStart && queryEnd) {
          // Convert query dates to proper Date objects
          const queryStartDate = DateTime.fromISO(queryStart)
            .setZone(localTimeZone)
            .startOf('day')
            .toJSDate();

          const queryEndDate = DateTime.fromISO(queryEnd)
            .setZone(localTimeZone)
            .endOf('day')
            .toJSDate();
          // Find tasks where task date range overlaps with query date range
          filter.$or = [
            // Case 1: Query range is completely within task range
            {
              "startDate.date": { $lte: queryStartDate },
              "endDate.date": { $gte: queryEndDate }
            },
            // Case 2: Query range overlaps at the beginning of task range
            {
              "startDate.date": { $lte: queryEndDate },
              "endDate.date": { $gte: queryStartDate }
            },
            // Case 3: Task has only startDate (ongoing task)
            {
              "startDate.date": { $lte: queryEndDate },
              "endDate.date": null
            },
            // Case 4: Task has only endDate (completed by date)
            {
              "startDate.date": null,
              "endDate.date": { $gte: queryStartDate }
            }
          ];
        }
      }

      // ✅ Entry ranges
      if (_entryDoneRange) {
        const [min, max] = _entryDoneRange.split(",").map(Number);
        if (!isNaN(min) && !isNaN(max)) {
          filter.entryDone = { $gte: min, $lte: max };
        }
      }
      if (_noOfEntryRange) {
        const [min, max] = _noOfEntryRange.split(",").map(Number);
        if (!isNaN(min) && !isNaN(max)) {
          filter.noOfEntry = { $gte: min, $lte: max };
        }
      }

      if (_individualBucket !== null && _assignee) {
        filter.individualBucket = {
          $elemMatch: {
            user: { $in: _assignee },
            individual: _individualBucket === "true",
          },
        };
      } else if (_individualBucket !== null) {
        filter["individualBucket.individual"] = _individualBucket === "true";
      } else {
        filter["individualBucket.individual"] = false;
      }

      // ✅ Sorting
      const sort: any = {};
      sort[sortBy] = order === "asc" ? 1 : -1;

      // ✅ Query DB
      const tasks = await Task.find(filter)
        .populate("assignee", "_id name role")
        .populate("userEstimatedTime.user", "_id name role")
        .populate("status.user", "_id name role")
        .populate("dueDate.user", "_id name role")
        .populate("startDate.user", "_id name role")
        .populate("endDate.user", "_id name role")
        .populate("createdBy", "_id name role")
        .populate("company", "_id name role")
        .populate("individualBucket.user", "_id name role")
        .populate("evaluation.user", "_id name role")
        .populate("statusHistory.changedBy", "_id name role")
        .populate("comments.createdBy", "_id name role")
        .populate("time_spent.user", "_id name role")
        .populate("Accept.user", "_id name role")
        .populate("actionEvents.user", "_id name role")
        .sort(sort)
        .skip(parseInt(page))
        .limit(parseInt(limit));

      const total = await Task.countDocuments(filter);
      return res.status(200).json({ total, totalPages: Math.round(total / limit), count: tasks.length, tasks });
    } catch (error: any) {
      console.error("Error getting tasks:", error.message);
      return res
        .status(500)
        .json({ message: "Failed to fetch tasks", error: error.message });
    }
  }


  async getTaskAmountTime(req: Request, res: Response) {
    try {
      const { assignees, company } = req.query as {
        assignees?: string;
        company?: string;
      };

      if (!company) {
        return res.status(400).json({ message: "Company ID is required" });
      }

      let assigneeIds: mongoose.Types.ObjectId[] = [];

      if (assignees) {
        // Split by comma and trim each ID
        const idArray = assignees.split(',').map(id => id.trim()).filter(id => id);
        assigneeIds = idArray.map(id => new mongoose.Types.ObjectId(id));
      } else {
        // If not provided, take all users from that company
        const users = await User.find({ company }, "_id");
        assigneeIds = users.map((u) => u._id);
      }

      // Fetch tasks - Fixed the query logic
      const taskAmount = await Task.find({
        company: new mongoose.Types.ObjectId(company),
        assignee: { $in: assigneeIds },
        status: {
          $elemMatch: {
            user: { $in: assigneeIds },
            status: { $nin: ["cancel", "completed"] }
          }
        }
      })
        .populate("assignee", "_id name role")
        .populate("userEstimatedTime.user", "_id name role")
        .populate("status.user", "_id name role")
        .populate("dueDate.user", "_id name role")
        .populate("startDate.user", "_id name role")
        .populate("endDate.user", "_id name role")
        .populate("createdBy", "_id name role");

      return res.status(200).json({ taskAmount });
    } catch (error: any) {
      console.error("Error calculating task time:", error.message);
      return res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
    }
  }

  async getTaskById(req: AuthRequest, res: Response) {
    try {
      const user: any = req.user;
      if (!user?.sub) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const safeNormalize = (val: any) => {
        if (!val || val === "null" || val === "undefined" || val === "[object Object]" || val === "") {
          return null;
        }
        return val;
      };

      const {
        status,
        priority,
        company,
        tags,
        search,
        limit,
        page,
        sortBy = "createdAt",
        order = "desc",
        dateRange,
        entryDoneRange,
        estimatedTime,
        noOfEntryRange,
        individualBucket,
      } = req.query as any;
      const _status = safeNormalize(status);
      const _priority = safeNormalize(priority);
      const _createdBy = user.role === "admin" ? null : safeNormalize(user?.sub);
      const _tags = safeNormalize(tags);
      const _company = safeNormalize(company);
      const _search = safeNormalize(search);
      const _dateRange = safeNormalize(dateRange);
      const _entryDoneRange = safeNormalize(entryDoneRange);
      const _noOfEntryRange = safeNormalize(noOfEntryRange);
      const _individualBucket = safeNormalize(individualBucket);
      const _estimatedTime = JSON.parse(estimatedTime);
      const filter: any = {
        assignee: { $in: [user.sub] },
      };
      const localTimeZone = DateTime.local().zoneName;
      console.log("entry", _noOfEntryRange, _entryDoneRange)
      //  Fix: status filter should match array elements where both user and status match
      let statusList: string[] = [];
      if (_status) {
        statusList = _status.split(",").map((s: string) => s.trim().toLowerCase());

        filter.status = {
          $elemMatch: {
            user: new mongoose.Types.ObjectId(user.sub),
            status: { $in: statusList },
          },
        };
      } else {
        filter.status = { $elemMatch: { user: new mongoose.Types.ObjectId(user.sub) } };
      }


      //  Priority filter
      if (_priority) {
        const priorityList = _priority.split(",").map((p: string) => p.trim().toLowerCase());
        filter.priority = { $in: priorityList };
      }

      //  CreatedBy
      if (_createdBy) {
        filter.createdBy = { $in: Array.isArray(_createdBy) ? _createdBy : [_createdBy] };
      }

      //  Tags
      if (_tags) {
        filter.tags = { $in: _tags.split(",").map((t: string) => t.trim()).filter(Boolean) };
      }

      //  Company
      if (_company) {
        filter.company = user?.company;
      }

      //  Text search
      const orConditions: any[] = [];
      if (_search) {
        orConditions.push(
          { taskTitle: { $regex: _search, $options: "i" } },
          { taskDescription: { $regex: _search, $options: "i" } }
        );
      }

      //  Date range
      // ✅ Date range - Find tasks where query date range overlaps with task date range
      if (_dateRange) {
        const [start, end] = _dateRange.split(",");
        if (start && end) {
          const queryStart = DateTime.fromISO(start)
            .setZone(localTimeZone)
            .startOf('day')
            .toJSDate();

          const queryEnd = DateTime.fromISO(end)
            .setZone(localTimeZone)
            .endOf('day')
            .toJSDate();

          // Create date range filter for overlapping ranges
          const dateRangeFilter = {
            $or: [
              // Case 1: Standard overlap - query range overlaps with task range
              {
                $and: [
                  { "startDate.date": { $lte: queryEnd } },
                  { "endDate.date": { $gte: queryStart } }
                ]
              },
              // Case 2: Task has no end date (ongoing) and started before query end
              {
                $and: [
                  { "startDate.date": { $lte: queryEnd } },
                  { "endDate.date": null }
                ]
              },
              // Case 3: Task has no start date but ends after query start
              {
                $and: [
                  { "startDate.date": null },
                  { "endDate.date": { $gte: queryStart } }
                ]
              },
              // Case 4: Check other date fields as fallback
              { taskDate: { $gte: queryStart, $lte: queryEnd } },
              { "dueDate.date": { $elemMatch: { $gte: queryStart, $lte: queryEnd } } }
            ]
          };

          orConditions.push(dateRangeFilter);
        }
      }

      if (orConditions.length > 0) {
        filter.$or = orConditions;
      }

      //  Numeric Ranges
      const andConditions: any[] = [];

      if (_entryDoneRange) {
        const [min, max] = _entryDoneRange.split(",").map(Number);

        if (!isNaN(min) && !isNaN(max)) {
          filter.entryDone = { $gte: min, $lte: max };
        }
      }

      if (_noOfEntryRange) {
        const [min, max] = _noOfEntryRange.split(",").map(Number);
        if (!isNaN(min) && !isNaN(max)) {
          filter.noOfEntry = { $gte: min, $lte: max };
        }
      }

      // if (andConditions.length > 0) {
      //   filter.$and = andConditions;
      // }
      //  Individual bucket logic
      if (_individualBucket !== null) {
        const isIndividual = _individualBucket === "true";
        filter.individualBucket = {
          $elemMatch: { user: user.sub, individual: isIndividual },
        };
      }
      if (_estimatedTime) {
        filter.estimatedTime = {
          value: Number(_estimatedTime.value), unit: _estimatedTime.unit,
        };
      }
      //  Sorting
      const sort: any = { [sortBy]: order === "asc" ? 1 : -1 };
      //  DB Query
      const tasks = await Task.find(filter)
        .populate("assignee", "_id name role")
        .populate("userEstimatedTime.user", "_id name role")
        .populate("status.user", "_id name role")
        .populate("dueDate.user", "_id name role")
        .populate("startDate.user", "_id name role")
        .populate("endDate.user", "_id name role")
        .populate("createdBy", "_id name role")
        .populate("company", "_id name role")
        .populate("statusHistory.changedBy", "_id name role")
        .lean();
      const transformedTasks = await this.transformTaskData(tasks, user?.sub);
      const statusOrder: Record<string, number> = {
        assignee: 1,
        "in progress": 2,
        pause: 3,
        expired: 4,
        completed: 5,
        cancel: 6,
      };

      const userTasks = transformedTasks
        .map((task: any) => {
          const currentStatus = task.status[0]?.status ?? "assignee";
          const sortValue = statusOrder[currentStatus] ?? 99;
          return { ...task, userStatus: currentStatus, sortValue };
        })
        .filter((task: any) => !_status || statusList.includes(task.userStatus));
      const totalCount = await Task.countDocuments(filter);

      const sortedTasks = userTasks
        .sort((a: any, b: any) => a.sortValue - b.sortValue)
        .slice(parseInt(page), parseInt(page) + parseInt(limit));
      return res.status(200).json({
        count: totalCount,
        totalPages: Math.round(totalCount / limit),
        tasks: sortedTasks.map(({ sortValue, ...rest }) => rest),
      });
    } catch (error: any) {
      console.error("Error getting tasks by user ID:", error);
      return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
  }


  async updateTaskStatus(req: AuthRequest, res: Response) {
    try {
      const user: any = req.user;
      const { id, company, status, userStatusId, address } = req.body;
      const localTimeZone = DateTime.local().zoneName;
      const userId = new mongoose.Types.ObjectId(userStatusId);

      // ✅ 1. Check if user already has an in-progress task
      if (status === "in progress") {
        const existingTask = await Task.findOne({
          company,
          assignee: userStatusId,
          status: {
            $elemMatch: { user: userStatusId, status: "in progress" },
          },
        }).select("_id");

        if (existingTask) {
          return res.status(400).json({
            success: false,
            message: "Already has a task in progress.",
            taskId: existingTask._id,
          });
        }
      }

      // ✅ 2. Load task
      const task = await Task.findOne({
        _id: new mongoose.Types.ObjectId(id),
        company: new mongoose.Types.ObjectId(company),
      });

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // ✅ 3. Pre-scan arrays in a single pass
      let userStatusEntry: any = null;
      let userEndDate: any = null;
      let userDueDates: Date[] = [];
      let latestHistory: any = null;
      let userTimeSpent: any = null;
      let hasUserComment = false;

      const now = DateTime.local().setZone(localTimeZone);

      // scan status
      for (const s of task.status as any) {
        if (s.user.toString() === userStatusId) {
          userStatusEntry = s;
          break;
        }
      }

      // scan endDate
      for (const ed of task.endDate as any) {
        if (ed.user.toString() === userStatusId) {
          userEndDate = ed;
          break;
        }
      }

      // scan dueDate
      for (const dd of task.dueDate as any) {
        if (dd.user.toString() === userStatusId) {
          userDueDates = dd.date || [];
          break;
        }
      }

      // scan statusHistory → pick latest in one pass
      for (const h of task.statusHistory as any) {
        if (h.changedBy.toString() === userId.toString()) {
          if (
            !latestHistory ||
            new Date(h.changedAt).getTime() >
            new Date(latestHistory.changedAt).getTime()
          ) {
            latestHistory = h;
          }
        }
      }

      // scan time_spent
      for (const t of task.time_spent as any) {
        if (t.user.toString() === userId.toString()) {
          userTimeSpent = t;
          break;
        }
      }

      // scan comments
      for (const c of task.comments as any) {
        if (String(c.createdBy) === String(userStatusId)) {
          hasUserComment = true;
          break;
        }
      }

      // ✅ 4. Validation: canceled task
      if (userStatusEntry?.status === "cancel" && user.role !== "admin") {
        return res.status(400).json({
          success: false,
          message: "Task is canceled, only admin can change status.",
        });
      }

      // ✅ 5. Validation: due/end date
      const validStatuses = ["assignee", "in progress", "expired", "completed"];
      if (validStatuses.includes(status)) {
        let hasValidDate = false;

        if (userEndDate?.date) {
          const endDate = DateTime.fromJSDate(userEndDate.date, {
            zone: localTimeZone,
          });
          if (endDate > now) hasValidDate = true;
        }

        if (userDueDates.length) {
          if (
            userDueDates.some(
              (d) => DateTime.fromJSDate(d, { zone: localTimeZone }) > now
            )
          ) {
            hasValidDate = true;
          }
        }

        if (!hasValidDate) {
          return res.status(400).json({
            success: false,
            message: "Target date must be updated before changing status.",
          });
        }
      }

      // ✅ 6. Validation: completed must have comment
      if (status === "completed" && !hasUserComment) {
        return res.status(400).json({
          success: false,
          message: "You must add a comment before completing the task.",
        });
      }

      // ✅ 7. Time spent calc if last status was in progress
      if (latestHistory?.status === "in progress") {
        const minutesSpent = Math.floor(
          (now.toMillis() -
            DateTime.fromJSDate(latestHistory.changedAt)
              .setZone(localTimeZone)
              .toMillis()) /
          60000
        );

        if (userTimeSpent) {
          userTimeSpent.time.push(minutesSpent);
        } else {
          task.time_spent.push({ user: userId, time: [minutesSpent] });
        }
      }

      // ✅ 8. Update user status
      if (userStatusEntry) {
        userStatusEntry.status = status;
      } else {
        task.status.push({ user: userId, status });
      }
      // ✅ 9. Ensure Accept is true for this user
      if (status !== "cancel") {
        const userAccept = task.Accept.find(
          (a: any) => a.user.toString() === userId.toString()
        );

        if (userAccept) {
          if (!userAccept.status) {
            userAccept.status = true;
          }
        } else {
          task.Accept.push({ user: userId, status: true });
        }
      }
      // ✅ 10. Push status history
      task.statusHistory.push({
        status,
        changedAt: now.toISO(),
        changedBy: userId,
        address: address || null,
      });

      await task.save();

      return res.status(200).json({
        message: "Task status updated successfully",
        task,
      });
    } catch (error: any) {
      console.error("Error updating task status:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }

  //  Add a new comment to a task
  async addTaskMessage(req: Request, res: Response) {
    try {
      const { message, files, address, taskId, company, userId } = req.body;
      if (!message || !taskId || !company || !userId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const localTimeZone = DateTime.local().zoneName;

      const task = await Task.findOne({ _id: taskId, company });
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const newComment = {
        createdBy: new mongoose.Types.ObjectId(userId),
        createdAt: DateTime.now().setZone(localTimeZone),
        message,
        files: files || [],
        workingLocation: address || "",
      };

      task.comments.push(newComment);
      await task.save();

      return res.status(201).json({
        message: "Comment added successfully",
        comment: newComment,
      });
    } catch (error: any) {
      console.error("Error adding task comment:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }

  async getTaskMessages(req: Request, res: Response) {
    try {
      const { id, company } = req.query as { id?: string; company?: string };

      if (!id || !company) {
        return res.status(400).json({ message: "Missing task ID or company" });
      }

      // Validate ObjectId format
      if (
        !mongoose.Types.ObjectId.isValid(id) ||
        !mongoose.Types.ObjectId.isValid(company)
      ) {
        return res
          .status(400)
          .json({ message: "Invalid task ID or company ID" });
      }

      const task = await Task.findOne({
        _id: new mongoose.Types.ObjectId(id),
        company: new mongoose.Types.ObjectId(company),
      }).populate("comments.createdBy", "name email");

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      return res.status(200).json(task.comments);
    } catch (error: any) {
      console.error("Error getting task comments:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }

  async updateTaskTimeline(req: Request, res: Response) {
    try {
      const { id, company, user, dueDate } = req.body;

      // Validate ObjectIds
      if (!id || !company || !user) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      // Find the task by id and company
      const task = await Task.findOne({
        _id: new mongoose.Types.ObjectId(id),
        company: new mongoose.Types.ObjectId(company),
      });
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Find the dueDate entry for this user
      const userDueDateEntry = task.dueDate.find(
        (entry: any) => entry.user.toString() === user
      );

      if (!userDueDateEntry) {
        return res
          .status(400)
          .json({ message: "User is not assigned to this task" });
      }

      // Push the new date
      userDueDateEntry.date.push(new Date(dueDate));

      // Save changes
      await task.save();

      return res.status(200).json({
        message: "Due date updated successfully",
        task,
      });
    } catch (error: any) {
      console.error("Error updating task timeline:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }
  async getTaskBucket(req: AuthRequest, res: Response) {
    try {
      const { bucketType, company } = req.query as {
        bucketType?: "individual" | "company";
        company?: string;
      };

      // base filter
      const filter: any = {};

      // restrict to company if passed
      if (company) {
        filter.company = new mongoose.Types.ObjectId(company);
      }

      // filter by bucket type
      if (bucketType === "individual") {
        filter["individualBucket.individual"] = true;
      } else if (bucketType === "company") {
        filter.companyBucket = true;
      } else {
        // if empty → match either individual OR company bucket
        filter.$or = [
          { "individualBucket.individual": true },
          { companyBucket: true },
        ];
      }

      const tasks = await Task.find(filter)
        .populate("assignee", "_id name role")
        .populate("userEstimatedTime.user", "_id name role")
        .populate("status.user", "_id name role")
        .populate("dueDate.user", "_id name role")
        .populate("startDate.user", "_id name role")
        .populate("endDate.user", "_id name role")
        .populate("createdBy", "_id name role")
        .populate("company", "_id name role")
        .populate("individualBucket.user", "_id name role")
        .populate("evaluation.user", "_id name role")
        .populate("statusHistory.changedBy", "_id name role")
        .populate("comments.createdBy", "_id name role")
        .populate("time_spent.user", "_id name role")
        .populate("Accept.user", "_id name role")
        .populate("actionEvents.user", "_id name role")
        .sort({ createdAt: -1 });

      return res.status(200).json({
        count: tasks.length,
        tasks,
      });
    } catch (error: any) {
      console.error("Error getting task bucket:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }

  async updateTaskDetails(req: AuthRequest, res: Response) {
    try {
      const { _id, company, ...rest } = req.body;

      if (!_id || !company) {
        return res
          .status(400)
          .json({ message: "Validate data error, Please login!" });
      }

      // Build dynamic update object
      const updateData: Record<string, any> = {};
      if (rest.entryTime) {
        updateData.entryTime = rest.entryTime;
      }
      if (rest.entryDone !== undefined) {
        updateData.entryDone = Number(rest.entryDone);
      }
      if (rest.NOE !== undefined) {
        updateData.noOfEntry = Number(rest.NOE);
      }
      if (rest.description) {
        updateData.taskDescription = rest.description;
      }
      if (rest.title) {
        updateData.taskTitle = rest.title;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updatedTask = await Task.findOneAndUpdate(
        { _id, company },
        { $set: updateData },
        { new: true }
      );

      if (!updatedTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      return res.status(200).json({
        message: "Task updated successfully",
        task: updatedTask,
      });
    } catch (error: any) {
      console.error("Error updating task:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }

  async individualBucket(req: AuthRequest, res: Response) {
    try {
      const authUser: any = req.user;
      let { userId } = req.query; // could be string or array
      let query: any = {};

      if (userId) {
        // Ensure userId is always an array
        const userIds = Array.isArray(userId) ? userId : [userId];

        query = {
          individualBucket: {
            $elemMatch: { user: { $in: userIds }, individual: true },
          },
        };
      } else {
        // If no userId provided → return all tasks where any user has individual = true
        query = {
          "individualBucket.individual": true,
        };
      }

      const tasks = await Task.find(query).populate("assignee", "_id name role")
        .populate("userEstimatedTime.user", "_id name role")
        .populate("status.user", "_id name role")
        .populate("dueDate.user", "_id name role")
        .populate("startDate.user", "_id name role")
        .populate("endDate.user", "_id name role")
        .populate("createdBy", "_id name role")
        .populate("company", "_id name role")
        .populate("individualBucket.user", "_id name role")
        .populate("evaluation.user", "_id name role")
        .populate("statusHistory.changedBy", "_id name role")
        .populate("comments.createdBy", "_id name role")
        .populate("time_spent.user", "_id name role")
        .populate("Accept.user", "_id name role")
        .populate("actionEvents.user", "_id name role");

      return res.status(200).json({
        message: "Individual bucket tasks fetched successfully",
        count: tasks.length,
        tasks,
      });
    } catch (error: any) {
      console.error("Error fetching individual bucket:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }

  //  Company Bucket
  async companyBucket(req: AuthRequest, res: Response) {
    try {
      const tasks = await Task.find({ companyBucket: true });

      return res.status(200).json({
        message: "Company bucket tasks fetched successfully",
        count: tasks.length,
        tasks,
      });
    } catch (error: any) {
      console.error("Error fetching company bucket:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }
  async bucketShift(req: AuthRequest, res: Response) {
    try {
      const { taskId, userId, toBucket } = req.body;
      if (!taskId || !userId || !toBucket) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const task: any = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      const userIds: string[] = Array.isArray(userId) ? userId : [userId];

      // Update individualBucket for each user
      task.individualBucket.forEach((entry: any) => {
        if (userIds.includes(entry.user.toString())) {
          entry.individual = toBucket === "individual";
        }
      });

      // Update companyBucket
      if (toBucket === "company") {
        if (task.companyBucket) {
          return res
            .status(200)
            .json({ message: "Task already exit in company bucket!" });
        }
        task.companyBucket = true;
        task.assignee = task.assignee.filter(
          (a: any) => !userIds.includes(a.toString())
        );
      } else if (toBucket === "none") {
        task.companyBucket = false;
      }
      await task.save();

      return res.status(200).json({
        message: "Task send to bucket successfully!",
        task,
      });
    } catch (error: any) {
      console.error("Error updating bucket:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }
  async pickTask(req: AuthRequest, res: Response) {
    try {
      const { taskId, assignee, bucketType, targetDate } = req.body;

      const task: any = await Task.findById(
        new mongoose.Types.ObjectId(taskId)
      );
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // ✅ ensure we use local timezone
      const localTimeZone = DateTime.local().zoneName;
      const now = DateTime.local().setZone(localTimeZone).toJSDate();
      const target = DateTime.fromISO(targetDate, {
        zone: localTimeZone,
      }).toJSDate();

      if (bucketType === "individual") {
        const assignees = Array.isArray(assignee) ? assignee : [assignee];

        // update individualBucket for each user
        task.individualBucket = task.individualBucket.map((ib: any) =>
          assignees.includes(ib.user.toString())
            ? { ...ib.toObject?.(), individual: false }
            : ib
        );

        // remove old dueDate entries of assignees
        task.dueDate = task.dueDate.filter(
          (d: any) => !assignees.includes(d.user.toString())
        );

        // add new dueDate entries
        assignees.forEach((a) => {
          task.dueDate.push({
            user: a,
            date: [target],
          });
        });

        // remove old status entries of assignees
        task.status = task.status.filter(
          (s: any) => !assignees.includes(s.user.toString())
        );

        // add new status entries
        assignees.forEach((a) => {
          task.status.push({
            user: a,
            status: "assignee",
          });
        });

        // add startDate entries
        assignees.forEach((a) => {
          task.startDate.push({
            user: a,
            date: now,
          });
        });

        // add statusHistory entries
        assignees.forEach((a) => {
          task.statusHistory.push({
            status: "assignee",
            changedAt: now,
            changedBy: a,
            address: req.body.address || null,
          });
        });
      }

      if (bucketType === "company") {
        // push into assignee array if not exists
        if (!task.assignee.find((a: any) => a.toString() === assignee)) {
          task.assignee.push(assignee[0]);
        }

        // update individualBucket for this user
        task.individualBucket = task.individualBucket.map((ib: any) =>
          ib.user.toString() === assignee[0]
            ? { ...ib.toObject(), individual: false }
            : ib
        );

        // update dueDate
        task.dueDate = task.dueDate.filter(
          (d: any) => d.user.toString() !== assignee[0]
        );
        task.dueDate.push({
          user: assignee[0],
          date: [target],
        });

        // ✅ add targetDate for company bucket
        task.targetDate = target;

        // update status
        task.status = task.status.filter(
          (s: any) => s.user.toString() !== assignee[0]
        );
        task.status.push({
          user: assignee[0],
          status: "assignee",
        });

        // push startDate
        task.startDate.push({
          user: assignee[0],
          date: now,
        });

        // push statusHistory
        task.statusHistory.push({
          status: "assignee",
          changedAt: now,
          changedBy: assignee[0] || assignee,
          address: req.body.address || null,
        });
      }

      await task.save();

      return res.status(200).json({
        message: "Task updated successfully",
        task,
      });
    } catch (error: any) {
      console.error("Error updating task:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }
  async estimatedTimeUpdate(req: AuthRequest, res: Response) {
    try {
      const { _id, userEstimatedTimes } = req.body;

      if (!_id || !userEstimatedTimes || !Array.isArray(userEstimatedTimes)) {
        return res.status(400).json({ message: "Invalid data format" });
      }

      const task = await Task.findById(_id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      // Update each user's estimated time
      userEstimatedTimes.forEach((update: any) => {
        const entry = task.userEstimatedTime.find(
          (uet: any) => uet.user.toString() === update.userId
        );
        if (entry) {
          entry.estimatedTime = {
            value: update.estimatedTime.value,
            unit: update.estimatedTime.unit,
          };
        }
      });

      // Mark nested array as modified so mongoose saves changes
      task.markModified("userEstimatedTime");

      // Conversion map → minutes
      const unitToMinutes: Record<string, number> = {
        Minutes: 1,
        Hours: 60,
        Days: 1440,
      };

      // Sum total minutes
      const totalMinutes = task.userEstimatedTime.reduce(
        (sum: number, uet: any) => {
          const value = uet.estimatedTime?.value || 0;
          const unit = uet.estimatedTime?.unit || "Minutes";
          return sum + value * (unitToMinutes[unit] || 1);
        },
        0
      );

      // Decide best display unit
      let finalValue: number;
      let finalUnit: "Minutes" | "Hours" | "Days";

      if (totalMinutes < 60) {
        finalValue = totalMinutes;
        finalUnit = "Minutes";
      } else if (totalMinutes < 1440) {
        finalValue = +(totalMinutes / 60).toFixed(2);
        finalUnit = "Hours";
      } else {
        finalValue = +(totalMinutes / 1440).toFixed(2);
        finalUnit = "Days";
      }

      task.estimatedTime = {
        value: finalValue,
        unit: finalUnit,
      };

      await task.save();

      return res.status(200).json({
        message: "Estimated times updated successfully",
        task,
      });
    } catch (error: any) {
      console.error("Error updating estimated times:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }
  async updateTags(req: Request, res: Response) {
    try {
      const { id, company, tags } = req.body;
      if (!id || !company || !Array.isArray(tags)) {
        return res
          .status(400)
          .json({ message: "Task ID, Company ID, and tags are required" });
      }
      const task = await Task.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(id),
          company: new mongoose.Types.ObjectId(company),
        },
        { tags },
        { new: true }
      );
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      return res.status(200).json({
        message: "Tags updated successfully",
        task,
      });
    } catch (error: any) {
      console.error("Error updating tags:", error.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: error.message,
      });
    }
  }

  // get contact person
  async getContactPerson(req: Request, res: Response) {
    try {
      const { task } = req.query;

      if (!task || !mongoose.Types.ObjectId.isValid(task as string)) {
        return res.status(400).json({ message: "Invalid or missing task ID" });
      }

      const taskDoc = await Task.findById(task).select("contactPerson");

      if (!taskDoc) {
        return res.status(404).json({ message: "Task not found" });
      }

      return res.status(200).json({ contactPerson: taskDoc.contactPerson });
    } catch (error: any) {
      console.error("Error fetching contact person:", error.message);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  //add contact person
  async addContactPerson(req: Request, res: Response) {
    try {
      const { name, phone, task }: any = req.body;
      if (!task || !mongoose.Types.ObjectId.isValid(task as string)) {
        return res.status(400).json({ message: "Invalid or missing task ID" });
      }

      if (!name || !phone) {
        return res.status(400).json({ message: "Name and phone are required" });
      }

      const updatedTask = await Task.findByIdAndUpdate(
        task,
        { $push: { contactPerson: { name, phone } } },
        { new: true }
      ).select("contactPerson");
      if (!updatedTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      return res.status(200).json({ contactPerson: updatedTask.contactPerson });
    } catch (error: any) {
      console.error("Error adding contact person:", error.message);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }
  // update contact person
  async updateContactPerson(req: Request, res: Response) {
    try {
      const { name, phone, task, index }: any = req.body;

      if (!task || !mongoose.Types.ObjectId.isValid(task as string)) {
        return res.status(400).json({ message: "Invalid or missing task ID" });
      }
      const taskDoc = await Task.findById(task);

      if (!taskDoc) {
        return res.status(404).json({ message: "Task not found" });
      }

      const idx = parseInt(index);
      if (idx < 0 || idx >= taskDoc.contactPerson.length) {
        return res.status(400).json({ message: "Index out of bounds" });
      }

      if (name) taskDoc.contactPerson[idx].name = name;
      if (phone) taskDoc.contactPerson[idx].phone = phone;

      await taskDoc.save();

      return res.status(200).json({ contactPerson: taskDoc.contactPerson });
    } catch (error: any) {
      console.error("Error updating contact person:", error.message);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }
  // delete contact person
  async removeContactPerson(req: Request, res: Response) {
    try {
      const { task, index } = req.body;
      if (!task) {
        return res.status(400).json({ message: "Invalid or missing task ID" });
      }
      const idx = parseInt(index);

      const taskDoc = await Task.findById(task);

      if (!taskDoc) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (idx < 0 || idx >= taskDoc.contactPerson.length) {
        return res.status(400).json({ message: "Index out of bounds" });
      }

      taskDoc.contactPerson.splice(idx, 1);
      await taskDoc.save();
      return res.status(200).json({ contactPerson: taskDoc.contactPerson });
    } catch (error: any) {
      console.error("Error removing contact person:", error.message);
      return res.status(500).json({ message: "Server error", error: error.message });
    }
  }
  async getReport(req: AuthRequest, res: Response) {
    try {
      const user: any = req.user;
      const normalize = (val: any) =>
        val && val !== "null" && val !== "undefined" && val !== "" ? val : null;

      // Extract + normalize query params
      const {
        assignee,
        company,
        dateRange,
        individualBucket,
      } = req.query as any;

      // const _assignee = normalize(assignee);
      // const _company = normalize(company);
      // const _dateRange = normalize(dateRange);
      // const _individualBucket = normalize(individualBucket);

      const filter: any = {};
      const localTimeZone = DateTime.local().zoneName;

      // Company filter

      filter.company = new mongoose.Types.ObjectId(company || user.company);


      if (assignee) {
        const assigneeIds = assignee
          .split(",")
          .map((id: string) => id.trim());

        // Match tasks where assignee array contains any of the given IDs
        filter.assignee = { $in: assigneeIds };
      } else {
        const users = await User.find({
          company: new mongoose.Types.ObjectId(user.company),
        });

        if (users.length === 0) {
          return res
            .status(400)
            .json({ message: "No users available to assign the task" });
        }

        filter.assignee = {
          $in: users.map((u) => u._id.toString()),
        };
      }


      // Date range filter
      if (dateRange) {
        const [start, end] = dateRange.split(",");
        if (start && end) {
          const startDt = DateTime.fromISO(start).setZone(localTimeZone).startOf("day");
          const endDt = DateTime.fromISO(end).setZone(localTimeZone).endOf("day");
          const startDateUTC = startDt.toUTC().toJSDate();
          const endDateUTC = endDt.toUTC().toJSDate();

          filter.$or = [
            { taskDate: { $gte: startDateUTC, $lte: endDateUTC } },
            { "dueDate.date": { $gte: startDateUTC, $lte: endDateUTC } },
            { "startDate.date": { $gte: startDateUTC, $lte: endDateUTC } },
            { "endDate.date": { $gte: startDateUTC, $lte: endDateUTC } },
          ];
        }
      }


      // Individual bucket filter - FIXED LOGIC
      if (individualBucket !== null && assignee) {
        filter.individualBucket = {
          $elemMatch: {
            user: { $in: assignee },
            individual: individualBucket === "true",
          },
        };
      } else if (individualBucket !== null) {
        filter["individualBucket.individual"] = individualBucket === "true";
      } else {
        filter["individualBucket.individual"] = false;
      }
      // Query DB with the fixed filter
      const tasks = await Task.find(filter)
        .populate("assignee", "_id name role email")
        .populate("userEstimatedTime.user", "_id name role")
        .populate("status.user", "_id name role")
        .populate("dueDate.user", "_id name role")
        .populate("startDate.user", "_id name role")
        .populate("endDate.user", "_id name role")
        .populate("createdBy", "_id name role")
        .populate("company", "_id name role")
        .populate("individualBucket.user", "_id name role")
        .populate("evaluation.user", "_id name role")
        .populate("statusHistory.changedBy", "_id name role")
        .populate("comments.createdBy", "_id name role")
        .populate("time_spent.user", "_id name role")
        .populate("Accept.user", "_id name role")
        .populate("actionEvents.user", "_id name role")
        .lean();

      // Transform data for better response
      const transformedTasks = tasks.map(task => ({
        id: task._id,
        title: task.taskTitle,
        description: task.taskDescription,
        assignee: task.assignee,
        status: task.status,
        priority: task.priority,
        taskDate: task.taskDate,
        dueDate: task.dueDate,
        startDate: task.startDate,
        endDate: task.endDate,
        entryDone: task.entryDone || 0,
        noOfEntry: task.noOfEntry || 0,
        estimatedTime: task.userEstimatedTime,
        timeSpent: task.time_spent,
        tags: task.tags || [],
        company: task.company,
        individualBucket: task.individualBucket,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      }));
      const groupTasksByAssignee = (tasks: any[]) => {
        const usersMap = new Map();

        tasks.forEach((task: any) => {
          // Since assignee is an array, loop through all assignees
          task.assignee.forEach((assignee: any) => {
            const userId = assignee._id.toString();

            if (!usersMap.has(userId)) {
              usersMap.set(userId, {
                user: assignee,
                tasks: []
              });
            }

            // Add the task to this user's task list
            usersMap.get(userId).tasks.push({
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status.find((s: any) => s.user._id.toString() === userId) || task.status[0],
              priority: task.priority,
              taskDate: task.taskDate,
              dueDate: task.dueDate.find((d: any) => d.user._id.toString() === userId) || task.dueDate[0],
              startDate: task.startDate.find((s: any) => s.user.toString() === userId) || task.startDate[0],
              endDate: task.endDate.find((e: any) => e.user.toString() === userId) || task.endDate[0],
              entryDone: task.entryDone,
              noOfEntry: task.noOfEntry,
              estimatedTime: task.estimatedTime.find((e: any) => e.user._id.toString() === userId) || task.estimatedTime[0],
              timeSpent: task.timeSpent.find((t: any) => t.user._id.toString() === userId) || { time: [] },
              tags: task.tags,
              company: task.company,
              individualBucket: task.individualBucket.find((i: any) => i.user.toString() === userId) || task.individualBucket[0],
              createdAt: task.createdAt,
              updatedAt: task.updatedAt
            });
          });
        });

        // Convert map to array
        return Array.from(usersMap.values());
      };
      const groupedTasks = groupTasksByAssignee(transformedTasks);

      return res.status(200).json({
        success: true,
        count: tasks.length,
        tasks: groupedTasks,
      });

    } catch (error: any) {
      console.error("Error generating report:", error.message);
      console.error("Error stack:", error.stack);
      return res.status(500).json({
        message: "Failed to generate report",
        error: error.message
      });
    }
  }
  async deleteRepeatTasks(req: AuthRequest, res: Response) {
    try {
      const user: any = req.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { taskIds, company } = req.body;
      if (!taskIds || !Array.isArray(taskIds) || !company) {
        return res
          .status(400)
          .json({ message: "Task IDs and company are required" });
      }
      const objectIds = taskIds.map((id: string) => new mongoose.Types.ObjectId(id));
      const result = await RepeatTask.deleteMany({
        _id: { $in: objectIds },
        company: company
      });
      return res.status(200).json({ message: "Tasks deleted successfully", result });
    } catch (error: any) {
      console.error("Error deleting tasks:", error.message);
      return res.status(500).json({ message: "Failed to delete tasks", error: error.message });
    }
  }

  async getReportWithFields(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      if (!user?.sub) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { users, fromDate, toDate, fields, status, priority, location } = 
        req.body || req.query;

      const localTimeZone = DateTime.local().zoneName;

      // Date range setup
      const startDate: Date = fromDate
        ? DateTime.fromISO(fromDate, { zone: localTimeZone })
            .startOf("day")
            .toJSDate()
        : DateTime.now().setZone(localTimeZone).startOf("day").toJSDate();

      const endDate: Date = toDate
        ? DateTime.fromISO(toDate, { zone: localTimeZone })
            .endOf("day")
            .toJSDate()
        : DateTime.now().setZone(localTimeZone).endOf("day").toJSDate();

      // Build query
      const query: Record<string, any> = {
        taskDate: { $gte: startDate, $lte: endDate },
        company: user.company,
      };

      // Handle user filtering based on role
      let userIds: mongoose.Types.ObjectId[] = [];

      if (user.role === "staff") {
        query.assignee = new mongoose.Types.ObjectId(user.sub);
      } else if (user.role === "admin") {
        if (!users || users.length === 0) {
          const allUsers = await User.find({ company: user.company }, "_id");
          userIds = allUsers.map((u) => u._id);
        } else {
          let arrayOfUsers = Array.isArray(users) ? users : users.split(",");
          userIds = arrayOfUsers.map(
            (id: string) => new mongoose.Types.ObjectId(id)
          );
        }

        if (userIds.length > 0) {
          query.assignee = { $in: userIds };
        }
      } else {
        return res.status(403).json({ message: "Unauthorized access" });
      }

      // Additional filters
      if (status) {
        const statusArray = Array.isArray(status) ? status : status.split(",");
        query["status.status"] = { $in: statusArray };
      }

      if (priority) {
        const priorityArray = Array.isArray(priority) ? priority : priority.split(",");
        query.priority = { $in: priorityArray };
      }

      if (location) {
        query.location = location;
      }

      // Build projection based on requested fields
      let projection: Record<string, number> = {
        _id: 1,
        taskTitle: 1,
        taskDate: 1,
        assignee: 1,
        company: 1,
        createdBy: 1,
      };

      let arrayFields = Array.isArray(fields) ? fields : fields?.split(",");
      const includeAllFields =
        !arrayFields || !Array.isArray(arrayFields) || arrayFields.length === 0;

      let userSelectFields = SAFE_USER_SELECT;
      let createdBySelectFields = SAFE_USER_SELECT;

      if (!includeAllFields) {
        let needsStatusHistory = false;
        let needsComments = false;
        let needsTimeSpent = false;
        let needsUserFields = new Set<string>();
        let needsCreatedByFields = new Set<string>();

        arrayFields.forEach((field: string) => {
          switch (field) {
            // User fields for assignees
            case "assigneeName":
            case "assigneeEmail":
            case "assigneePhone":
              needsUserFields.add(field.replace("assignee", "").toLowerCase());
              break;

            // Creator fields
            case "creatorName":
            case "creatorEmail":
            case "creatorPhone":
              needsCreatedByFields.add(field.replace("creator", "").toLowerCase());
              break;

            // Basic fields
            case "taskTitle":
            case "taskDescription":
            case "taskDate":
            case "priority":
            case "location":
            case "address":
            case "tags":
            case "notes":
            case "approval":
            case "taskType":
            case "divideTime":
            case "noOfEntry":
            case "entryDone":
              projection[field] = 1;
              break;

            // Nested fields
            case "estimatedTime":
            case "entryTime":
            case "userEstimatedTime":
            case "dueDate":
            case "startDate":
            case "endDate":
            case "status":
            case "evaluation":
            case "individualBucket":
            case "Accept":
            case "contactPerson":
              projection[field] = 1;
              break;

            // Complex nested fields
            case "statusHistory":
            case "lastStatusChange":
            case "statusChanges":
              needsStatusHistory = true;
              break;

            case "comments":
            case "commentCount":
              needsComments = true;
              break;

            case "timeSpent":
            case "totalTimeSpent":
              needsTimeSpent = true;
              break;

            // Calculated fields
            case "isOverdue":
            case "completionRate":
            case "taskDuration":
            case "timeRemaining":
              // These are calculated, no projection needed
              break;

            default:
              projection[field] = 1;
          }
        });

        if (needsStatusHistory) projection.statusHistory = 1;
        if (needsComments) projection.comments = 1;
        if (needsTimeSpent) projection.time_spent = 1;

        if (needsUserFields.size > 0) {
          userSelectFields = Array.from(needsUserFields).join(" ");
        }
        if (needsCreatedByFields.size > 0) {
          createdBySelectFields = Array.from(needsCreatedByFields).join(" ");
        }
      } else {
        projection = {};
        userSelectFields = SAFE_USER_SELECT;
        createdBySelectFields = SAFE_USER_SELECT;
      }

      console.log("Task projection:", projection);
      console.log("User select fields:", userSelectFields);

      // Fetch tasks
      const projectionParam: any = Object.keys(projection).length > 0 ? projection : undefined;
      const tasks = await Task.find(
        query,
        projectionParam
      )
        .populate({ path: "assignee", select: userSelectFields })
        .populate({ path: "createdBy", select: createdBySelectFields })
        .sort({ taskDate: -1, taskTitle: 1 })
        .lean();

      if (!tasks || tasks.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No tasks found for the specified criteria",
          data: {
            tasks: [],
            summary: {
              totalTasks: 0,
              totalUsers: 0,
              byStatus: {},
              byPriority: {},
            },
            dateRange: {
              from: startDate,
              to: endDate,
            },
          },
        });
      }

      // Helper functions
      const calculateTaskDuration = (startDate: Date, endDate: Date): number => {
        if (!startDate || !endDate) return 0;
        const start = DateTime.fromJSDate(startDate);
        const end = DateTime.fromJSDate(endDate);
        return end.diff(start, "hours").hours;
      };

      const isTaskOverdue = (dueDate: Date[], status: any[]): boolean => {
        if (!dueDate || dueDate.length === 0) return false;
        const latestDue = dueDate[dueDate.length - 1];
        const now = DateTime.now();
        const due = DateTime.fromJSDate(latestDue);
        
        const isCompleted = status?.some(s => s.status === "completed");
        return due < now && !isCompleted;
      };

      const calculateCompletionRate = (entryDone: number, noOfEntry: number): number => {
        if (!noOfEntry || noOfEntry === 0) return 0;
        return Math.round((entryDone / noOfEntry) * 100);
      };

      const getTotalTimeSpent = (timeSpent: any[]): number => {
        if (!timeSpent || timeSpent.length === 0) return 0;
        return timeSpent.reduce((total, ts) => {
          const userTime = ts.time?.reduce((sum: number, t: number) => sum + t, 0) || 0;
          return total + userTime;
        }, 0);
      };

      const getLastStatusChange = (statusHistory: any[]): any => {
        if (!statusHistory || statusHistory.length === 0) return null;
        return statusHistory[statusHistory.length - 1];
      };

      // Format tasks
      const formattedTasks = tasks.map((task: any) => {
        const formattedTask: Record<string, any> = {
          _id: task._id,
        };

        // Calculate metrics
        const totalTimeSpent = getTotalTimeSpent(task.time_spent);
        const lastStatusChange = getLastStatusChange(task.statusHistory);
        const completionRate = calculateCompletionRate(task.entryDone, task.noOfEntry);
        
        let taskDuration = 0;
        if (task.startDate?.[0]?.date && task.endDate?.[0]?.date) {
          taskDuration = calculateTaskDuration(
            task.startDate[0].date,
            task.endDate[0].date
          );
        }

        const isOverdue = isTaskOverdue(
          task.dueDate?.flatMap((d: any) => d.date) || [],
          task.status || []
        );

        if (includeAllFields) {
          // Include all fields
          formattedTask.taskTitle = task.taskTitle;
          formattedTask.taskDescription = task.taskDescription;
          formattedTask.taskDate = task.taskDate;
          formattedTask.priority = task.priority;
          formattedTask.location = task.location;
          formattedTask.address = task.address;
          formattedTask.tags = task.tags;
          formattedTask.notes = task.notes;
          formattedTask.approval = task.approval;
          formattedTask.taskType = task.taskType;
          formattedTask.divideTime = task.divideTime;

          formattedTask.assignee = task.assignee;
          formattedTask.createdBy = task.createdBy;
          
          formattedTask.estimatedTime = task.estimatedTime;
          formattedTask.entryTime = task.entryTime;
          formattedTask.noOfEntry = task.noOfEntry;
          formattedTask.entryDone = task.entryDone;
          
          formattedTask.status = task.status;
          formattedTask.statusHistory = task.statusHistory;
          formattedTask.lastStatusChange = lastStatusChange;
          
          formattedTask.dueDate = task.dueDate;
          formattedTask.startDate = task.startDate;
          formattedTask.endDate = task.endDate;
          
          formattedTask.timeSpent = task.time_spent;
          formattedTask.totalTimeSpent = totalTimeSpent;
          
          formattedTask.comments = task.comments;
          formattedTask.commentCount = task.comments?.length || 0;
          
          formattedTask.evaluation = task.evaluation;
          formattedTask.contactPerson = task.contactPerson;
          
          // Calculated fields
          formattedTask.completionRate = completionRate;
          formattedTask.taskDuration = parseFloat(taskDuration.toFixed(2));
          formattedTask.isOverdue = isOverdue;
          
          formattedTask.createdAt = task.createdAt;
          formattedTask.updatedAt = task.updatedAt;
        } else {
          // Include only requested fields
          const fieldMapping: Record<string, () => void> = {
            taskTitle: () => { formattedTask.taskTitle = task.taskTitle; },
            taskDescription: () => { formattedTask.taskDescription = task.taskDescription; },
            taskDate: () => { formattedTask.taskDate = task.taskDate; },
            priority: () => { formattedTask.priority = task.priority; },
            location: () => { formattedTask.location = task.location; },
            address: () => { formattedTask.address = task.address; },
            tags: () => { formattedTask.tags = task.tags; },
            notes: () => { formattedTask.notes = task.notes; },
            approval: () => { formattedTask.approval = task.approval; },
            taskType: () => { formattedTask.taskType = task.taskType; },
            divideTime: () => { formattedTask.divideTime = task.divideTime; },
            
            assignee: () => { formattedTask.assignee = task.assignee; },
            createdBy: () => { formattedTask.createdBy = task.createdBy; },
            
            assigneeName: () => { 
              formattedTask.assigneeName = task.assignee?.map((a: any) => a.name);
            },
            assigneeEmail: () => { 
              formattedTask.assigneeEmail = task.assignee?.map((a: any) => a.email);
            },
            creatorName: () => { formattedTask.creatorName = task.createdBy?.name; },
            creatorEmail: () => { formattedTask.creatorEmail = task.createdBy?.email; },
            
            estimatedTime: () => { formattedTask.estimatedTime = task.estimatedTime; },
            entryTime: () => { formattedTask.entryTime = task.entryTime; },
            noOfEntry: () => { formattedTask.noOfEntry = task.noOfEntry; },
            entryDone: () => { formattedTask.entryDone = task.entryDone; },
            
            status: () => { formattedTask.status = task.status; },
            statusHistory: () => { formattedTask.statusHistory = task.statusHistory; },
            lastStatusChange: () => { formattedTask.lastStatusChange = lastStatusChange; },
            
            dueDate: () => { formattedTask.dueDate = task.dueDate; },
            startDate: () => { formattedTask.startDate = task.startDate; },
            endDate: () => { formattedTask.endDate = task.endDate; },
            
            timeSpent: () => { formattedTask.timeSpent = task.time_spent; },
            totalTimeSpent: () => { formattedTask.totalTimeSpent = totalTimeSpent; },
            
            comments: () => { formattedTask.comments = task.comments; },
            commentCount: () => { formattedTask.commentCount = task.comments?.length || 0; },
            
            evaluation: () => { formattedTask.evaluation = task.evaluation; },
            contactPerson: () => { formattedTask.contactPerson = task.contactPerson; },
            
            completionRate: () => { formattedTask.completionRate = completionRate; },
            taskDuration: () => { formattedTask.taskDuration = parseFloat(taskDuration.toFixed(2)); },
            isOverdue: () => { formattedTask.isOverdue = isOverdue; },
            
            createdAt: () => { formattedTask.createdAt = task.createdAt; },
            updatedAt: () => { formattedTask.updatedAt = task.updatedAt; },
          };

          arrayFields?.forEach((field: string) => {
            if (fieldMapping[field]) {
              fieldMapping[field]();
            } else if (task[field] !== undefined) {
              formattedTask[field] = task[field];
            }
          });

          // Always include for internal calculations
          formattedTask._totalTimeSpent = totalTimeSpent;
          formattedTask._completionRate = completionRate;
          formattedTask._isOverdue = isOverdue;
        }

        return formattedTask;
      });

      // Calculate summaries
      const statusCount: Record<string, number> = {};
      const priorityCount: Record<string, number> = {};
      const userTaskCount: Record<string, number> = {};
      
      let totalOverdue = 0;
      let totalCompleted = 0;
      let totalTimeSpentAll = 0;

      formattedTasks.forEach((task) => {
        // Status summary
        task.status?.forEach((s: any) => {
          statusCount[s.status] = (statusCount[s.status] || 0) + 1;
        });

        // Priority summary
        if (task.priority) {
          priorityCount[task.priority] = (priorityCount[task.priority] || 0) + 1;
        }

        // User summary
        const assignees = Array.isArray(task.assignee) ? task.assignee : [task.assignee];
        assignees.forEach((assignee: any) => {
          if (assignee?._id) {
            const userId = assignee._id.toString();
            userTaskCount[userId] = (userTaskCount[userId] || 0) + 1;
          }
        });

        // Aggregates
        if (task._isOverdue || task.isOverdue) totalOverdue++;
        if (task.status?.some((s: any) => s.status === "completed")) totalCompleted++;
        totalTimeSpentAll += task._totalTimeSpent || task.totalTimeSpent || 0;
      });

      const overallSummary = {
        totalTasks: formattedTasks.length,
        totalUsers: Object.keys(userTaskCount).length,
        totalCompleted,
        totalOverdue,
        totalTimeSpentMinutes: totalTimeSpentAll,
        totalTimeSpentHours: parseFloat((totalTimeSpentAll / 60).toFixed(2)),
        byStatus: statusCount,
        byPriority: priorityCount,
        completionPercentage: parseFloat(
          ((totalCompleted / formattedTasks.length) * 100).toFixed(2)
        ),
      };

      // User-wise summary
      const userSummaries: Record<string, any> = {};
      
      formattedTasks.forEach((task) => {
        const assignees = Array.isArray(task.assignee) ? task.assignee : [task.assignee];
        
        assignees.forEach((assignee: any) => {
          if (!assignee?._id) return;
          
          const userId = assignee._id.toString();
          
          if (!userSummaries[userId]) {
            userSummaries[userId] = {
              user: assignee,
              totalTasks: 0,
              completedTasks: 0,
              overdueTasks: 0,
              totalTimeSpent: 0,
              byStatus: {},
              byPriority: {},
            };
          }

          userSummaries[userId].totalTasks++;
          
          if (task.status?.some((s: any) => s.status === "completed")) {
            userSummaries[userId].completedTasks++;
          }
          
          if (task._isOverdue || task.isOverdue) {
            userSummaries[userId].overdueTasks++;
          }

          const userTimeSpent = task.time_spent?.find(
            (ts: any) => ts.user?.toString() === userId
          );
          if (userTimeSpent) {
            const time = userTimeSpent.time?.reduce((sum: number, t: number) => sum + t, 0) || 0;
            userSummaries[userId].totalTimeSpent += time;
          }

          // Status count
          const userStatus = task.status?.find((s: any) => s.user?.toString() === userId);
          if (userStatus) {
            userSummaries[userId].byStatus[userStatus.status] = 
              (userSummaries[userId].byStatus[userStatus.status] || 0) + 1;
          }

          // Priority count
          if (task.priority) {
            userSummaries[userId].byPriority[task.priority] = 
              (userSummaries[userId].byPriority[task.priority] || 0) + 1;
          }
        });
      });

      const userSummariesArray = Object.values(userSummaries).map((summary: any) => ({
        user: summary.user,
        totalTasks: summary.totalTasks,
        completedTasks: summary.completedTasks,
        overdueTasks: summary.overdueTasks,
        totalTimeSpentMinutes: summary.totalTimeSpent,
        totalTimeSpentHours: parseFloat((summary.totalTimeSpent / 60).toFixed(2)),
        completionRate: parseFloat(
          ((summary.completedTasks / summary.totalTasks) * 100).toFixed(2)
        ),
        byStatus: summary.byStatus,
        byPriority: summary.byPriority,
      }));

      return res.status(200).json({
        success: true,
        message: "Task report retrieved successfully",
        data: {
          tasks: formattedTasks,
          userSummaries: userSummariesArray,
          overallSummary,
          dateRange: {
            from: startDate,
            to: endDate,
            fromISO: DateTime.fromJSDate(startDate, { zone: localTimeZone }).toISODate(),
            toISO: DateTime.fromJSDate(endDate, { zone: localTimeZone }).toISODate(),
          },
        },
      });
    } catch (error: any) {
      console.error("Error fetching task report:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  private async getLocalTimeZone(): Promise<string> {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  private async transformTaskData(apiTasks: any[], loginUserId: string) {
    return apiTasks.map((task) => {
      const loginId = String(loginUserId);

      const userAssignee = task.assignee
        ? [task.assignee.find((a: any) => String(a?._id) === loginId)].filter(
          Boolean
        )
        : [];

      const userEstimatedTime = task.userEstimatedTime
        ? [
          task.userEstimatedTime.find(
            (u: any) => String(u?.user?._id) === loginId
          ),
        ].filter(Boolean)
        : [];

      const userStatus = task.status
        ? [
          task.status.find((s: any) => String(s?.user?._id) === loginId),
        ].filter(Boolean)
        : [];

      const userStartDate = task.startDate
        ? [
          task.startDate.find((s: any) => String(s?.user ?? s) === loginId),
        ].filter(Boolean)
        : [];

      const userTargetDate = task.endDate
        ? [
          task.endDate.find((e: any) => String(e?.user ?? e) === loginId),
        ].filter(Boolean)
        : [];

      const userDueDate = task.dueDate
        ? [
          task.dueDate.find((d: any) => String(d?.user?._id) === loginId),
        ].filter(Boolean)
        : [];

      const userEvaluation = task.evaluation
        ? [
          task.evaluation.find((d: any) => String(d?.user?._id) === loginId),
        ].filter(Boolean)
        : [];

      const userStatusHistory = task.statusHistory
        ? [
          task.statusHistory.find(
            (d: any) => String(d?.changedBy?._id) === loginId
          ),
        ].filter(Boolean)
        : [];

      const userAccept = task.Accept
        ? [
          task.Accept.find((s: any) => String(s?.user?._id) === loginId),
        ].filter(Boolean)
        : [];

      const userActionEvents = task.actionEvents
        ? [
          task.actionEvents.find(
            (s: any) => String(s?.user?._id) === loginId
          ),
        ].filter(Boolean)
        : [];

      const userTimeSpent = task.time_spent
        ? [
          task.time_spent.find((t: any) => String(t?.user ?? t) === loginId),
        ].filter(Boolean)
        : [];

      return {
        id: task._id,
        taskTitle: task.taskTitle,
        taskDescription: task.taskDescription,
        assignee: userAssignee ?? null,
        priority: task.priority,
        taskDate: task.taskDate,
        estimateTime: task.estimatedMinutes,
        userEstimatedTime: userEstimatedTime ?? null,
        spendTime: userTimeSpent ?? null,
        noe: task.assignee?.length ?? 0,
        location: task.location,
        tags: task.tags ?? [],
        comments: task.comments ?? [],
        contactPerson: task.contactPerson ?? [],
        createdBy: task.createdBy,
        status: userStatus ?? null,
        NOE: task.noOfEntry ?? 0,
        entryDone: task.entryDone ?? 0,
        entryTime: task.entryTime ?? { unit: "", value: 0 },
        accept: userAccept ?? null,
        startDate: userStartDate ?? null,
        targetDate: userTargetDate ?? null,
        dueDate: userDueDate ?? null,
        userEvaluation: userEvaluation ?? null,
        statusHistory: userStatusHistory ?? null,
        company: task.company ?? null,
        individualBucket: task.individualBucket ?? null,
        companyBucket: task.companyBucket ?? null,
        actionEvents: userActionEvents ?? null,
      };
    });
  }

}
