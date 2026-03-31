// src/models/WhatsAppFollowUp.ts
import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum WhatsAppFollowUpStatus {
  SCHEDULED  = 'scheduled',
  PROCESSING = 'processing',
  SENT       = 'sent',
  DELIVERED  = 'delivered',
  READ       = 'read',
  FAILED     = 'failed',
  CANCELLED  = 'cancelled',
}

// ─── Statics interface ────────────────────────────────────────────────────────
export interface IWhatsAppFollowUpStatics {
  getDueFollowUps(companyId: string, limit?: number): mongoose.Query<IWhatsAppFollowUp[], IWhatsAppFollowUp>;
  getPendingByLead(leadId: string): mongoose.Query<IWhatsAppFollowUp[], IWhatsAppFollowUp>;
}

// ─── Document interface ───────────────────────────────────────────────────────
export interface IWhatsAppFollowUp extends Document {
  // ── Relations ──────────────────────────────────────────────────────────
  company:    Types.ObjectId;   // ref → Company
  lead:       Types.ObjectId;   // ref → Lead
  template:   Types.ObjectId;   // ref → WhatsAppTemplate

  // ── Recipient ──────────────────────────────────────────────────────────
  recipient:  string;           // Phone number at time of scheduling (snapshot)

  // ── Scheduling ─────────────────────────────────────────────────────────
  scheduledAt: Date;
  sentAt?:     Date;
  deliveredAt?:Date;
  readAt?:     Date;

  // ── Status & Tracking ──────────────────────────────────────────────────
  status:      WhatsAppFollowUpStatus;
  messageId?:  string;         // Provider Message ID (e.g., wamid)
  failureReason?: string;
  retryCount:  number;

  // ── Dynamic Data ───────────────────────────────────────────────────────
  /**
   * The specific values used to render the template for this instance.
   * e.g., { customer_name: "John", otp: "1234" }
   */
  variables:   Record<string, any>;

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
  markFailed(reason: string): Promise<this>;
  cancel(): Promise<this>;
  softDelete(deletedBy: Types.ObjectId): Promise<this>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const WhatsAppFollowUpSchema = new Schema<IWhatsAppFollowUp>(
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
      ref:      'WhatsAppTemplate',
      required: true,
    },
    // ── Recipient ────────────────────────────────────────────────────────
    recipient: {
      type:     String,
      required: [true, 'Recipient phone number is required'],
      trim:     true,
      index:    true,
    },
    // ── Scheduling ───────────────────────────────────────────────────────
    scheduledAt: {
      type:     Date,
      required: [true, 'Scheduled date is required'],
      index:    true,
    },
    sentAt:      { type: Date, index: true },
    deliveredAt: { type: Date },
    readAt:      { type: Date },
    // ── Status & Tracking ────────────────────────────────────────────────
    status: {
      type:     String,
      enum:     { values: Object.values(WhatsAppFollowUpStatus), message: '{VALUE} is not a valid follow-up status' },
      default:  WhatsAppFollowUpStatus.SCHEDULED,
      required: true,
      index:    true,
    },
    messageId: {
      type:     String,
      trim:     true,
      sparse:   true,
    },
    failureReason: {
      type:     String,
      trim:     true,
    },
    retryCount: {
      type:     Number,
      default:  0,
      min:      0,
    },
    // ── Dynamic Data ─────────────────────────────────────────────────────
    variables: {
      type:     Schema.Types.Mixed,
      default:  {},
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
WhatsAppFollowUpSchema.index(
  { company: 1, scheduledAt: 1, status: 1 },
  { name: 'cx_scheduled_status' }
);
// ESR: Company → Lead → Status (For Lead Timeline)
WhatsAppFollowUpSchema.index(
  { company: 1, lead: 1, status: 1, createdAt: -1 },
  { name: 'cx_lead_status_created' }
);
// Soft Delete Filter
WhatsAppFollowUpSchema.index(
  { company: 1, isDeleted: 1, scheduledAt: 1 },
  { name: 'cx_deleted_scheduled' }
);

// ─── Pre-save Middleware ──────────────────────────────────────────────────────
// Prevent scheduling in the past
WhatsAppFollowUpSchema.pre('save', function (next) {
  if (this.isNew && this.scheduledAt < new Date()) {
    // Allow slight buffer for processing, but generally prevent past dates
    // unless manually overridden by admin logic (skipped here for strictness)
    // return next(new Error('Cannot schedule follow-up in the past'));
  }
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────
WhatsAppFollowUpSchema.methods.markSent = async function (this: IWhatsAppFollowUp, messageId: string): Promise<IWhatsAppFollowUp> {
  this.status      = WhatsAppFollowUpStatus.SENT;
  this.sentAt      = new Date();
  this.messageId   = messageId;
  this.updatedBy   = (this.updatedBy as any) || (this.createdBy as any); // Fallback
  return this.save();
};

WhatsAppFollowUpSchema.methods.markFailed = async function (this: IWhatsAppFollowUp, reason: string): Promise<IWhatsAppFollowUp> {
  this.status        = WhatsAppFollowUpStatus.FAILED;
  this.failureReason = reason;
  this.retryCount   += 1;
  this.updatedBy     = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

WhatsAppFollowUpSchema.methods.cancel = async function (this: IWhatsAppFollowUp): Promise<IWhatsAppFollowUp> {
  this.status      = WhatsAppFollowUpStatus.CANCELLED;
  this.updatedBy   = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

WhatsAppFollowUpSchema.methods.softDelete = async function (
  this: IWhatsAppFollowUp,
  deletedBy: Types.ObjectId
): Promise<IWhatsAppFollowUp> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

// ─── Static Methods ───────────────────────────────────────────────────────────
WhatsAppFollowUpSchema.statics.getDueFollowUps = function (companyId: string, limit = 50) {
  return this.find({
    company:      companyId,
    isDeleted:    false,
    status:       WhatsAppFollowUpStatus.SCHEDULED,
    scheduledAt:  { $lte: new Date() },
  })
  .populate('template', 'name bodyContent language')
  .populate('lead', 'name phone whatsapp status')
  .sort({ scheduledAt: 1 })
  .limit(limit);
};

WhatsAppFollowUpSchema.statics.getPendingByLead = function (leadId: string) {
  return this.find({
    lead:      new Types.ObjectId(leadId),
    isDeleted: false,
    status:    { $in: [WhatsAppFollowUpStatus.SCHEDULED, WhatsAppFollowUpStatus.PROCESSING] },
  }).sort({ scheduledAt: 1 });
};

// ─── Model ────────────────────────────────────────────────────────────────────
export type WhatsAppFollowUpModel = Model<IWhatsAppFollowUp> & IWhatsAppFollowUpStatics;
export const WhatsAppFollowUp = model<IWhatsAppFollowUp, WhatsAppFollowUpModel>('WhatsAppFollowUp', WhatsAppFollowUpSchema);
export default WhatsAppFollowUp;