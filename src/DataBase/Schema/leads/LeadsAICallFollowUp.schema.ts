// src/models/AICallFollowUp.ts
import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum AICallStatus {
  SCHEDULED   = 'scheduled',
  INITIATING  = 'initiating',   // Twilio call created
  RINGING     = 'ringing',
  IN_PROGRESS = 'in_progress',
  COMPLETED   = 'completed',
  FAILED      = 'failed',
  BUSY        = 'busy',
  NO_ANSWER   = 'no_answer',
  CANCELLED   = 'cancelled',
}

export enum AICallDirection {
  OUTBOUND = 'outbound',
  INBOUND  = 'inbound',
}

export enum CallSentiment {
  POSITIVE = 'positive',
  NEUTRAL  = 'neutral',
  NEGATIVE = 'negative',
}

// ─── Statics interface ────────────────────────────────────────────────────────
export interface IAICallFollowUpStatics {
  getDueCalls(companyId: string, limit?: number): mongoose.Query<IAICallFollowUp[], IAICallFollowUp>;
  getPendingByLead(leadId: string): mongoose.Query<IAICallFollowUp[], IAICallFollowUp>;
  getByTwilioSid(callSid: string): mongoose.Query<IAICallFollowUp | null, IAICallFollowUp>;
  getCompletedByTemplate(templateId: string): mongoose.Query<IAICallFollowUp[], IAICallFollowUp>;
}

// ─── Document interface ───────────────────────────────────────────────────────
export interface IAICallFollowUp extends Document {
  // ── Relations ──────────────────────────────────────────────────────────
  company:    Types.ObjectId;   // ref → Company
  lead:       Types.ObjectId;   // ref → Lead
  template:   Types.ObjectId;   // ref → AICallTemplate

  // ── Call Identity ──────────────────────────────────────────────────────
  direction:  AICallDirection;
  sessionId?: string;           // Internal session ID (e.g., Retell/Provider Session ID)

  // ── Recipient ──────────────────────────────────────────────────────────
  recipient:  string;           // Phone number (E.164 format)
  recipientName?: string;

  // ── Twilio Specifics ───────────────────────────────────────────────────
  twilioCallSid?:   string;     // Twilio Call SID
  twilioPhoneNumberSid?: string; // Twilio Number SID used
  recordingUrl?:    string;     // Public URL to recording
  recordingSid?:    string;     // Twilio Recording SID
  transcription?:   string;     // Full text transcript
  summary?:         string;     // AI-generated summary of call
  sentiment?:       CallSentiment;

  // ── Timing ─────────────────────────────────────────────────────────────
  scheduledAt:  Date;
  initiatedAt?: Date;           // When Twilio call started
  answeredAt?:  Date;           // When human picked up
  endedAt?:     Date;
  
  // ── Metrics ────────────────────────────────────────────────────────────
  durationSeconds?: number;
  costUsd?:         number;     // Estimated cost of call
  latencyMs?:       number;     // AI response latency avg
  
  // ── Status & Tracking ──────────────────────────────────────────────────
  status:       AICallStatus;
  failureReason?: string;
  retryCount:   number;
  maxRetries:   number;

  // ── Dynamic Data ───────────────────────────────────────────────────────
  variables:    Record<string, any>; // Values used for this specific call

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
  startCall(twilioSid: string): Promise<this>;
  markAnswered(): Promise<this>;
  endCall(duration: number, recordingUrl?: string): Promise<this>;
  updateTranscription(text: string, summary?: string, sentiment?: CallSentiment): Promise<this>;
  markFailed(reason: string): Promise<this>;
  cancel(): Promise<this>;
  softDelete(deletedBy: Types.ObjectId): Promise<this>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const AICallFollowUpSchema = new Schema<IAICallFollowUp>(
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
      ref:      'AICallTemplate',
      required: true,
      index:    true,
    },
    // ── Call Identity ────────────────────────────────────────────────────
    direction: {
      type:     String,
      enum:     { values: Object.values(AICallDirection), message: '{VALUE} is not a valid direction' },
      default:  AICallDirection.OUTBOUND,
      required: true,
    },
    sessionId: {
      type:     String,
      trim:     true,
      sparse:   true,
      index:    true,
    },
    // ── Recipient ────────────────────────────────────────────────────────
    recipient: {
      type:     String,
      required: [true, 'Recipient phone number is required'],
      trim:     true,
      index:    true,
    },
    recipientName: {
      type:     String,
      trim:     true,
    },
    // ── Twilio Specifics ─────────────────────────────────────────────────
    twilioCallSid: {
      type:     String,
      trim:     true,
      sparse:   true,
      index:    true,
    },
    twilioPhoneNumberSid: {
      type:     String,
      trim:     true,
    },
    recordingUrl: {
      type:     String,
      trim:     true,
    },
    recordingSid: {
      type:     String,
      trim:     true,
    },
    transcription: {
      type:     String,
      trim:     true,
    },
    summary: {
      type:     String,
      trim:     true,
      maxlength:[2000, 'Summary cannot exceed 2000 characters'],
    },
    sentiment: {
      type:     String,
      enum:     { values: Object.values(CallSentiment), message: '{VALUE} is not a valid sentiment' },
    },
    // ── Timing ───────────────────────────────────────────────────────────
    scheduledAt: {
      type:     Date,
      required: [true, 'Scheduled date is required'],
      index:    true,
    },
    initiatedAt: { type: Date },
    answeredAt:  { type: Date },
    endedAt:     { type: Date, index: true },
    // ── Metrics ──────────────────────────────────────────────────────────
    durationSeconds: {
      type:     Number,
      min:      [0, 'Duration cannot be negative'],
    },
    costUsd: {
      type:     Number,
      min:      [0, 'Cost cannot be negative'],
    },
    latencyMs: {
      type:     Number,
      min:      [0, 'Latency cannot be negative'],
    },
    // ── Status & Tracking ────────────────────────────────────────────────
    status: {
      type:     String,
      enum:     { values: Object.values(AICallStatus), message: '{VALUE} is not a valid call status' },
      default:  AICallStatus.SCHEDULED,
      required: true,
      index:    true,
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
    maxRetries: {
      type:     Number,
      default:  2,
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
// ESR: Company → ScheduledAt → Status (For Dialer Cron Jobs)
AICallFollowUpSchema.index(
  { company: 1, scheduledAt: 1, status: 1 },
  { name: 'cx_scheduled_status' }
);
// ESR: Company → Lead → Status (For Lead Timeline)
AICallFollowUpSchema.index(
  { company: 1, lead: 1, status: 1, createdAt: -1 },
  { name: 'cx_lead_status_created' }
);
// ESR: Twilio Call Sid (For Webhook Processing)
AICallFollowUpSchema.index(
  { twilioCallSid: 1 },
  { name: 'ix_twilio_sid', sparse: true }
);
// ESR: Company → Template → Status (For Template Analytics)
AICallFollowUpSchema.index(
  { company: 1, template: 1, status: 1 },
  { name: 'cx_template_status' }
);
// Soft Delete Filter
AICallFollowUpSchema.index(
  { company: 1, isDeleted: 1, scheduledAt: 1 },
  { name: 'cx_deleted_scheduled' }
);
// Completed Calls for Reporting
AICallFollowUpSchema.index(
  { company: 1, isDeleted: 1, status: 1, endedAt: -1 },
  { name: 'cx_deleted_status_ended', sparse: true }
);

// ─── Instance Methods ─────────────────────────────────────────────────────────
AICallFollowUpSchema.methods.startCall = async function (
  this: IAICallFollowUp,
  twilioSid: string
): Promise<IAICallFollowUp> {
  this.status      = AICallStatus.INITIATING;
  this.twilioCallSid = twilioSid;
  this.initiatedAt = new Date();
  this.updatedBy   = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

AICallFollowUpSchema.methods.markAnswered = async function (
  this: IAICallFollowUp
): Promise<IAICallFollowUp> {
  this.status      = AICallStatus.IN_PROGRESS;
  this.answeredAt  = new Date();
  this.updatedBy   = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

AICallFollowUpSchema.methods.endCall = async function (
  this: IAICallFollowUp,
  duration: number,
  recordingUrl?: string
): Promise<IAICallFollowUp> {
  this.status        = AICallStatus.COMPLETED;
  this.endedAt       = new Date();
  this.durationSeconds = duration;
  if (recordingUrl) this.recordingUrl = recordingUrl;
  this.updatedBy     = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

AICallFollowUpSchema.methods.updateTranscription = async function (
  this: IAICallFollowUp,
  text: string,
  summary?: string,
  sentiment?: CallSentiment
): Promise<IAICallFollowUp> {
  this.transcription = text;
  if (summary) this.summary = summary;
  if (sentiment) this.sentiment = sentiment;
  this.updatedBy = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

AICallFollowUpSchema.methods.markFailed = async function (
  this: IAICallFollowUp,
  reason: string
): Promise<IAICallFollowUp> {
  this.status        = AICallStatus.FAILED;
  this.failureReason = reason;
  this.endedAt       = new Date();
  this.retryCount   += 1;
  this.updatedBy     = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

AICallFollowUpSchema.methods.cancel = async function (
  this: IAICallFollowUp
): Promise<IAICallFollowUp> {
  this.status    = AICallStatus.CANCELLED;
  this.endedAt   = new Date();
  this.updatedBy = (this.updatedBy as any) || (this.createdBy as any);
  return this.save();
};

AICallFollowUpSchema.methods.softDelete = async function (
  this: IAICallFollowUp,
  deletedBy: Types.ObjectId
): Promise<IAICallFollowUp> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

// ─── Static Methods ───────────────────────────────────────────────────────────
AICallFollowUpSchema.statics.getDueCalls = function (companyId: string, limit = 50) {
  return this.find({
    company:      companyId,
    isDeleted:    false,
    status:       AICallStatus.SCHEDULED,
    scheduledAt:  { $lte: new Date() },
  })
  .populate('template', 'name voiceConfig systemPrompt twilioConfig')
  .populate('lead', 'name phone whatsapp status')
  .sort({ scheduledAt: 1 })
  .limit(limit);
};

AICallFollowUpSchema.statics.getPendingByLead = function (leadId: string) {
  return this.find({
    lead:      new Types.ObjectId(leadId),
    isDeleted: false,
    status:    { $in: [AICallStatus.SCHEDULED, AICallStatus.INITIATING] },
  }).sort({ scheduledAt: 1 });
};

AICallFollowUpSchema.statics.getByTwilioSid = function (callSid: string) {
  return this.findOne({ twilioCallSid: callSid, isDeleted: false });
};

AICallFollowUpSchema.statics.getCompletedByTemplate = function (templateId: string) {
  return this.find({
    template:  new Types.ObjectId(templateId),
    isDeleted: false,
    status:    AICallStatus.COMPLETED,
  }).sort({ endedAt: -1 });
};

// ─── Model ────────────────────────────────────────────────────────────────────
export type AICallFollowUpModel = Model<IAICallFollowUp> & IAICallFollowUpStatics;
export const AICallFollowUp = model<IAICallFollowUp, AICallFollowUpModel>('AICallFollowUp', AICallFollowUpSchema);
export default AICallFollowUp;