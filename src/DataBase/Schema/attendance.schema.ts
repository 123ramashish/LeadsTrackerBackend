import mongoose, { Document, Schema } from "mongoose";

export interface IAttendance extends Document {
  user: mongoose.Types.ObjectId;
  punchIn?: Date;
  punchOut?: Date;
  punchInLocation?: string;
  punchOutLocation?: string;
  status?: "Present" | "Absent" | "On Leave";
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    _id: {
      type: Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    punchIn: Date,
    punchOut: Date,
    punchInLocation: String,
    punchOutLocation: String,
    status: {
      type: String,
      enum: ["Present", "Absent", "On Leave"],
    },
  },
  { timestamps: true }
);

export default mongoose.models.Attendance ||
  mongoose.model<IAttendance>("Attendance", attendanceSchema);
