import { Request, Response } from "express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import Task from "../DataBase/Schema/task.schema";
import User from "../DataBase/Schema/user.schema";
import { Notification_Create } from "../utils/notificationUtils";
import { sendPushNotification } from "../helper/notifications";
import Notification from "../DataBase/Schema/notification.schema";
interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    company: string;
  };
}
export default class TaskController {
  // ✅ Create Task
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

      // ✅ Convert estimated time value to number
      const totalValue = Number(body.estimatedTime.value);
      const unit = body.estimatedTime.unit;

      // ✅ If no assignee provided, assign all users in company
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

      // ✅ Get local timezone and convert dates
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
      console.log("task", body);
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

      // ✅ Extract + normalize query params
      const {
        status,
        priority,
        assignee,
        createdBy,
        company,
        tags,
        search,
        limit = "100",
        skip = "0",
        sortBy = "createdAt",
        order = "desc",
        dateRange,
        entryDoneRange,
        noOfEntryRange,
        individualBucket,
      } = req.query as any;
      console.log("individualBucket", individualBucket);
      const _status = normalize(status);
      const _priority = normalize(priority);
      const _assignee = normalize(assignee);
      const _createdBy = normalize(user.role === "admin" ? "" : user?.sub);
      const _tags = normalize(tags);
      const _company = normalize(company);
      const _search = normalize(search);
      const _dateRange = normalize(dateRange);
      const _entryDoneRange = normalize(entryDoneRange);
      const _noOfEntryRange = normalize(noOfEntryRange);
      const _individualBucket = normalize(individualBucket);

      const filter: any = {};

      // ✅ Multi-value fields
      if (_status) {
        filter["status.status"] = {
          $in: _status.split(",").map((s: any) => s.trim()),
        };
      }
      if (_priority) {
        filter.priority = {
          $in: _priority.split(",").map((p: any) => p.trim()),
        };
      }
      if (_assignee) {
        filter.assignee = {
          $in: _assignee.split(",").map((a: any) => a.trim()),
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
        const [start, end] = _dateRange.split(",");
        if (start && end) {
          const startDate = new Date(start);
          const endDate = new Date(end);
          filter.$or = [
            { taskDate: { $gte: startDate, $lte: endDate } },
            {
              "dueDate.date": {
                $elemMatch: { $gte: startDate, $lte: endDate },
              },
            },
            { "startDate.date": { $gte: startDate, $lte: endDate } },
            { "endDate.date": { $gte: startDate, $lte: endDate } },
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
      console.log("filter", filter);
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
        .skip(parseInt(skip))
        .limit(parseInt(limit));

      const total = await Task.countDocuments(filter);

      return res.status(200).json({ total, count: tasks.length, tasks });
    } catch (error: any) {
      console.error("Error getting tasks:", error.message);
      return res
        .status(500)
        .json({ message: "Failed to fetch tasks", error: error.message });
    }
  }

  async getTaskAmountTime(req: Request, res: Response) {
    try {
      const { assignee, company } = req.query as {
        assignee?: string;
        company?: string;
      };

      if (!company) {
        return res.status(400).json({ message: "Company ID is required" });
      }

      const assigneeIds: string[] = assignee ? JSON.parse(assignee) : [];

      const userList =
        assigneeIds.length === 0
          ? await User.find({ company }, "_id name phone")
          : await User.find(
              { _id: { $in: assigneeIds }, company },
              "_id name phone"
            );

      const results = [];

      for (const user of userList) {
        const tasks = await Task.find({
          company,
          assignee: user._id,
        });

        let totalMinutes = 0;

        for (const task of tasks) {
          const userEstimate = task.userEstimatedTime.find(
            (et: any) => et.user.toString() === user._id.toString()
          );

          if (userEstimate) {
            const { unit, value } = userEstimate.estimatedTime;

            if (unit === "Minutes") totalMinutes += value;
            else if (unit === "Hours") totalMinutes += value * 60;
            else if (unit === "Days") totalMinutes += value * 1440;
          }
        }

        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;

        results.push({
          userId: user._id,
          name: user.name,
          phone: user.phone,
          totalAmount: { days, hours, minutes },
        });
      }

      return res.status(200).json({ count: results.length, results });
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
      const {
        limit = "10",
        skip = "0",
        status,
        search,
        taskDate,
        priority,
      } = req.query as {
        limit?: string;
        skip?: string;
        status?: string;
        search?: string;
        taskDate?: string;
        priority?: string;
      };

      if (!user?.sub) {
        return res.status(400).json({ message: "User ID is required" });
      }
      console.log("usersub", user.sub, typeof user.sub);
      // Step 1: Build base query
      const query: any = {
        assignee: { $in: [user.sub] },
        status: {
          $elemMatch: {
            status: { $ne: "cancel" },
          },
        },
      };
      if (priority) query.priority = priority;
      if (taskDate) query.taskDate = new Date(taskDate);
      if (search) {
        query.$or = [
          { taskTitle: { $regex: search, $options: "i" } },
          { taskDescription: { $regex: search, $options: "i" } },
        ];
      }

      // Step 2: Find and populate
      const tasks = await Task.find(query)
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
      // Step 3: Apply per-user transformation
      const transformedTasks = await this.transformTaskData(tasks, user?.sub);

      // Step 4: Process status per user
      const statusOrder: Record<string, number> = {
        expired: 1,
        "in progress": 2,
        pause: 3,
        assignee: 4,
        completed: 5,
        cancel: 6,
      };

      const userTasks = transformedTasks
        .map((task: any) => {
          const currentStatus =
            task.status?.status?.toLowerCase() ?? "assignee";
          const sortValue: any = statusOrder[currentStatus] ?? 99;
          return { ...task, userStatus: currentStatus, sortValue };
        })
        .filter((task: any) => !status || task.userStatus === status);

      // Step 5: Sort & paginate
      const sortedTasks = userTasks
        .sort((a: any, b: any) => a.sortValue - b.sortValue)
        .slice(parseInt(skip), parseInt(skip) + parseInt(limit));
      return res.status(200).json({
        count: sortedTasks.length,
        tasks: sortedTasks.map(({ sortValue, ...rest }) => rest),
      });
    } catch (error: any) {
      console.error("Error getting tasks by user ID:", error);
      return res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
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

  // ✅ Add a new comment to a task
  async addTaskMessage(req: Request, res: Response) {
    try {
      const { message, files, address, taskId, company, userId } = req.body;
      console.log("body", req.body);
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
      console.log("Incoming query params:", id, company);

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
        updateData.entryDone = rest.entryDone;
      }
      if (rest.NOE !== undefined) {
        updateData.noOfEntry = rest.NOE;
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
      console.log("userid", userId);
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

      const tasks = await Task.find(query);

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

  // ✅ Company Bucket
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
      console.log("body", req.body);

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
      // console.log("userEstimatedTimes", JSON.stringify(userEstimatedTimes));

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
      console.log("tags", id, company, tags);
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

  // ✅ Utility: Get local timezone
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
