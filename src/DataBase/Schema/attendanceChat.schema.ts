import mongoose, { Document, Schema, Types } from "mongoose";

export interface IAttendanceChatMessage {
  _id: Types.ObjectId;
  content?: string;
  date?: Date;
  files?: string[];
  user: Types.ObjectId;
  status?: string;
}

export interface IAttendanceChat extends Document {
  company: Types.ObjectId;
  messages: IAttendanceChatMessage[];
}

const MessageSchema = new Schema<IAttendanceChatMessage>(
  {
    _id: {
      type: Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
    },
    content: { type: String },
    date: { type: Date, default: Date.now },
    files: [{ type: String }],
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: { type: String },
  },
  { _id: true } 
);

const attendanceChatSchema = new Schema<IAttendanceChat>(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: "Registration",
    },
    messages: {
      type: [MessageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default (mongoose.models.AttendanceChat as mongoose.Model<IAttendanceChat>) ||
  mongoose.model<IAttendanceChat>("AttendanceChat", attendanceChatSchema);
