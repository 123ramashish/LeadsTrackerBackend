import { Request, Response } from "express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import Suggestion from "../DataBase/Schema/suggestions.schema";

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    company:string;
  };
}

export default class SuggestionController {
  /**
   * Get Suggestions
   */
  static async getSuggestions(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res
          .status(401)
          .json({ message: "Unauthorized for getting suggestions" });
      }

      const { search, hasComments, selectedUser, fromDate, toDate, sortBy } =
        req.query as {
          search?: string;
          hasComments?: string;
          selectedUser?: string;
          fromDate?: string;
          toDate?: string;
          sortBy?: string;
        };

      const localTimeZone = DateTime.local().zoneName;

      const matchQuery: any = {};

      if (search) {
        matchQuery["$or"] = [
          { title: { $regex: search, $options: "i" } },
          { suggestion: { $regex: search, $options: "i" } },
        ];
      }

      if (hasComments === "yes") {
        matchQuery["comments.0"] = { $exists: true };
      }

      if (fromDate && toDate) {
        matchQuery.createdAt = {
          $gte: DateTime.fromISO(fromDate, { zone: localTimeZone })
            .startOf("day")
            .toJSDate(),
          $lte: DateTime.fromISO(toDate, { zone: localTimeZone })
            .endOf("day")
            .toJSDate(),
        };
      }

      if (selectedUser && mongoose.Types.ObjectId.isValid(selectedUser)) {
        matchQuery["createdBy"] = new mongoose.Types.ObjectId(selectedUser);
      }

      let sortStage: Record<string, 1 | -1> = { createdAt: -1 };
      let addFieldsStage = null;

      switch (sortBy) {
        case "createdAtAsc":
          sortStage = { createdAt: 1 };
          break;
        case "likes":
          addFieldsStage = { likesCount: { $size: "$likes" } };
          sortStage = { likesCount: -1 };
          break;
        case "comments":
          addFieldsStage = { commentsCount: { $size: "$comments" } };
          sortStage = { commentsCount: -1 };
          break;
      }

      const pipeline: mongoose.PipelineStage[] = [
        { $match: matchQuery },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdBy",
          },
        },
        { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
        ...(addFieldsStage ? [{ $addFields: addFieldsStage }] : []),
        {
          $project: {
            title: 1,
            suggestion: 1,
            status: 1,
            createdAt: 1,
            likes: 1,
            comments: 1,
            ...(sortBy === "likes" ? { likesCount: 1 } : {}),
            ...(sortBy === "comments" ? { commentsCount: 1 } : {}),
            createdBy: {
              _id: "$createdBy._id",
              name: "$createdBy.name",
              role: "$createdBy.role",
              phone: "$createdBy.phone",
            },
          },
        },
        { $sort: sortStage },
      ];

      const suggestions = await Suggestion.aggregate(pipeline);

      return res.status(200).json({ data: suggestions });
    } catch (error: any) {
      return res
        .status(500)
        .json({ message: error.message || "Something went wrong" });
    }
  }

  /**
   * Create Suggestion
   */
  static async createSuggestion(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res
          .status(401)
          .json({ message: "User not found! Please login." });
      }

      const localTimeZone = DateTime.local().zoneName;
      const { title, suggestion } = req.body;
      const newSuggestion = new Suggestion({
        title,
        suggestion,
        createdBy: new mongoose.Types.ObjectId(user.sub),
        status: "in progress",
        createdAt: DateTime.now().setZone(localTimeZone).toJSDate(),
        company:user.company
      });

      await newSuggestion.save();

      return res.status(201).json({
        message: "Suggestion created successfully",
        data: newSuggestion,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * Like / Unlike Suggestion
   */
  static async updateSuggestionLike(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const { documentId } = req.body;

      if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
        return res.status(400).json({ message: "Invalid documentId" });
      }

      const suggestion = await Suggestion.findById(documentId);
      if (!suggestion) {
        return res.status(404).json({ message: "Suggestion not found" });
      }

      const userId = new mongoose.Types.ObjectId(user?.sub);
      const hasLiked = suggestion.likes.some((id: any) => id.equals(userId));

      if (hasLiked) {
        suggestion.likes = suggestion.likes.filter(
          (id: any) => !id.equals(userId)
        );
      } else {
        suggestion.likes.push(userId);
      }

      await suggestion.save();

      return res.status(200).json({
        message: hasLiked ? "You removed your like." : "Thanks for liking!",
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * Admin Update Suggestion
   */
  static async updateSuggestionAdmin(req: AuthRequest, res: Response) {
    try {
      const { documentId, reward, process } = req.body;

      if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const suggestion = await Suggestion.findById(documentId);
      if (!suggestion) {
        return res.status(404).json({ message: "Suggestion not found" });
      }

      if (reward && process) {
        return res.status(400).json({
          message: "Only one of reward or process can be updated at a time",
        });
      }

      if (!reward && !process) {
        return res.status(400).json({ message: "Nothing to update" });
      }

      if (reward) suggestion.rewards = reward;
      if (process) suggestion.status = process;

      await suggestion.save();

      return res.status(200).json({
        message: "Suggestion updated successfully",
        data: suggestion,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * Update suggestion (edit content/status)
   */
  static async updateSuggestion(req: AuthRequest, res: Response) {
    try {
      const { documentId, title, suggestion, status } = req.body;

      if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
        return res.status(400).json({ message: "Invalid documentId" });
      }

      const updated = await Suggestion.findByIdAndUpdate(
        documentId,
        { $set: { title, suggestion, status } },
        { new: true }
      );

      return res.status(200).json({
        message: "Suggestion updated successfully",
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * Delete Suggestion
   */
  static async deleteSuggestion(req: AuthRequest, res: Response) {
    try {
      const { documentId } = req.body;
      if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
        return res.status(400).json({ message: "Invalid documentId" });
      }

      await Suggestion.findByIdAndDelete(documentId);

      return res
        .status(200)
        .json({ message: "Suggestion deleted successfully" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * Get Comments for a Suggestion
   */
  static async getCommentsSuggestions(req: AuthRequest, res: Response) {
    try {
      const { id } = req.query;
      if (!id || !mongoose.Types.ObjectId.isValid(id as string)) {
        return res.status(400).json({ message: "Invalid suggestion ID" });
      }

      const suggestion = await Suggestion.findById(id).populate(
        "comments.user",
        "_id name role"
      );
      if (!suggestion) {
        return res.status(404).json({ message: "Suggestion not found" });
      }

      return res.status(200).json({ data: suggestion.comments });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * Add Comment to Suggestion
   */
  static async addCommentSuggestions(req: AuthRequest, res: Response) {
    try {
      const { documentId, comment, userId } = req.body;
      const user = req.user;
      if (!documentId || !comment) {
        return res.status(400).json({ message: "Missing data" });
      }

      const suggestion = await Suggestion.findById(documentId);
      if (!suggestion) {
        return res.status(404).json({ message: "Suggestion not found" });
      }

      const newComment = {
        user: new mongoose.Types.ObjectId(user?.sub),
        content: comment,
        createdAt: new Date(),
      };

      suggestion.comments.push(newComment);
      await suggestion.save();

      return res.status(201).json({
        message: "Comment added successfully",
        data: newComment,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * Update a Comment
   */
  static async updateCommentSuggestions(req: AuthRequest, res: Response) {
    try {
      const { suggestionId, commentId, content } = req.body;

      const suggestion = await Suggestion.findById(suggestionId);
      if (!suggestion) {
        return res.status(404).json({ message: "Suggestion not found" });
      }

      const comment = suggestion.comments.id(commentId);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      comment.content = content;
      await suggestion.save();

      return res.status(200).json({
        message: "Comment updated successfully",
        data: comment,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }
}
