import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import NotificationController from "../controller/notification.controller";

const notificationRouter = Router();

notificationRouter.post("/", authenticate, NotificationController.createNotification);
notificationRouter.get("/unread", authenticate, NotificationController.getUnreadNotifications);
notificationRouter.get("/read", authenticate, NotificationController.getReadNotifications);
notificationRouter.put("/read", authenticate, NotificationController.markAsRead);

export default notificationRouter;
