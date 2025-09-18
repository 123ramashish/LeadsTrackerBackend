import cron from "node-cron";
import AutoController from "../controller/auto.controller";
import { DateTime } from "luxon";


// Run createTaskFromRepeatTask every day at 9:00 AM
cron.schedule("9 * * * *", async () => {
  console.log("[AUTO CRON] Running createTaskFromRepeatTask...");
  try {
    await AutoController.runAutoRepeatTaskCreation();
  } catch (err) {
    console.error("Error in createTaskFromRepeatTask:", err);
  }
});

// Run changeExpiredTaskStatus every day at 9:05 AM
cron.schedule("9 *  * * *", async () => {
  console.log("[AUTO CRON] Running changeExpiredTaskStatus...");
  try {
    await AutoController.runAutoStatusUpdate();

  } catch (err) {
    console.error("Error in changeExpiredTaskStatus:", err);
  }
});

