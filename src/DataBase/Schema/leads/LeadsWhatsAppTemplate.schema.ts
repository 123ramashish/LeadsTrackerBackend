// src/models/WhatsAppTemplate.ts
import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum WhatsAppTemplateStatus {
  DRAFT      = 'draft',
  PENDING    = 'pending',
  APPROVED   = 'approved',
  REJECTED   = 'rejected',
  DISABLED   = 'disabled',
}

export enum WhatsAppCategory {
  AUTHENTICATION = 'authentication',
  MARKETING      = 'marketing',
  UTILITY        = 'utility',
}

export enum WhatsAppLanguage {
  EN_US = 'en_US',
  EN_GB = 'en_GB',
  HI_IN = 'hi_IN',
  ES_ES = 'es_ES',
  // Add more as needed
}

// ─── Statics interface ────────────────────────────────────────────────────────
export interface IWhatsAppTemplateStatics {
  getByCompany(companyId: string, status?: WhatsAppTemplateStatus): mongoose.Query<IWhatsAppTemplate[], IWhatsAppTemplate>;
  getApprovedTemplates(companyId: string): mongoose.Query<IWhatsAppTemplate[], IWhatsAppTemplate>;
}

// ─── Document interface ───────────────────────────────────────────────────────
export interface IWhatsAppTemplate extends Document {
  // ── Core Identity ──────────────────────────────────────────────────────
  name:           string;        // Internal name (e.g., "welcome_offer_v1")
  templateId?:    string;        // Provider ID (e.g., Meta WhatsApp ID)
  language:       WhatsAppLanguage;
  category:       WhatsAppCategory;
  status:         WhatsAppTemplateStatus;
  
  // ── Content ────────────────────────────────────────────────────────────
  bodyContent:    string;        // Text with placeholders {{1}}, {{2}}
  headerContent?: string;        // Optional header text or media handle_id
  footerContent?: string;        // Optional footer text
  buttons?: {
    type: 'quick_reply' | 'url' | 'phone_number';
    text: string;
    url?: string;
    phone_number?: string;
  }[];

  // ── Dynamic Variables ──────────────────────────────────────────────────
  /**
   * Definition of expected variables for rendering.
   * e.g., [{ name: 'customer_name', type: 'string' }, { name: 'otp', type: 'number' }]
   */
  variables: {
    name: string;
    type: 'string' | 'number' | 'date' | 'currency';
    required: boolean;
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

  // ── Instance Methods ───────────────────────────────────────────────────
  render(variables: Record<string, any>): string;
  softDelete(deletedBy: Types.ObjectId): Promise<this>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const WhatsAppTemplateSchema = new Schema<IWhatsAppTemplate>(
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
    language: {
      type:     String,
      enum:     { values: Object.values(WhatsAppLanguage), message: '{VALUE} is not a valid language' },
      default:  WhatsAppLanguage.EN_US,
      required: true,
    },
    category: {
      type:     String,
      enum:     { values: Object.values(WhatsAppCategory), message: '{VALUE} is not a valid category' },
      default:  WhatsAppCategory.MARKETING,
      required: true,
    },
    status: {
      type:     String,
      enum:     { values: Object.values(WhatsAppTemplateStatus), message: '{VALUE} is not a valid status' },
      default:  WhatsAppTemplateStatus.DRAFT,
      required: true,
      index:    true,
    },
    // ── Content ───────────────────────────────────────────────────────────
    bodyContent: {
      type:     String,
      required: [true, 'Body content is required'],
      trim:     true,
      maxlength:[1024, 'Body content cannot exceed 1024 characters'],
    },
    headerContent: {
      type:     String,
      trim:     true,
      maxlength:[60, 'Header content cannot exceed 60 characters'],
    },
    footerContent: {
      type:     String,
      trim:     true,
      maxlength:[60, 'Footer content cannot exceed 60 characters'],
    },
    buttons: {
      type: [{
        type: { type: String, enum: ['quick_reply', 'url', 'phone_number'] },
        text: String,
        url: String,
        phone_number: String,
      }],
      default: [],
    },
    // ── Dynamic Variables ─────────────────────────────────────────────────
    variables: {
      type: [{
        name:     { type: String, required: true },
        type:     { type: String, enum: ['string', 'number', 'date', 'currency'], required: true },
        required: { type: Boolean, default: true },
      }],
      default: [],
    },
    // ── Company & Audit ───────────────────────────────────────────────────
    company: {
      type:  Schema.Types.ObjectId,
      ref:   'Company',
      index: true,
      required: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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
// ESR: Company → Status → Name
WhatsAppTemplateSchema.index(
  { company: 1, status: 1, name: 1 },
  { name: 'cx_status_name' }
);
// Unique template name per company (if not using provider templateId)
WhatsAppTemplateSchema.index(
  { company: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: 'uq_company_name' }
);
// Soft delete filter
WhatsAppTemplateSchema.index(
  { company: 1, isDeleted: 1, createdAt: -1 },
  { name: 'cx_deleted_created' }
);

// ─── Instance Methods ─────────────────────────────────────────────────────────
/**
 * Replaces {{1}}, {{2}} or {{variable_name}} placeholders with provided values.
 */
WhatsAppTemplateSchema.methods.render = function (this: IWhatsAppTemplate, variables: Record<string, any>): string {
  let content = this.bodyContent;
  
  // Handle positional placeholders {{1}}, {{2}}...
  this.variables.forEach((v, index) => {
    const val = variables[v.name] ?? variables[index + 1];
    if (val !== undefined) {
      const regex = new RegExp(`\\{\\{${index + 1}\\}\\}`, 'g');
      content = content.replace(regex, String(val));
    }
  });

  // Handle named placeholders {{customer_name}}
  Object.keys(variables).forEach(key => {
    if (typeof key === 'string' && !/^\d+$/.test(key)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      content = content.replace(regex, String(variables[key]));
    }
  });

  return content;
};

WhatsAppTemplateSchema.methods.softDelete = async function (
  this: IWhatsAppTemplate,
  deletedBy: Types.ObjectId
): Promise<IWhatsAppTemplate> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

// ─── Static Methods ───────────────────────────────────────────────────────────
WhatsAppTemplateSchema.statics.getByCompany = function (companyId: string, status?: WhatsAppTemplateStatus) {
  const query: Record<string, unknown> = { company: companyId, isDeleted: false };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

WhatsAppTemplateSchema.statics.getApprovedTemplates = function (companyId: string) {
  return this.find({ 
    company: companyId, 
    status: WhatsAppTemplateStatus.APPROVED, 
    isDeleted: false 
  }).sort({ name: 1 });
};

// ─── Model ────────────────────────────────────────────────────────────────────
export type WhatsAppTemplateModel = Model<IWhatsAppTemplate> & IWhatsAppTemplateStatics;
export const WhatsAppTemplate = model<IWhatsAppTemplate, WhatsAppTemplateModel>('WhatsAppTemplate', WhatsAppTemplateSchema);
export default WhatsAppTemplate;