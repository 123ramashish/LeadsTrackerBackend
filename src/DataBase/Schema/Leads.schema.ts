import mongoose, { Schema, Document, Model } from 'mongoose';

// Enums for type safety
export enum LeadStatus {
  CREATED = 'created',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  PROPOSAL_SENT = 'proposal_sent',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
  FOLLOW_UP = 'follow_up'
}

export enum LeadType {
  LEAD = 'lead',
  PROSPECT = 'prospect',
  CLIENT = 'client',
  CUSTOMER = 'customer'
}

export enum LeadSource {
  WEBSITE = 'website',
  REFERRAL = 'referral',
  SOCIAL_MEDIA = 'social_media',
  EMAIL_CAMPAIGN = 'email_campaign',
  COLD_CALL = 'cold_call',
  PAID_ADS = 'paid_ads',
  TRADE_SHOW = 'trade_show',
  OTHER = 'other'
}

export enum LeadPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Interface for Lead document
export interface ILead extends Document {
  // Basic Information
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  googleMapUrl?: string;
  whatsapp?: string;
  
  // Lead Classification
  status: LeadStatus;
  type: LeadType;
  source: LeadSource;
  priority: LeadPriority;
  isFavorite: boolean;
  
  // Lead Scoring & Value
  score: number; // 0-100 lead score
  estimatedValue?: number;
  actualValue?: number;
  
  // Assignment & Ownership
  assignedTo?: mongoose.Types.ObjectId;
  company: mongoose.Types.ObjectId;
  
  // Tracking Timestamps
  statusUpdatedAt?: Date;
  lastContacted?: Date;
  lastActivityAt?: Date;
  nextFollowUp?: Date;
  convertedAt?: Date;
  lostAt?: Date;
  
  // User Tracking
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  deletedBy?: mongoose.Types.ObjectId;
  deletedAt?: Date;
  isDeleted: boolean;
  
  // Engagement Metrics
  totalInteractions: number;
  emailsSent: number;
  callsMade: number;
  meetingsHeld: number;
  
  // Additional Data
  tags: string[];
  customFields?: Map<string, any>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Virtual properties
  isActive: boolean;
  daysSinceCreated: number;
  daysSinceLastContact: number;
}

// Lead Schema
const leadSchema = new Schema<ILead>(
  {
    // ===== BASIC INFORMATION =====
    name: {
      type: String,
      required: [true, 'Lead name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
      index: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      maxlength: [254, 'Email cannot exceed 254 characters'],
      sparse: true
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, 'Phone number cannot exceed 30 characters'],
      sparse: true
    },
    website: {
      type: String,
      trim: true,
      maxlength: [200, 'Website URL cannot exceed 200 characters']
    },
    address: {
      type: String,
      trim: true,
      maxlength: [500, 'Address cannot exceed 500 characters']
    },
    googleMapUrl: {
      type: String,
      trim: true,
      maxlength: [500, 'Google Maps URL cannot exceed 500 characters']
    },
    whatsapp: {
      type: String,
      trim: true,
      maxlength: [30, 'WhatsApp number cannot exceed 30 characters']
    },
    
    // ===== LEAD CLASSIFICATION =====
    status: {
      type: String,
      enum: {
        values: Object.values(LeadStatus),
        message: '{VALUE} is not a valid lead status'
      },
      default: LeadStatus.CREATED,
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: {
        values: Object.values(LeadType),
        message: '{VALUE} is not a valid lead type'
      },
      default: LeadType.LEAD,
      required: true,
      index: true
    },
    source: {
      type: String,
      enum: {
        values: Object.values(LeadSource),
        message: '{VALUE} is not a valid lead source'
      },
      default: LeadSource.OTHER,
      required: true,
      index: true
    },
    priority: {
      type: String,
      enum: {
        values: Object.values(LeadPriority),
        message: '{VALUE} is not a valid priority level'
      },
      default: LeadPriority.MEDIUM,
      required: true,
      index: true
    },
    isFavorite: {
      type: Boolean,
      default: false,
      index: true
    },
    
    // ===== LEAD SCORING & VALUE =====
    score: {
      type: Number,
      min: [0, 'Score cannot be negative'],
      max: [100, 'Score cannot exceed 100'],
      default: 0,
      index: true
    },
    estimatedValue: {
      type: Number,
      min: [0, 'Estimated value cannot be negative']
    },
    actualValue: {
      type: Number,
      min: [0, 'Actual value cannot be negative']
    },
    
    // ===== ASSIGNMENT & OWNERSHIP =====
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company is required'],
      index: true
    },
    
    // ===== TRACKING TIMESTAMPS =====
    statusUpdatedAt: {
      type: Date,
      index: true
    },
    lastContacted: {
      type: Date,
      index: true
    },
    lastActivityAt: {
      type: Date,
      index: true
    },
    nextFollowUp: {
      type: Date,
      index: true
    },
    convertedAt: {
      type: Date
    },
    lostAt: {
      type: Date
    },
    
    // ===== USER TRACKING =====
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    deletedAt: {
      type: Date
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    
    // ===== ENGAGEMENT METRICS =====
    totalInteractions: {
      type: Number,
      default: 0,
      min: 0
    },
    emailsSent: {
      type: Number,
      default: 0,
      min: 0
    },
    callsMade: {
      type: Number,
      default: 0,
      min: 0
    },
    meetingsHeld: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // ===== ADDITIONAL DATA =====
    tags: {
      type: [String],
      default: [],
      index: true
    },
    customFields: {
      type: Map,
      of: Schema.Types.Mixed
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ===== INDEXES =====
leadSchema.index({ company: 1, status: 1, createdAt: -1 });
leadSchema.index({ company: 1, assignedTo: 1, status: 1 });
leadSchema.index({ company: 1, isFavorite: 1, createdAt: -1 });
leadSchema.index({ company: 1, priority: 1, nextFollowUp: 1 });
leadSchema.index({ company: 1, score: -1 });
leadSchema.index({ email: 1, company: 1 }, { unique: true, sparse: true });
leadSchema.index({ phone: 1, company: 1 }, { unique: true, sparse: true });
leadSchema.index({ tags: 1 });

// ===== VIRTUALS =====
leadSchema.virtual('isActive').get(function (this: ILead) {
  return this.status !== LeadStatus.LOST && this.status !== LeadStatus.WON;
});

leadSchema.virtual('daysSinceCreated').get(function (this: ILead) {
  return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24));
});

leadSchema.virtual('daysSinceLastContact').get(function (this: ILead) {
  if (!this.lastContacted) return null;
  return Math.floor((Date.now() - this.lastContacted.getTime()) / (1000 * 60 * 60 * 24));
});

// ===== MIDDLEWARE =====
// Update lastActivityAt on any update
leadSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.lastActivityAt = new Date();
  }
  next();
});

// Prevent duplicate emails/phones within same company
leadSchema.pre('save', async function (next) {
  if (this.isNew && (this.email || this.phone)) {
    const query: any = { company: this.company, isDeleted: false };
    if (this.email) query.email = this.email;
    if (this.phone) query.phone = this.phone;
    
    const existing = await (this.constructor as Model<ILead>).findOne(query);
    if (existing) {
      throw new Error('A lead with this email or phone already exists in your company');
    }
  }
  next();
});

// ===== STATIC METHODS =====
leadSchema.statics.getLeadsByStatus = function (
  companyId: string,
  status: LeadStatus
) {
  return this.find({ company: companyId, status, isDeleted: false });
};

leadSchema.statics.getOverdueFollowUps = function (companyId: string) {
  return this.find({
    company: companyId,
    isDeleted: false,
    nextFollowUp: { $lte: new Date() },
    status: { $nin: [LeadStatus.WON, LeadStatus.LOST] }
  }).sort({ nextFollowUp: 1 });
};

// ===== INSTANCE METHODS =====
leadSchema.methods.updateScore = function (this: ILead) {
  let score = 0;
  
  // Basic information completeness (20 points)
  if (this.email) score += 5;
  if (this.phone) score += 5;
  if (this.website) score += 5;
  if (this.address) score += 5;
  
  // Engagement level (30 points)
  score += Math.min(10, this.emailsSent * 2);
  score += Math.min(10, this.callsMade * 3);
  score += Math.min(10, this.meetingsHeld * 5);
  
  // Status progression (30 points)
  const statusScores: Record<LeadStatus, number> = {
    [LeadStatus.CREATED]: 0,
    [LeadStatus.CONTACTED]: 10,
    [LeadStatus.QUALIFIED]: 15,
    [LeadStatus.PROPOSAL_SENT]: 20,
    [LeadStatus.NEGOTIATION]: 25,
    [LeadStatus.WON]: 30,
    [LeadStatus.LOST]: 0,
    [LeadStatus.FOLLOW_UP]: 10
  };
  score += statusScores[this.status];
  
  // Recency (20 points)
  if (this.lastContacted) {
    const daysSince = this.daysSinceLastContact || 0;
    if (daysSince < 7) score += 20;
    else if (daysSince < 14) score += 15;
    else if (daysSince < 30) score += 10;
    else score += 5;
  }
  
  this.score = Math.min(100, score);
  return this.score;
};

const Lead = mongoose.model<ILead>('Lead', leadSchema);

export default Lead;