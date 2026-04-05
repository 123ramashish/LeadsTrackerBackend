// controller/booking.controller.ts
import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import Slot, { SLOT_STATUS }                   from '../DataBase/Schema/clinivo/slot.schema';
import Booking, {
    BOOKING_STATUS,
    BOOKING_SOURCE,
    generateConfirmationId,
}                                               from '../DataBase/Schema/clinivo/booking.schema';
import Chat, { MESSAGE_SENDER, MESSAGE_TYPE }   from '../DataBase/Schema/clinivo/chat.schema';

// ── Augmented Request ─────────────────────────────────────────────────────────
interface AuthRequest extends Request {
    user?: { id: string; companyId: string; isSuperAdmin?: boolean };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveCompanyId(req: AuthRequest): string | null {
    const user = req.user!;
    if (user.isSuperAdmin && req.query.companyId) {
        const id = String(req.query.companyId);
        return mongoose.Types.ObjectId.isValid(id) ? id : null;
    }
    return user.companyId ?? null;
}

function toOid(id: string) { return new mongoose.Types.ObjectId(id); }

export default class BookingController {

    // ── POST /bookings/:slotId ────────────────────────────────────────────────
    // Book a slot. If slot reaches maxBookingLimit it flips to FULL atomically.
    // Optionally creates a Chat thread (pass createChat: true in body).
    async bookSlot(req: AuthRequest, res: Response): Promise<void> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const companyId = resolveCompanyId(req);
            const { slotId } = req.params as { slotId: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); await session.abortTransaction(); return; }
            if (!mongoose.Types.ObjectId.isValid(slotId)) {
                res.status(400).json({ message: 'Invalid slot ID' }); await session.abortTransaction(); return;
            }

            const {
                patientName,
                patientPhone,
                patientEmail,
                issues = [],
                notes,
                source = BOOKING_SOURCE.MANUAL,
                whatsappJid,
                createChat = false,
            } = req.body as {
                patientName:    string;
                patientPhone:   string;
                patientEmail?:  string;
                issues?:        string[];
                notes?:         string;
                source?:        BOOKING_SOURCE;
                whatsappJid?:   string;
                createChat?:    boolean;
            };

            if (!patientName?.trim()) {
                res.status(400).json({ message: 'patientName is required' }); await session.abortTransaction(); return;
            }
            if (!patientPhone?.trim()) {
                res.status(400).json({ message: 'patientPhone is required' }); await session.abortTransaction(); return;
            }
            if (!Array.isArray(issues)) {
                res.status(400).json({ message: 'issues must be an array of strings' }); await session.abortTransaction(); return;
            }

            // ── Atomic slot update ─────────────────────────────────────────────
            // Increment currentBookings; flip to FULL if limit reached.
            // Uses aggregation pipeline update so the comparison is in one round-trip.
            const slot = await Slot.findOneAndUpdate(
                {
                    _id:       toOid(slotId),
                    company:   toOid(companyId),
                    status:    SLOT_STATUS.AVAILABLE,   // only available slots accept new bookings
                    isDeleted: false,
                },
                [
                    {
                        $set: {
                            currentBookings: { $add: ['$currentBookings', 1] },
                            updatedBy: toOid(req.user!.id),
                            // Flip FULL once the incremented count reaches the limit
                            status: {
                                $cond: {
                                    if:   { $gte: [{ $add: ['$currentBookings', 1] }, '$maxBookingLimit'] },
                                    then: SLOT_STATUS.FULL,
                                    else: SLOT_STATUS.AVAILABLE,
                                },
                            },
                        },
                    },
                ],
                { new: true, session }
            ).lean();

            if (!slot) {
                await session.abortTransaction();
                // Distinguish "not found" from "wrong status"
                const exists = await Slot.findOne({ _id: toOid(slotId), isDeleted: false }).lean();
                if (!exists) { res.status(404).json({ message: 'Slot not found' }); return; }
                res.status(409).json({
                    message: `Slot is ${exists.status} — no bookings can be added.`,
                    status:  exists.status,
                });
                return;
            }

            // ── Create Booking ─────────────────────────────────────────────────
            const [booking] = await Booking.create(
                [
                    {
                        slot:           toOid(slotId),
                        company:        toOid(companyId),
                        patientName:    patientName.trim(),
                        patientPhone:   patientPhone.trim(),
                        patientEmail:   patientEmail?.trim().toLowerCase(),
                        issues:         issues.map((i: string) => i.trim()).filter(Boolean),
                        notes:          notes?.trim(),
                        status:         BOOKING_STATUS.CONFIRMED,
                        confirmationId: generateConfirmationId(),
                        source,
                        whatsappJid,
                        bookedAt:       new Date(),
                        bookedBy:       toOid(req.user!.id),
                    },
                ],
                { session }
            );

            // ── Optionally open a Chat thread ──────────────────────────────────
            let chat: InstanceType<typeof Chat> | null = null;
            if (createChat) {
                [chat] = await Chat.create(
                    [
                        {
                            company:      toOid(companyId),
                            booking:      booking._id,
                            slot:         toOid(slotId),
                            patientName:  booking.patientName,
                            patientPhone: booking.patientPhone,
                            patientJid:   whatsappJid,
                            // Seed with a system welcome message
                            messages: [
                                {
                                    sender:      MESSAGE_SENDER.SYSTEM,
                                    content:     `Booking confirmed for ${slot.date} at ${slot.startTime}. Confirmation: ${booking.confirmationId}`,
                                    messageType: MESSAGE_TYPE.TEXT,
                                    isRead:      false,
                                    timestamp:   new Date(),
                                    isDeleted:   false,
                                },
                            ],
                        },
                    ],
                    { session }
                );
            }

            await session.commitTransaction();

            res.status(201).json({
                message: 'Slot booked successfully',
                data: {
                    bookingId:      booking._id,
                    confirmationId: booking.confirmationId,
                    slotId:         slot._id,
                    date:           slot.date,
                    startTime:      slot.startTime,
                    endTime:        slot.endTime,
                    slotStatus:     slot.status,
                    remainingSlots: Math.max(0, slot.maxBookingLimit - slot.currentBookings),
                    patientName:    booking.patientName,
                    patientPhone:   booking.patientPhone,
                    issues:         booking.issues,
                    source:         booking.source,
                    chatId:         chat?._id ?? null,
                },
            });
        } catch (err: unknown) {
            await session.abortTransaction();
            res.status(500).json({ message: 'Failed to book slot', error: (err as Error).message });
        } finally {
            session.endSession();
        }
    }

    // ── GET /bookings/:bookingId ───────────────────────────────────────────────
    async getBooking(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { bookingId } = req.params as { bookingId: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!mongoose.Types.ObjectId.isValid(bookingId)) {
                res.status(400).json({ message: 'Invalid booking ID' }); return;
            }

            const booking = await Booking.findOne({ _id: toOid(bookingId), company: toOid(companyId) })
                .populate('slot', 'date startTime endTime durationMins status')
                .lean();

            if (!booking) { res.status(404).json({ message: 'Booking not found' }); return; }
            res.json({ data: booking });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to fetch booking', error: (err as Error).message });
        }
    }

    // ── GET /bookings?slotId=&status=&page=&limit= ────────────────────────────
    // List bookings — filter by slot, status, patientPhone
    async listBookings(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const {
                slotId,
                status,
                patientPhone,
                page  = '1',
                limit = '20',
            } = req.query as {
                slotId?: string; status?: string; patientPhone?: string;
                page?: string;   limit?: string;
            };

            const filter: Record<string, unknown> = { company: toOid(companyId) };
            if (slotId && mongoose.Types.ObjectId.isValid(slotId))   filter.slot   = toOid(slotId);
            if (status && Object.values(BOOKING_STATUS).includes(status as BOOKING_STATUS))
                filter.status = status;
            if (patientPhone) filter.patientPhone = patientPhone.trim();

            const skip    = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
            const pageSize = Math.min(100, parseInt(limit));

            const [bookings, total] = await Promise.all([
                Booking.find(filter)
                    .populate('slot', 'date startTime endTime')
                    .sort({ bookedAt: -1 })
                    .skip(skip)
                    .limit(pageSize)
                    .lean(),
                Booking.countDocuments(filter),
            ]);

            res.json({ data: bookings, meta: { total, page: parseInt(page), limit: pageSize } });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to list bookings', error: (err as Error).message });
        }
    }

    // ── PATCH /bookings/:bookingId/cancel ─────────────────────────────────────
    // Cancel a booking → decrement slot's currentBookings; re-open if was FULL.
    async cancelBooking(req: AuthRequest, res: Response): Promise<void> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const companyId = resolveCompanyId(req);
            const { bookingId } = req.params as { bookingId: string };
            const { reason } = req.body as { reason?: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); await session.abortTransaction(); return; }
            if (!mongoose.Types.ObjectId.isValid(bookingId)) {
                res.status(400).json({ message: 'Invalid booking ID' }); await session.abortTransaction(); return;
            }

            // Mark booking cancelled
            const booking = await Booking.findOneAndUpdate(
                {
                    _id:     toOid(bookingId),
                    company: toOid(companyId),
                    status:  BOOKING_STATUS.CONFIRMED,
                },
                {
                    $set: {
                        status:       BOOKING_STATUS.CANCELLED,
                        cancelledAt:  new Date(),
                        cancelReason: reason?.trim(),
                        cancelledBy:  toOid(req.user!.id),
                    },
                },
                { new: true, session }
            ).lean();

            if (!booking) {
                await session.abortTransaction();
                res.status(404).json({ message: 'Confirmed booking not found' });
                return;
            }

            // Decrement slot's counter; if it was FULL, make it AVAILABLE again
            await Slot.findOneAndUpdate(
                { _id: booking.slot, isDeleted: false },
                [
                    {
                        $set: {
                            currentBookings: { $max: [0, { $subtract: ['$currentBookings', 1] }] },
                            updatedBy: toOid(req.user!.id),
                            status: {
                                $cond: {
                                    // Only restore to AVAILABLE if it was FULL; leave BLOCKED/EXPIRED alone
                                    if:   { $eq: ['$status', SLOT_STATUS.FULL] },
                                    then: SLOT_STATUS.AVAILABLE,
                                    else: '$$ROOT.status',
                                },
                            },
                        },
                    },
                ],
                { session }
            );

            // Close chat if open
            await Chat.updateOne(
                { booking: toOid(bookingId), status: 'open' },
                { $set: { status: 'closed' } },
                { session }
            );

            await session.commitTransaction();

            res.json({ message: 'Booking cancelled', data: { bookingId: booking._id, status: BOOKING_STATUS.CANCELLED } });
        } catch (err: unknown) {
            await session.abortTransaction();
            res.status(500).json({ message: 'Failed to cancel booking', error: (err as Error).message });
        } finally {
            session.endSession();
        }
    }

    // ── PATCH /bookings/:bookingId/complete ───────────────────────────────────
    async completeBooking(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { bookingId } = req.params as { bookingId: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const booking = await Booking.findOneAndUpdate(
                { _id: toOid(bookingId), company: toOid(companyId), status: BOOKING_STATUS.CONFIRMED },
                { $set: { status: BOOKING_STATUS.COMPLETED, completedAt: new Date() } },
                { new: true }
            ).lean();

            if (!booking) { res.status(404).json({ message: 'Confirmed booking not found' }); return; }

            // Resolve chat
            await Chat.updateOne({ booking: toOid(bookingId) }, { $set: { status: 'resolved' } });

            res.json({ message: 'Booking marked as completed', data: booking });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to complete booking', error: (err as Error).message });
        }
    }

    // ── PATCH /bookings/:bookingId/no-show ────────────────────────────────────
    async markNoShow(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { bookingId } = req.params as { bookingId: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const booking = await Booking.findOneAndUpdate(
                { _id: toOid(bookingId), company: toOid(companyId), status: BOOKING_STATUS.CONFIRMED },
                { $set: { status: BOOKING_STATUS.NO_SHOW } },
                { new: true }
            ).lean();

            if (!booking) { res.status(404).json({ message: 'Confirmed booking not found' }); return; }
            res.json({ message: 'Booking marked as no-show', data: booking });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to mark no-show', error: (err as Error).message });
        }
    }

    // ── PATCH /bookings/:bookingId/issues ─────────────────────────────────────
    // Update / add issues on a booking after creation
    async updateIssues(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { bookingId } = req.params as { bookingId: string };
            const { issues } = req.body as { issues: string[] };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!Array.isArray(issues) || issues.length === 0) {
                res.status(400).json({ message: 'issues must be a non-empty array' }); return;
            }

            const booking = await Booking.findOneAndUpdate(
                { _id: toOid(bookingId), company: toOid(companyId) },
                { $set: { issues: issues.map(i => i.trim()).filter(Boolean) } },
                { new: true }
            ).lean();

            if (!booking) { res.status(404).json({ message: 'Booking not found' }); return; }
            res.json({ message: 'Issues updated', data: booking });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to update issues', error: (err as Error).message });
        }
    }
}