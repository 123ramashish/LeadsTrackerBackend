// DataBase/Schema/booking.schema.ts
import mongoose, { Document, Schema, Types } from 'mongoose';

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum BOOKING_STATUS {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW   = 'no_show',
}

export enum BOOKING_SOURCE {
  WHATSAPP = 'whatsapp',
  MANUAL   = 'manual',
  ONLINE   = 'online',
}

// ── Short confirmation ID ─────────────────────────────────────────────────────

export function generateConfirmationId(): string {
  return 'BK-' + Math.random().toString(36).toUpperCase().slice(2, 7);
}

// ── Document Interface ────────────────────────────────────────────────────────

export interface IBooking extends Document {
  slot:           Types.ObjectId;
  company:        Types.ObjectId;

  // Patient info
  patientName:    string;
  patientPhone:   string;
  patientEmail?:  string;
  issues:         string[];           // multiple issues per visit
  notes?:         string;             // internal admin notes

  // Booking meta
  status:         BOOKING_STATUS;
  confirmationId: string;
  source:         BOOKING_SOURCE;
  whatsappJid?:   string;             // WA contact JID for reminders

  // Audit
  bookedAt:       Date;
  bookedBy?:      Types.ObjectId;     // userId for manual bookings

  // Cancellation
  cancelledAt?:   Date;
  cancelReason?:  string;
  cancelledBy?:   Types.ObjectId;

  // Completion
  completedAt?:   Date;

  createdAt:      Date;
  updatedAt:      Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const BookingSchema = new Schema<IBooking>(
  {
    slot: {
      type:     Schema.Types.ObjectId,
      ref:      'Slot',
      required: true,
      index:    true,
    },
    company: {
      type:     Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },

    // ── Patient ───────────────────────────────────────────────────────────────
    patientName:  { type: String, required: true, trim: true },
    patientPhone: { type: String, required: true, trim: true },
    patientEmail: { type: String, trim: true, lowercase: true },
    issues:       { type: [String], default: [] },     // e.g. ["Back pain", "Fever"]
    notes:        { type: String, trim: true },

    // ── Booking meta ──────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.CONFIRMED,
      index:   true,
    },
    confirmationId: { type: String, required: true, unique: true },
    source: {
      type:    String,
      enum:    Object.values(BOOKING_SOURCE),
      default: BOOKING_SOURCE.MANUAL,
    },
    whatsappJid: { type: String },

    // ── Audit ─────────────────────────────────────────────────────────────────
    bookedAt: { type: Date, default: Date.now },
    bookedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // ── Cancellation ──────────────────────────────────────────────────────────
    cancelledAt:  { type: Date },
    cancelReason: { type: String, trim: true },
    cancelledBy:  { type: Schema.Types.ObjectId, ref: 'User' },

    // ── Completion ────────────────────────────────────────────────────────────
    completedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Fast lookups: all bookings for a slot, or all for a company on a status
BookingSchema.index({ slot: 1, status: 1 });
BookingSchema.index({ company: 1, status: 1 });
BookingSchema.index({ company: 1, patientPhone: 1 });
BookingSchema.index({ confirmationId: 1 }, { unique: true });

// ── Virtuals ──────────────────────────────────────────────────────────────────

BookingSchema.virtual('isActive').get(function (this: IBooking) {
  return this.status === BOOKING_STATUS.CONFIRMED;
});

// ── Model ─────────────────────────────────────────────────────────────────────

const Booking = mongoose.model<IBooking>('Booking', BookingSchema);
export default Booking;