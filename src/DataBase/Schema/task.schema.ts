import mongoose from "mongoose";
import { Schema } from "mongoose";

// EstimatedTime Sub-schema
const EstimatedTimeSchema = new Schema(
  {
    unit: {
      type: String,
      enum: ["Minutes", "Hours", "Days"],
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

// StatusHistoryEntry Sub-schema
const StatusHistoryEntrySchema = new Schema(
  {
    status: {
      type: String,
      enum: [
        "not assignee",
        "assignee",
        "in progress",
        "pause",
        "completed",
        "expired",
        "cancel",
      ],
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    address: String,
  },
  { _id: false }
);

// Comment Sub-schema
const CommentSchema = new Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: Date,
    message: String,
    files: [String],
    workingLocation: String,
  },
  { _id: false }
);

// TimeSpent Sub-schema
const TimeSpentSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    time: [Number], // Array of time entries in minutes
  },
  { _id: false }
);

// UserEstimatedTime Sub-schema
const UserEstimatedTimeSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    estimatedTime: {
      type: EstimatedTimeSchema,
      required: true,
    },
  },
  { _id: false }
);

// ActionEvent Sub-schema
const ActionEventSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    actionOn: String,
    actionType: String,
    actionDate: Date,
    actionDetails: String,
    actionLocation: String,
  },
  { _id: false }
);

// Evaluation Sub-schema (for reward/punishment)
const EvaluationSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    type: {
      type: String,
      enum: ["Rewarded", "Punished"],
    },
    amount: Number,
  },
  { _id: false }
);

// Status Sub-schema (per user status)
const UserStatusSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: String,
  },
  { _id: false }
);

// DueDate Sub-schema (user-specific due dates)
const DueDateSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    date: [Date], // Array of dates for the user
  },
  { _id: false }
);

// Acceptance Sub-schema (task acceptance tracking)
const AcceptanceSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: Boolean,
  },
  { _id: false }
);

const TaskSchema = new Schema(
  {
    taskTitle: {
      type: String,
      required: true,
      trim: true,
    },
    taskDate: {
      type: Date,
      required: true,
    },
    taskDescription: {
      type: String,
      required: true,
      trim: true,
    },
    estimatedTime: {
      type: EstimatedTimeSchema,
      required: true,
    },
    entryTime: {
      type: EstimatedTimeSchema,
    },
    noOfEntry: Number,
    entryDone: Number,
    assignee: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    userEstimatedTime: [UserEstimatedTimeSchema],
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      required: true,
    },
    evaluation: [EvaluationSchema],
    status: [UserStatusSchema],
    statusHistory: [StatusHistoryEntrySchema],
    time_spent: [TimeSpentSchema],

    location: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    dueDate: [DueDateSchema],
    startDate: [{ user: mongoose.Schema.Types.ObjectId, date: Date }],
    endDate: [{ user: mongoose.Schema.Types.ObjectId, date: Date }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    company: mongoose.Schema.Types.ObjectId,
    tags: [String],
    comments: [CommentSchema],
    approval: Boolean,
    notes: String,
    individualBucket: [
      {
        user: mongoose.Schema.Types.ObjectId,
        individual: {
          type: Boolean,
          default: false,
        },
      },
    ],
    companyBucket: {
      type: Boolean,
      default: false,
    },
    taskType: String,
    Accept: [AcceptanceSchema],
    repeatTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepeatingTask",
    },
    actionEvents: [ActionEventSchema],
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Create the Task model
const Task = mongoose.model("Task", TaskSchema);

export default Task;
