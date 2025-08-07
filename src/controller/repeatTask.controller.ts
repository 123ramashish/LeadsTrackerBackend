import { Request, Response } from "express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import RepeatTask from "../DataBase/Schema/repeatTask.schema";
import User from "../DataBase/Schema/user.schema";

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
  };
}

const weekdayToNumber: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

export default class RepeatTaskController {
  async createTask(req: AuthRequest, res: Response) {
    try {
      const body = req.body;
      console.log("body",body)
      const userId = req.user?.sub;
      console.log("body", body);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const zone = DateTime.local().zoneName;

      const localStartDate = DateTime.fromISO(body.taskDate, { zone }).startOf(
        "day"
      );
      const localEndDate = DateTime.fromISO(body.endDate, { zone }).endOf(
        "day"
      );

      if (!localStartDate.isValid || !localEndDate.isValid) {
        return res
          .status(400)
          .json({ message: "Invalid start or end date format" });
      }

      if (localEndDate <= localStartDate) {
        return res
          .status(400)
          .json({ message: "End date must be after start date" });
      }

      const localTaskDate = localStartDate.toJSDate();
      const repeatType = body.repeatType?.toLowerCase();

      // Initialize repeat fields
      let repeatDay: number | null = null;
      let repeatMonthNumber: number | null = null;
      let repeatDate: Date | null = null;

      if (repeatType === "weekly") {
        if (body.repeatDay) {
          repeatDay = weekdayToNumber[body.repeatDay.toLowerCase()] ?? null;
        }
      } else if (repeatType === "monthly") {
        repeatMonthNumber = body.repeatNumber ?? null;
      } else if (repeatType === "quarterly" || repeatType === "annually") {
        if (body.repeatTime) {
          const parsedDate = DateTime.fromISO(body.repeatTime, { zone });
          repeatDate = parsedDate.isValid ? parsedDate.toJSDate() : null;
        }
      }
      // For daily, leave all repeat fields as null

      // Handle assignees
      let assigneesToAssign =
        Array.isArray(body.assignee) && body.assignee.length > 0
          ? body.assignee
          : (
              await User.find({
                company: new mongoose.Types.ObjectId(body.company),
              }).select("_id")
            ).map((u) => u._id);

      const newTask = new RepeatTask({
        taskTitle: body.taskTitle,
        taskDate: localTaskDate,
        taskDescription: body.taskDescription,
        estimatedTime: body.estimatedTime,
        assignee: assigneesToAssign,
        priority: body.priority,
        location: body.location,
        address: body.address?.trim() || null,
        startDate: localStartDate,
        endDate: localEndDate,
        createdBy: userId,
        company: new mongoose.Types.ObjectId(body.company),
        tags: body.tags,
        notes: body.notes,
        repeatInterval: repeatType,
        repeatTaskId: body.repeatTaskId,
        repeatDay: repeatDay,
        repeatMonthNumber: repeatMonthNumber,
        repeatDate: repeatDate,
        divideTime:body.divideTime
      });

      const savedTask = await newTask.save();

      res.status(201).json({
        message: "Repeat Task created successfully",
        task: savedTask,
      });
    } catch (error: any) {
      console.error("Error creating repeat task:", error);
      res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  }
}
