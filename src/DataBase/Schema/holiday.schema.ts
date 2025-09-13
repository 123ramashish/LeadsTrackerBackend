// models/Holiday.js
import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    type:String,
    isRecurring: {
      type: Boolean,
      default: false, // yearly recurring
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Registration", // optional: if holiday tied to company
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.models.Holiday ||
  mongoose.model("Holiday", holidaySchema);
