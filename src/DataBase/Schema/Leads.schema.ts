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
  GOOGLE_MAPS    = 'google_maps',   // ← added for scraper imports
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
  name:     string;          // ✅ REQUIRED — business / person name
  address:  string;          // ✅ REQUIRED — physical address

  email?:        string;
  phone?:        string;
  whatsapp?:     string;
  website?:      string;
  googleMapUrl?: string;

  // ── Business / Scraper Fields ──────────────────────────────────────────────
  /**
   * The exact store/business name as returned by Google Maps scraper.
   * Stored separately from `name` so the canonical display name can differ
   * from the scraped raw string without data loss.
   */
  businessName?: string;

  /** Star rating (0.0 – 5.0) from Google Maps or any review platform. */
  rating?: number;

  /** Total number of public reviews. */
  numberOfReviews?: number;

  /** Business category (e.g. "Jewelry store", "Dental clinic"). */
  category?: string;

  /**
   * Structured Google Maps metadata captured at scrape time.
   * Kept as a flexible sub-document so new fields don't require schema changes.
   */
  googleMapsData?: {
    placeId?:      string;   // Google Place ID if obtainable
    mapsUrl?:      string;   // Full /maps/place/... URL
    scrapedAt?:    Date;     // When the record was scraped
    searchQuery?:  string;   // The query string that surfaced this result
  };

  // ── Classification ─────────────────────────────────────────────────────────
  status:    LeadStatus;
  type:      LeadType;
  source:    LeadSource;
  priority:  LeadPriority;
  isFavorite: boolean;
  tags:       string[];
  customFields?: Map<string, unknown>;

  // ── Company & Assignment ───────────────────────────────────────────────────
  company?:     Types.ObjectId;   // ref → Company  (now optional)
  companyName?: string;
  assignedTo?:  Types.ObjectId;   // ref → User

  // ── Scoring & Value ────────────────────────────────────────────────────────
  score:           number;
  estimatedValue?: number;
  actualValue?:    number;

  // ── Engagement Counters ────────────────────────────────────────────────────
  totalInteractions: number;
  emailsSent:        number;
  callsMade:         number;
  meetingsHeld:      number;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  statusUpdatedAt?: Date;
  lastContacted?:   Date;
  lastActivityAt?:  Date;
  nextFollowUp?:    Date;
  convertedAt?:     Date;
  lostAt?:          Date;
  createdAt:        Date;
  updatedAt:        Date;

  // ── Soft Delete ────────────────────────────────────────────────────────────
  isDeleted:  boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;

  // ── Audit Trail ────────────────────────────────────────────────────────────
  createdBy?: Types.ObjectId;   // optional — scraper imports have no user context
  updatedBy?: Types.ObjectId;

  // ── Virtuals ───────────────────────────────────────────────────────────────
  isActive:              boolean;
  daysSinceCreated:      number;
  daysSinceLastContact:  number | null;

  // ── Instance Methods ───────────────────────────────────────────────────────
  computeScore(): number;
  softDelete(deletedBy: Types.ObjectId): Promise<this>;
  markContacted(): Promise<this>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const LeadSchema = new Schema<ILead>(
  {
    // ── REQUIRED ─────────────────────────────────────────────────────────────
    name: {
      type:      String,
      required:  [true, 'Business / lead name is required'],
      trim:      true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
      index:     true,
    },
    address: {
      type:      String,
      required:  [true, 'Address is required'],
      trim:      true,
      maxlength: [500, 'Address cannot exceed 500 characters'],
    },

    // ── Basic contact (all optional) ──────────────────────────────────────
    email: {
      type:      String,
      trim:      true,
      lowercase: true,
      match:     [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      maxlength: [254, 'Email cannot exceed 254 characters'],
      sparse:    true,
    },
    phone: {
      type:      String,
      trim:      true,
      maxlength: [30, 'Phone cannot exceed 30 characters'],
      sparse:    true,
    },
    whatsapp: {
      type:      String,
      trim:      true,
      maxlength: [30, 'WhatsApp number cannot exceed 30 characters'],
    },
    website: {
      type:      String,
      trim:      true,
      maxlength: [500, 'Website URL cannot exceed 500 characters'],
    },
    googleMapUrl: {
      type:      String,
      trim:      true,
      maxlength: [500, 'Google Maps URL cannot exceed 500 characters'],
    },

    // ── Business / Scraper Fields ─────────────────────────────────────────
    businessName: {
      type:      String,
      trim:      true,
      maxlength: [200, 'Business name cannot exceed 200 characters'],
      index:     true,
    },
    rating: {
      type: Number,
      min:  [0,   'Rating cannot be below 0'],
      max:  [5,   'Rating cannot exceed 5'],
    },
    numberOfReviews: {
      type: Number,
      min:  [0, 'Number of reviews cannot be negative'],
    },
    category: {
      type:      String,
      trim:      true,
      maxlength: [100, 'Category cannot exceed 100 characters'],
      index:     true,
    },
    googleMapsData: {
      type: new Schema(
        {
          placeId:     { type: String, trim: true },
          mapsUrl:     { type: String, trim: true },
          scrapedAt:   { type: Date   },
          searchQuery: { type: String, trim: true },
        },
        { _id: false }
      ),
      default: undefined,
    },

    // ── Classification ────────────────────────────────────────────────────
    status: {
      type:     String,
      enum:     { values: Object.values(LeadStatus), message: '{VALUE} is not a valid lead status' },
      default:  LeadStatus.CREATED,
      required: true,
      index:    true,
    },
    type: {
      type:     String,
      enum:     { values: Object.values(LeadType), message: '{VALUE} is not a valid lead type' },
      default:  LeadType.LEAD,
      required: true,
      index:    true,
    },
    source: {
      type:     String,
      enum:     { values: Object.values(LeadSource), message: '{VALUE} is not a valid lead source' },
      default:  LeadSource.OTHER,
      required: true,
      index:    true,
    },
    priority: {
      type:     String,
      enum:     { values: Object.values(LeadPriority), message: '{VALUE} is not a valid priority' },
      default:  LeadPriority.MEDIUM,
      required: true,
      index:    true,
    },
    isFavorite: {
      type:    Boolean,
      default: false,
      index:   true,
    },
    tags: {
      type:    [String],
      default: [],
      index:   true,
    },
    customFields: {
      type: Map,
      of:   Schema.Types.Mixed,
    },

    // ── Company & Assignment ──────────────────────────────────────────────
    company: {
      type:  Schema.Types.ObjectId,
      ref:   'Company',
      index: true,
      // intentionally not required — scraper imports may not have a company yet
    },
    companyName: {
      type:      String,
      trim:      true,
      maxlength: [200, 'Company name cannot exceed 200 characters'],
    },
    assignedTo: {
      type:  Schema.Types.ObjectId,
      ref:   'User',
      index: true,
    },

    // ── Scoring & Value ───────────────────────────────────────────────────
    score: {
      type:    Number,
      default: 0,
      min:     [0,   'Score cannot be negative'],
      max:     [100, 'Score cannot exceed 100'],
      index:   true,
    },
    estimatedValue: {
      type: Number,
      min:  [0, 'Estimated value cannot be negative'],
    },
    actualValue: {
      type: Number,
      min:  [0, 'Actual value cannot be negative'],
    },

    // ── Engagement Counters ───────────────────────────────────────────────
    totalInteractions: { type: Number, default: 0, min: 0 },
    emailsSent:        { type: Number, default: 0, min: 0 },
    callsMade:         { type: Number, default: 0, min: 0 },
    meetingsHeld:      { type: Number, default: 0, min: 0 },

    // ── Timestamps ────────────────────────────────────────────────────────
    statusUpdatedAt: { type: Date, index: true },
    lastContacted:   { type: Date, index: true },
    lastActivityAt:  { type: Date, index: true },
    nextFollowUp:    { type: Date, index: true },
    convertedAt:     { type: Date },
    lostAt:          { type: Date },

    // ── Soft Delete ───────────────────────────────────────────────────────
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // ── Audit Trail ───────────────────────────────────────────────────────
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },   // optional
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
//
//  Naming convention used in comments:
//    ESR  = Equality → Sort → Range   (optimal index field order)
//    cx   = company  (prefix every tenant-scoped index with company first
//                     so MongoDB can always narrow to one tenant cheaply)
//
// ── 1. UNIQUE / SPARSE CONSTRAINTS ───────────────────────────────────────────

// Prevent duplicate email / phone per company
LeadSchema.index({ email: 1, company: 1 }, { unique: true, sparse: true, name: 'uq_email_company' });
LeadSchema.index({ phone: 1, company: 1 }, { unique: true, sparse: true, name: 'uq_phone_company' });

// ── 2. FULL-TEXT SEARCH ───────────────────────────────────────────────────────
//
//  Covers: /leads?q=tanishq  /leads?q=delhi  /leads?q=jewelry
//
//  Field weights control relevance ranking:
//    name / businessName  → highest  (exact name match should win)
//    category             → high     (e.g. "jewelry store")
//    companyName / address→ medium
//    email / phone        → low      (rarely searched as free text)
//
LeadSchema.index(
  {
    name:         'text',
    businessName: 'text',
    category:     'text',
    companyName:  'text',
    address:      'text',
    email:        'text',
    phone:        'text',
    tags:         'text',
  },
  {
    name: 'text_search_leads',
    weights: {
      name:         10,
      businessName: 10,
      category:      7,
      companyName:   5,
      address:       4,
      email:         3,
      phone:         3,
      tags:          6,
    },
    default_language: 'english',
  }
);

// ── 3. PRIMARY LIST VIEW  (company dashboard default: newest first) ───────────
//
//  Query: { company, isDeleted: false }  sort: { createdAt: -1 }
//  ESR:   company(E) → isDeleted(E) → createdAt(S)
//
LeadSchema.index(
  { company: 1, isDeleted: 1, createdAt: -1 },
  { name: 'cx_deleted_created' }
);

// ── 4. STATUS FILTER  (most common single filter) ────────────────────────────
//
//  Query: { company, isDeleted: false, status: 'contacted' }  sort: createdAt desc
//
LeadSchema.index(
  { company: 1, isDeleted: 1, status: 1, createdAt: -1 },
  { name: 'cx_deleted_status_created' }
);

// ── 5. PRIORITY FILTER ────────────────────────────────────────────────────────
//
//  Query: { company, isDeleted: false, priority: 'urgent' }  sort: createdAt desc
//
LeadSchema.index(
  { company: 1, isDeleted: 1, priority: 1, createdAt: -1 },
  { name: 'cx_deleted_priority_created' }
);

// ── 6. TYPE FILTER  (lead / prospect / client / customer) ────────────────────
//
LeadSchema.index(
  { company: 1, isDeleted: 1, type: 1, createdAt: -1 },
  { name: 'cx_deleted_type_created' }
);

// ── 7. SOURCE FILTER  (google_maps / referral / cold_call …) ─────────────────
//
LeadSchema.index(
  { company: 1, isDeleted: 1, source: 1, createdAt: -1 },
  { name: 'cx_deleted_source_created' }
);

// ── 8. CATEGORY FILTER  (scraper: "Jewelry store", "Dental clinic" …) ────────
//
LeadSchema.index(
  { company: 1, isDeleted: 1, category: 1, createdAt: -1 },
  { name: 'cx_deleted_category_created' }
);

// ── 9. ASSIGNED-TO FILTER  (per-agent views) ─────────────────────────────────
//
//  Query: { company, isDeleted: false, assignedTo: userId, status }
//
LeadSchema.index(
  { company: 1, isDeleted: 1, assignedTo: 1, status: 1, createdAt: -1 },
  { name: 'cx_deleted_assigned_status_created' }
);

// ── 10. FAVORITES FILTER ──────────────────────────────────────────────────────
//
LeadSchema.index(
  { company: 1, isDeleted: 1, isFavorite: 1, createdAt: -1 },
  { name: 'cx_deleted_favorite_created' }
);

// ── 11. SCORE SORT / RANGE FILTER  ("top leads" view) ────────────────────────
//
//  Query: { company, isDeleted: false, score: { $gte: 70 } }  sort: score desc
//
LeadSchema.index(
  { company: 1, isDeleted: 1, score: -1 },
  { name: 'cx_deleted_score' }
);

// ── 12. RATING SORT / RANGE  (Google Maps reputation filter) ─────────────────
//
//  Query: { company, isDeleted: false, rating: { $gte: 4.0 } }  sort: rating desc
//
LeadSchema.index(
  { company: 1, isDeleted: 1, rating: -1, numberOfReviews: -1 },
  { name: 'cx_deleted_rating_reviews' }
);

// ── 13. FOLLOW-UP / OVERDUE VIEW ─────────────────────────────────────────────
//
//  Query: { company, isDeleted: false, nextFollowUp: { $lte: now },
//            status: { $nin: ['won','lost'] } }
//  sort: nextFollowUp asc  (most overdue first)
//
LeadSchema.index(
  { company: 1, isDeleted: 1, nextFollowUp: 1 },
  { name: 'cx_deleted_followup', sparse: true }
);

// ── 14. PRIORITY + FOLLOW-UP  (urgent overdue leads) ─────────────────────────
//
LeadSchema.index(
  { company: 1, isDeleted: 1, priority: 1, nextFollowUp: 1 },
  { name: 'cx_deleted_priority_followup', sparse: true }
);

// ── 15. LAST CONTACTED SORT  (stale leads – "not contacted in 30 days") ───────
//
LeadSchema.index(
  { company: 1, isDeleted: 1, lastContacted: 1 },
  { name: 'cx_deleted_lastcontacted', sparse: true }
);

// ── 16. LAST ACTIVITY SORT  (recently active leads) ──────────────────────────
//
LeadSchema.index(
  { company: 1, isDeleted: 1, lastActivityAt: -1 },
  { name: 'cx_deleted_lastactivity', sparse: true }
);

// ── 17. COMBINED STATUS + PRIORITY  (kanban-style board filter) ──────────────
//
//  Query: { company, isDeleted: false, status: 'contacted', priority: 'high' }
//
LeadSchema.index(
  { company: 1, isDeleted: 1, status: 1, priority: 1, createdAt: -1 },
  { name: 'cx_deleted_status_priority_created' }
);

// ── 18. TAGS FILTER ───────────────────────────────────────────────────────────
//
//  Query: { company, isDeleted: false, tags: { $in: ['vip','hot'] } }
//
LeadSchema.index(
  { company: 1, isDeleted: 1, tags: 1 },
  { name: 'cx_deleted_tags' }
);

// ── 19. ESTIMATED VALUE SORT  (deal-size ranking) ────────────────────────────
//
LeadSchema.index(
  { company: 1, isDeleted: 1, estimatedValue: -1 },
  { name: 'cx_deleted_estimatedvalue', sparse: true }
);

// ── 20. STATUS UPDATED AT  (recently changed pipeline stage) ─────────────────
//
LeadSchema.index(
  { company: 1, isDeleted: 1, statusUpdatedAt: -1 },
  { name: 'cx_deleted_statusupdated', sparse: true }
);

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

// Stamp statusUpdatedAt + convertedAt / lostAt when status changes
LeadSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.statusUpdatedAt = new Date();
    if (this.status === LeadStatus.WON  && !this.convertedAt) this.convertedAt = new Date();
    if (this.status === LeadStatus.LOST && !this.lostAt)      this.lostAt      = new Date();
  }
  next();
});

// Guard: no duplicate email / phone within the same company (skip if no company)
LeadSchema.pre('save', async function (next) {
  if (!this.isNew)               return next();
  if (!this.company)             return next();   // standalone / scraper leads skip
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
 * engagement depth, pipeline stage, contact recency, and now
 * also factors in the Google Maps rating.
 */
LeadSchema.methods.computeScore = function (this: ILead): number {
  let score = 0;

  // 1. Profile completeness — 20 pts
  if (this.email)   score += 5;
  if (this.phone)   score += 5;
  if (this.website) score += 5;
  if (this.address) score += 5;   // always 5 since address is now required

  // 2. Engagement depth — 25 pts
  score += Math.min(8,  this.emailsSent   * 2);
  score += Math.min(9,  this.callsMade    * 3);
  score += Math.min(8,  this.meetingsHeld * 4);

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

  // 4. Recency — 15 pts
  const days = this.daysSinceLastContact;
  if (days !== null) {
    if      (days <  7) score += 15;
    else if (days < 14) score += 10;
    else if (days < 30) score +=  5;
  }

  // 5. Google Maps reputation — 10 pts  (new)
  if (this.rating !== undefined && this.rating !== null) {
    // 4.5–5.0 → 10, 4.0–4.4 → 7, 3.5–3.9 → 4, <3.5 → 1
    if      (this.rating >= 4.5) score += 10;
    else if (this.rating >= 4.0) score +=  7;
    else if (this.rating >= 3.5) score +=  4;
    else                         score +=  1;
  }

  this.score = Math.min(100, Math.max(0, score));
  return this.score;
};

LeadSchema.methods.softDelete = async function (
  this: ILead,
  deletedBy: Types.ObjectId
): Promise<ILead> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

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

LeadSchema.statics.getLeadsByStatus = function (companyId: string, status: LeadStatus) {
  return this.find({ company: companyId, status, isDeleted: false }).sort({ createdAt: -1 });
};

LeadSchema.statics.getOverdueFollowUps = function (companyId: string) {
  return this.find({
    company:      companyId,
    isDeleted:    false,
    nextFollowUp: { $lte: new Date() },
    status:       { $nin: [LeadStatus.WON, LeadStatus.LOST] },
  }).sort({ nextFollowUp: 1 });
};

LeadSchema.statics.getByCompany = function (
  companyId: string,
  filters: Partial<Pick<ILead, 'status' | 'type' | 'priority'>> = {}
) {
  return this.find({ company: companyId, isDeleted: false, ...filters }).sort({ createdAt: -1 });
};

// ─── Model ────────────────────────────────────────────────────────────────────

export type LeadModel = Model<ILead> & ILeadStatics;

export const Lead = model<ILead, LeadModel>('Lead', LeadSchema);

export default Lead;