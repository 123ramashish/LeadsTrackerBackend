import mongoose from "mongoose";
const leaveSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  startTime: String,
  endTime: String,
  leaveType: {
    type: String,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  roster: {
    type: Boolean,
    default: false,
  },
  file: [String],
  status: {
    type: String,
    default: "Pending",
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Registration",
  },
  remarks: [
    {
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      image: String,
      createAt: Date,
      message: String,
    },
  ],
}, { timestamps: true });
export default mongoose.models.Leave || mongoose.model("Leave", leaveSchema);
