// DataBase/Schema/whatsappConnection.schema.ts
import mongoose, { Document, Schema, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Enums / Constants
// ─────────────────────────────────────────────────────────────────────────────

export enum WA_CONNECTION_STATUS {
  DISCONNECTED = 'disconnected',
  QR_PENDING   = 'qr_pending',   // QR generated, waiting for client scan
  CONNECTING   = 'connecting',   // Client scanned, authenticating
  CONNECTED    = 'connected',    // Fully authenticated & active
  EXPIRED      = 'expired',      // QR expired before scan
  FAILED       = 'failed',       // Auth failed after scan
}

export enum WA_MESSAGE_STATUS {
  QUEUED    = 'queued',
  SENT      = 'sent',
  DELIVERED = 'delivered',
  READ      = 'read',
  FAILED    = 'failed',
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-document: WebhookConfig
// ─────────────────────────────────────────────────────────────────────────────

export interface IWebhookConfig {
  url: string;
  secret?: string;
  events: ('message' | 'status' | 'connection')[];
  isActive: boolean;
}

const WebhookConfigSchema = new Schema<IWebhookConfig>(
  {
    url:      { type: String, required: true, trim: true },
    secret:   { type: String, trim: true },
    events:   { type: [String], default: ['message', 'status'] },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-document: ConnectionEvent (audit trail)
// ─────────────────────────────────────────────────────────────────────────────

export interface IConnectionEvent {
  event: 'connected' | 'disconnected' | 'qr_generated' | 'auth_failed' | 'expired';
  at: Date;
  triggeredBy?: Types.ObjectId;   // userId if manual action
  meta?: Record<string, unknown>;
}

const ConnectionEventSchema = new Schema<IConnectionEvent>(
  {
    event:       { type: String, required: true },
    at:          { type: Date, default: Date.now },
    triggeredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    meta:        { type: Schema.Types.Mixed },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-document: UsageStats (rolling 30-day)
// ─────────────────────────────────────────────────────────────────────────────

export interface IUsageStats {
  totalEnquiries:  number;
  totalSlotsBooked: number;
  totalMsgSent:    number;
  totalMsgReceived: number;
  avgResponseMs:   number;
  lastUpdated:     Date;
}

const UsageStatsSchema = new Schema<IUsageStats>(
  {
    totalEnquiries:   { type: Number, default: 0 },
    totalSlotsBooked: { type: Number, default: 0 },
    totalMsgSent:     { type: Number, default: 0 },
    totalMsgReceived: { type: Number, default: 0 },
    avgResponseMs:    { type: Number, default: 0 },
    lastUpdated:      { type: Date, default: Date.now },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Root Document: WhatsApp Connection per Company
// ─────────────────────────────────────────────────────────────────────────────

export interface IWhatsAppConnection extends Document {
  company:       Types.ObjectId;
  status:        WA_CONNECTION_STATUS;

  // QR flow
  qrCode?:       string;           // base64 PNG or raw QR string
  qrCodeRaw?:    string;           // raw pairing string (for Baileys)
  qrGeneratedAt?: Date;
  qrExpiresAt?:  Date;             // typically qrGeneratedAt + 90s

  // Active connection metadata
  phoneNumber?:  string;           // e.g. "+919876543210"
  displayName?:  string;           // WhatsApp display name
  connectedAt?:  Date;
  lastSeenAt?:   Date;

  // Session (library-specific, encrypted or raw JSON)
  sessionData?:  string;           // Store as JSON string; keep sensitive data encrypted

  // Disconnection
  disconnectedAt?: Date;
  disconnectReason?: string;

  // Webhook config
  webhook?:      IWebhookConfig;

  // Audit trail (last 20 events)
  history:       IConnectionEvent[];

  // Aggregated stats (updated by cron / event handlers)
  stats:         IUsageStats;

  // Soft delete
  isDeleted:     boolean;
  deletedAt?:    Date;

  createdBy:     Types.ObjectId;
  updatedBy:     Types.ObjectId;
  createdAt:     Date;
  updatedAt:     Date;
}

const WhatsAppConnectionSchema = new Schema<IWhatsAppConnection>(
  {
    company: {
      type:     Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      unique:   true,   // one connection record per company
      index:    true,
    },
    status: {
      type:    String,
      enum:    Object.values(WA_CONNECTION_STATUS),
      default: WA_CONNECTION_STATUS.DISCONNECTED,
      index:   true,
    },

    // QR
    qrCode:        { type: String },
    qrCodeRaw:     { type: String },
    qrGeneratedAt: { type: Date },
    qrExpiresAt:   { type: Date },

    // Connected metadata
    phoneNumber:  { type: String, trim: true },
    displayName:  { type: String, trim: true },
    connectedAt:  { type: Date },
    lastSeenAt:   { type: Date },

    // Session
    sessionData: { type: String, select: false }, // excluded by default for security

    // Disconnection
    disconnectedAt:   { type: Date },
    disconnectReason: { type: String, trim: true },

    // Webhook
    webhook: { type: WebhookConfigSchema },

    // Audit trail — cap to 20 entries
    history: {
      type:    [ConnectionEventSchema],
      default: [],
    },

    // Usage stats
    stats: {
      type:    UsageStatsSchema,
      default: () => ({}),
    },

    // Soft delete
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtual: isConnected ──────────────────────────────────────────────────────
WhatsAppConnectionSchema.virtual('isConnected').get(function (this: IWhatsAppConnection) {
  return this.status === WA_CONNECTION_STATUS.CONNECTED;
});

// ── Virtual: isQRValid ────────────────────────────────────────────────────────
WhatsAppConnectionSchema.virtual('isQRValid').get(function (this: IWhatsAppConnection) {
  if (!this.qrExpiresAt) return false;
  return new Date() < this.qrExpiresAt;
});

// ── Instance: pushHistory ─────────────────────────────────────────────────────
WhatsAppConnectionSchema.methods.pushHistory = function (
  event: IConnectionEvent['event'],
  triggeredBy?: string,
  meta?: Record<string, unknown>
) {
  this.history.unshift({ event, at: new Date(), triggeredBy, meta });
  // keep last 20 entries
  if (this.history.length > 20) this.history = this.history.slice(0, 20);
};

// ── Indexes ───────────────────────────────────────────────────────────────────
WhatsAppConnectionSchema.index({ company: 1, isDeleted: 1 });
WhatsAppConnectionSchema.index({ status: 1, isDeleted: 1 });
WhatsAppConnectionSchema.index({ qrExpiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL not on doc, just for queries

const WhatsAppConnection = mongoose.model<IWhatsAppConnection>(
  'WhatsAppConnection',
  WhatsAppConnectionSchema
);

export default WhatsAppConnection;