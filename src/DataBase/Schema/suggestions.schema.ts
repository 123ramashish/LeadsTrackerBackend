import mongoose from "mongoose";

const suggestionSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  title: { type: String, required: [true, "Title required!"] },
  suggestion: { type: String, required: [true, "Suggestion required!"] },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Users",
    required: [true, "Please login user details not found!"],
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Registration",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
    },
  ],
  rewards: String,
  status: String,
  comments: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
      content: { type: String },
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

// ✅ Prevents model overwrite in Next.js / hot reload
const Suggestion =
  mongoose.models.Suggestion || mongoose.model("Suggestion", suggestionSchema);

export default Suggestion;
