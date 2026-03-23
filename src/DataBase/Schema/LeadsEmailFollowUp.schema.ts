// src/models/EmailCampaign.ts
import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum EmailCampaignStatus {
  DRAFT       = 'draft',
  SCHEDULED   = 'scheduled',
  PROCESSING  = 'processing',
  SENT        = 'sent',
  DELIVERED   = 'delivered',
  OPENED      = 'opened',
  CLICKED     = 'clicked',
  BOUNCED     = 'bounced',
  FAILED      = 'failed',
  CANCELLED   = 'cancelled',
  UNSUBSCRIBED= 'unsubscribed',
}

export enum EmailCampaignType {
  SINGLE      = 'single',       // One-off email to single lead
  BULK        = 'bulk',         // Bulk email to multiple leads
  AUTOMATED   = 'automated',    // Triggered by workflow/automation
}

export enum BounceType {
  HARD        = 'hard',         // Permanent failure
  SOFT        = 'soft',         // Temporary failure
}

// ─── Statics interface ────────────────────────────────────────────────────────
export interface IEmailCampaignStatics {
  getDueEmails(companyId: string, limit?: number): mongoose.Query<IEmailCampaign[], IEmailCampaign>;
  getPendingByLead(leadId: string): mongoose.Query<IEmailCampaign[], IEmailCampaign>;
  getByTemplate(templateId: string): mongoose.Query<IEmailCampaign[], IEmailCampaign>;
  getBouncedEmails(companyId: string): mongoose.Query<IEmailCampaign[], IEmailCampaign>;
}

// ─── Document interface ───────────────────────────────────────────────────────
export interface IEmailCampaign extends Document {
  // ── Relations ──────────────────────────────────────────────────────────
  company:    Types.ObjectId;   // ref → Company
  lead:       Types.ObjectId;   // ref → Lead
  template:   Types.ObjectId;   // ref → EmailTemplate
  campaign?:  Types.ObjectId;   // ref → EmailCampaign (for bulk campaigns)

  // ── Campaign Type ──────────────────────────────────────────────────────
  type:       EmailCampaignType;

  // ── Recipient ──────────────────────────────────────────────────────────
  recipient:  string;           // Email address at time of scheduling (snapshot)
  recipientName?: string;       // Recipient name at time of scheduling

  // ── Content Snapshot ───────────────────────────────────────────────────
  /**
   * Rendered subject and content at send time (preserved for audit)
   */
  subjectSnapshot?:   string;
  htmlSnapshot?:      string;
  textSnapshot?:      string;

  // ── Scheduling ─────────────────────────────────────────────────────────
  scheduledAt:  Date;
  sentAt?:      Date;
  deliveredAt?: Date;
  openedAt?:    Date;
  clickedAt?:   Date;
  bouncedAt?:   Date;

  // ── Status & Tracking ──────────────────────────────────────────────────
  status:       EmailCampaignStatus;
  messageId?:   string;           // Provider Message ID (e.g., SendGrid message_id)
  failureReason?: string;
  bounceType?:  BounceType;
  retryCount:   number;
  maxRetries:   number;

  // ── Engagement Tracking ────────────────────────────────────────────────
  openCount:    number;
  clickCount:   number;
  clickedLinks?: {
    url: string;
    clickedAt: Date;
  }[];
  userAgent?:   string;           // From email open/click tracking
  ipAddress?:   string;           // From email open/click tracking

  // ── Dynamic Data ───────────────────────────────────────────────────────
  /**
   * The specific values used to render the template for this instance.
   * e.g., { customer_name: "John", order_id: "ORD-123" }
   */
  variables:    Record<string, any>;

  // ── Headers & Metadata ─────────────────────────────────────────────────
  headers?:     Record<string, string>;  // Custom email headers
  tags?:        string[];                // For provider-side categorization

  // ── Audit & Soft Delete ────────────────────────────────────────────────
  createdBy?:   Types.ObjectId;
  updatedBy?:   Types.ObjectId;
  isDeleted:    boolean;
  deletedAt?:   Date;
  deletedBy?:   Types.ObjectId;

  // ── Timestamps ─────────────────────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;

  // ── Instance Methods ───────────────────────────────────────────────────
  markSent(messageId: string): Promise<this>;
  markDelivered(): Promise<this>;
  markOpened(userAgent?: string, ipAddress?: string): Promise<this>;
  markClicked(url: string, userAgent?: string, ipAddress?: string): Promise<this>;
  markBounced(type: BounceType, reason: string): Promise<this>;
  markFailed(reason: string): Promise<this>;
  cancel(): Promise<this>;
  softDelete(deletedBy: Types.ObjectId): Promise<this>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const EmailCampaignSchema = new Schema<IEmailCampaign>(
  {
    // ── Relations ────────────────────────────────────────────────────────
    company: {
      type:     Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },
    lead: {
      type:     Schema.Types.ObjectId,
      ref:      'Lead',
      required: true,
      index:    true,
    },
    template: {
      type:     Schema.Types.ObjectId,
      ref:      'EmailTemplate',
      required: true,
      index:    true,
    },
    campaign: {
      type:     Schema.Types.ObjectId,
      ref:      'EmailCampaign',  // Self-reference for bulk campaign grouping
      index:    true,
    },
    // ── Campaign Type ────────────────────────────────────────────────────
    type: {
      type:     String,
      enum:     { values: Object.values(EmailCampaignType), message: '{VALUE} is not a valid campaign type' },
      default:  EmailCampaignType.SINGLE,
      required: true,
      index:    true,
    },
    // ── Recipient ────────────────────────────────────────────────────────
    recipient: {
      type:     String,
      required: [true, 'Recipient email is required'],
      trim:     true,
      lowercase:true,
      match:    [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index:    true,
    },
    recipientName: {
      type:     String,
      trim:     true,
      maxlength:[200, 'Recipient name cannot exceed 200 characters'],
    },
    // ── Content Snapshot ─────────────────────────────────────────────────
    subjectSnapshot: {
      type:     String,
      trim:     true,
    },
    htmlSnapshot: {
      type:     String,
    },
    textSnapshot: {
      type:     String,
    },
    // ── Scheduling ───────────────────────────────────────────────────────
    scheduledAt: {
      type:     Date,
      required: [true, 'Scheduled date is required'],
      index:    true,
    },
    sentAt:      { type: Date, index: true },
    deliveredAt: { type: Date, index: true },
    openedAt:    { type: Date },
    clickedAt:   { type: Date },
    bouncedAt:   { type: Date },
    // ── Status & Tracking ────────────────────────────────────────────────
    status: {
      type:     String,
      enum:     { values: Object.values(EmailCampaignStatus), message: '{VALUE} is not a valid campaign status' },
      default:  EmailCampaignStatus.DRAFT,
      required: true,
      index:    true,
    },
    messageId: {
      type:     String,
      trim:     true,
      sparse:   true,
      index:    true,
    },
    failureReason: {
      type:     String,
      trim:     true,
    },
    bounceType: {
      type:     String,
      enum:     { values: Object.values(BounceType), message: '{VALUE} is not a valid bounce type' },
    },
    retryCount: {
      type:     Number,
      default:  0,
      min:      0,
    },
    maxRetries: {
      type:     Number,
      default:  3,
      min:      0,
    },
    // ── Engagement Tracking ──────────────────────────────────────────────
    openCount: {
      type:     Number,
      default:  0,
      min:      0,
    },
    clickCount: {
      type:     Number,
      default:  0,
      min:      0,
    },
    clickedLinks: {
      type: [{
        url:       { type: String, required: true },
        clickedAt: { type: Date, required: true },
      }],
      default: [],
    },
    userAgent: {
      type:     String,
      trim:     true,
    },
    ipAddress: {
      type:     String,
      trim:     true,
    },
    // ── Dynamic Data ─────────────────────────────────────────────────────
    variables: {
      type:     Schema.Types.Mixed,
      default:  {},
    },
    // ── Headers & Metadata ───────────────────────────────────────────────
    headers: {
      type:     Map,
      of:       String,
    },
    tags: {
      type:     [String],
      default:  [],
    },
    // ── Audit & Soft Delete ──────────────────────────────────────────────
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// ESR: Company → ScheduledAt → Status (For Cron Jobs)
EmailCampaignSchema.index(
  { company: 1, scheduledAt: 1, status: 1 },
  { name: 'cx_scheduled_status' }
);
// ESR: Company → Lead → Status (For Lead Timeline)
EmailCampaignSchema.index(
  { company: 1, lead: 1, status: 1, createdAt: -1 },
  { name: 'cx_lead_status_created' }
);
// ESR: Company → Template → Status (For Template Analytics)
EmailCampaignSchema.index(
  { company: 1, template: 1, status: 1 },
  { name: 'cx_template_status' }
);
// ESR: Company → MessageId (For Webhook Processing)
EmailCampaignSchema.index(
  { company: 1, messageId: 1 },
  { name: 'cx_messageid', sparse: true }
);
// ESR: Company → Recipient → Status (For Duplicate Detection)
EmailCampaignSchema.index(
  { company: 1, recipient: 1, status: 1, createdAt: -1 },
  { name: 'cx_recipient_status_created' }
);
// Soft Delete Filter
EmailCampaignSchema.index(
  { company: 1, isDeleted: 1, scheduledAt: 1 },
  { name: 'cx_deleted_scheduled' }
);
// Engagement Tracking Indexes
EmailCampaignSchema.index(
  { company: 1, isDeleted: 1, openedAt: 1 },
  { name: 'cx_deleted_opened', sparse: true }
);
EmailCampaignSchema.index(
  { company: 1, isDeleted: 1, clickedAt: 1 },
  { name: 'cx_deleted_clicked', sparse: true }
);
EmailCampaignSchema.index(
  { company: 1, isDeleted: 1, bounceType: 1 },
  { name: 'cx_deleted_bounce', sparse: true }
);

// ─── Pre-save Middleware ──────────────────────────────────────────────────────
// Prevent scheduling in the past (with small buffer for processing)
EmailCampaignSchema.pre('save', function (next) {
  if (this.isNew && this.scheduledAt < new Date(Date.now() - 60000)) {
    // Allow 1 minute buffer for processing delays
    // return next(new Error('Cannot schedule email in the past'));
  }
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────
EmailCampaignSchema.methods.markSent = async function (
  this: IEmailCampaign,
  messageId: string
): Promise<IEmailCampaign> {
  this.status    = EmailCampaignStatus.SENT;
  this.sentAt    = new Date();
  this.messageId = messageId;
  this.updatedBy = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

EmailCampaignSchema.methods.markDelivered = async function (
  this: IEmailCampaign
): Promise<IEmailCampaign> {
  this.status      = EmailCampaignStatus.DELIVERED;
  this.deliveredAt = new Date();
  this.updatedBy   = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

EmailCampaignSchema.methods.markOpened = async function (
  this: IEmailCampaign,
  userAgent?: string,
  ipAddress?: string
): Promise<IEmailCampaign> {
  this.status     = EmailCampaignStatus.OPENED;
  this.openedAt   = new Date();
  this.openCount += 1;
  if (userAgent) this.userAgent = userAgent;
  if (ipAddress) this.ipAddress = ipAddress;
  this.updatedBy  = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

EmailCampaignSchema.methods.markClicked = async function (
  this: IEmailCampaign,
  url: string,
  userAgent?: string,
  ipAddress?: string
): Promise<IEmailCampaign> {
  this.status     = EmailCampaignStatus.CLICKED;
  this.clickedAt  = new Date();
  this.clickCount += 1;
  
  if (!this.clickedLinks) this.clickedLinks = [];
  this.clickedLinks.push({ url, clickedAt: new Date() });
  
  if (userAgent) this.userAgent = userAgent;
  if (ipAddress) this.ipAddress = ipAddress;
  this.updatedBy  = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

EmailCampaignSchema.methods.markBounced = async function (
  this: IEmailCampaign,
  type: BounceType,
  reason: string
): Promise<IEmailCampaign> {
  this.status        = EmailCampaignStatus.BOUNCED;
  this.bouncedAt     = new Date();
  this.bounceType    = type;
  this.failureReason = reason;
  this.updatedBy     = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

EmailCampaignSchema.methods.markFailed = async function (
  this: IEmailCampaign,
  reason: string
): Promise<IEmailCampaign> {
  this.status        = EmailCampaignStatus.FAILED;
  this.failureReason = reason;
  this.retryCount   += 1;
  this.updatedBy     = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

EmailCampaignSchema.methods.cancel = async function (
  this: IEmailCampaign
): Promise<IEmailCampaign> {
  this.status    = EmailCampaignStatus.CANCELLED;
  this.updatedBy = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

EmailCampaignSchema.methods.softDelete = async function (
  this: IEmailCampaign,
  deletedBy: Types.ObjectId
): Promise<IEmailCampaign> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

// ─── Static Methods ───────────────────────────────────────────────────────────
EmailCampaignSchema.statics.getDueEmails = function (companyId: string, limit = 50) {
  return this.find({
    company:      companyId,
    isDeleted:    false,
    status:       EmailCampaignStatus.SCHEDULED,
    scheduledAt:  { $lte: new Date() },
  })
  .populate('template', 'name subject category')
  .populate('lead', 'name email phone status')
  .sort({ scheduledAt: 1 })
  .limit(limit);
};

EmailCampaignSchema.statics.getPendingByLead = function (leadId: string) {
  return this.find({
    lead:      new Types.ObjectId(leadId),
    isDeleted: false,
    status:    { $in: [EmailCampaignStatus.SCHEDULED, EmailCampaignStatus.PROCESSING] },
  }).sort({ scheduledAt: 1 });
};

EmailCampaignSchema.statics.getByTemplate = function (templateId: string) {
  return this.find({
    template:  new Types.ObjectId(templateId),
    isDeleted: false,
  }).sort({ createdAt: -1 });
};

EmailCampaignSchema.statics.getBouncedEmails = function (companyId: string) {
  return this.find({
    company:   companyId,
    isDeleted: false,
    status:    EmailCampaignStatus.BOUNCED,
  }).sort({ bouncedAt: -1 });
};

// ─── Model ────────────────────────────────────────────────────────────────────
export type EmailCampaignModel = Model<IEmailCampaign> & IEmailCampaignStatics;
export const EmailCampaign = model<IEmailCampaign, EmailCampaignModel>('EmailCampaign', EmailCampaignSchema);
export default EmailCampaign;