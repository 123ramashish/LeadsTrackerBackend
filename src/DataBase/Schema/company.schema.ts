import mongoose, { Document, Model, Schema } from 'mongoose';

export const COMPANY_TYPES = [
  'family',
  'clinic',
  'hospital',
  'healthcare',
  'college',
  'university',
  'school',
  'institute',
  'company',
  'other',
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number];

// ─── Document Interface ───────────────────────────────────────────────────────
export interface ICompany extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  type: CompanyType;
  contactEmail?: string;
  contactPhone: string;
  industry?: string;
  website?: string;
  address?: string;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICompanyModel extends Model<ICompany> {}

// ─── Schema ───────────────────────────────────────────────────────────────────
const companySchema = new Schema<ICompany, ICompanyModel>(
  {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
    },
    type: {
      type: String,
      enum: COMPANY_TYPES,
      required: [true, 'Company type is required'],
      lowercase: true,
    },
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    contactPhone: {
      type: String,
      required: [true, 'Contact phone is required'],
    },
    industry: { type: String, trim: true },
    website: { type: String, trim: true },
    address: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true }
);

// Unique: name + contactPhone combo
companySchema.index({ name: 1, contactPhone: 1 }, { unique: true });
companySchema.index({ isDeleted: 1, isActive: 1 });

const Company = mongoose.model<ICompany, ICompanyModel>('Company', companySchema);
export default Company;