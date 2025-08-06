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
      const user=req.user
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
      const perUserValue = Math.floor(totalValue / body.assignee.length);
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

  // ✅ Utility: Get local timezone
  private async getLocalTimeZone(): Promise<string> {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}
