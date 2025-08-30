import Task from "../DataBase/Schema/task.schema";
import RepeatTask from "../DataBase/Schema/repeatTask.schema";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import leaveSchema from "../DataBase/Schema/leave.schema";
import User from "../DataBase/Schema/user.schema";
import { Notification_Create } from "../utils/notificationUtils";
import * as cron from "node-cron";

// Holiday schema interface (assuming you have this)
interface Holiday {
  _id: mongoose.Types.ObjectId;
  date: Date;
  name: string;
  company?: mongoose.Types.ObjectId;
  isActive: boolean;
}

export default class AutoController {
  static async runAutoStatusUpdate() {
    try {
      console.log("[AUTO STATUS UPDATE] Starting status update...");

      // Get today's date at the start of the day (00:00:00)
      const today = DateTime.now().startOf("day");

      // Fetch all tasks that have an `endDate` field that is not empty
      const tasks = await Task.find({ endDate: { $exists: true, $ne: [] } });

      let updatedTasksCount = 0;

      // Iterate over each task
      for (const task of tasks) {
        // Update the `status` array for each user in the task
        const updatedStatuses = task.status.map((statusObj: any) => {
          // Find the matching user's end date in the task's endDate array
          const userEndDateObj = task.endDate.find(
            (end: any) => end.user.toString() === statusObj.user.toString()
          );

          // If the user has an end date and it's before today, and status is not already "expired"
          if (
            userEndDateObj?.date &&
            DateTime.fromJSDate(userEndDateObj.date) < today &&
            statusObj.status !== "expired"
          ) {
            // Mark the status as expired
            return { ...statusObj, status: "expired" };
          }

          // Otherwise, return the status as-is
          return statusObj;
        });

        // Check if the status array actually changed
        const hasChanged =
          JSON.stringify(task.status) !== JSON.stringify(updatedStatuses);

        // If it did change, update the task in the database
        if (hasChanged) {
          await Task.updateOne(
            { _id: task._id },
            { $set: { status: updatedStatuses } }
          );
          updatedTasksCount++;
        }
      }

      // Log how many tasks had their status updated
      console.log(
        `[AUTO STATUS UPDATE] Updated status for ${updatedTasksCount} tasks.`
      );

      return {
        success: true,
        updatedTasksCount,
        message: `Status updated for ${updatedTasksCount} tasks`,
      };
    } catch (error) {
      // Catch and log any errors that occurred during processing
      console.error("[AUTO STATUS UPDATE ERROR]", error);
      throw error;
    }
  }

  /**
   * Method to create tasks from repeat tasks with leave and holiday conditions
   */
  static async runAutoRepeatTaskCreation() {
    try {
      console.log("[AUTO REPEAT TASK] Starting repeat task creation...");

      // Get today's date at the start of the day (00:00:00)
      const today = DateTime.now().startOf("day");

      // Fetch all active repeat tasks
      const repeatTasks = await RepeatTask.find({});
      let createdCount = 0;
      let skippedCount = 0;

      // Iterate over each repeat task
      for (const repeatTask of repeatTasks) {
        try {
          // Skip if startDate or endDate is missing
          if (!repeatTask.startDate || !repeatTask.endDate) {
            console.log(
              `Skipping repeat task ${repeatTask.taskTitle} - Missing start/end date`
            );
            continue;
          }

          // Convert startDate and endDate to Luxon DateTime and normalize
          const startDate = DateTime.fromJSDate(repeatTask.startDate).startOf(
            "day"
          );
          const endDate = DateTime.fromJSDate(repeatTask.endDate).endOf("day");

          // Skip if today's date is outside the repeat range
          if (today < startDate || today > endDate) {
            continue;
          }

          // Flag to determine whether we should create a new task today
          let shouldCreate = false;

          // Determine logic based on repeat interval
          switch (repeatTask.repeatInterval) {
            case "daily":
              shouldCreate = true;
              break;

            case "weekly":
              if (
                repeatTask.repeatDay !== null &&
                today.weekday === repeatTask.repeatDay
              ) {
                shouldCreate = true;
              }
              break;

            case "monthly":
              // Check if repeatMonthNumber matches today's day of month
              if (
                repeatTask.repeatMonthNumber !== null &&
                today.day === repeatTask.repeatMonthNumber
              ) {
                shouldCreate = true;
              }
              // OR check if repeatDate (full date) matches today's month and day
              else if (repeatTask.repeatDate) {
                const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
                if (
                  today.month === repeatDate.month &&
                  today.day === repeatDate.day
                ) {
                  shouldCreate = true;
                }
              }
              break;

            case "quarterly":
              // Create task on the same day every quarter
              if (repeatTask.repeatDate) {
                const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
                const monthsInQuarter = [0, 3, 6, 9]; // Quarters start months
                const targetMonth = monthsInQuarter.find(
                  (month) => (month + repeatDate.month) % 12 === today.month - 1
                );
                if (targetMonth !== undefined && today.day === repeatDate.day) {
                  shouldCreate = true;
                }
              }
              break;

            case "annually":
              // Create task on the same date every year
              if (repeatTask.repeatDate) {
                const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
                if (
                  today.month === repeatDate.month &&
                  today.day === repeatDate.day
                ) {
                  shouldCreate = true;
                }
              }
              break;

            default:
              console.log(
                `Unknown repeat interval: ${repeatTask.repeatInterval}`
              );
              break;
          }

          // If we should create a task, call the createTaskFromRepeat method
          if (shouldCreate) {
            // Check if task already exists for today to avoid duplicates
            const existingTask = await Task.findOne({
              repeatTaskId: repeatTask._id,
              taskDate: {
                $gte: today.toJSDate(),
                $lt: today.plus({ days: 1 }).toJSDate(),
              },
            });

            if (existingTask) {
              console.log(
                `Task already exists for ${
                  repeatTask.taskTitle
                } on ${today.toFormat("yyyy-MM-dd")}`
              );
              continue;
            }

            const result = await AutoController.createTaskFromRepeat(
              repeatTask._id.toString(),
              today.toJSDate()
            );

            if (result.success) {
              createdCount++;
              console.log(
                `Created task: ${repeatTask.taskTitle} for ${today.toFormat(
                  "yyyy-MM-dd"
                )}`
              );
            } else {
              skippedCount++;
              console.log(
                `Skipped task: ${repeatTask.taskTitle} - ${result.message}`
              );
            }
          }
        } catch (error) {
          console.error(
            `Error processing repeat task ${repeatTask.taskTitle}:`,
            error
          );
          skippedCount++;
        }
      }

      console.log(
        `[AUTO REPEAT TASK] Created ${createdCount} tasks, skipped ${skippedCount} tasks.`
      );

      return {
        success: true,
        createdCount,
        skippedCount,
        message: `Processed repeat tasks - Created: ${createdCount}, Skipped: ${skippedCount}`,
      };
    } catch (error) {
      console.error("[AUTO REPEAT TASK ERROR]", error);
      throw error;
    }
  }

  /**
   * Creates tasks from repeat tasks with leave and holiday validation
   */
  static async createTaskFromRepeat(
    repeatTaskId: string,
    targetDate?: Date
  ): Promise<any> {
    try {
      // Get the repeat task
      const repeatTask: any = await RepeatTask.findById(repeatTaskId).populate(
        "assignee"
      );
      if (!repeatTask) {
        throw new Error("Repeat task not found");
      }

      // Use provided date or current date
      const taskDate = targetDate || new Date();
      const localTimeZone = await AutoController.getLocalTimeZone();

      // Convert to local timezone for proper date comparison
      const taskDateTime = DateTime.fromJSDate(taskDate).setZone(localTimeZone);
      const taskDateOnly = taskDateTime.startOf("day").toJSDate();

      // Check if the date is a holiday for the company
      const isHoliday = await AutoController.checkIfHoliday(
        taskDateOnly,
        repeatTask.company
      );
      if (isHoliday) {
        console.log(
          `Skipping task creation for ${repeatTask.taskTitle} - Holiday on ${taskDate}`
        );
        return {
          success: false,
          message: "Task creation skipped due to holiday",
          date: taskDate,
        };
      }

      // Get assignees
      let assignees: string[] =
        repeatTask.assignee?.map(
          (a: any) => a._id?.toString() || a.toString()
        ) || [];

      // If no assignees, get all company users
      if (assignees.length === 0) {
        const users = await User.find({ company: repeatTask.company });
        if (!users.length) {
          throw new Error("No users found for company");
        }
        assignees = users.map((u) => u._id.toString());
      }

      // Filter out users who are on leave for the task date
      const availableAssignees = await AutoController.filterUsersOnLeave(
        assignees,
        taskDateOnly
      );

      if (availableAssignees.length === 0) {
        console.log(
          `Skipping task creation for ${repeatTask.taskTitle} - All assignees on leave on ${taskDate}`
        );
        return {
          success: false,
          message: "Task creation skipped - all assignees on leave",
          date: taskDate,
        };
      }

      // Calculate estimated time per user
      const totalValue = Number(repeatTask.estimatedTime.value);
      const unit = repeatTask.estimatedTime.unit;
      const perUserValue = repeatTask.divideTime
        ? parseFloat((totalValue / availableAssignees.length).toFixed(2))
        : totalValue;

      // Create user estimated time array
      const userEstimatedTime = availableAssignees.map((userId) => ({
        user: userId,
        estimatedTime: { unit, value: perUserValue },
      }));

      // Calculate due date (assuming same day for now, can be modified based on business logic)
      const dueDateTime = taskDateTime.endOf("day");
      const dueDate = new Date(dueDateTime.toISO()!);

      // Create user-specific arrays
      const userStartDate = availableAssignees.map((userId) => ({
        user: userId,
        date: taskDateOnly,
      }));

      const userEndDate = availableAssignees.map((userId) => ({
        user: userId,
        date: dueDate,
      }));

      const userDueDate = availableAssignees.map((userId) => ({
        user: userId,
        date: [dueDate],
      }));

      const individualBucket = availableAssignees.map((userId) => ({
        user: userId,
        individual: false,
      }));

      const status = availableAssignees.map((userId) => ({
        user: userId,
        status: "assignee",
      }));

      // Create the task
      const task = new Task({
        taskTitle: repeatTask.taskTitle,
        taskDescription: repeatTask.taskDescription || "",
        taskDate: taskDateOnly,
        estimatedTime: { unit, value: totalValue },
        noOfEntry: repeatTask.noOfEntry,
        entryTime: repeatTask.entryTime,
        assignee: availableAssignees,
        userEstimatedTime,
        priority: repeatTask.priority,
        location: repeatTask.location,
        address: repeatTask.address || null,
        startDate: userStartDate,
        endDate: userEndDate,
        dueDate: userDueDate,
        createdBy: repeatTask.createdBy,
        tags: repeatTask.tags || [],
        notes: repeatTask.notes || "",
        status,
        company: new mongoose.Types.ObjectId(repeatTask.company),
        individualBucket,
        companyBucket: false,
        repeatTaskId: repeatTask._id,
        divideTime: repeatTask.divideTime || false,
      });

      // Save the task
      await task.save();

      // Create notification message
      const message = `You have been assigned a task '${repeatTask.taskTitle}'`;

      // Send notifications only to available assignees
      await Notification_Create(
        availableAssignees,
        repeatTask.taskTitle,
        message
      );

      // Update the repeat task to include this new task ID
      await RepeatTask.updateOne(
        { _id: repeatTask._id },
        { $push: { repeatTaskId: task._id } }
      );

      return {
        success: true,
        task,
        message: "Task created successfully",
        availableAssignees: availableAssignees.length,
        totalAssignees: assignees.length,
        usersOnLeave: assignees.length - availableAssignees.length,
      };
    } catch (error) {
      console.error("Error creating task from repeat:", error);
      throw error;
    }
  }

  /**
   * Get local timezone
   */
  private static async getLocalTimeZone(): Promise<string> {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * Check if a given date is a holiday for the company
   */
  private static async checkIfHoliday(
    date: Date,
    companyId: mongoose.Types.ObjectId
  ): Promise<boolean> {
    try {
      // Assuming you have a Holiday model/collection
      const Holiday = mongoose.model("Holiday");

      const startOfDay = DateTime.fromJSDate(date).startOf("day").toJSDate();
      const endOfDay = DateTime.fromJSDate(date).endOf("day").toJSDate();

      const holiday = await Holiday.findOne({
        date: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
        $or: [
          { company: companyId },
          { company: { $exists: false } }, // Global holidays
        ],
        isActive: { $ne: false }, // Active holidays (default true)
      });

      return !!holiday;
    } catch (error) {
      // If Holiday model doesn't exist or error occurs, assume no holiday
      console.warn("Holiday check failed:", error);
      return false;
    }
  }

  /**
   * Filter out users who are on approved leave for the given date
   */
  private static async filterUsersOnLeave(
    userIds: string[],
    taskDate: Date
  ): Promise<string[]> {
    try {
      const startOfDay = DateTime.fromJSDate(taskDate)
        .startOf("day")
        .toJSDate();
      const endOfDay = DateTime.fromJSDate(taskDate).endOf("day").toJSDate();

      // Find all approved leaves that overlap with the task date
      const overlappingLeaves = await leaveSchema.find({
        user: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: "Approved",
        startDate: { $lte: endOfDay },
        endDate: { $gte: startOfDay },
      });

      // Get user IDs who are on leave
      const usersOnLeave = overlappingLeaves.map((leave) =>
        leave.user.toString()
      );

      // Return users who are NOT on leave
      return userIds.filter((userId) => !usersOnLeave.includes(userId));
    } catch (error) {
      console.error("Error filtering users on leave:", error);
      // If there's an error, return all users (fail safe)
      return userIds;
    }
  }

  /**
   * Combined auto update method - handles both status updates and repeat task creation
   */
  static async runAutoUpdate() {
    try {
      console.log("[AUTO UPDATE] Starting combined auto update...");

      // Run status updates first
      const statusResult = await AutoController.runAutoStatusUpdate();

      // Run repeat task creation
      const repeatResult = await AutoController.runAutoRepeatTaskCreation();

      return {
        success: true,
        statusUpdate: statusResult,
        repeatTaskCreation: repeatResult,
        message: "Auto update completed successfully",
      };
    } catch (error) {
      console.error("[AUTO UPDATE ERROR]", error);
      throw error;
    }
  }

  /**
   * Check if a repeat task should be created today based on its interval
   */
  private static shouldCreateRepeatTask(
    repeatTask: any,
    today: DateTime
  ): boolean {
    switch (repeatTask.repeatInterval) {
      case "daily":
        return true;

      case "weekly":
        return (
          repeatTask.repeatDay !== null &&
          today.weekday === repeatTask.repeatDay
        );

      case "monthly":
        // Check if repeatMonthNumber matches today's day of month
        if (
          repeatTask.repeatMonthNumber !== null &&
          today.day === repeatTask.repeatMonthNumber
        ) {
          return true;
        }
        // OR check if repeatDate (full date) matches today's month and day
        else if (repeatTask.repeatDate) {
          const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
          return (
            today.month === repeatDate.month && today.day === repeatDate.day
          );
        }
        return false;

      case "quarterly":
        // Create task on the same day every quarter
        if (repeatTask.repeatDate) {
          const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
          const monthsInQuarter = [1, 4, 7, 10]; // January, April, July, October
          const isQuarterMonth = monthsInQuarter.includes(today.month);
          return isQuarterMonth && today.day === repeatDate.day;
        }
        return false;

      case "annually":
        // Create task on the same date every year
        if (repeatTask.repeatDate) {
          const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
          return (
            today.month === repeatDate.month && today.day === repeatDate.day
          );
        }
        return false;

      default:
        console.log(`Unknown repeat interval: ${repeatTask.repeatInterval}`);
        return false;
    }
  }

  /**
   * Check if task already exists for today to avoid duplicates
   */
  private static async taskExistsForToday(
    repeatTaskId: mongoose.Types.ObjectId,
    today: DateTime
  ): Promise<boolean> {
    const existingTask = await Task.findOne({
      repeatTaskId: repeatTaskId,
      taskDate: {
        $gte: today.toJSDate(),
        $lt: today.plus({ days: 1 }).toJSDate(),
      },
    });

    return !!existingTask;
  }
}

// Server setup with cron jobs
export const setupAutoEvents = () => {
  console.log("[AUTO EVENTS] Setting up cron jobs...");

  // Run status update at 00:01 AM every day
  cron.schedule("1 0 * * *", async () => {
    console.log("[AUTO CRON] Starting status update...");
    try {
      await AutoController.runAutoStatusUpdate();
    } catch (error) {
      console.error("[AUTO CRON ERROR] Status update failed:", error);
    }
  });

  // Run repeat task creation at 00:05 AM every day
  cron.schedule("5 0 * * *", async () => {
    console.log("[AUTO CRON] Starting repeat task creation...");
    try {
      await AutoController.runAutoRepeatTaskCreation();
    } catch (error) {
      console.error("[AUTO CRON ERROR] Repeat task creation failed:", error);
    }
  });

  // Optional: Combined update at 00:10 AM (if you want both in one go)
  // cron.schedule('10 0 * * *', async () => {
  //   console.log('[AUTO CRON] Starting combined auto update...');
  //   try {
  //     await AutoController.runAutoUpdate();
  //   } catch (error) {
  //     console.error('[AUTO CRON ERROR] Combined update failed:', error);
  //   }
  // });

  console.log("[AUTO EVENTS] Cron jobs scheduled successfully");
};
