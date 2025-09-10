import cron from "node-cron";
import AutoController from "../controller/auto.controller";

const autoController = new AutoController();

// Run createTaskFromRepeatTask every hour at :00
cron.schedule("0 * * * *", async () => {
  console.log("[AUTO CRON] Running createTaskFromRepeatTask...");
//   try {
//     await autoController.createTaskFromRepeatTask();
//   } catch (err) {
//     console.error("Error in createTaskFromRepeatTask:", err);
//   }
});

// Run changeExpiredTaskStatus every hour at :01 (1 min later)
cron.schedule("1 * * * *", async () => {
  console.log("[AUTO CRON] Running changeExpiredTaskStatus...");
//   try {
//     await autoController.changeExpiredTaskStatus();
//   } catch (err) {
//     console.error("Error in changeExpiredTaskStatus:", err);
//   }
});

// Run sendNotification every hour at :02 (2 min later)
cron.schedule("2 * * * *", async () => {
  console.log("[AUTO CRON] Running sendNotification...");
//   try {
//     await autoController.sendNotification();
//   } catch (err) {
//     console.error("Error in sendNotification:", err);
//   }
});
