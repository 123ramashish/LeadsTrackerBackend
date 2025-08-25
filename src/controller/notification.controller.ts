import { Request, Response } from "express";
import Notification from "../DataBase/Schema/notification.schema";
import mongoose from "mongoose";
import ErrorLog from "../helper/ErrorLog";
interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    company:string;
  };
}
export default class NotificationController {
  // ✅ Create Notification
  
  static async createNotification(req: Request, res: Response): Promise<Response> {
    try {
      const { createFor, description, title } = req.body;

      if (!createFor || !description || !title) {
        await ErrorLog(
          "Notification Creating",
          new Error(`Missing Fields -> createFor:${createFor}, description:${description}, title:${title}`)
        );
        return res.status(400).json({ message: "All fields are required" });
      }

      const notification = await Notification.create({
        createFor,
        description,
        title,
      });

      return res.status(201).json({
        message: "Notification created successfully",
        data: notification,
      });
    } catch (error: any) {
      await ErrorLog("Notification Create Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Get Unread Notifications
  static async getUnreadNotifications(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user 

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const notifications = await Notification.find({
        $and: [
          { createFor: { $in: [user.sub] } },
          { read: { $nin: [user.sub] } },
        ],
      })
        .sort({ _id: -1 })
        .lean();

      return res.json({ message: "success", data: { notifications } });
    } catch (error: any) {
      await ErrorLog("Get Notifications Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Get Read Notifications
  static async getReadNotifications(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user 

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const notifications = await Notification.find({
        $and: [
          { createFor: { $in: [user.sub] } },
          { read: { $in: [user.sub] } },
        ],
      }).lean();

      return res.json({ message: "success", data: { notifications } });
    } catch (error: any) {
      await ErrorLog("Get Read Notifications Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Mark Notification as Read
  static async markAsRead(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user 
      const { id } = req.body;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!id) {
        return res.status(400).json({ message: "Notification ID required" });
      }

      await Notification.findByIdAndUpdate(id, {
        $push: { read: user.sub },
      });

      return res.json({ message: "Notification has been marked read successfully." });
    } catch (error: any) {
      await ErrorLog("Mark Notification Read Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }
}
