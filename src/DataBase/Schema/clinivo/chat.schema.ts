// DataBase/Schema/chat.schema.ts
import mongoose, { Document, Schema, Types } from 'mongoose';

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum MESSAGE_SENDER {
  PATIENT = 'patient',
  DOCTOR  = 'doctor',
  SYSTEM  = 'system',   // automated confirmations, reminders
}

export enum MESSAGE_TYPE {
  TEXT  = 'text',
  IMAGE = 'image',
  FILE  = 'file',
  AUDIO = 'audio',
}

export enum CHAT_STATUS {
  OPEN     = 'open',      // active conversation
  CLOSED   = 'closed',    // appointment done, thread archived
  RESOLVED = 'resolved',  // explicitly resolved by doctor/admin
}

// ── Sub-document: Message ─────────────────────────────────────────────────────

export interface IMessage {
  _id?:               Types.ObjectId;
  sender:             MESSAGE_SENDER;
  senderRef?:         Types.ObjectId;   // User _id for doctor/admin senders
  content:            string;
  messageType:        MESSAGE_TYPE;
  mediaUrl?:          string;           // S3/CDN URL for images, files, audio
  mediaSize?:         number;           // bytes
  mediaMimeType?:     string;           // e.g. "image/jpeg", "application/pdf"
  whatsappMessageId?: string;           // WA message ID for status tracking
  isRead:             boolean;
  readAt?:            Date;
  timestamp:          Date;
  isDeleted:          boolean;          // soft-delete a single message
}

const MessageSchema = new Schema<IMessage>(
  {
    sender:             { type: String, enum: Object.values(MESSAGE_SENDER), required: true },
    senderRef:          { type: Schema.Types.ObjectId, ref: 'User' },
    content:            { type: String, required: true, trim: true },
    messageType:        { type: String, enum: Object.values(MESSAGE_TYPE), default: MESSAGE_TYPE.TEXT },
    mediaUrl:           { type: String },
    mediaSize:          { type: Number },
    mediaMimeType:      { type: String },
    whatsappMessageId:  { type: String, index: true },
    isRead:             { type: Boolean, default: false },
    readAt:             { type: Date },
    timestamp:          { type: Date, default: Date.now },
    isDeleted:          { type: Boolean, default: false },
  },
  { _id: true }
);

// ── Document Interface: Chat ──────────────────────────────────────────────────

export interface IChat extends Document {
  company:        Types.ObjectId;
  booking:        Types.ObjectId;       // linked booking
  slot:           Types.ObjectId;       // denormalised for easy slot-level queries
  assignedTo?:    Types.ObjectId;       // doctor/staff User _id

  // Patient contact (denormalised so chat survives booking cancellation)
  patientName:    string;
  patientPhone:   string;
  patientJid?:    string;               // WhatsApp JID for outbound messages

  messages:       IMessage[];
  status:         CHAT_STATUS;

  // Convenience counters
  unreadByDoctor:   number;             // messages from patient not yet read
  unreadByPatient:  number;             // messages from doctor not yet read
  lastMessageAt?:   Date;
  lastMessageSnippet?: string;          // first 80 chars of last message

  isDeleted:      boolean;
  deletedAt?:     Date;
  createdAt:      Date;
  updatedAt:      Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const ChatSchema = new Schema<IChat>(
  {
    company: {
      type:     Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },
    booking: {
      type:     Schema.Types.ObjectId,
      ref:      'Booking',
      required: true,
      index:    true,
    },
    slot: {
      type:     Schema.Types.ObjectId,
      ref:      'Slot',
      required: true,
      index:    true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref:  'User',
    },

    // ── Patient ───────────────────────────────────────────────────────────────
    patientName:  { type: String, required: true, trim: true },
    patientPhone: { type: String, required: true, trim: true },
    patientJid:   { type: String },

    // ── Messages ──────────────────────────────────────────────────────────────
    messages: { type: [MessageSchema], default: [] },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    Object.values(CHAT_STATUS),
      default: CHAT_STATUS.OPEN,
      index:   true,
    },

    // ── Counters ──────────────────────────────────────────────────────────────
    unreadByDoctor:      { type: Number, default: 0 },
    unreadByPatient:     { type: Number, default: 0 },
    lastMessageAt:       { type: Date },
    lastMessageSnippet:  { type: String, maxlength: 80 },

    // ── Soft delete ───────────────────────────────────────────────────────────
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Admin inbox: open chats sorted by last activity
ChatSchema.index({ company: 1, status: 1, lastMessageAt: -1 });
// Find all chats for a specific patient number
ChatSchema.index({ company: 1, patientPhone: 1 });
// Find by WA message ID for delivery status webhooks
ChatSchema.index({ 'messages.whatsappMessageId': 1 }, { sparse: true });
// One chat per booking (enforce at application level too)
ChatSchema.index({ booking: 1 }, { unique: true });

// ── Pre-save: sync counters & snippet ────────────────────────────────────────

ChatSchema.pre('save', function (next) {
  const messages = this.messages.filter(m => !m.isDeleted);
  if (messages.length) {
    const last = messages[messages.length - 1];
    this.lastMessageAt      = last.timestamp;
    this.lastMessageSnippet = last.content.slice(0, 80);
    this.unreadByDoctor     = messages.filter(m => m.sender === MESSAGE_SENDER.PATIENT && !m.isRead).length;
    this.unreadByPatient    = messages.filter(m => m.sender === MESSAGE_SENDER.DOCTOR  && !m.isRead).length;
  }
  next();
});

// ── Virtuals ──────────────────────────────────────────────────────────────────

ChatSchema.virtual('messageCount').get(function (this: IChat) {
  return this.messages.filter(m => !m.isDeleted).length;
});

// ── Model ─────────────────────────────────────────────────────────────────────

const Chat = mongoose.model<IChat>('Chat', ChatSchema);
export default Chat;
export { MessageSchema };