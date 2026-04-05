// DataBase/Schema/whatsappTemplate.schema.ts
import mongoose, { Document, Schema, Types, Model } from 'mongoose'; // add Model

interface IWhatsAppTemplateConfigStatics extends Model<IWhatsAppTemplateConfig> {
  getDefaultCategories(): Omit<ICategory, '_id' | 'createdAt' | 'updatedAt'>[];
}
// ── Sub-document: Individual Template ────────────────────────────────────────

export interface ITemplate {
  _id: Types.ObjectId;
  key: string;               // e.g. "WELCOME", "CONFIRM_BOOKING"
  desc: string;              // Human-readable description
  tpl: string;               // Message body with {variable} placeholders
  vars: string[];            // Auto-extracted variable names e.g. ['name', 'date']
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateSchema = new Schema<ITemplate>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^\w+$/, 'Template key must be alphanumeric with underscores only'],
    },
    desc: {
      type: String,
      trim: true,
      default: '',
      maxlength: [300, 'Description cannot exceed 300 characters'],
    },
    tpl: {
      type: String,
      required: [true, 'Template body is required'],
      trim: true,
      maxlength: [4096, 'WhatsApp message cannot exceed 4096 characters'],
    },
    vars: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, _id: true }
);

// ── Sub-document: Category ────────────────────────────────────────────────────

export interface ICategory {
  _id: Types.ObjectId;
  key: string;               // e.g. "ONBOARDING", "BOOKING"
  label: string;             // Display name e.g. "Onboarding"
  emoji: string;             // e.g. "👤"
  templates: ITemplate[];
  isActive: boolean;
  order: number;             // For drag-drop reordering
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^\w+$/, 'Category key must be alphanumeric with underscores only'],
    },
    label: {
      type: String,
      required: [true, 'Category label is required'],
      trim: true,
      maxlength: [100, 'Label cannot exceed 100 characters'],
    },
    emoji: {
      type: String,
      default: '💬',
    },
    templates: {
      type: [TemplateSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true, _id: true }
);

// ── Root Document: WhatsApp Template Config per Company ───────────────────────

export interface IWhatsAppTemplateConfig extends Document {
  company: Types.ObjectId;           // Reference to Company
  categories: ICategory[];
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy: Types.ObjectId;         // Admin user who created this config
  updatedBy: Types.ObjectId;         // Last user to update
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppTemplateConfigSchema = new Schema<IWhatsAppTemplateConfig>(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,                  // One config document per company
      index: true,
    },
    categories: {
      type: [CategorySchema],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    // Return virtuals when converting to JSON/Object
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Instance methods ──────────────────────────────────────────────────────────

// Auto-extract {variable} placeholders from template body
WhatsAppTemplateConfigSchema.methods.extractVars = function (tpl: string): string[] {
  const matches = [...tpl.matchAll(/\{(\w+)\}/g)];
  return [...new Set(matches.map(m => m[1]))];
};

// ── Static helper: seed default categories for a new company ─────────────────
WhatsAppTemplateConfigSchema.statics.getDefaultCategories = function (): Omit<ICategory, '_id' | 'createdAt' | 'updatedAt'>[] {
  return [
    {
      key: 'ONBOARDING', label: 'Onboarding', emoji: '👤', isActive: true, order: 0,
      templates: [
        { key: 'WELCOME', desc: 'First message to any new patient', vars: ['clinicName'], isActive: true,
          tpl: `👋 Welcome to *{clinicName}*!\n\nI'm your virtual receptionist. I can help you:\n\n1️⃣ Book an appointment\n2️⃣ Check your appointment\n3️⃣ Cancel appointment\n4️⃣ Our services\n5️⃣ Clinic info & timings\n\nPlease type the *number* or describe what you need 😊` } as any,
        { key: 'ASK_NAME', desc: 'Ask patient full name', vars: [], isActive: true,
          tpl: `Great! Let's get you booked. 📋\n\nFirst, may I know your *full name*?` } as any,
      ],
    },
    {
      key: 'BOOKING', label: 'Booking', emoji: '📅', isActive: true, order: 1,
      templates: [
        { key: 'CONFIRM_BOOKING', desc: 'Summary before confirmation', vars: ['name','date','time','issue'], isActive: true,
          tpl: `✅ *Please confirm your appointment:*\n\n👤 Name: *{name}*\n📅 Date: *{date}*\n🕐 Time: *{time}*\n🩺 Issue: *{issue}*\n\nReply *YES* to confirm or *NO* to cancel.` } as any,
        { key: 'BOOKING_SUCCESS', desc: 'Sent after successful booking', vars: ['name','date','time','clinicAddress'], isActive: true,
          tpl: `🎉 *Appointment Confirmed!*\n\nHi {name}, your appointment is booked:\n\n📅 *{date}* at *{time}*\n📍 {clinicAddress}\n\n⏰ Please arrive 10 minutes early.\n\nSee you soon! 💪` } as any,
      ],
    },
    {
      key: 'REMINDER', label: 'Reminder', emoji: '⏰', isActive: true, order: 2,
      templates: [
        { key: 'DAY_BEFORE', desc: 'Day-before appointment reminder', vars: ['clinicName','name','date','time','clinicAddress'], isActive: true,
          tpl: `⏰ *Appointment Reminder* — {clinicName}\n\nHi *{name}*, your appointment is *tomorrow*:\n\n📅 *{date}* at *{time}*\n📍 {clinicAddress}\n\nReply *CANCEL* if you can't make it. See you! 💪` } as any,
      ],
    },
    {
      key: 'GENERAL', label: 'General', emoji: '💬', isActive: true, order: 3,
      templates: [
        { key: 'UNKNOWN', desc: 'Fallback for unrecognised input', vars: [], isActive: true,
          tpl: `🤔 I didn't quite get that. Here's what I can help with:\n\n*1* — Book appointment\n*2* — Check appointment\n*3* — Cancel appointment\n*4* — Our services\n*5* — Clinic info\n\nPlease reply with a number.` } as any,
        { key: 'OUT_OF_HOURS', desc: 'Outside working hours message', vars: [], isActive: true,
          tpl: `😴 We're currently *closed*.\n\nOur working hours are:\n📅 Mon–Sat: 9 AM – 7 PM\n\nYou can still book and we'll confirm it!\nType *1* to proceed.` } as any,
      ],
    },
  ];
};

// ── Indexes ───────────────────────────────────────────────────────────────────
WhatsAppTemplateConfigSchema.index({ company: 1, isDeleted: 1 });

const WhatsAppTemplateConfig = mongoose.model<
  IWhatsAppTemplateConfig,
  IWhatsAppTemplateConfigStatics
>('WhatsAppTemplateConfig', WhatsAppTemplateConfigSchema);

export default WhatsAppTemplateConfig;