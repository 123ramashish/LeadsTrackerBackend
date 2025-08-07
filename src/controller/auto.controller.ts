// Importing the Task schema/model from the database
import Task from "../DataBase/Schema/task.schema";

// Importing the RepeatTask schema/model from the database
import RepeatTask from "../DataBase/Schema/repeatTask.schema";

// Importing Luxon's DateTime for date manipulation
import { DateTime } from "luxon";

// Importing a utility function to create a task based on a repeat pattern
import { createTaskFromRepeat } from "../utils/task.utils";

// Exporting the AutoController class to be used for automated operations
export default class AutoController {
  // Method to run automatic updates (called by a scheduler like cron)
  async runAutoUpdate() {
    try {
      // Get today's date at the start of the day (00:00:00)
      const today = DateTime.now().startOf("day");

      // Step 1: Expire outdated task.user.statuses

      // Fetch all tasks that have an `endDate` field that is not empty
      const tasks = await Task.find({ endDate: { $exists: true, $ne: [] } });

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
        }
      }

      // Step 2: Process Repeat Tasks

      // Fetch all repeat tasks from the database
      const repeatTasks = await RepeatTask.find({});
      // Counter for tracking how many tasks were created
      let createdCount = 0;

      // Iterate over each repeat task
      for (const repeatTask of repeatTasks) {
        // Skip if startDate or endDate is missing
        if (!repeatTask.startDate || !repeatTask.endDate) continue;

        // Convert startDate and endDate to Luxon DateTime and normalize
        const startDate = DateTime.fromJSDate(repeatTask.startDate).startOf("day");
        const endDate = DateTime.fromJSDate(repeatTask.endDate).endOf("day");

        // Skip if today's date is outside the repeat range
        if (today < startDate || today > endDate) continue;

        // Flag to determine whether we should create a new task today
        let shouldCreate = false;

        // Determine logic based on repeat interval
        switch (repeatTask.repeatInterval) {
          // For daily tasks, always create if in range
          case "daily":
            shouldCreate = true;
            break;

          // For weekly tasks, match today's weekday with repeatDay
          case "weekly":
            if (
              repeatTask.repeatDay !== null &&
              today.weekday === repeatTask.repeatDay
            ) {
              shouldCreate = true;
            }
            break;

          // For monthly tasks
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

          // Default fallback for unsupported types
          default:
            break;
        }

        // If we should create a task, do it and increment the counter
        if (shouldCreate) {
          await createTaskFromRepeat(repeatTask);
          createdCount++;
        }
      }

      // Log how many tasks were created from repeat logic
      console.log(`[AUTO SYNC] Created ${createdCount} new repeat tasks.`);
    } catch (error) {
      // Catch and log any errors that occurred during processing
      console.error("[AUTO SYNC ERROR]", error);
    }
  }
}
