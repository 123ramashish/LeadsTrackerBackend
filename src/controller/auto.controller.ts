import Task from "../DataBase/Schema/task.schema";
import RepeatTask from "../DataBase/Schema/repeatTask.schema";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import leaveSchema from "../DataBase/Schema/leave.schema";
import User from "../DataBase/Schema/user.schema";
import { Notification_Create } from "../utils/notificationUtils";

export default class AutoStatusUpdater {
  /**
   * Expire tasks by comparing today with endDate/dueDate
   */
  static async runAutoStatusUpdate() {
    try {
      console.log("[AUTO STATUS UPDATE] Starting status update...");
      const today = DateTime.local().startOf("day");

      const tasks = await Task.find({
        $or: [
          { endDate: { $exists: true, $ne: [] } },
          { dueDate: { $exists: true, $ne: [] } },
        ],
      });

      let updatedTasksCount = 0;

      for (const task of tasks) {
        const updatedStatuses = task.status.map((statusObj: any) => {
          const userEndDateObj = task.endDate?.find(
            (end: any) => end.user.toString() === statusObj.user.toString()
          );

          const userDueDateObj = task.dueDate?.find(
            (due: any) => due.user.toString() === statusObj.user.toString()
          );

          const endDate = userEndDateObj?.date
            ? DateTime.fromJSDate(userEndDateObj.date).setZone("local")
            : null;

          const dueDates = Array.isArray(userDueDateObj?.date)
            ? userDueDateObj.date.map((d: any) =>
                DateTime.fromJSDate(d).setZone("local")
              )
            : [];

          const isExpiredByEndDate = endDate && endDate < today;
          const isExpiredByDueDate =
            dueDates.length > 0 && dueDates.some((d) => d < today);

          if (
            (isExpiredByEndDate || isExpiredByDueDate) &&
            statusObj.status !== "expired"
          ) {
            return { ...statusObj, status: "expired" };
          }

          return statusObj;
        });

        const hasChanged =
          JSON.stringify(task.status) !== JSON.stringify(updatedStatuses);

        if (hasChanged) {
          await Task.updateOne(
            { _id: task._id },
            { $set: { status: updatedStatuses } }
          );
          updatedTasksCount++;
        }
      }

      console.log(
        `[AUTO STATUS UPDATE] Updated status for ${updatedTasksCount} tasks.`
      );

      return {
        success: true,
        updatedTasksCount,
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
      const today = DateTime.local().startOf("day");
      const repeatTasks = await RepeatTask.find({});

      let createdCount = 0;
      let skippedCount = 0;

      for (const repeatTask of repeatTasks) {
        try {
          if (!repeatTask.startDate || !repeatTask.endDate) continue;

          const startDate = DateTime.fromJSDate(
            repeatTask.startDate
          ).startOf("day");
          const endDate = DateTime.fromJSDate(repeatTask.endDate).endOf("day");

          if (today < startDate || today > endDate) continue;

          const shouldCreate = this.shouldCreateRepeatTask(repeatTask, today);
          if (!shouldCreate) continue;

          const exists = await this.taskExistsForToday(
            repeatTask._id,
            today
          );
          if (exists) continue;

          const result = await this.createTaskFromRepeat(
            repeatTask._id.toString(),
            today.toJSDate()
          );

          if (result.success) createdCount++;
          else skippedCount++;
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

      const taskDate = targetDate || new Date();
      const localTimeZone = await this.getLocalTimeZone();

      const taskDateTime = DateTime.fromJSDate(taskDate).setZone(localTimeZone);
      const taskDateOnly = taskDateTime.startOf("day").toJSDate();

      // ✅ Skip task creation if holiday
      const isHoliday = await this.checkIfHoliday(
        taskDateOnly,
        repeatTask.company
      );
      if (isHoliday)
        return { success: false, message: "Skipped due to holiday" };

      // Collect assignees
      let assignees: string[] =
        repeatTask.assignee?.map(
          (a: any) => a._id?.toString() || a.toString()
        ) || [];

      if (assignees.length === 0) {
        const users = await User.find({ company: repeatTask.company });
        assignees = users.map((u) => u._id.toString());
      }

      // ✅ Skip task creation if ANY user is on leave
      const usersOnLeave = await this.getUsersOnLeave(
        assignees,
        taskDateOnly
      );
      if (usersOnLeave.length > 0)
        return { success: false, message: "Skipped - user(s) on leave" };

      // Estimate time
      const totalValue = Number(repeatTask.estimatedTime.value);
      const unit = repeatTask.estimatedTime.unit;

      const perUserValue = repeatTask.divideTime
        ? parseFloat((totalValue / assignees.length).toFixed(2))
        : totalValue;

      const userEstimatedTime = assignees.map((userId) => ({
        user: userId,
        estimatedTime: { unit, value: perUserValue },
      }));

      const dueDateTime = taskDateTime.endOf("day");
      const dueDate = new Date(dueDateTime.toISO()!);

      const userStartDate = assignees.map((userId) => ({
        user: userId,
        date: taskDateOnly,
      }));
      const userEndDate = assignees.map((userId) => ({
        user: userId,
        date: dueDate,
      }));
      const userDueDate = assignees.map((userId) => ({
        user: userId,
        date: [dueDate],
      }));

      const individualBucket = assignees.map((userId) => ({
        user: userId,
        individual: false,
      }));
      const status = assignees.map((userId) => ({
        user: userId,
        status: "assignee",
      }));

      const task = new Task({
        taskTitle: repeatTask.taskTitle,
        taskDescription: repeatTask.taskDescription || "",
        taskDate: taskDateOnly,
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

      await task.save();

      await Notification_Create(
        assignees,
        repeatTask.taskTitle,
        `You have been assigned a task '${repeatTask.taskTitle}'`
      );

      return { success: true, task };
    } catch (error) {
      console.error("Error creating task from repeat:", error);
      throw error;
    }
  }

  private static async getLocalTimeZone(): Promise<string> {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  private static async checkIfHoliday(
    date: Date,
    companyId: mongoose.Types.ObjectId
  ): Promise<boolean> {
    try {
      const Holiday = mongoose.model("Holiday");
      const startOfDay = DateTime.fromJSDate(date).startOf("day").toJSDate();
      const endOfDay = DateTime.fromJSDate(date).endOf("day").toJSDate();

      const holiday = await Holiday.findOne({
        date: { $gte: startOfDay, $lte: endOfDay },
        $or: [{ company: companyId }, { company: { $exists: false } }],
      });

      return !!holiday;
    } catch (error) {
      console.warn("Holiday check failed:", error);
      return false;
    }
  }

  private static async getUsersOnLeave(
    userIds: string[],
    taskDate: Date
  ): Promise<string[]> {
    try {
      const startOfDay = DateTime.fromJSDate(taskDate)
        .startOf("day")
        .toJSDate();
      const endOfDay = DateTime.fromJSDate(taskDate).endOf("day").toJSDate();

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
        return repeatTask.repeatDay && today.weekday === repeatTask.repeatDay;
      case "monthly":
        if (
          repeatTask.repeatMonthNumber &&
          today.day === repeatTask.repeatMonthNumber
        )
          return true;
        if (repeatTask.repeatDate) {
          const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
          return (
            today.month === repeatDate.month && today.day === repeatDate.day
          );
        }
        return false;
      case "quarterly":
        if (repeatTask.repeatDate) {
          const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
          const quarterMonths = [1, 4, 7, 10];
          return (
            quarterMonths.includes(today.month) && today.day === repeatDate.day
          );
        }
        return false;
      case "annually":
        if (repeatTask.repeatDate) {
          const repeatDate = DateTime.fromJSDate(repeatTask.repeatDate);
          return (
            today.month === repeatDate.month && today.day === repeatDate.day
          );
        }
        return false;
      default:
        return false;
    }
  }

  private static async taskExistsForToday(
    repeatTaskId: mongoose.Types.ObjectId,
    today: DateTime
  ): Promise<boolean> {
    const existingTask = await Task.findOne({
      repeatTaskId,
      taskDate: {
        $gte: today.toJSDate(),
        $lt: today.plus({ days: 1 }).toJSDate(),
      },
    });
    return !!existingTask;
  }
}
