import { Request, Response } from "express";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import Task from "../DataBase/Schema/task.schema";

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
  };
}

export default class DashboardController {
  static async getDashboardData(req: AuthRequest, res: Response) {
    const user: any = req.user
    try {
      if (user?.role !== "admin" || user?.role !== "manager" || user?.role !== "teamLeader") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const {
        assignee = [],
        estimatedValue,
        estimatedUnit,
        priority,
        status,
        startDate,
        endDate,
        createdBy,
        companyBucket,
        individualBucket,
        hasComments,
        hasAccept,
        sortField = "createdAt",
        sortOrder = "desc",
        company
      } = req.query;

      // Prepare filters
      const match: any = {};

      // Company filter (if applicable)
      if (company || user.company) {
        match.company = new mongoose.Types.ObjectId(company as string || user.company);
      }

      // Assignee filter
      if (assignee && Array.isArray(assignee) && assignee.length > 0) {
        match.assignee = { $in: assignee.map((id: any) => new mongoose.Types.ObjectId(id)) };
      }

      // Estimated time filter
      if (estimatedValue && estimatedUnit) {
        match["estimatedTime.value"] = Number(estimatedValue);
        match["estimatedTime.unit"] = estimatedUnit;
      }

      // Priority filter
      if (priority) {
        match.priority = priority;
      }

      // Status filter (in `status` array of subdocs)
      if (status) {
        match["status.status"] = status;
      }

      // Date range filter (using createdAt OR taskDate)
      if (startDate && endDate) {
        match.taskDate = {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string)
        };
      }

      // createdBy filter
      if (createdBy) {
        match.createdBy = new mongoose.Types.ObjectId(createdBy as string);
      }



      // Individual bucket filter (true if any individual is true)
      if (individualBucket !== undefined) {
        match["individualBucket.individual"] = individualBucket === "true";
      }

      // Has comments filter
      if (hasComments === "true") {
        match.comments = { $exists: true, $ne: [] };
      }

      // Has accept true filter
      if (hasAccept === "true") {
        match["Accept.status"] = true;
      }

      // Aggregation pipeline
      const tasks = await Task.aggregate([
        { $match: match },
        { $sort: { [sortField as string]: sortOrder === "asc" ? 1 : -1 } }
      ]);

      return res.json({ success: true, data: tasks });
    } catch (error: any) {
      console.error("Error fetching dashboard data:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

}