// src/models/Lead.ts
import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum LeadStatus {
  CREATED       = 'created',
  CONTACTED     = 'contacted',
  QUALIFIED     = 'qualified',
  PROPOSAL_SENT = 'proposal_sent',
  NEGOTIATION   = 'negotiation',
  WON           = 'won',
  LOST          = 'lost',
  FOLLOW_UP     = 'follow_up',
}

export enum LeadType {
  LEAD     = 'lead',
  PROSPECT = 'prospect',
  CLIENT   = 'client',
  CUSTOMER = 'customer',
}

export enum LeadSource {
  WEBSITE        = 'website',
  REFERRAL       = 'referral',
  SOCIAL_MEDIA   = 'social_media',
  EMAIL_CAMPAIGN = 'email_campaign',
  COLD_CALL      = 'cold_call',
  PAID_ADS       = 'paid_ads',
  TRADE_SHOW     = 'trade_show',
  OTHER          = 'other',
}

export enum LeadPriority {
  LOW    = 'low',
  MEDIUM = 'medium',
  HIGH   = 'high',
  URGENT = 'urgent',
}

// ─── Statics interface ────────────────────────────────────────────────────────

export interface ILeadStatics {
  getLeadsByStatus(companyId: string, status: LeadStatus): mongoose.Query<ILead[], ILead>;
  getOverdueFollowUps(companyId: string): mongoose.Query<ILead[], ILead>;
  getByCompany(companyId: string, filters?: Partial<Pick<ILead, 'status' | 'type' | 'priority'>>): mongoose.Query<ILead[], ILead>;
}

// ─── Document interface ───────────────────────────────────────────────────────

export interface ILead extends Document {
  // ── Basic Information ──────────────────────────────────────────────────────
  name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  address?: string;
  googleMapUrl?: string;

  // ── Classification ─────────────────────────────────────────────────────────
  status: LeadStatus;
  type: LeadType;
  source: LeadSource;
  priority: LeadPriority;
  isFavorite: boolean;
  tags: string[];
  customFields?: Map<string, unknown>;

  // ── Company & Assignment ───────────────────────────────────────────────────
  company: Types.ObjectId;           // ref → Company  (required)
  companyName?: string;              // denormalised snapshot for fast list rendering
  assignedTo?: Types.ObjectId;       // ref → User

  // ── Scoring & Value ────────────────────────────────────────────────────────
  score: number;                     // 0 – 100
  estimatedValue?: number;
  actualValue?: number;

  // ── Engagement Counters ────────────────────────────────────────────────────
  totalInteractions: number;
  emailsSent: number;
  callsMade: number;
  meetingsHeld: number;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  statusUpdatedAt?: Date;
  lastContacted?: Date;
  lastActivityAt?: Date;
  nextFollowUp?: Date;
  convertedAt?: Date;
  lostAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // ── Soft Delete ────────────────────────────────────────────────────────────
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;

  // ── Audit Trail ────────────────────────────────────────────────────────────
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;

  // ── Virtuals ───────────────────────────────────────────────────────────────
  isActive: boolean;
  daysSinceCreated: number;
  daysSinceLastContact: number | null;

  // ── Instance Methods ───────────────────────────────────────────────────────
  computeScore(): number;
  softDelete(deletedBy: Types.ObjectId): Promise<this>;
  markContacted(): Promise<this>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const LeadSchema = new Schema<ILead>(
  {
    // ── Basic Information ────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Lead name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      maxlength: [254, 'Email cannot exceed 254 characters'],
      sparse: true,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, 'Phone cannot exceed 30 characters'],
      sparse: true,
    },
    whatsapp: {
      type: String,
      trim: true,
      maxlength: [30, 'WhatsApp number cannot exceed 30 characters'],
    },
    website: {
      type: String,
      trim: true,
      maxlength: [200, 'Website URL cannot exceed 200 characters'],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [500, 'Address cannot exceed 500 characters'],
    },
    googleMapUrl: {
      type: String,
      trim: true,
      maxlength: [500, 'Google Maps URL cannot exceed 500 characters'],
    },

    // ── Classification ───────────────────────────────────────────────────────
    status: {
      type: String,
      enum: { values: Object.values(LeadStatus), message: '{VALUE} is not a valid lead status' },
      default: LeadStatus.CREATED,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: { values: Object.values(LeadType), message: '{VALUE} is not a valid lead type' },
      default: LeadType.LEAD,
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: { values: Object.values(LeadSource), message: '{VALUE} is not a valid lead source' },
      default: LeadSource.OTHER,
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: { values: Object.values(LeadPriority), message: '{VALUE} is not a valid priority' },
      default: LeadPriority.MEDIUM,
      required: true,
      index: true,
    },
    isFavorite: {
      type: Boolean,
      default: false,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    customFields: {
      type: Map,
      of: Schema.Types.Mixed,
    },

    // ── Company & Assignment ─────────────────────────────────────────────────
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company reference is required'],
      index: true,
    },
    companyName: {
      type: String,
      trim: true,
      maxlength: [200, 'Company name cannot exceed 200 characters'],
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    // ── Scoring & Value ──────────────────────────────────────────────────────
    score: {
      type: Number,
      default: 0,
      min: [0, 'Score cannot be negative'],
      max: [100, 'Score cannot exceed 100'],
      index: true,
    },
    estimatedValue: {
      type: Number,
      min: [0, 'Estimated value cannot be negative'],
    },
    actualValue: {
      type: Number,
      min: [0, 'Actual value cannot be negative'],
    },

    // ── Engagement Counters ──────────────────────────────────────────────────
    totalInteractions: { type: Number, default: 0, min: 0 },
    emailsSent:        { type: Number, default: 0, min: 0 },
    callsMade:         { type: Number, default: 0, min: 0 },
    meetingsHeld:      { type: Number, default: 0, min: 0 },

    // ── Timestamps ───────────────────────────────────────────────────────────
    statusUpdatedAt: { type: Date, index: true },
    lastContacted:   { type: Date, index: true },
    lastActivityAt:  { type: Date, index: true },
    nextFollowUp:    { type: Date, index: true },
    convertedAt:     { type: Date },
    lostAt:          { type: Date },

    // ── Soft Delete ──────────────────────────────────────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // ── Audit Trail ──────────────────────────────────────────────────────────
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'createdBy is required'],
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Compound Indexes ─────────────────────────────────────────────────────────

LeadSchema.index({ company: 1, status: 1, createdAt: -1 });
LeadSchema.index({ company: 1, assignedTo: 1, status: 1 });
LeadSchema.index({ company: 1, isFavorite: 1, createdAt: -1 });
LeadSchema.index({ company: 1, priority: 1, nextFollowUp: 1 });
LeadSchema.index({ company: 1, score: -1 });
LeadSchema.index({ company: 1, isDeleted: 1, createdAt: -1 });
LeadSchema.index({ email: 1, company: 1 }, { unique: true, sparse: true });
LeadSchema.index({ phone: 1, company: 1 }, { unique: true, sparse: true });
LeadSchema.index({ name: 'text', email: 'text', companyName: 'text', address: 'text' });

// ─── Virtuals ─────────────────────────────────────────────────────────────────

LeadSchema.virtual('isActive').get(function (this: ILead) {
  return this.status !== LeadStatus.LOST && this.status !== LeadStatus.WON;
});

LeadSchema.virtual('daysSinceCreated').get(function (this: ILead) {
  return Math.floor((Date.now() - this.createdAt.getTime()) / 86_400_000);
});

LeadSchema.virtual('daysSinceLastContact').get(function (this: ILead): number | null {
  if (!this.lastContacted) return null;
  return Math.floor((Date.now() - this.lastContacted.getTime()) / 86_400_000);
});

// ─── Pre-save Middleware ──────────────────────────────────────────────────────

// Stamp lastActivityAt on every non-creation save
LeadSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified()) {
    this.lastActivityAt = new Date();
  }
  next();
});

// Stamp statusUpdatedAt when status changes
LeadSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.statusUpdatedAt = new Date();

    if (this.status === LeadStatus.WON  && !this.convertedAt) this.convertedAt = new Date();
    if (this.status === LeadStatus.LOST && !this.lostAt)      this.lostAt      = new Date();
  }
  next();
});

// Guard: no duplicate email/phone within the same company
LeadSchema.pre('save', async function (next) {
  if (!this.isNew) return next();
  if (!this.email && !this.phone) return next();

  const orConditions: object[] = [];
  if (this.email) orConditions.push({ email: this.email });
  if (this.phone) orConditions.push({ phone: this.phone });

  const existing = await (this.constructor as Model<ILead>).findOne({
    company:   this.company,
    isDeleted: false,
    $or: orConditions,
  });

  if (existing) {
    return next(
      new Error('A lead with this email or phone already exists in your company')
    );
  }
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Recomputes the lead score based on profile completeness,
 * engagement depth, pipeline stage, and contact recency.
 * Returns the computed score (also writes it to this.score).
 */
LeadSchema.methods.computeScore = function (this: ILead): number {
  let score = 0;

  // 1. Profile completeness — 20 pts
  if (this.email)    score += 5;
  if (this.phone)    score += 5;
  if (this.website)  score += 5;
  if (this.address)  score += 5;

  // 2. Engagement depth — 30 pts
  score += Math.min(10, this.emailsSent   * 2);
  score += Math.min(10, this.callsMade    * 3);
  score += Math.min(10, this.meetingsHeld * 5);

  // 3. Pipeline stage — 30 pts
  const stageScore: Record<LeadStatus, number> = {
    [LeadStatus.CREATED]:       0,
    [LeadStatus.CONTACTED]:    10,
    [LeadStatus.QUALIFIED]:    15,
    [LeadStatus.PROPOSAL_SENT]:20,
    [LeadStatus.NEGOTIATION]:  25,
    [LeadStatus.FOLLOW_UP]:    10,
    [LeadStatus.WON]:          30,
    [LeadStatus.LOST]:          0,
  };
  score += stageScore[this.status];

  // 4. Recency — 20 pts
  const days = this.daysSinceLastContact;
  if (days !== null) {
    if      (days <  7) score += 20;
    else if (days < 14) score += 15;
    else if (days < 30) score += 10;
    else                score +=  5;
  }

  this.score = Math.min(100, Math.max(0, score));
  return this.score;
};

/**
 * Performs a soft-delete: sets isDeleted, deletedAt, deletedBy
 * and saves the document. Does NOT remove it from the database.
 */
LeadSchema.methods.softDelete = async function (
  this: ILead,
  deletedBy: Types.ObjectId
): Promise<ILead> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

/**
 * Stamps lastContacted to now, increments totalInteractions,
 * updates status to CONTACTED if still in CREATED, and saves.
 */
LeadSchema.methods.markContacted = async function (this: ILead): Promise<ILead> {
  this.lastContacted      = new Date();
  this.lastActivityAt     = new Date();
  this.totalInteractions += 1;
  if (this.status === LeadStatus.CREATED) {
    this.status = LeadStatus.CONTACTED;
  }
  return this.save();
};

// ─── Static Methods ───────────────────────────────────────────────────────────

LeadSchema.statics.getLeadsByStatus = function (
  companyId: string,
  status: LeadStatus
) {
  return this.find({ company: companyId, status, isDeleted: false }).sort({ createdAt: -1 });
};

LeadSchema.statics.getOverdueFollowUps = function (companyId: string) {
  return this.find({
    company:   companyId,
    isDeleted: false,
    nextFollowUp: { $lte: new Date() },
    status: { $nin: [LeadStatus.WON, LeadStatus.LOST] },
  }).sort({ nextFollowUp: 1 });
};

LeadSchema.statics.getByCompany = function (
  companyId: string,
  filters: Partial<Pick<ILead, 'status' | 'type' | 'priority'>> = {}
) {
  return this.find({ company: companyId, isDeleted: false, ...filters }).sort({ createdAt: -1 });
};

// ─── Model ───────────────────────────────────────────────────────────────────

export type LeadModel = Model<ILead> & ILeadStatics;

export const Lead = model<ILead, LeadModel>('Lead', LeadSchema);

export default Lead;