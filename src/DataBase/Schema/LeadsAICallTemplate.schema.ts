// src/models/AICallTemplate.ts
import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum AICallTemplateStatus {
  DRAFT      = 'draft',
  ACTIVE     = 'active',
  INACTIVE   = 'inactive',
  ARCHIVED   = 'archived',
}

export enum AICallCategory {
  SALES_OUTBOUND   = 'sales_outbound',
  SUPPORT_INBOUND  = 'support_inbound',
  FOLLOW_UP        = 'follow_up',
  VERIFICATION     = 'verification',
  APPOINTMENT      = 'appointment',
}

export enum AIProvider {
  ELEVENLABS = 'elevenlabs',
  TWILIO_AI  = 'twilio_ai',
  RETELL     = 'retell',
}

// ─── Statics interface ────────────────────────────────────────────────────────
export interface IAICallTemplateStatics {
  getByCompany(companyId: string, status?: AICallTemplateStatus): mongoose.Query<IAICallTemplate[], IAICallTemplate>;
  getActiveTemplates(companyId: string): mongoose.Query<IAICallTemplate[], IAICallTemplate>;
  getByCategory(companyId: string, category: AICallCategory): mongoose.Query<IAICallTemplate[], IAICallTemplate>;
}

// ─── Document interface ───────────────────────────────────────────────────────
export interface IAICallTemplate extends Document {
  // ── Core Identity ──────────────────────────────────────────────────────
  name:           string;        // Internal name (e.g., "sales_qualifier_v1")
  templateId?:    string;        // Provider Template ID (if applicable)
  category:       AICallCategory;
  status:         AICallTemplateStatus;
  provider:       AIProvider;
  
  // ── ElevenLabs Voice Settings ──────────────────────────────────────────
  voiceConfig: {
    voiceId:    string;        // ElevenLabs Voice ID
    modelId:    string;        // e.g., "eleven_turbo_v2", "eleven_monolingual_v1"
    stability:  number;        // 0.0 - 1.0
    similarity: number;        // 0.0 - 1.0 (Similarity Boost)
    style?:     number;        // 0.0 - 1.0 (Style Exaggeration)
  };

  // ── Call Flow & Prompt ─────────────────────────────────────────────────
  systemPrompt:   string;        // The main instruction for the AI agent
  firstMessage?:  string;        // Optional specific opening line
  maxDuration?:   number;        // Max call duration in seconds
  allowInterruption: boolean;    // Can user interrupt the AI?
  
  // ── Twilio Configuration ───────────────────────────────────────────────
  twilioConfig?: {
    phoneNumberSid: string;    // Twilio Phone Number SID to call from
    webhookUrl?:    string;    // Override default webhook
    recordingEnabled: boolean;
  };

  // ── Dynamic Variables ──────────────────────────────────────────────────
  variables: {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    required: boolean;
    defaultValue?: string;
  }[];

  // ── Company & Audit ────────────────────────────────────────────────────
  company:      Types.ObjectId;   // ref → Company
  createdBy?:   Types.ObjectId;   // ref → User
  updatedBy?:   Types.ObjectId;   // ref → User
  
  // ── Soft Delete ────────────────────────────────────────────────────────
  isDeleted:  boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;

  // ── Timestamps ─────────────────────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;

  // ── Usage Tracking ─────────────────────────────────────────────────────
  timesUsed: number;
  lastUsedAt?: Date;

  // ── Instance Methods ───────────────────────────────────────────────────
  renderPrompt(variables: Record<string, any>): string;
  incrementUsage(): Promise<this>;
  softDelete(deletedBy: Types.ObjectId): Promise<this>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const AICallTemplateSchema = new Schema<IAICallTemplate>(
  {
    // ── Core Identity ─────────────────────────────────────────────────────
    name: {
      type:     String,
      required: [true, 'Template name is required'],
      trim:     true,
      maxlength:[100, 'Name cannot exceed 100 characters'],
      index:    true,
    },
    templateId: {
      type:     String,
      trim:     true,
      sparse:   true,
    },
    category: {
      type:     String,
      enum:     { values: Object.values(AICallCategory), message: '{VALUE} is not a valid category' },
      default:  AICallCategory.FOLLOW_UP,
      required: true,
      index:    true,
    },
    status: {
      type:     String,
      enum:     { values: Object.values(AICallTemplateStatus), message: '{VALUE} is not a valid status' },
      default:  AICallTemplateStatus.DRAFT,
      required: true,
      index:    true,
    },
    provider: {
      type:     String,
      enum:     { values: Object.values(AIProvider), message: '{VALUE} is not a valid provider' },
      default:  AIProvider.ELEVENLABS,
      required: true,
    },
    // ── ElevenLabs Voice Settings ────────────────────────────────────────
    voiceConfig: {
      voiceId:    { type: String, required: true, trim: true },
      modelId:    { type: String, required: true, trim: true, default: 'eleven_turbo_v2' },
      stability:  { type: Number, min: 0, max: 1, default: 0.5 },
      similarity: { type: Number, min: 0, max: 1, default: 0.75 },
      style:      { type: Number, min: 0, max: 1 },
    },
    // ── Call Flow & Prompt ───────────────────────────────────────────────
    systemPrompt: {
      type:     String,
      required: [true, 'System prompt is required'],
      trim:     true,
      maxlength:[5000, 'Prompt cannot exceed 5000 characters'],
    },
    firstMessage: {
      type:     String,
      trim:     true,
      maxlength:[500, 'First message cannot exceed 500 characters'],
    },
    maxDuration: {
      type:     Number,
      default:  300, // 5 minutes
      min:      [10, 'Minimum duration 10s'],
      max:      [1800, 'Maximum duration 30m'],
    },
    allowInterruption: {
      type:     Boolean,
      default:  true,
    },
    // ── Twilio Configuration ─────────────────────────────────────────────
    twilioConfig: {
      phoneNumberSid: { type: String, required: true, trim: true },
      webhookUrl:     { type: String, trim: true },
      recordingEnabled: { type: Boolean, default: true },
    },
    // ── Dynamic Variables ────────────────────────────────────────────────
    variables: {
      type: [{
        name:         { type: String, required: true },
        type:         { type: String, enum: ['string', 'number', 'date', 'boolean'], required: true },
        required:     { type: Boolean, default: true },
        defaultValue: { type: String },
      }],
      default: [],
    },
    // ── Company & Audit ──────────────────────────────────────────────────
    company: {
      type:     Schema.Types.ObjectId,
      ref:      'Company',
      index:    true,
      required: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // ── Usage Tracking ───────────────────────────────────────────────────
    timesUsed: {
      type:    Number,
      default: 0,
      min:     [0, 'Usage count cannot be negative'],
    },
    lastUsedAt: { type: Date },
    // ── Soft Delete ──────────────────────────────────────────────────────
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
// ESR: Company → Status → Category
AICallTemplateSchema.index(
  { company: 1, status: 1, category: 1 },
  { name: 'cx_status_category' }
);
// Unique template name per company
AICallTemplateSchema.index(
  { company: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: 'uq_company_name' }
);
// Soft delete filter
AICallTemplateSchema.index(
  { company: 1, isDeleted: 1, createdAt: -1 },
  { name: 'cx_deleted_created' }
);

// ─── Instance Methods ─────────────────────────────────────────────────────────
/**
 * Replaces {{variable_name}} placeholders in the system prompt.
 */
AICallTemplateSchema.methods.renderPrompt = function (
  this: IAICallTemplate,
  variables: Record<string, any>
): string {
  let prompt = this.systemPrompt;
  
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    prompt = prompt.replace(regex, String(variables[key]));
  });

  return prompt;
};

AICallTemplateSchema.methods.incrementUsage = async function (
  this: IAICallTemplate
): Promise<IAICallTemplate> {
  this.timesUsed += 1;
  this.lastUsedAt = new Date();
  return this.save();
};

AICallTemplateSchema.methods.softDelete = async function (
  this: IAICallTemplate,
  deletedBy: Types.ObjectId
): Promise<IAICallTemplate> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

// ─── Static Methods ───────────────────────────────────────────────────────────
AICallTemplateSchema.statics.getByCompany = function (
  companyId: string,
  status?: AICallTemplateStatus
) {
  const query: Record<string, unknown> = { company: companyId, isDeleted: false };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

AICallTemplateSchema.statics.getActiveTemplates = function (companyId: string) {
  return this.find({ 
    company: companyId, 
    status: AICallTemplateStatus.ACTIVE, 
    isDeleted: false 
  }).sort({ name: 1 });
};

AICallTemplateSchema.statics.getByCategory = function (
  companyId: string,
  category: AICallCategory
) {
  return this.find({ 
    company: companyId, 
    category, 
    status: AICallTemplateStatus.ACTIVE, 
    isDeleted: false 
  }).sort({ name: 1 });
};

// ─── Model ────────────────────────────────────────────────────────────────────
export type AICallTemplateModel = Model<IAICallTemplate> & IAICallTemplateStatics;
export const AICallTemplate = model<IAICallTemplate, AICallTemplateModel>('AICallTemplate', AICallTemplateSchema);
export default AICallTemplate;