import Task from "../DataBase/Schema/task.schema";
import RepeatTask from "../DataBase/Schema/repeatTask.schema";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import leaveSchema from "../DataBase/Schema/leave.schema";
import User from "../DataBase/Schema/user.schema";
import { Notification_Create } from "../utils/notificationUtils";
import Notification from "../DataBase/Schema/notification.schema";
import { sendPushNotification } from "../helper/notifications";

export default class AutoStatusUpdater {
  static async runAutoStatusUpdate() {
    try {
      console.log("[AUTO STATUS UPDATE] Starting status update...");

      const localTimeZone = DateTime.local().zoneName;
      const today = DateTime.now().setZone(localTimeZone).startOf("day");
      console.log("today", today.toISODate());

      // 1. Check holiday
      const isHoliday = await this.checkIfHoliday(today.toJSDate());
      if (isHoliday) {
        console.log("[AUTO STATUS UPDATE] Skipped - Today is a holiday");
        return {
          success: true,
          updatedTasksCount: 0,
          message: "Skipped due to holiday",
        };
      }

      // 2. Get all users
      const users = await User.find({}, "_id").lean();
      const userIds = users.map((u: any) => u._id.toString());

      // 3. Filter users not on leave
      const usersOnLeave = await this.getUsersOnLeave(
        userIds,
        today.toJSDate()
      );
      const activeUserIds = userIds.filter((id) => !usersOnLeave.includes(id));

      if (activeUserIds.length === 0) {
        console.log("[AUTO STATUS UPDATE] No active users today");
        return {
          success: true,
          updatedTasksCount: 0,
          message: "No active users",
        };
      }

      // 4. Find tasks assigned to active users with expired dates
      const tasks = await Task.find({
        assignee: { $in: activeUserIds },
        $or: [
          { endDate: { $elemMatch: { date: { $lt: today.toJSDate() } } } },
          { dueDate: { $elemMatch: { date: { $lt: today.toJSDate() } } } },
        ],
      }).lean();

      console.log("tasks found", tasks.length);

      let updatedTasksCount = 0;
      const expiredTaskUser: string[] = [];

      for (const task of tasks) {
        let hasChanged = false;

        const updatedStatuses = task.status.map((statusObj: any) => {
          const userId = statusObj?.user?.toString();
          if (!userId) return statusObj;

          const dueExpired =
            task.dueDate?.some(
              (d: any) => new Date(d.date) < today.toJSDate()
            ) ?? false;
          const endExpired =
            task.endDate?.some(
              (d: any) => new Date(d.date) < today.toJSDate()
            ) ?? false;

          if (
            activeUserIds.includes(userId) &&
            (dueExpired || endExpired) &&
            statusObj.status !== "expired"
          ) {
            hasChanged = true;
            expiredTaskUser.push(userId);

            // 🔔 Create notification in DB
            Notification.create({
              createFor: userId,
              title: "Task Expired",
              description: `Task "${task.taskTitle}" has expired.`,
            });

            // 📲 Send push notification
            sendPushNotification(
              userId,
              "Task Expired",
              `Task "${task.taskTitle}" has expired.`
            );

            return { ...statusObj, status: "expired" };
          }
          return statusObj;
        });

        if (hasChanged) {
          await Task.updateOne(
            { _id: task._id },
            { $set: { status: updatedStatuses } }
          );
          updatedTasksCount++;
        }
      }

      console.log("expiredTaskUser", expiredTaskUser);
      console.log(
        `[AUTO STATUS UPDATE] Updated status for ${updatedTasksCount} tasks.`
      );

      return {
        success: true,
        updatedTasksCount,
        expiredTaskUser,
        message: `Status updated for ${updatedTasksCount} tasks`,
      };
    } catch (error) {
      console.error("[AUTO STATUS UPDATE ERROR]", error);
      throw error;
    }
  }

  /**
   * Repeat task creation runner
   */
  static async runAutoRepeatTaskCreation() {
    try {
      console.log("[AUTO REPEAT TASK] Starting repeat task creation...");
      const localTimeZone = DateTime.local().zoneName;
      const today = DateTime.now().setZone(localTimeZone);
      console.log("today", today);

      // 1. Check holiday
      const isHoliday = await this.checkIfHoliday(today.toJSDate());
      if (isHoliday) {
        console.log("[AUTO STATUS UPDATE] Skipped - Today is a holiday");
        return {
          success: true,
          updatedTasksCount: 0,
          message: "Skipped due to holiday",
        };
      }

      // 2. Get all users
      const users = await User.find({}, "_id").lean();
      const userIds = users.map((u: any) => u._id.toString());

      // 3. Filter users not on leave
      const usersOnLeave = await this.getUsersOnLeave(
        userIds,
        today.toJSDate()
      );
      const activeUserIds = userIds.filter((id) => !usersOnLeave.includes(id));

      if (activeUserIds.length === 0) {
        console.log("[AUTO STATUS UPDATE] No active users today");
        return {
          success: true,
          updatedTasksCount: 0,
          message: "No active users",
        };
      }
      console.log("activeUserId", activeUserIds)
      // 4. Find tasks assigned to active users with expired dates
      const repeatTasks = await RepeatTask.find({
        assignee: { $in: activeUserIds },
      }).lean();
      console.log("repeatTask", repeatTasks)
      let createdCount = 0;
      let skippedCount = 0;

      for (const repeatTask of repeatTasks) {
        try {
          if (!repeatTask.startDate || !repeatTask.endDate) continue;

          const startDate = DateTime.fromJSDate(repeatTask.startDate).startOf(
            "day"
          );
          const endDate = DateTime.fromJSDate(repeatTask.endDate).endOf("day");

          if (today < startDate || today > endDate) continue;

          const shouldCreate = this.shouldCreateRepeatTask(repeatTask, today);
          if (!shouldCreate) continue;
          const repeatTaskIdLength = repeatTask?.repeatTaskId?.length;
          const exists = await this.taskExistsForToday(repeatTask?.repeatTaskId[repeatTaskIdLength - 1], today);
          console.log("exist", exists)
          if (exists) continue;

          const result = await this.createTaskFromRepeat(
            repeatTask._id.toString(),
            today.toJSDate()
          );
          console.log("result", result)
          if (result.success) {
            await RepeatTask.findByIdAndUpdate(
              repeatTask._id,
              { $push: { repeatTaskId: result?.task?._id } },
              { new: true }
            );
            createdCount++;
          } else {
            skippedCount++;
          }
        } catch (err) {
          console.error(
            `Error processing repeat task ${repeatTask.taskTitle}:`,
            err
          );
          skippedCount++;
        }
      }

      console.log(
        `[AUTO REPEAT TASK] Created ${createdCount} tasks, skipped ${skippedCount} tasks.`
      );

      return { success: true, createdCount, skippedCount };
    } catch (error) {
      console.error("[AUTO REPEAT TASK ERROR]", error);
      throw error;
    }
  }

  /**
   * Create a task instance from a repeatTask
   */
  static async createTaskFromRepeat(
    repeatTaskId: string,
    targetDate?: Date
  ): Promise<any> {
    try {
      const repeatTask: any = await RepeatTask.findById(repeatTaskId).populate(
        "assignee"
      );
      if (!repeatTask) throw new Error("Repeat task not found");
      const localTimeZone = DateTime.local().zoneName;
      const taskDate = DateTime.now().setZone(localTimeZone);
      const startDate = taskDate.startOf("day").toJSDate();
      const endDate = taskDate.endOf("day").toJSDate();


      // Collect assignees
      let assignees: string[] =
        repeatTask.assignee?.map(
          (a: any) => a._id?.toString() || a.toString()
        ) || [];

      if (assignees.length === 0) {
        const users = await User.find({ company: repeatTask.company });
        assignees = users.map((u) => u._id.toString());
      }
      // Calculate estimated time
      const totalValue = Number(repeatTask.estimatedTime.value);
      const unit = repeatTask.estimatedTime.unit;
      const perUserValue = repeatTask.divideTime
        ? parseFloat((totalValue / assignees.length).toFixed(2))
        : totalValue;
      const userEstimatedTime = assignees.map((userId) => ({
        user: userId,
        estimatedTime: { unit, value: perUserValue },
      }));

      // User-specific start/end dates
      const userStartDate = assignees.map((userId) => ({
        user: userId,
        date: startDate,
      }));
      const userEndDate = assignees.map((userId) => ({
        user: userId,
        date: endDate,
      }));
      const dueDate = assignees.map((userId) => ({
        user: userId,
        date: [endDate],
      }));

      // ✅ Status per assignee
      const status = assignees.map((userId) => ({
        user: userId,
        status: "assignee",
      }));

      // Create task
      const task = new Task({
        taskTitle: repeatTask.taskTitle,
        taskDescription: repeatTask.taskDescription || "",
        taskDate: startDate,
        estimatedTime: { unit, value: totalValue },
        noOfEntry: repeatTask.noOfEntry,
        entryTime: repeatTask.entryTime,
        assignee: assignees,
        userEstimatedTime,
        priority: repeatTask.priority,
        location: repeatTask.location,
        address: repeatTask.address || null,
        startDate: userStartDate,
        endDate: userEndDate,
        dueDate,
        createdBy: repeatTask.createdBy,
        tags: repeatTask.tags || [],
        notes: repeatTask.notes || "",
        status,
        company: new mongoose.Types.ObjectId(repeatTask.company),
        individualBucket: assignees.map((userId) => ({
          user: userId,
          individual: false,
        })),
        companyBucket: false,
        repeatTaskId: repeatTask._id,
        divideTime: repeatTask.divideTime || false,
      });

      const taskCreated = await task.save();
      // 🔔 Notifications
      const message = `You have been assigned a task '${repeatTask.taskTitle}'`;
      if (assignees.length > 0) {
        Notification.create({
          createFor: assignees,
          title: repeatTask.taskTitle,
          description: message,
        });
        sendPushNotification(assignees, repeatTask.taskTitle, message);
        await Notification_Create(assignees, repeatTask.taskTitle, message);
      }

      return { success: true, task, taskCreated };
    } catch (error) {
      console.error("Error creating task from repeat:", error);
      throw error;
    }
  }

  private static async getLocalTimeZone(): Promise<string> {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  private static async checkIfHoliday(date: Date): Promise<boolean> {
    try {
      const Holiday = mongoose.model("Holiday");
      const startOfDay = DateTime.fromJSDate(date).startOf("day").toJSDate();
      const endOfDay = DateTime.fromJSDate(date).endOf("day").toJSDate();

      const holiday = await Holiday.findOne({
        date: { $gte: startOfDay, $lte: endOfDay },
      });

      return !!holiday;
    } catch (error) {
      console.warn("Holiday check failed:", error);
      return false;
    }
  }

  private static async getUsersOnLeave(
    userIds: string[],
    date: Date
  ): Promise<string[]> {
    try {
      const startOfDay = DateTime.fromJSDate(date).startOf("day").toJSDate();
      const endOfDay = DateTime.fromJSDate(date).endOf("day").toJSDate();

      const overlappingLeaves = await leaveSchema.find({
        user: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: "Approved",
        startDate: { $lte: endOfDay },
        endDate: { $gte: startOfDay },
      });

      return overlappingLeaves.map((leave) => leave.user.toString());
    } catch (error) {
      console.error("Error checking users on leave:", error);
      return [];
    }
  }

  private static shouldCreateRepeatTask(
    repeatTask: any,
    today: DateTime
  ): boolean {
    switch (repeatTask.repeatInterval) {
      case "daily":
        return true;
      case "weekly":
        if (!repeatTask.repeatDay) return false;

        if (Array.isArray(repeatTask.repeatDay)) {
          return repeatTask.repeatDay.includes(today.weekday);
        } else {
          return today.weekday === repeatTask.repeatDay;
        }

      case "monthly":
        if (!repeatTask.repeatMonthNumber) return false;

        // handle array or single number
        if (Array.isArray(repeatTask.repeatMonthNumber)) {
          return repeatTask.repeatMonthNumber.includes(today.day);
        } else {
          return today.day === repeatTask.repeatMonthNumber;
        }

      case "quarterly":
        if (!repeatTask.repeatDate) return false;

        const quarterMonths = [1, 4, 7, 10];

        if (Array.isArray(repeatTask.repeatDate)) {
          // check if any date in array matches today's quarter month and day
          return repeatTask.repeatDate.some((d: Date) => {
            const repeatDate = DateTime.fromJSDate(d);
            return (
              quarterMonths.includes(today.month) &&
              today.day === repeatDate.day
            );
          });
        } else {
          const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
          return (
            quarterMonths.includes(today.month) && today.day === repeatDate.day
          );
        }

      case "annually":
        if (!repeatTask.repeatDate) return false;

        if (Array.isArray(repeatTask.repeatDate)) {
          // check if any date in array matches today's month and day
          return repeatTask.repeatDate.some((d: Date) => {
            const repeatDate = DateTime.fromJSDate(d);
            return (
              today.month === repeatDate.month && today.day === repeatDate.day
            );
          });
        } else {
          const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
          return (
            today.month === repeatDate.month && today.day === repeatDate.day
          );
        }

      default:
        return false;
    }
  }

  private static async taskExistsForToday(
    repeatTaskId: mongoose.Types.ObjectId,
    today: DateTime
  ): Promise<boolean> {
    const startOfDay = today.startOf('day').toJSDate();
    const endOfDay = today.endOf('day').toJSDate();

    const existingTask = await Task.findOne({
      _id: new mongoose.Types.ObjectId(repeatTaskId),
      updatedAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });
    console.log("existingTask", existingTask)
    return !!existingTask;
  }
}
