import { Schema, model, Document, Types } from 'mongoose';
import { Channel } from '../../types';

export interface ITemplate extends Document {
  name: string;
  channel: Channel;
  subject?: string;   // email only
  body: string;
  usageCount: number;
  isActive: boolean;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  // Virtuals
  characterCount: number;
  isWhatsAppTemplate: boolean;
  isEmailTemplate: boolean;
}

// ── Main Schema: Template ─────────────────────────────────────────────────
const TemplateSchema = new Schema<ITemplate>(
  {
    // ── Basic Info ──
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [150, 'Template name cannot exceed 150 characters'],
      minlength: [3, 'Template name must be at least 3 characters'],
    },
    channel: {
      type: String,
      enum: {
        values: ['whatsapp', 'email'],
        message: 'Channel must be either "whatsapp" or "email"',
      },
      required: [true, 'Channel is required'],
      index: true,
    },
    
    // ── Content ──
    subject: {
      type: String,
      trim: true,
      maxlength: [200, 'Subject cannot exceed 200 characters'],
      // Note: Required for email channel - validate in service/controller
    },
    body: {
      type: String,
      required: [true, 'Template body is required'],
      maxlength: [5000, 'Body cannot exceed 5,000 characters'],
      minlength: [10, 'Body must be at least 10 characters'],
    },
    
    // ── Metadata ──
    usageCount: {
      type: Number,
      default: 0,
      min: [0, 'Usage count cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────
TemplateSchema.index({ channel: 1, isActive: 1, usageCount: -1 });
TemplateSchema.index({ name: 'text', body: 'text', subject: 'text' });
TemplateSchema.index({ createdBy: 1, channel: 1 });

// ── Virtuals ──────────────────────────────────────────────────────────────
TemplateSchema.virtual('characterCount').get(function (this: ITemplate): number {
  return this.body.length + (this.subject?.length || 0);
});

TemplateSchema.virtual('isWhatsAppTemplate').get(function (this: ITemplate): boolean {
  return this.channel === 'whatsapp';
});

TemplateSchema.virtual('isEmailTemplate').get(function (this: ITemplate): boolean {
  return this.channel === 'email';
});

// ── Pre-save Middleware ───────────────────────────────────────────────────
TemplateSchema.pre('save', function (next) {
  // Auto-validate subject for email templates
  if (this.channel === 'email' && !this.subject?.trim()) {
    throw new Error('Subject is required for email templates');
  }
  
  // Auto-trim whitespace
  if (this.isModified('name')) this.name = this.name.trim();
  if (this.isModified('subject') && this.subject) this.subject = this.subject.trim();
  if (this.isModified('body')) this.body = this.body.trim();
  
  next();
});

// ── Instance Methods ──────────────────────────────────────────────────────
TemplateSchema.methods.incrementUsage = function (): Promise<ITemplate> {
  this.usageCount += 1;
  return this.save();
};

TemplateSchema.methods.updateContent = function (
  updates: Partial<Pick<ITemplate, 'name' | 'subject' | 'body'>>,
  updatedBy: Types.ObjectId
): Promise<ITemplate> {
  if (updates.name) this.name = updates.name.trim();
  if (updates.subject !== undefined) this.subject = updates.subject?.trim();
  if (updates.body) this.body = updates.body.trim();
  this.updatedBy = updatedBy;
  return this.save();
};

TemplateSchema.methods.toggleActive = function (): Promise<ITemplate> {
  this.isActive = !this.isActive;
  return this.save();
};

// ── Static Methods ────────────────────────────────────────────────────────
TemplateSchema.statics.findByChannel = function (channel: Channel, isActive = true) {
  return this.find({ channel, isActive })
    .sort({ usageCount: -1, updatedAt: -1 })
    .limit(50);
};

TemplateSchema.statics.search = function (query: string, channel?: Channel) {
  const searchQuery: any = {
    $text: { $search: query },
    isActive: true,
  };
  if (channel) searchQuery.channel = channel;
  
  return this.find(searchQuery)
    .sort({ score: { $meta: 'textScore' }, usageCount: -1 })
    .limit(20);
};

TemplateSchema.statics.getUsageStats = function (dateFrom?: Date, dateTo?: Date) {
  const match: any = { isActive: true };
  if (dateFrom || dateTo) {
    match.updatedAt = {};
    if (dateFrom) match.updatedAt.$gte = dateFrom;
    if (dateTo) match.updatedAt.$lte = dateTo;
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$channel',
        totalTemplates: { $sum: 1 },
        totalUsage: { $sum: '$usageCount' },
        avgUsage: { $avg: '$usageCount' },
        mostUsed: { $max: '$usageCount' },
      },
    },
  ]);
};

// ── Export Model ──────────────────────────────────────────────────────────
export const Template = model<ITemplate>('Template', TemplateSchema);