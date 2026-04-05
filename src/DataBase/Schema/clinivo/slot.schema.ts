// DataBase/Schema/slot.schema.ts
import mongoose, { Document, Schema, Types } from 'mongoose';

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum SLOT_STATUS {
  AVAILABLE = 'available',
  BOOKED    = 'booked',
  BLOCKED   = 'blocked',   // admin manually blocked
  EXPIRED   = 'expired',   // past slots
}

export enum BOOKING_SOURCE {
  WHATSAPP = 'whatsapp',
  MANUAL   = 'manual',     // booked by admin directly
  ONLINE   = 'online',     // web form
}

// ── Sub-document: Booking Details (filled when status → booked) ───────────────

export interface IBookingDetails {
  patientName:   string;
  patientPhone:  string;
  patientEmail?: string;
  issue?:        string;       // reason for visit
  notes?:        string;       // internal admin notes
  bookedAt:      Date;
  bookedBy?:     Types.ObjectId;   // userId if manual booking
  source:        BOOKING_SOURCE;
  confirmationId: string;          // short unique ref e.g. "BK-A3X9"
  whatsappJid?:  string;           // WA contact JID for sending reminders
}

const BookingDetailsSchema = new Schema<IBookingDetails>(
  {
    patientName:    { type: String, required: true, trim: true },
    patientPhone:   { type: String, required: true, trim: true },
    patientEmail:   { type: String, trim: true, lowercase: true },
    issue:          { type: String, trim: true },
    notes:          { type: String, trim: true },
    bookedAt:       { type: Date, default: Date.now },
    bookedBy:       { type: Schema.Types.ObjectId, ref: 'User' },
    source:         { type: String, enum: Object.values(BOOKING_SOURCE), default: BOOKING_SOURCE.MANUAL },
    confirmationId: { type: String, required: true },
    whatsappJid:    { type: String },
  },
);

// ── Root Document: Slot ───────────────────────────────────────────────────────

export interface ISlot extends Document {
  company:      Types.ObjectId;
  date:         string;        // ISO date string "YYYY-MM-DD" — indexed for fast day queries
  startTime:    string;        // "09:00" 24-hr format
  endTime:      string;        // "10:00" 24-hr format
  durationMins: number;        // default 60
  status:       SLOT_STATUS;
  booking?:     IBookingDetails;
  isDeleted:    boolean;
  deletedAt?:   Date;
  createdBy:    Types.ObjectId;
  updatedBy:    Types.ObjectId;
  createdAt:    Date;
  updatedAt:    Date;
}

const SlotSchema = new Schema<ISlot>(
  {
    company: {
      type:     Schema.Types.ObjectId,
      ref:      'Company',
      required: true,
      index:    true,
    },
    date: {
      type:     String,
      required: true,
      match:    [/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'],
      index:    true,
    },
    startTime: {
      type:     String,
      required: true,
      match:    [/^\d{2}:\d{2}$/, 'startTime must be HH:MM'],
    },
    endTime: {
      type:     String,
      required: true,
      match:    [/^\d{2}:\d{2}$/, 'endTime must be HH:MM'],
    },
    durationMins: { type: Number, default: 60 },
    status:       {
      type:    String,
      enum:    Object.values(SLOT_STATUS),
      default: SLOT_STATUS.AVAILABLE,
      index:   true,
    },
    booking:   { type: BookingDetailsSchema, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Virtual: isAvailable ──────────────────────────────────────────────────────
SlotSchema.virtual('isAvailable').get(function (this: ISlot) {
  return this.status === SLOT_STATUS.AVAILABLE;
});

// ── Compound indexes ──────────────────────────────────────────────────────────
SlotSchema.index({ company: 1, date: 1, isDeleted: 1 });
SlotSchema.index({ company: 1, date: 1, status: 1 });
// Prevent duplicate slots for same company+date+startTime
SlotSchema.index({ company: 1, date: 1, startTime: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

// ── Statics ───────────────────────────────────────────────────────────────────

// Generate time slots for a full day given open/close times and duration
SlotSchema.statics.generateTimeSlots = function (
  openTime:     string,   // "09:00"
  closeTime:    string,   // "18:00"
  durationMins: number,   // 60
): { startTime: string; endTime: string; durationMins: number }[] {
  const slots: { startTime: string; endTime: string; durationMins: number }[] = [];
  const [openH, openM]   = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);

  let cursor = openH * 60 + openM;
  const end  = closeH * 60 + closeM;

  while (cursor + durationMins <= end) {
    const startH = String(Math.floor(cursor / 60)).padStart(2, '0');
    const startM = String(cursor % 60).padStart(2, '0');
    cursor += durationMins;
    const endH   = String(Math.floor(cursor / 60)).padStart(2, '0');
    const endM   = String(cursor % 60).padStart(2, '0');
    slots.push({ startTime: `${startH}:${startM}`, endTime: `${endH}:${endM}`, durationMins });
  }
  return slots;
};

// Short confirmation ID generator
export function generateConfirmationId(): string {
  return 'BK-' + Math.random().toString(36).toUpperCase().slice(2, 7);
}

const Slot = mongoose.model<ISlot>('Slot', SlotSchema);
export default Slot;