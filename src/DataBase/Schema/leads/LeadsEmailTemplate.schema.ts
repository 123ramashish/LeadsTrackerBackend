// src/models/EmailTemplate.ts
import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum EmailTemplateStatus {
  DRAFT      = 'draft',
  ACTIVE     = 'active',
  INACTIVE   = 'inactive',
  ARCHIVED   = 'archived',
}

export enum EmailCategory {
  TRANSACTIONAL  = 'transactional',
  MARKETING      = 'marketing',
  NOTIFICATION   = 'notification',
  ONBOARDING     = 'onboarding',
  FOLLOW_UP      = 'follow_up',
}

// ─── Statics interface ────────────────────────────────────────────────────────
export interface IEmailTemplateStatics {
  getByCompany(companyId: string, status?: EmailTemplateStatus): mongoose.Query<IEmailTemplate[], IEmailTemplate>;
  getActiveTemplates(companyId: string): mongoose.Query<IEmailTemplate[], IEmailTemplate>;
  getByCategory(companyId: string, category: EmailCategory): mongoose.Query<IEmailTemplate[], IEmailTemplate>;
}

// ─── Document interface ───────────────────────────────────────────────────────
export interface IEmailTemplate extends Document {
  // ── Core Identity ──────────────────────────────────────────────────────
  name:           string;        // Internal name (e.g., "welcome_email_v1")
  templateId?:    string;        // Provider ID (e.g., SendGrid/Mailgun ID)
  category:       EmailCategory;
  status:         EmailTemplateStatus;
  
  // ── Content ────────────────────────────────────────────────────────────
  subject:        string;        // Email subject line with placeholders
  htmlContent:    string;        // HTML body with placeholders
  textContent?:   string;        // Plain text fallback
  fromName?:      string;        // Sender name override
  fromEmail?:     string;        // Sender email override
  replyTo?:       string;        // Reply-to email
  
  // ── Dynamic Variables ──────────────────────────────────────────────────
  /**
   * Definition of expected variables for rendering.
   * e.g., [{ name: 'customer_name', type: 'string' }, { name: 'order_id', type: 'string' }]
   */
  variables: {
    name: string;
    type: 'string' | 'number' | 'date' | 'currency' | 'url';
    required: boolean;
    defaultValue?: string;
  }[];

  // ── Attachments ────────────────────────────────────────────────────────
  attachments?: {
    name: string;
    url: string;
    type: string;  // MIME type
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
  render(variables: Record<string, any>): { subject: string; html: string; text?: string };
  incrementUsage(): Promise<this>;
  softDelete(deletedBy: Types.ObjectId): Promise<this>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const EmailTemplateSchema = new Schema<IEmailTemplate>(
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
      index:    true,
    },
    category: {
      type:     String,
      enum:     { values: Object.values(EmailCategory), message: '{VALUE} is not a valid category' },
      default:  EmailCategory.MARKETING,
      required: true,
      index:    true,
    },
    status: {
      type:     String,
      enum:     { values: Object.values(EmailTemplateStatus), message: '{VALUE} is not a valid status' },
      default:  EmailTemplateStatus.DRAFT,
      required: true,
      index:    true,
    },
    // ── Content ───────────────────────────────────────────────────────────
    subject: {
      type:     String,
      required: [true, 'Email subject is required'],
      trim:     true,
      maxlength:[200, 'Subject cannot exceed 200 characters'],
    },
    htmlContent: {
      type:     String,
      required: [true, 'HTML content is required'],
      trim:     true,
    },
    textContent: {
      type:     String,
      trim:     true,
    },
    fromName: {
      type:     String,
      trim:     true,
      maxlength:[100, 'From name cannot exceed 100 characters'],
    },
    fromEmail: {
      type:     String,
      trim:     true,
      lowercase:true,
      match:    [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    replyTo: {
      type:     String,
      trim:     true,
      lowercase:true,
      match:    [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    // ── Dynamic Variables ─────────────────────────────────────────────────
    variables: {
      type: [{
        name:         { type: String, required: true },
        type:         { type: String, enum: ['string', 'number', 'date', 'currency', 'url'], required: true },
        required:     { type: Boolean, default: true },
        defaultValue: { type: String },
      }],
      default: [],
    },
    // ── Attachments ───────────────────────────────────────────────────────
    attachments: {
      type: [{
        name: { type: String, required: true },
        url:  { type: String, required: true },
        type: { type: String, required: true },
      }],
      default: [],
    },
    // ── Company & Audit ───────────────────────────────────────────────────
    company: {
      type:     Schema.Types.ObjectId,
      ref:      'Company',
      index:    true,
      required: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // ── Usage Tracking ────────────────────────────────────────────────────
    timesUsed: {
      type:    Number,
      default: 0,
      min:     [0, 'Usage count cannot be negative'],
    },
    lastUsedAt: { type: Date },
    // ── Soft Delete ───────────────────────────────────────────────────────
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
EmailTemplateSchema.index(
  { company: 1, status: 1, category: 1 },
  { name: 'cx_status_category' }
);
// ESR: Company → Category → Name (for template picker)
EmailTemplateSchema.index(
  { company: 1, category: 1, name: 1 },
  { name: 'cx_category_name' }
);
// Unique template name per company
EmailTemplateSchema.index(
  { company: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: 'uq_company_name' }
);
// Soft delete filter
EmailTemplateSchema.index(
  { company: 1, isDeleted: 1, createdAt: -1 },
  { name: 'cx_deleted_created' }
);

// ─── Instance Methods ─────────────────────────────────────────────────────────
/**
 * Replaces {{variable_name}} or {{1}}, {{2}} placeholders with provided values.
 * Returns rendered subject, HTML, and text content.
 */
EmailTemplateSchema.methods.render = function (
  this: IEmailTemplate,
  variables: Record<string, any>
): { subject: string; html: string; text?: string } {
  const replacePlaceholders = (content: string): string => {
    let result = content;
    
    // Handle positional placeholders {{1}}, {{2}}...
    this.variables.forEach((v, index) => {
      const val = variables[v.name] ?? variables[index + 1] ?? v.defaultValue ?? '';
      const regex = new RegExp(`\\{\\{${index + 1}\\}\\}`, 'g');
      result = result.replace(regex, String(val));
    });

    // Handle named placeholders {{customer_name}}
    Object.keys(variables).forEach(key => {
      if (typeof key === 'string' && !/^\d+$/.test(key)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, String(variables[key]));
      }
    });

    return result;
  };

  return {
    subject: replacePlaceholders(this.subject),
    html:    replacePlaceholders(this.htmlContent),
    text:    this.textContent ? replacePlaceholders(this.textContent) : undefined,
  };
};

EmailTemplateSchema.methods.incrementUsage = async function (
  this: IEmailTemplate
): Promise<IEmailTemplate> {
  this.timesUsed += 1;
  this.lastUsedAt = new Date();
  return this.save();
};

EmailTemplateSchema.methods.softDelete = async function (
  this: IEmailTemplate,
  deletedBy: Types.ObjectId
): Promise<IEmailTemplate> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

// ─── Static Methods ───────────────────────────────────────────────────────────
EmailTemplateSchema.statics.getByCompany = function (
  companyId: string,
  status?: EmailTemplateStatus
) {
  const query: Record<string, unknown> = { company: companyId, isDeleted: false };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

EmailTemplateSchema.statics.getActiveTemplates = function (companyId: string) {
  return this.find({ 
    company: companyId, 
    status: EmailTemplateStatus.ACTIVE, 
    isDeleted: false 
  }).sort({ name: 1 });
};

EmailTemplateSchema.statics.getByCategory = function (
  companyId: string,
  category: EmailCategory
) {
  return this.find({ 
    company: companyId, 
    category, 
    status: EmailTemplateStatus.ACTIVE, 
    isDeleted: false 
  }).sort({ name: 1 });
};

// ─── Model ────────────────────────────────────────────────────────────────────
export type EmailTemplateModel = Model<IEmailTemplate> & IEmailTemplateStatics;
export const EmailTemplate = model<IEmailTemplate, EmailTemplateModel>('EmailTemplate', EmailTemplateSchema);
export default EmailTemplate;