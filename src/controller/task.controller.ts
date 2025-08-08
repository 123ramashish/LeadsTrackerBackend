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
      const localTimeZone = await this.getLocalTimeZone();

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
        entryTime: body.entryTime,
        noOfEntry:body.noOfEntry,
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
      const {
        status,
        priority,
        assignee,
        createdBy,
        company,
        search,
        limit = "10",
        skip = "0",
        sortBy = "createdAt",
        order = "desc",
      } = req.query as {
        status?: string;
        priority?: string;
        assignee?: string;
        createdBy?: string;
        company?: string;
        search?: string;
        limit?: string;
        skip?: string;
        sortBy?: string;
        order?: string;
      };
console.log("api call")
      // Build the filter object
      const filter: any = {};

      if (status) filter["status.status"] = status;
      if (priority) filter.priority = priority;
      if (assignee) filter.assignee = assignee;
      if (createdBy) filter.createdBy = createdBy;
      if (company) filter.company = company;

      // Optional text search on title or description
      if (search) {
        filter.$or = [
          { taskTitle: { $regex: search, $options: "i" } },
          { taskDescription: { $regex: search, $options: "i" } },
        ];
      }

      // Sorting
      const sort: any = {};
      sort[sortBy] = order === "asc" ? 1 : -1;

      // Fetch tasks from DB
      const tasks = await Task.find(filter)
        .sort(sort)
        .skip(parseInt(skip))
        .limit(parseInt(limit));

      // Get total count for pagination
      const total = await Task.countDocuments(filter);

      // Return response
      return res.status(200).json({
        total,
        count: tasks.length,
        tasks,
      });
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

  // ✅ Utility: Get local timezone
  private async getLocalTimeZone(): Promise<string> {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}
