import mongoose, { Schema, model, models, Model, Document } from "mongoose";

export interface ILead extends Document {
  _id: mongoose.Types.ObjectId;
  PartyName: string;
  Email: string;
  Phone: string;
  ContactPerson: string;
  Comments?: string;
  Project?: string;
  createdBy?: mongoose.Types.ObjectId;
  assigneeTo?: mongoose.Types.ObjectId;
  assignee: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  company: mongoose.Types.ObjectId;
}

const docSchema = new Schema<ILead>(
  {
    _id: {
      type: Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
    },
    PartyName: { type: String, required: true },
    Email: { type: String, required: true },
    Phone: { type: String, required: true },
    ContactPerson: { type: String, required: true },
    Comments: { type: String, default: "" },
    Project: { type: String, default: "" },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Registration",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    assigneeTo: { type: Schema.Types.ObjectId, ref: "User" },
    assignee: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const LeadModel: Model<ILead> =
  (models.Lead as Model<ILead>) || model<ILead>("Lead", docSchema);

export default LeadModel;
