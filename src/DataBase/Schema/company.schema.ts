import mongoose, { Document, Model, Schema } from 'mongoose';

export const COMPANY_TYPES = [
  'family', 'clinic', 'hospital', 'healthcare', 'college',
  'university', 'school', 'institute', 'company', 'other',
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

// ─── Google Sync Configuration Interface ─────────────────────────────────────
export interface GoogleSyncConfig {
  googlePlaceId?: string;
  googleApiKey?: string; // Store encrypted in production
  autoSync: boolean;
  syncThreshold: number; // Min rating 1-5 for auto-sync
  lastSyncedAt?: Date;
  totalPushed: number;
}

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
  
  // Google Reviews Integration
  googleSync?: GoogleSyncConfig;
  
  // Google Rating Cache (optional)
  googleRating?: {
    rating: number;
    reviewCount: number;
    lastFetched: Date;
  };
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
    
    // Google Reviews Integration
    googleSync: {
      googlePlaceId: { 
        type: String, 
        match: [/^ChIJ[a-zA-Z0-9_-]+$/, 'Invalid Google Place ID format'] 
      },
      googleApiKey: { type: String, select: false }, // Exclude from queries by default
      autoSync: { type: Boolean, default: false },
      syncThreshold: { type: Number, min: 1, max: 5, default: 4 },
      lastSyncedAt: Date,
      totalPushed: { type: Number, default: 0 },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    
    // Google Rating Cache
    googleRating: {
      rating: Number,
      reviewCount: Number,
      lastFetched: Date,
    },
  },
  { timestamps: true }
);

// Indexes
companySchema.index({ name: 1, contactPhone: 1 }, { unique: true });
companySchema.index({ isDeleted: 1, isActive: 1 });
companySchema.index({ 'googleSync.googlePlaceId': 1 }, { sparse: true });

// ─── Instance Methods ─────────────────────────────────────────────────────────
companySchema.methods.hasGoogleConfig = function(): boolean {
  return !!(this.googleSync?.googlePlaceId && this.googleSync?.googleApiKey);
};

companySchema.methods.canAutoSync = function(rating: number): boolean {
  return this.googleSync?.autoSync === true && rating >= (this.googleSync?.syncThreshold || 4);
};

// ─── Static Methods ───────────────────────────────────────────────────────────
companySchema.statics.findByGooglePlaceId = function(placeId: string) {
  return this.findOne({ 
    'googleSync.googlePlaceId': placeId, 
    isDeleted: false,
    isActive: true 
  });
};

const Company = mongoose.model<ICompany, ICompanyModel>('Company', companySchema);
export default Company;