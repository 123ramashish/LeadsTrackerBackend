import mongoose, { Schema, Document } from "mongoose";

export interface ISubscription extends Document {
  endpoint: string;
  expirationTime?: Date | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  user?: mongoose.Types.ObjectId;
  company?: mongoose.Types.ObjectId;
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema: Schema = new Schema<ISubscription>(
  {
    endpoint: { type: String, required: true, unique: true },
    expirationTime: { type: Date, default: null },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    company: { type: Schema.Types.ObjectId, ref: "Registration" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

export default mongoose.models.Subscription ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);
