import mongoose, { Schema, Document } from "mongoose";

export interface IGoal extends Document {
  title: string;
  description: string;
  status: string;
  endDate: Date;
  user: mongoose.Types.ObjectId;
  company: mongoose.Types.ObjectId;
  category?: string;
}

const GoalSchema: Schema = new Schema<IGoal>(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [100, "Title must be at most 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [5, "Description must be at least 5 characters"],
      maxlength: [500, "Description must be at most 500 characters"],
    },
    category: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      required: [true, "Status is required"],
      enum: ["pending", "in-progress", "completed"],
      default: "pending",
    },
    endDate: {
      type: Date,
      required: [true, "Target date is required"],
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Registration",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IGoal>("Goal", GoalSchema);
