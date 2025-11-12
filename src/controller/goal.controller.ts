import { Request, Response } from "express";
import goalSchema from "../DataBase/Schema/goal.schema";
import repeateGoalSchema from "../DataBase/Schema/repeateGoal.schema";
import { DateTime } from "luxon";
import mongoose from "mongoose";

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    company:string;
  };
}

export default class GoalController {
  static async createGoal(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const {
        name,
        description,
        targetDate,
        category,
        isRepetitive,
        repeatType,
        repeatConfig,
      } = req.body;

      if (!name || !description || !targetDate || !category) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let createdGoal;

      if (isRepetitive) {
        // ✅ Validate repeatType
        if (!repeatType) {
          return res
            .status(400)
            .json({ message: "Repeat type is required for repetitive goals" });
        }

        // ✅ Validate repeatInterval enum
        const validIntervals = ["daily", "weekly", "monthly", "annually"];
        if (!validIntervals.includes(repeatType)) {
          return res.status(400).json({ message: "Invalid repeat type" });
        }

        // ✅ Calculate startDate based on repeatType
        let startDate: Date;
        let endDate = DateTime.fromISO(targetDate, {
          zone: localTimeZone,
        }).startOf("day");

        switch (repeatType) {
          case "daily":
            startDate = DateTime.now()
              .setZone(localTimeZone)
              .startOf("day")
              .toJSDate();
            break;

          case "weekly":
            if (!repeatConfig?.weeklyDay) {
              return res.status(400).json({
                message: "weeklyDay is required for weekly repeat type",
              });
            }
            const weekDayMap: Record<string, number> = {
              Sunday: 7,
              Monday: 1,
              Tuesday: 2,
              Wednesday: 3,
              Thursday: 4,
              Friday: 5,
              Saturday: 6,
            };
            const targetDay = weekDayMap[repeatConfig.weeklyDay];
            if (!targetDay) {
              return res
                .status(400)
                .json({ message: "Invalid weeklyDay provided" });
            }
            let now = DateTime.now().setZone(localTimeZone);
            let weeklyDateTime = now
              .startOf("week")
              .plus({ days: targetDay - 1 });
            if (weeklyDateTime < now.startOf("day")) {
              weeklyDateTime = weeklyDateTime.plus({ weeks: 1 });
            }
            startDate = weeklyDateTime.toJSDate();
            break;

          case "monthly":
            if (
              !repeatConfig?.monthlyDate ||
              repeatConfig.monthlyDate < 1 ||
              repeatConfig.monthlyDate > 31
            ) {
              return res.status(400).json({
                message:
                  "monthlyDate (1-31) is required for monthly repeat type",
              });
            }
            let nowMonthly = DateTime.now().setZone(localTimeZone);
            let monthlyDateTime = nowMonthly
              .set({ day: repeatConfig.monthlyDate })
              .startOf("day");
            if (monthlyDateTime < nowMonthly.startOf("day")) {
              monthlyDateTime = monthlyDateTime.plus({ months: 1 });
            }
            startDate = monthlyDateTime.toJSDate();
            break;

          case "annually":
            if (!repeatConfig?.annuallyDate) {
              return res.status(400).json({
                message: "annuallyDate is required for annually repeat type",
              });
            }
            let nowAnnually = DateTime.now().setZone(localTimeZone);
            let annuallyDateTime = DateTime.fromISO(repeatConfig.annuallyDate, {
              zone: localTimeZone,
            }).startOf("day");
            if (annuallyDateTime < nowAnnually.startOf("day")) {
              annuallyDateTime = annuallyDateTime.plus({ years: 1 });
            }
            startDate = annuallyDateTime.toJSDate();
            break;

          default:
            startDate = DateTime.now().setZone(localTimeZone).toJSDate();
        }

        // ✅ Ensure endDate is after startDate
        if (endDate <= DateTime.fromJSDate(startDate)) {
          return res.status(400).json({
            message: "Target date should be greater than repetitive goal",
          });
        }

        // ✅ Prepare repeat goal data
        const repeatGoalData: any = {
          title: name,
          description,
          category,
          repeatInterval: repeatType,
          startDate,
          endDate: DateTime.fromISO(targetDate, {
            zone: localTimeZone,
          }).toJSDate(),
          user: new mongoose.Types.ObjectId(user.sub),
          status: "pending",
          completedDates: [],
          company:user?.company
        };

        // ✅ Optionally store repeatConfig info inside description or extra fields
        if (repeatConfig) {
          repeatGoalData.repeatConfig = repeatConfig;
        }

        const repeatGoal = new repeateGoalSchema(repeatGoalData);
        createdGoal = await repeatGoal.save();
      } else {
        // ✅ Normal Goal
        const normalGoal = new goalSchema({
          title: name,
          description,
          category,
          status: "pending",
          endDate: DateTime.fromISO(targetDate, {
            zone: localTimeZone,
          }).toJSDate(),
          user: new mongoose.Types.ObjectId(user.sub),
          company:user?.company
        });

        createdGoal = await normalGoal.save();
      }

      return res.status(201).json({
        message: "Goal created successfully",
        goal: createdGoal,
      });
    } catch (error: any) {
      console.error("Error creating goal:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

  // ✅ Get All Goals
  static async getGoals(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }
      const { userId, page = 1, limit = 10 } = req.query;
      const filter: any = {company:user?.company};
      if (userId) filter.user = userId;

      const goals = await goalSchema
        .find(filter)
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .sort({ createdAt: -1 });

      const total = await goalSchema.countDocuments(filter);
      return res.status(200).json({ total, goals });
    } catch (error: any) {
      console.error("Error fetching goals:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

  // ✅ Get Single Goal
  static async getGoalById(req: Request, res: Response) {
    try {
       const user = (req as AuthRequest).user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }
      const { id } = req.params;
      const goal = await goalSchema.findById({_id: id,company:user?.company });
      if (!goal) return res.status(404).json({ message: "Goal not found" });

      return res.status(200).json(goal);
    } catch (error: any) {
      console.error("Error fetching goal:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

  // ✅ Update Goal
  static async updateGoal(req: Request, res: Response) {
    try {
       const user = (req as AuthRequest).user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }
      const { id } = req.params;
      const updateData = req.body;

      const goal = await goalSchema.findByIdAndUpdate({_id:id}, updateData, {
        new: true,
      });
      if (!goal) return res.status(404).json({ message: "Goal not found" });

      return res
        .status(200)
        .json({ message: "Goal updated successfully", goal });
    } catch (error: any) {
      console.error("Error updating goal:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

  // ✅ Delete Goal
  static async deleteGoal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const goal = await goalSchema.findByIdAndDelete({_id: id});
      if (!goal) return res.status(404).json({ message: "Goal not found" });

      return res.status(200).json({ message: "Goal deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting goal:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }
  private async getLocalTimeZone(): Promise<string> {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}
