import { 
  Schema, 
  model, 
  Model, 
  Types, 
  HydratedDocument,
  QueryWithHelpers 
} from 'mongoose';
import { 
  WAStatus, 
  EmailStatus, 
  FollowUpStatus, 
  IMessageReply, 
  Channel 
} from '../../../types';

// ── Interface: DO NOT extend Document ─────────────────────────────────────
export interface IMessage {
  // Lead snapshot (denormalised for fast list rendering)
  leadId: Types.ObjectId;
  leadName: string;
  leadEmail: string;
  leadPhone: string;

  channel: Channel;
  subject?: string;
  body: string;
  templateId?: Types.ObjectId;

  // WhatsApp delivery status
  waStatus?: WAStatus;

  // Email delivery status
  emailStatus?: EmailStatus;

  // Timestamps
  sentAt: Date;
  deliveredAt?: Date;
  seenAt?: Date;
  openedAt?: Date;
  repliedAt?: Date;

  // Replies from the lead
  replies: IMessageReply[];

  // Follow-up tracking
  followUpStatus: FollowUpStatus;
  followUpScheduledAt?: Date;
  reminderAt?: Date;
  reminderNote?: string;

  // Bulk send
  isBulk: boolean;
  bulkCount?: number;

  createdAt: Date;
  updatedAt: Date;
}

// ── Instance Methods Interface ───────────────────────────────────────────
export interface IMessageMethods {
  markAsDelivered(): Promise<HydratedDocument<IMessage, IMessageMethods>>;
  markAsSeen(): Promise<HydratedDocument<IMessage, IMessageMethods>>;
  addReply(text: string): HydratedDocument<IMessage, IMessageMethods>;
  scheduleFollowUp(date: Date, note?: string): HydratedDocument<IMessage, IMessageMethods>;
  needsAutoFollowUp: boolean; // virtual
}

// ── Static Methods Interface ─────────────────────────────────────────────
export interface IMessageModel extends Model<IMessage, {}, IMessageMethods> {
  findPendingFollowUps(
    companyId: Types.ObjectId
  ): QueryWithHelpers<
    HydratedDocument<IMessage, IMessageMethods>[],
    HydratedDocument<IMessage, IMessageMethods>,
    {},
    IMessage
  >;
  
  getStatsByChannel(
    channel: Channel, 
    dateFrom?: Date, 
    dateTo?: Date
  ): Promise<Array<{
    _id: FollowUpStatus;
    count: number;
    avgReplies: number;
  }>>;
}

// ── Sub-schema: Message Reply ────────────────────────────────────────────
const MessageReplySchema = new Schema<IMessageReply>(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [2000, 'Reply text cannot exceed 2000 characters'],
    },
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: true }
);

// ── Main Schema: Message ─────────────────────────────────────────────────
const MessageSchema = new Schema<IMessage, IMessageModel, IMessageMethods>(
  {
    // ── Lead Reference (denormalised) ──
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: [true, 'leadId is required'],
      index: true,
    },
    leadName: {
      type: String,
      required: [true, 'leadName is required'],
      trim: true,
      maxlength: [200, 'Lead name cannot exceed 200 characters'],
    },
    leadEmail: {
      type: String,
      required: [true, 'leadEmail is required'],
      trim: true,
      lowercase: true,
      maxlength: [255, 'Email cannot exceed 255 characters'],
    },
    leadPhone: {
      type: String,
      required: [true, 'leadPhone is required'],
      trim: true,
      maxlength: [50, 'Phone cannot exceed 50 characters'],
    },

    // ── Channel & Content ──
    channel: {
      type: String,
      enum: {
        values: ['whatsapp', 'email'],
        message: 'Channel must be either "whatsapp" or "email"',
      },
      required: [true, 'Channel is required'],
    },
    subject: {
      type: String,
      trim: true,
      maxlength: [500, 'Subject cannot exceed 500 characters'],
    },
    body: {
      type: String,
      required: [true, 'Message body is required'],
      maxlength: [10000, 'Body cannot exceed 10,000 characters'],
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'Template',
    },

    // ── WhatsApp Status ──
    waStatus: {
      type: String,
      enum: {
        values: ['sending', 'sent', 'delivered', 'seen', 'replied'],
        message: 'Invalid WhatsApp status value',
      },
    },

    // ── Email Status ──
    emailStatus: {
      type: String,
      enum: {
        values: ['sending', 'sent', 'opened', 'replied'],
        message: 'Invalid email status value',
      },
    },

    // ── Timestamps ──
    sentAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    deliveredAt: { type: Date },
    seenAt: { type: Date },
    openedAt: { type: Date },
    repliedAt: { type: Date, index: true },

    // ── Replies Array ──
    replies: {
      type: [MessageReplySchema],
      default: [],
    },

    // ── Follow-up Tracking ──
    followUpStatus: {
      type: String,
      enum: {
        values: ['pending', 'auto_scheduled', 'sent', 'done'],
        message: 'Invalid follow-up status value',
      },
      default: 'pending',
      index: true,
    },
    followUpScheduledAt: { type: Date },
    reminderAt: { 
      type: Date,
      index: { sparse: true }
    },
    reminderNote: {
      type: String,
      trim: true,
      maxlength: [500, 'Reminder note cannot exceed 500 characters'],
    },

    // ── Bulk Send Metadata ──
    isBulk: {
      type: Boolean,
      default: false,
      index: true,
    },
    bulkCount: {
      type: Number,
      min: [1, 'bulkCount must be at least 1'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes for Query Performance ────────────────────────────────────────
MessageSchema.index({ channel: 1, sentAt: -1 });
MessageSchema.index({ leadId: 1, sentAt: -1 });
MessageSchema.index({ followUpStatus: 1, reminderAt: 1 });
MessageSchema.index({ leadName: 'text', body: 'text', subject: 'text' });

// ── Type Guard Helpers ───────────────────────────────────────────────────
function isWAStatus(status: string | undefined): status is WAStatus {
  return ['sending', 'sent', 'delivered', 'seen', 'replied'].includes(status as string);
}

function isEmailStatus(status: string | undefined): status is EmailStatus {
  return ['sending', 'sent', 'opened', 'replied'].includes(status as string);
}

// ── Virtual: Auto Follow-up Reminder (7-day rule) ────────────────────────
MessageSchema.virtual('needsAutoFollowUp').get(function (
  this: HydratedDocument<IMessage, IMessageMethods>
): boolean {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - this.sentAt.getTime();
  
  if (elapsed < SEVEN_DAYS_MS) return false;

  if (this.channel === 'whatsapp') {
    return !isWAStatus(this.waStatus) || 
           (this.waStatus !== 'replied' && this.waStatus !== 'seen');
  }
  
  if (this.channel === 'email') {
    return !isEmailStatus(this.emailStatus) || 
           (this.emailStatus !== 'replied' && this.emailStatus !== 'opened');
  }
  
  return false;
});

// ── Pre-save Middleware ──────────────────────────────────────────────────
MessageSchema.pre('save', function (
  this: HydratedDocument<IMessage, IMessageMethods>,
  next
) {
  if (this.isModified('replies') && this.replies.length > 0) {
    this.followUpStatus = 'done';
    this.followUpScheduledAt = undefined;
    this.reminderAt = undefined;
  }
  next();
});

// ── Instance Methods ─────────────────────────────────────────────────────
MessageSchema.methods.markAsDelivered = function (
  this: HydratedDocument<IMessage, IMessageMethods>
): Promise<HydratedDocument<IMessage, IMessageMethods>> {
  if (this.channel === 'whatsapp') {
    this.waStatus = 'delivered';
    this.deliveredAt = new Date();
  } else {
    this.emailStatus = 'sent';
    this.deliveredAt = new Date();
  }
  return this.save();
};

MessageSchema.methods.markAsSeen = function (
  this: HydratedDocument<IMessage, IMessageMethods>
): Promise<HydratedDocument<IMessage, IMessageMethods>> {
  if (this.channel === 'whatsapp') {
    this.waStatus = 'seen';
    this.seenAt = new Date();
  } else {
    this.emailStatus = 'opened';
    this.openedAt = new Date();
  }
  return this.save();
};

MessageSchema.methods.addReply = function (
  this: HydratedDocument<IMessage, IMessageMethods>,
  text: string
): HydratedDocument<IMessage, IMessageMethods> {
  this.replies.push({
    text: text.trim(),
    receivedAt: new Date(),
  });
  this.repliedAt = new Date();
  if (this.channel === 'whatsapp') {
    this.waStatus = 'replied';
  } else {
    this.emailStatus = 'replied';
  }
  this.followUpStatus = 'done';
  return this;
};

MessageSchema.methods.scheduleFollowUp = function (
  this: HydratedDocument<IMessage, IMessageMethods>,
  date: Date,
  note?: string
): HydratedDocument<IMessage, IMessageMethods> {
  this.followUpStatus = 'auto_scheduled';
  this.followUpScheduledAt = date;
  this.reminderAt = note ? new Date(date.getTime() - 2 * 60 * 60 * 1000) : date;
  this.reminderNote = note;
  return this;
};

// ── Static Methods ───────────────────────────────────────────────────────
MessageSchema.statics.findPendingFollowUps = function (
  this: IMessageModel,
  companyId: Types.ObjectId
) {
  return this.find({
    followUpStatus: { $in: ['pending', 'auto_scheduled'] },
    reminderAt: { $lte: new Date() },
  }).populate('leadId', 'name email phone status');
};

MessageSchema.statics.getStatsByChannel = async function (
  this: IMessageModel,
  channel: Channel,
  dateFrom?: Date,
  dateTo?: Date
) {
  const match: any = { channel };
  if (dateFrom || dateTo) {
    match.sentAt = {};
    if (dateFrom) match.sentAt.$gte = dateFrom;
    if (dateTo) match.sentAt.$lte = dateTo;
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$followUpStatus',
        count: { $sum: 1 },
        avgReplies: { $avg: { $size: '$replies' } },
      },
    },
  ]);
};

// ── Export Model ─────────────────────────────────────────────────────────
export const Message = model<IMessage, IMessageModel>('Message', MessageSchema);