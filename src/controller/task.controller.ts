import { Request, Response } from "express";
import Task from "../DataBase/Schema/task.schema";
import User from "../DataBase/Schema/user.schema";
import { DateTime } from "luxon";

export default class TaskController {
  // ✅ Create Task
  async createTask(req: Request, res: Response) {
    try {
      const body = req.body;

      // ✅ Validate required fields
      if (!body.taskTitle || !body.taskDate || !body.taskDescription || !body.estimatedTime || !body.assignee || !body.priority) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // ✅ If no assignees provided, assign to all users with role 'user'
      if (body.assignee.length === 0) {
        const users = await User.find({ role: "user" });
        if (users.length === 0) {
          return res.status(400).json({ message: "No users available to assign the task" });
        }
        body.assignee = users.map(user => user._id.toString());
      }

      // ✅ Calculate estimated time per user
      const totalValue = body.estimatedTime.value;
      const unit = body.estimatedTime.unit;
      const perUserValue = Math.floor(totalValue / body.assignee.length);

      const userEstimatedTime = body.assignee.map((userId: string) => ({
        user: userId,
        estimatedTime: {
          unit,
          value: perUserValue
        }
      }));

      // ✅ Get timezone and handle dates
      const localTimeZone = await this.getLocalTimeZone();
      const startDate = body.startDate
        ? new Date(DateTime.fromISO(body.startDate).setZone(localTimeZone).toISO()!)
        : new Date(DateTime.now().setZone(localTimeZone).toISO()!);

      const endDate = body.endDate
        ? new Date(DateTime.fromISO(body.endDate).setZone(localTimeZone).toISO()!)
        : null;

      // ✅ Prepare Task data
      const task = new Task({
        taskTitle: body.taskTitle,
        taskDescription: body.taskDescription,
        taskDate: body.taskDate,
        estimatedTime: body.estimatedTime,
        assignee: body.assignee,
        userEstimatedTime, // ✅ Divided estimated time
        priority: body.priority,
        location: body.location,
        address: body.address,
        startDate,
        endDate,
        createdBy: body.createdBy,
        tags: body.tags || [],
        notes: body.notes || "",
        status: body.assignee.map((userId: string) => ({
          user: userId,
          status: "assignee"
        }))
      });

      await task.save();

      return res.status(201).json({
        message: "Task created successfully",
        task
      });
    } catch (error: any) {
      console.error("Error creating task:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

  // ✅ Utility: Get local timezone
  private async getLocalTimeZone(): Promise<string> {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}
