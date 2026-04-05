// DataBase/Schema/slot.schema.ts
import mongoose, { Document, Schema, Types } from 'mongoose';

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum SLOT_STATUS {
  AVAILABLE = 'available',
  FULL      = 'full',       // currentBookings === maxBookingLimit
  BLOCKED   = 'blocked',    // admin manually blocked
  EXPIRED   = 'expired',    // past slots
  CANCELLED = 'cancelled',  // admin cancelled the entire slot
}

// ── Document Interface ────────────────────────────────────────────────────────

export interface ISlot extends Document {
  company:          Types.ObjectId;
  date:             string;           // ISO date string "YYYY-MM-DD"
  startTime:        string;           // "09:00" 24-hr
  endTime:          string;           // "10:00" 24-hr
  durationMins:     number;           // default 60
  maxBookingLimit:  number;           // max patients per slot (default 1)
  currentBookings:  number;           // live count of confirmed bookings
  status:           SLOT_STATUS;
  isDeleted:        boolean;
  deletedAt?:       Date;
  createdBy:        Types.ObjectId;
  updatedBy:        Types.ObjectId;
  createdAt:        Date;
  updatedAt:        Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

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

    // ── Booking capacity ──────────────────────────────────────────────────────
    maxBookingLimit: {
      type:    Number,
      default: 1,
      min:     [1, 'maxBookingLimit must be at least 1'],
      max:     [50, 'maxBookingLimit cannot exceed 50'],
    },
    currentBookings: {
      type:    Number,
      default: 0,
      min:     [0, 'currentBookings cannot be negative'],
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    Object.values(SLOT_STATUS),
      default: SLOT_STATUS.AVAILABLE,
      index:   true,
    },

    // ── Soft delete ───────────────────────────────────────────────────────────
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },

    // ── Audit ─────────────────────────────────────────────────────────────────
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Virtuals ──────────────────────────────────────────────────────────────────

SlotSchema.virtual('isAvailable').get(function (this: ISlot) {
  return this.status === SLOT_STATUS.AVAILABLE;
});

SlotSchema.virtual('remainingSlots').get(function (this: ISlot) {
  return Math.max(0, this.maxBookingLimit - this.currentBookings);
});

// Populate bookings for this slot via virtual populate
SlotSchema.virtual('bookings', {
  ref:          'Booking',
  localField:   '_id',
  foreignField: 'slot',
  match:        { status: 'confirmed' },
});

// ── Compound indexes ──────────────────────────────────────────────────────────

SlotSchema.index({ company: 1, date: 1, isDeleted: 1 });
SlotSchema.index({ company: 1, date: 1, status: 1 });
// Prevent duplicate slots for same company+date+startTime
SlotSchema.index(
  { company: 1, date: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

// ── Statics ───────────────────────────────────────────────────────────────────

SlotSchema.statics.generateTimeSlots = function (
  openTime:     string,
  closeTime:    string,
  durationMins: number,
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

// ── Model ─────────────────────────────────────────────────────────────────────

const Slot = mongoose.model<ISlot>('Slot', SlotSchema);
export default Slot;