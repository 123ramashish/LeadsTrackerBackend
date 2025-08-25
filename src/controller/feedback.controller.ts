import { Request, Response } from "express";
import mongoose from "mongoose";
import Feedback from "../DataBase/Schema/feedback.schema";

interface AuthRequest extends Request {
  user?: { sub: string; email: string; role: string,company:string };
}

export default class FeedbackController {
  // ✅ Get all feedbacks
  static async getFeedbacks(req: AuthRequest, res: Response) {
    try {
      const feedbacks = await Feedback.find()
        .populate("user", "name email")
        .populate("comments.user", "name email");
      res.json(feedbacks);
    } catch (error: any) {
      res.status(500).json({
        message: "Error fetching feedbacks",
        error: error.message,
      });
    }
  }

  // ✅ Create Feedback
  static async createFeedback(req: AuthRequest, res: Response) {
    try {
      const { user } = req;
      const { title, description } = req.body;
      if (!title || !description) {
        return res.status(400).json({
          message: "Title and description required",
        });
      }

      const feedback = await Feedback.create({
        title,
        description,
        user: new mongoose.Types.ObjectId(req.user?.sub),
        company:user?.company
      });

      const populated = await feedback.populate("user", "name email");

      res.status(201).json({
        feedback: populated,
        message: "Feedback created!",
      });
    } catch (error: any) {
      res.status(500).json({
        message: "Error creating feedback",
        error: error.message,
      });
    }
  }

  // ✅ Update Feedback Status
  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      const feedback = await Feedback.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      )
        .populate("user", "name email")
        .populate("comments.user", "name email");

      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      res.json({
        feedback,
        message: "Status updated!",
      });
    } catch (error: any) {
      res.status(500).json({
        message: "Error updating status",
        error: error.message,
      });
    }
  }

  // ✅ Add Comment / Message
  static async addComment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { comment } = req.body;
      console.log("body", id, comment.comment);
      if (!comment) {
        return res.status(400).json({ message: "Message required" });
      }

      const feedback: any = await Feedback.findById(id);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      feedback.comments.push({
        user: new mongoose.Types.ObjectId(req.user?.sub),
        message:comment,
      });

      const savedFeedback = await feedback.save();
      const populated = await savedFeedback.populate([
        { path: "user", select: "name email" },
        { path: "comments.user", select: "name email" },
      ]);

      res.json({
        feedback: populated,
        message: "Comment added!",
      });
    } catch (error: any) {
      res.status(500).json({
        message: "Error adding comment",
        error: error.message,
      });
    }
  }

  // ✅ Delete feedback
  static async deleteFeedback(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const feedback = await Feedback.findByIdAndDelete(id);

      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      res.json({ message: "Feedback deleted successfully" });
    } catch (error: any) {
      res.status(500).json({
        message: "Error deleting feedback",
        error: error.message,
      });
    }
  }
}
