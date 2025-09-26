import * as dotenv from "dotenv";
dotenv.config();
import { Request, Response } from "express";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import ImageKit from "imagekit";
import leaveSchema from "../DataBase/Schema/leave.schema";
import User from "../DataBase/Schema/user.schema";

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY as string,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY as string,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT as string,
});

const localTimeZone = DateTime.local().zoneName;

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    company: string;
  };
}

function toZonedDate(d: string | Date) {
  if (d instanceof Date) return d;
  return DateTime.fromISO(String(d)).setZone(localTimeZone).toJSDate();
}

export default class LeaveController {
  static async createLeave(req: AuthRequest, res: Response) {
    try {
      const { user } = req;

      if (!user || !user.sub) {
        return res
          .status(401)
          .json({ message: "User authentication required" });
      }

      const body = req.body as {
        leaveType?: string;
        startDate?: string;
        endDate?: string;
        reason?: string;
      };
      console.log("body", req.body);
      if (!body.leaveType || !body.startDate || !body.endDate) {
        return res
          .status(400)
          .json({
            message: "Leave Type, start date, and end date are required",
          });
      }

      const leave = new leaveSchema({
        reason: body.reason,
        leaveType: body.leaveType,
        status: "Pending",
        startDate: toZonedDate(body.startDate),
        endDate: toZonedDate(body.endDate),
        user: user.sub,
        company: user?.company,
      });

      await leave.save();

      return res.status(201).json({
        message: "Leave created successfully",
        data: leave,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ message: error?.message || "Failed to create leave" });
    }
  }

  static async updateLeave(req: AuthRequest, res: Response) {
    try {
      const { user } = req;
      if (!user || !user.sub) {
        return res
          .status(401)
          .json({ message: "User authentication required" });
      }

      const id = (req.query.id as string) || (req.body?.id as string);
      if (!id) {
        return res.status(400).json({ message: "Id is missing in Params" });
      }

      const body = req.body as { status?: string };

      if (body.status === "delete") {
        const leave = await leaveSchema.findByIdAndDelete(id);
        return res.status(200).json({
          message: "Leave deleted successfully",
          data: leave,
        });
      }

      const updatedLeave = await leaveSchema.findByIdAndUpdate(
        id,
        {
          status: body.status,
          updatedAt: DateTime.now().setZone(localTimeZone).toJSDate(),
        },
        { new: true }
      );
      console.log("updatedLeave", updatedLeave);
      if (!updatedLeave) {
        return res.status(404).json({ message: "Leave not found" });
      }

      return res.status(200).json({
        message: "Leave updated successfully",
        data: updatedLeave,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ message: error?.message || "Failed to update leave" });
    }
  }

  static async getLeaves(req: AuthRequest, res: Response) {
    try {
      const { user } = req;
      if (!user || !user.sub) {
        return res
          .status(401)
          .json({ message: "User authentication required" });
      }

      const statusFilter = (req.query.status as string) ?? undefined;
      const searchQuery = (req.query.search as string) ?? undefined;
      const users = req.query.users 

      const query: any = {};
      if (user.role === "staff") {
        query.user = user.sub;
      } else {
        query.user = users
      }
      console.log("user", users,statusFilter)
      if (statusFilter && statusFilter !== "All") {
        query.status = statusFilter;
      }

      if (typeof searchQuery !== "undefined") {
        query.leaveType = { $regex: searchQuery, $options: "i" };
      }

      query.$or = [{ roster: { $ne: true } }, { roster: { $exists: false } }];

      const leaves = await leaveSchema
        .find(query)
        .populate([{ path: "user", model: User }])
        .populate([{ path: "remarks.createdBy", model: User }])
        .sort({ createAt: -1 })
        .lean();

      return res.status(200).json({
        message: "Leave fetched successfully",
        data: leaves,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ message: error?.message || "Failed to fetch leaves" });
    }
  }

  static async uploadHRM(req: Request, res: Response) {
    try {
      const clientData = req.body?.ClientData as string;
      if (!clientData) {
        return res.status(400).json({ message: "Form Data Get Error" });
      }

      const files = (req as any).files as Express.Multer.File[] | undefined;

      if (files && files.length > 0) {
        await Promise.all(
          files.map(async (file) => {
            await imagekit.upload({
              file: file.buffer,
              fileName: file.originalname,
              folder: "HRM",
            });
          })
        );
      }

      return res.status(200).json({ message: "Upload successfully" });
    } catch (error: any) {
      return res.status(500).json({ message: error?.message });
    }
  }

  static async getLeaveFiles(_req: Request, res: Response) {
    try {
      const files = await imagekit.listFiles({ path: "/HRM" });
      return res.status(200).json({
        message: "Fetch Image Data successfully",
        data: files,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error?.message });
    }
  }

  static async commentLeave(req: AuthRequest, res: Response) {
    try {
      const { user } = req;
      if (!user || !user.sub) {
        return res
          .status(401)
          .json({ message: "User authentication required" });
      }

      const id = (req.body?.id as string) ?? undefined;
      const newComment = (req.body?.newComment as string) ?? undefined;

      if (!id) {
        return res.status(400).json({ message: "Id is missing in Params" });
      }
      if (!newComment) {
        return res
          .status(400)
          .json({ message: "Payload is missing or invalid" });
      }

      let uploadUrl: string | undefined;
      const files = (req as any).files as Express.Multer.File[] | undefined;

      if (files && files.length > 0) {
        const first = files[0];
        const uploaded = await imagekit.upload({
          file: first.buffer,
          fileName: first.originalname,
          folder: "Leave",
        });
        uploadUrl = uploaded?.url;
      }

      const updatedLeave = await leaveSchema.findByIdAndUpdate(
        id,
        {
          $push: {
            remarks: {
              message: newComment,
              image: uploadUrl,
              createdBy: new mongoose.Types.ObjectId(user.sub),
              createAt: DateTime.now().setZone(localTimeZone).toJSDate(),
            },
          },
          updatedAt: DateTime.now().setZone(localTimeZone).toJSDate(),
        },
        { new: true }
      );

      if (!updatedLeave) {
        return res.status(404).json({ message: "Leave not found" });
      }

      return res.status(200).json({
        message: "Leave updated successfully",
        data: updatedLeave,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error?.message });
    }
  }
}
