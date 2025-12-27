import { Request, Response } from "express";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import Task from "../DataBase/Schema/task.schema";

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    company:string
  };
}
interface DashboardStats {
  taskStatus: {
    completed: number;
    inProgress: number;
    pending: number;
    expired: number;
  };
  priorityDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  stats: {
    pendingTasks: number;
    totalComments: number;
    tasksInBucket: number;
    contactPersons: number;
    averageEntryDone: number;
  };
  estimatedVsActual: Array<{
    taskTitle: string;
    estimated: number;
    actual: number;
  }>;
  timeStats: {
    totalEstimated: number;
    totalSpent: number;
    variance: number;
  };
}
// Helper function to convert time to minutes
function convertToMinutes(value: number, unit: string): number {
  switch (unit) {
    case 'Minutes':
      return value;
    case 'Hours':
      return value * 60;
    case 'Days':
      return value * 60 * 24;
    default:
      return value;
  }
}
export default class DashboardController {
  static async getDashboardData(req: AuthRequest, res: Response) {
    const user: any = req.user
    try {

      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const {
        assignee,
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

  static async dashboardGraph(req: AuthRequest, res: Response) {
    try {
      const { dateRange, assignee, priority, status } = req.query;
      const userId = req.user?.sub;
      const company = req.user?.company;

      if (!company) {
        return res.status(400).json({ message: "Company not found" });
      }

      // Build query filters
      const query: any = { company: new mongoose.Types.ObjectId(company as string) };

      // Date range filter
      if (dateRange && Array.isArray(dateRange) && dateRange.length === 2) {
        query.taskDate = {
          $gte: new Date(dateRange[0] as string),
          $lte: new Date(dateRange[1] as string)
        };
      }

      // Assignee filter
      if (assignee && Array.isArray(assignee) && assignee.length > 0) {
        query.assignee = {
          $in: assignee.map(id => new mongoose.Types.ObjectId(id as string))
        };
      }

      // Priority filter
      if (priority && Array.isArray(priority) && priority.length > 0) {
        query.priority = { $in: priority };
      }

      // Status filter
      if (status && Array.isArray(status) && status.length > 0) {
        query['status.status'] = { $in: status };
      }

      // Fetch all tasks matching the filters
      const tasks = await Task.find(query)
        .populate('assignee', 'name')
        .populate('createdBy', 'name')
        .lean();

      // Initialize dashboard data
      const dashboardData: DashboardStats = {
        taskStatus: {
          completed: 0,
          inProgress: 0,
          pending: 0,
          expired: 0
        },
        priorityDistribution: {
          high: 0,
          medium: 0,
          low: 0
        },
        stats: {
          pendingTasks: 0,
          totalComments: 0,
          tasksInBucket: 0,
          contactPersons: 0,
          averageEntryDone: 0
        },
        estimatedVsActual: [],
        timeStats: {
          totalEstimated: 0,
          totalSpent: 0,
          variance: 0
        }
      };

      let totalEntryDone = 0;
      let tasksWithEntryDone = 0;
      const contactPersonSet = new Set<string>();

      // Process each task
      tasks.forEach((task: any) => {
        // Task Status Distribution
        const taskStatus = task.status?.[0]?.status || 'pending';
        switch (taskStatus) {
          case 'completed':
            dashboardData.taskStatus.completed++;
            break;
          case 'in progress':
            dashboardData.taskStatus.inProgress++;
            break;
          case 'expired':
            dashboardData.taskStatus.expired++;
            break;
          case 'assignee':
          case 'not assignee':
          case 'pause':
          case 'cancel':
          default:
            dashboardData.taskStatus.pending++;
            break;
        }

        // Priority Distribution
        if (task.priority) {
          dashboardData.priorityDistribution[task.priority as keyof typeof dashboardData.priorityDistribution]++;
        }

        // Stats Calculations
        if (taskStatus === 'assignee' || taskStatus === 'not assignee' || taskStatus === 'pause') {
          dashboardData.stats.pendingTasks++;
        }

        // Total Comments
        if (task.comments && Array.isArray(task.comments)) {
          dashboardData.stats.totalComments += task.comments.length;
        }

        // Tasks in Bucket (individual or company bucket)
        if (task.companyBucket || 
            (task.individualBucket && task.individualBucket.some((b: any) => b.individual))) {
          dashboardData.stats.tasksInBucket++;
        }

        // Contact Persons
        if (task.contactPerson && Array.isArray(task.contactPerson)) {
          task.contactPerson.forEach((contact: any) => {
            if (contact.phone) {
              contactPersonSet.add(contact.phone.toString());
            }
          });
        }

        // Entry Done Average
        if (task.entryDone !== undefined && task.entryDone !== null) {
          totalEntryDone += task.entryDone;
          tasksWithEntryDone++;
        }

        // Estimated vs Actual Time (for top tasks)
        const estimatedMinutes = convertToMinutes(
          task.estimatedTime?.value || 0,
          task.estimatedTime?.unit || 'Minutes'
        );

        const actualMinutes = task.time_spent?.reduce((sum: number, ts: any) => {
          return sum + (ts.time?.reduce((a: number, b: number) => a + b, 0) || 0);
        }, 0) || 0;

        if (estimatedMinutes > 0 || actualMinutes > 0) {
          dashboardData.estimatedVsActual.push({
            taskTitle: task.taskTitle || 'Untitled',
            estimated: Math.round(estimatedMinutes / 60 * 100) / 100, // Convert to hours
            actual: Math.round(actualMinutes / 60 * 100) / 100 // Convert to hours
          });
        }

        // Total Time Stats
        dashboardData.timeStats.totalEstimated += estimatedMinutes;
        dashboardData.timeStats.totalSpent += actualMinutes;
      });

      // Calculate averages and final stats
      dashboardData.stats.contactPersons = contactPersonSet.size;
      dashboardData.stats.averageEntryDone = tasksWithEntryDone > 0 
        ? Math.round(totalEntryDone / tasksWithEntryDone) 
        : 0;

      // Sort estimated vs actual by estimated time and take top 7
      dashboardData.estimatedVsActual.sort((a, b) => b.estimated - a.estimated);
      dashboardData.estimatedVsActual = dashboardData.estimatedVsActual.slice(0, 7);

      // Convert time stats to hours
      dashboardData.timeStats.totalEstimated = Math.round(dashboardData.timeStats.totalEstimated / 60);
      dashboardData.timeStats.totalSpent = Math.round(dashboardData.timeStats.totalSpent / 60);
      dashboardData.timeStats.variance = dashboardData.timeStats.totalSpent - dashboardData.timeStats.totalEstimated;

      // Calculate percentages for task status
      const totalTasks = tasks.length || 1; // Avoid division by zero
      const taskStatusPercentages = {
        completed: Math.round((dashboardData.taskStatus.completed / totalTasks) * 100),
        inProgress: Math.round((dashboardData.taskStatus.inProgress / totalTasks) * 100),
        pending: Math.round((dashboardData.taskStatus.pending / totalTasks) * 100),
        expired: Math.round((dashboardData.taskStatus.expired / totalTasks) * 100)
      };

      return res.status(200).json({
        success: true,
        data: {
          ...dashboardData,
          taskStatusPercentages,
          totalTasks: tasks.length
        }
      });

    } catch (error) {
      console.error('Dashboard Graph Error:', error);
      return res.status(500).json({ 
        success: false,
        message: "Something went wrong!",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}



