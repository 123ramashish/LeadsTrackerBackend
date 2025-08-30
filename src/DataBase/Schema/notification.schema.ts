import mongoose, { Schema, model, models, Document, Model } from "mongoose";

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  title?: string;
  description?: string;
  createFor: mongoose.Types.ObjectId[];
  read: mongoose.Types.ObjectId[];
  createdAt: Date;
}

// Schema definition
const notificationSchema = new Schema<INotification>(
  {
    _id: {
      type: Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
    },
    title: { type: String },
    description: { type: String },
    createFor: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    read: [
      {
        type: Schema.Types.ObjectId,
      },
    ],
    
  },
  { timestamps: false } 
);

const Notification: Model<INotification> =
  (models.Notification as Model<INotification>) ||
  model<INotification>("Notification", notificationSchema);

export default Notification;
