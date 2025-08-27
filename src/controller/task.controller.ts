import { Request, Response } from "express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import Task from "../DataBase/Schema/task.schema";
import User from "../DataBase/Schema/user.schema";
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
      if (startDate > new Date() && !body.bucket) {
        body.bucket = "individual";
      }
      if (body.bucket === "individual") {
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
        noOfEntry: body.noOfEntry,
        entryTime: body.entryTime,
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

      return res.status(201).json({
        message: "Task created successfully",
        task,
      });
    } catch (error: any) {
      console.error("Error creating task:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }
  async getAllTask(req: Request, res: Response) {
    try {
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
        limit = "20",
        skip = "0",
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
      const _createdBy = normalize(createdBy);
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
        filter.createdBy = {
          $in: _createdBy.split(",").map((c: any) => c.trim()),
        };
      }
      if (_tags) {
        filter.tags = { $in: _tags.split(",").map((t: any) => t.trim()) };
      }
      if (_company) {
        filter.company = _company;
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

      // ✅ Boolean field
      if (_individualBucket !== null) {
        filter.individualBucket = _individualBucket === "true";
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

  async getTaskById(req: Request, res: Response) {
    try {
      const { userId } = req.params;
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

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      // Step 1: Build base query
      const query: any = { assignee: userId };

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

      // Step 3: Process status per user
      const statusOrder: Record<string, number> = {
        expired: 1,
        pause: 2,
        inprogress: 3,
        assignee: 4,
        completed: 5,
      };

      const userTasks = tasks
        .map((task) => {
          const userStatusObj = task.status.find(
            (s: any) => s.user?._id?.toString() === userId // ✅ after populate, s.user is an object
          );

          const currentStatus = userStatusObj?.status ?? "assignee";
          const sortValue = statusOrder[currentStatus] ?? 99;

          return { ...task, userStatus: currentStatus, sortValue };
        })
        .filter((task) => !status || task.userStatus === status);

      // Step 4: Sort & paginate
      const sortedTasks = userTasks
        .sort((a, b) => a.sortValue - b.sortValue)
        .slice(parseInt(skip), parseInt(skip) + parseInt(limit));

      return res.status(200).json({
        count: sortedTasks.length,
        tasks: sortedTasks.map(({ sortValue, userStatus, ...rest }) => ({
          ...rest,
          userStatus,
        })),
      });
    } catch (error: any) {
      console.error("Error getting tasks by user ID:", error.message);
      return res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
    }
  }

  async updateTaskStatus(req: AuthRequest, res: Response) {
    try {
      const { id, company, status, loginUser, address } = req.body;
      console.log("body", req.body);
      const task = await Task.findOne({
        _id: new mongoose.Types.ObjectId(id),
        company: new mongoose.Types.ObjectId(company),
      });

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      const localTimeZone = DateTime.local().zoneName;

      const userId = new mongoose.Types.ObjectId(loginUser.id);

      // Get the latest status history for this user
      const userHistory = task.statusHistory
        .filter(
          (entry: any) => entry.changedBy.toString() === userId.toString()
        )
        .sort(
          (a: any, b: any) =>
            new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
        );

      const latestHistory = userHistory[0];

      // If latest status is "in progress" → calculate spent time
      if (latestHistory && latestHistory.status === "in progress") {
        const now = DateTime.now().setZone(localTimeZone);
        const minutesSpent = Math.floor(
          (now.toMillis() -
            DateTime.fromJSDate(latestHistory.changedAt)
              .setZone(localTimeZone)
              .toMillis()) /
            60000
        );

        // Update time_spent for this user
        let timeEntry = task.time_spent.find(
          (t: any) => t.user.toString() === userId.toString()
        );
        if (timeEntry) {
          timeEntry.time.push(minutesSpent);
        } else {
          task.time_spent.push({ user: userId, time: [minutesSpent] });
        }
      }

      // Update the user's current status in task.status
      let statusEntry = task.status.find(
        (s: any) => s.user.toString() === userId.toString()
      );
      if (statusEntry) {
        statusEntry.status = status;
      } else {
        task.status.push({ user: userId, status });
      }

      // Push new entry into statusHistory
      task.statusHistory.push({
        status,
        changedAt: DateTime.now().setZone(localTimeZone).toISO(),
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
        bucketType?: "individual" | "company" | "";
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
      console.log("api call");
      const user:any = req.user;
      const tasks = await Task.find({
        individualBucket: {
          $elemMatch: { user: user.sub, individual: true },
        },
      });

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
    // try {
    //   const tasks = await Task.find({ companyBucket: true });

    //   return res.status(200).json({
    //     message: "Company bucket tasks fetched successfully",
    //     count: tasks.length,
    //     tasks,
    //   });
    // } catch (error: any) {
    //   console.error("Error fetching company bucket:", error.message);
    //   return res.status(500).json({
    //     message: "Internal Server Error",
    //     error: error.message,
    //   });
    // }
  }

  // ✅ Utility: Get local timezone
  private async getLocalTimeZone(): Promise<string> {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}
