import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import FeedbackController from "../controller/feedback.controller";

const feedbackRouter = Router();

// Get all feedbacks
feedbackRouter.get("/", authenticate, FeedbackController.getFeedbacks);

// Create feedback
feedbackRouter.post("/", authenticate, FeedbackController.createFeedback);

// Update feedback status
feedbackRouter.patch("/:id/status", authenticate, FeedbackController.updateStatus);

// Add comment/message
feedbackRouter.post("/:id/comments", authenticate, FeedbackController.addComment);

// Delete feedback
feedbackRouter.delete("/:id", authenticate, FeedbackController.deleteFeedback);

export default feedbackRouter;