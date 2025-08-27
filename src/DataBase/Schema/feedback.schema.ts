import mongoose, { Schema, Document } from "mongoose";

export interface IFeedback extends Document {
  title: string;
  description: string;
  status: string;
  user: mongoose.Types.ObjectId;
  company: {
    type: mongoose.Schema.Types.ObjectId;
    ref: "Registration";
  };
  comments: {
    user: mongoose.Types.ObjectId;
    message: string;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const FeedbackSchema = new Schema<IFeedback>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["yet-to-start", "in-progress", "completed", "cancelled", "paused"],
      default: "yet-to-start",
    },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    comments: [CommentSchema],
  },
  { versionKey: false, timestamps: true }
);

export default mongoose.model<IFeedback>("Feedback", FeedbackSchema);
