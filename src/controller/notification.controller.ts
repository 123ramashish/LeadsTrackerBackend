import { Request, Response } from "express";
import Notification from "../DataBase/Schema/notification.schema";
import mongoose from "mongoose";
import ErrorLog from "../helper/ErrorLog";

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    company: string;
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
      const user = req.user;
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
      await ErrorLog("Get Unread Notifications Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Get Read Notifications
  static async getReadNotifications(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const notifications = await Notification.find({
        $and: [
          { createFor: { $in: [user.sub] } },
          { read: { $in: [user.sub] } },
        ],
      })
        .sort({ _id: -1 })
        .lean();

      return res.json({ message: "success", data: { notifications } });
    } catch (error: any) {
      await ErrorLog("Get Read Notifications Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Get All Notifications (both read and unread)
  static async getAllNotifications(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const notifications = await Notification.find({
        createFor: { $in: [user.sub] },
      })
        .sort({ _id: -1 })
        .lean();

      return res.json({ message: "success", data: { notifications } });
    } catch (error: any) {
      await ErrorLog("Get All Notifications Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Get Single Notification by ID
  static async getNotificationById(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      const { id } = req.params;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const notification = await Notification.findOne({
        _id: id,
        createFor: { $in: [user.sub] },
      }).lean();

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      return res.json({ message: "success", data: notification });
    } catch (error: any) {
      await ErrorLog("Get Notification By ID Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Mark Notification as Read
  static async markAsRead(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      const { id } = req.body;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!id) {
        return res.status(400).json({ message: "Notification ID required" });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const notification = await Notification.findOneAndUpdate(
        { 
          _id: id,
          createFor: { $in: [user.sub] },
          read: { $nin: [user.sub] } // Only update if not already read
        },
        {
          $push: { read: user.sub },
        },
        { new: true }
      );

      if (!notification) {
        return res.status(404).json({ message: "Notification not found or already read" });
      }

      return res.json({ 
        message: "Notification has been marked read successfully.",
        data: notification 
      });
    } catch (error: any) {
      await ErrorLog("Mark Notification Read Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Archive Notification
  static async archiveNotification(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      const { id } = req.params;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const notification = await Notification.findOneAndUpdate(
        { 
          _id: id,
          createFor: { $in: [user.sub] }
        },
        {
          $set: { archived: true },
          $push: { read: user.sub } // Also mark as read when archiving
        },
        { new: true }
      );

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      return res.json({ 
        message: "Notification archived successfully",
        data: notification 
      });
    } catch (error: any) {
      await ErrorLog("Archive Notification Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Delete Notification
  static async deleteNotification(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      const { id } = req.params;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      const notification = await Notification.findOneAndDelete({
        _id: id,
        createFor: { $in: [user.sub] }
      });

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      return res.json({ message: "Notification deleted successfully" });
    } catch (error: any) {
      await ErrorLog("Delete Notification Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Update Notification
  static async updateNotification(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      const { id } = req.params;
      const updateData = req.body;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      // Remove fields that shouldn't be updated directly
      delete updateData._id;
      delete updateData.createFor;
      delete updateData.createAt;

      const notification = await Notification.findOneAndUpdate(
        { 
          _id: id,
          createFor: { $in: [user.sub] }
        },
        { $set: updateData },
        { new: true }
      );

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      return res.json({ 
        message: "Notification updated successfully",
        data: notification 
      });
    } catch (error: any) {
      await ErrorLog("Update Notification Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Get Notification Count
  static async getNotificationCount(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [unreadCount, readCount, totalCount] = await Promise.all([
        Notification.countDocuments({
          $and: [
            { createFor: { $in: [user.sub] } },
            { read: { $nin: [user.sub] } },
          ],
        }),
        Notification.countDocuments({
          $and: [
            { createFor: { $in: [user.sub] } },
            { read: { $in: [user.sub] } },
          ],
        }),
        Notification.countDocuments({
          createFor: { $in: [user.sub] },
        })
      ]);

      return res.json({
        message: "success",
        data: {
          unread: unreadCount,
          read: readCount,
          total: totalCount
        }
      });
    } catch (error: any) {
      await ErrorLog("Get Notification Count Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }

  // ✅ Mark All as Read
  static async markAllAsRead(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const result = await Notification.updateMany(
        {
          $and: [
            { createFor: { $in: [user.sub] } },
            { read: { $nin: [user.sub] } },
          ],
        },
        {
          $push: { read: user.sub },
        }
      );

      return res.json({ 
        message: "All notifications marked as read successfully",
        data: { modifiedCount: result.modifiedCount }
      });
    } catch (error: any) {
      await ErrorLog("Mark All Read Error", error);
      return res.status(500).json({ message: error?.message });
    }
  }
}