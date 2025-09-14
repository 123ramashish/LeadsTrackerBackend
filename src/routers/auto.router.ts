import cron from "node-cron";
import AutoController from "../controller/auto.controller";


// Run createTaskFromRepeatTask every day at 9:00 AM
cron.schedule("0 9 * * *", async () => {
  console.log("[AUTO CRON] Running createTaskFromRepeatTask...");
  try {
    await AutoController.runAutoRepeatTaskCreation();
  } catch (err) {
    console.error("Error in createTaskFromRepeatTask:", err);
  }
});

// Run changeExpiredTaskStatus every day at 9:01 AM
cron.schedule("1 9 * * *", async () => {
  console.log("[AUTO CRON] Running changeExpiredTaskStatus...");
  try {
    await AutoController.runAutoStatusUpdate();
  } catch (err) {
    console.error("Error in changeExpiredTaskStatus:", err);
  }
});

// Run sendNotification every day at 9:02 AM
// cron.schedule("2 9 * * *", async () => {
//   console.log("[AUTO CRON] Running sendNotification...");
//   try {
//     await AutoController.sendNotification();
//   } catch (err) {
//     console.error("Error in sendNotification:", err);
//   }
// });
