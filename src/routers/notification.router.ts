import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import NotificationController from "../controller/notification.controller";

const notificationRouter = Router();

// 📌 Create notification
notificationRouter.post("/", authenticate, NotificationController.createNotification);

// 📌 Get all notifications (both read and unread)
notificationRouter.get("/", authenticate, NotificationController.getAllNotifications);

// 📌 Get unread notifications
notificationRouter.get("/unread", authenticate, NotificationController.getUnreadNotifications);

// 📌 Get read notifications
notificationRouter.get("/read", authenticate, NotificationController.getReadNotifications);

// 📌 Get notification counts
notificationRouter.get("/count", authenticate, NotificationController.getNotificationCount);

// 📌 Get single notification by ID
notificationRouter.get("/:id", authenticate, NotificationController.getNotificationById);

// 📌 Mark notification as read
notificationRouter.put("/read", authenticate, NotificationController.markAsRead);

// 📌 Mark all notifications as read
notificationRouter.put("/read/all", authenticate, NotificationController.markAllAsRead);

// 📌 Update notification
notificationRouter.put("/:id", authenticate, NotificationController.updateNotification);

// 📌 Archive notification
notificationRouter.patch("/:id/archive", authenticate, NotificationController.archiveNotification);

// 📌 Delete notification
notificationRouter.delete("/:id", authenticate, NotificationController.deleteNotification);

export default notificationRouter;