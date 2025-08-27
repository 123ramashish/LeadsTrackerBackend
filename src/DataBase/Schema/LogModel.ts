import mongoose, { Schema, model, models, Document, Model } from "mongoose";

export interface ILog extends Document {
  _id: mongoose.Types.ObjectId;
  errorName?: string;
  errorDescription?: string;
  code?: string;
  createdAt: string;
  other?: string;
}

const logSchema = new Schema<ILog>({
  _id: {
    type: Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  errorName: { type: String },
  errorDescription: { type: String },
  code: { type: String },
  createdAt: {
    type: String,
    default: () => new Date().toLocaleString("en-GB"), 
  },
  other: { type: String },
});

const Log: Model<ILog> =
  (models.Log as Model<ILog>) || model<ILog>("Log", logSchema);

export default Log;
