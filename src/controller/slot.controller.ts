// controller/slot.controller.ts
import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import Slot, {
    SLOT_STATUS,
    BOOKING_SOURCE,
    generateConfirmationId,
} from '../DataBase/Schema/clinivo/slot.schema';

// ── Augmented Request ─────────────────────────────────────────────────────────
interface AuthRequest extends Request {
    user?: {
        id: string;
        companyId: string;
        isSuperAdmin?: boolean;
    };
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

function isValidDate(d: string) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)); }
function isValidTime(t: string) { return /^\d{2}:\d{2}$/.test(t); }

// Compare "HH:MM" strings
function timeToMins(t: string) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

export default class SlotController {

    // ── GET /slots?date=YYYY-MM-DD ────────────────────────────────────────────
    // Returns all slots for a company on a given date.
    async getSlotsByDate(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            const { date } = req.query as { date?: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!date || !isValidDate(date)) {
                res.status(400).json({ message: 'date query param required (YYYY-MM-DD)' }); return;
            }

            const slots = await Slot.find({ company: companyId?._id, date, isDeleted: false })
                .sort({ startTime: 1 })
                .lean();

            // Auto-expire past slots
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            const nowMins = now.getHours() * 60 + now.getMinutes();

            const expiredIds: Types.ObjectId[] = [];
            for (const s of slots) {
                if (
                    s.status === SLOT_STATUS.AVAILABLE &&
                    (s.date < todayStr || (s.date === todayStr && timeToMins(s.endTime) <= nowMins))
                ) {
                    expiredIds.push(s._id as Types.ObjectId);
                    s.status = SLOT_STATUS.EXPIRED;
                }
            }

            if (expiredIds.length) {
                await Slot.updateMany(
                    { _id: { $in: expiredIds } },
                    { $set: { status: SLOT_STATUS.EXPIRED, updatedBy: toOid(req.user!.id) } }
                );
            }

            res.json({ data: slots });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to fetch slots', error: (err as Error).message });
        }
    }

    // ── GET /slots/range?from=YYYY-MM-DD&to=YYYY-MM-DD ───────────────────────
    // Returns slots across a date range (max 31 days) — useful for calendar views.
    async getSlotsByRange(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            const { from, to, status } = req.query as { from?: string; to?: string; status?: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!from || !to || !isValidDate(from) || !isValidDate(to)) {
                res.status(400).json({ message: 'from and to query params required (YYYY-MM-DD)' }); return;
            }
            if (from > to) {
                res.status(400).json({ message: 'from must be before to' }); return;
            }

            const diffDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
            if (diffDays > 31) {
                res.status(400).json({ message: 'Range cannot exceed 31 days' }); return;
            }

            const filter: Record<string, unknown> = {
                company: toOid(companyId?._id),
                date: { $gte: from, $lte: to },
                isDeleted: false,
            };
            if (status) filter.status = status;

            const slots = await Slot.find(filter).sort({ date: 1, startTime: 1 }).lean();
            res.json({ data: slots });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to fetch slots', error: (err as Error).message });
        }
    }

    // ── POST /slots ───────────────────────────────────────────────────────────
    // Create a single custom slot with a specific date + time.
    async createSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const { date, startTime, durationMins = 60 } = req.body as {
                date: string; startTime: string; durationMins?: number;
            };

            if (!date || !isValidDate(date)) {
                res.status(400).json({ message: 'date is required (YYYY-MM-DD)' }); return;
            }
            if (!startTime || !isValidTime(startTime)) {
                res.status(400).json({ message: 'startTime is required (HH:MM)' }); return;
            }
            if (durationMins < 15 || durationMins > 480) {
                res.status(400).json({ message: 'durationMins must be between 15 and 480' }); return;
            }

            const startMins = timeToMins(startTime);
            const endMins = startMins + durationMins;
            const endH = String(Math.floor(endMins / 60)).padStart(2, '0');
            const endM = String(endMins % 60).padStart(2, '0');
            const endTime = `${endH}:${endM}`;

            if (endMins > 24 * 60) {
                res.status(400).json({ message: 'Slot cannot extend past midnight' }); return;
            }
            console.log({ companyId, date, startTime, endTime, durationMins });
            const slot = new Slot({
                company: toOid(companyId?._id),
                date,
                startTime,
                endTime,
                durationMins,
                status: SLOT_STATUS.AVAILABLE,
                createdBy: toOid(req.user!.id),
                updatedBy: toOid(req.user!.id),
            });
            await slot.save();
            res.status(201).json({ message: 'Slot created', data: slot });
        } catch (err: unknown) {
            if ((err as any).code === 11000) {
                res.status(409).json({ message: 'A slot at this time already exists for this date' });
                return;
            }
            res.status(500).json({ message: 'Failed to create slot', error: (err as Error).message });
        }
    }

    // ── POST /slots/bulk-generate ─────────────────────────────────────────────
    // Auto-generate 1-hour slots for a full day between openTime and closeTime.
    // Skips times where a slot already exists (idempotent).
    async bulkGenerateSlots(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const {
                date,
                openTime = '09:00',
                closeTime = '18:00',
                durationMins = 60,
            } = req.body as {
                date: string; openTime?: string; closeTime?: string; durationMins?: number;
            };

            if (!date || !isValidDate(date)) {
                res.status(400).json({ message: 'date is required (YYYY-MM-DD)' }); return;
            }
            if (!isValidTime(openTime) || !isValidTime(closeTime)) {
                res.status(400).json({ message: 'openTime and closeTime must be HH:MM' }); return;
            }
            if (timeToMins(openTime) >= timeToMins(closeTime)) {
                res.status(400).json({ message: 'openTime must be before closeTime' }); return;
            }

            // Use the static to get time pairs
            const timePairs = (Slot as any).generateTimeSlots(openTime, closeTime, durationMins) as
                { startTime: string; endTime: string; durationMins: number }[];

            const userId = toOid(req.user!.id);
            const docs = timePairs.map((t) => ({
                company: toOid(companyId?._id),
                date,
                startTime: t.startTime,
                endTime: t.endTime,
                durationMins: t.durationMins,
                status: SLOT_STATUS.AVAILABLE,
                createdBy: userId,
                updatedBy: userId,
            }));

            // ordered:false → insert all, skip duplicates without failing the whole batch
            const result = await Slot.insertMany(docs, { ordered: false }).catch((e: any) => {
                if (e.code === 11000 || e.name === 'BulkWriteError') return e.insertedDocs ?? [];
                throw e;
            });

            const inserted = Array.isArray(result) ? result.length : 0;
            const skipped = docs.length - inserted;

            res.status(201).json({
                message: `Generated ${inserted} slot(s). Skipped ${skipped} duplicate(s).`,
                data: { inserted, skipped, total: docs.length },
            });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to generate slots', error: (err as Error).message });
        }
    }

    // ── POST /slots/:slotId/book ──────────────────────────────────────────────
    // Book a slot with patient details. Called on WhatsApp confirmation or manual booking.
    async bookSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            const { slotId } = req.params as any;

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!mongoose.Types.ObjectId.isValid(slotId)) {
                res.status(400).json({ message: 'Invalid slot ID' }); return;
            }

            const {
                patientName,
                patientPhone,
                patientEmail,
                issue,
                notes,
                source = BOOKING_SOURCE.MANUAL,
                whatsappJid,
            } = req.body as {
                patientName: string;
                patientPhone: string;
                patientEmail?: string;
                issue?: string;
                notes?: string;
                source?: BOOKING_SOURCE;
                whatsappJid?: string;
            };

            if (!patientName?.trim()) {
                res.status(400).json({ message: 'patientName is required' }); return;
            }
            if (!patientPhone?.trim()) {
                res.status(400).json({ message: 'patientPhone is required' }); return;
            }
console.log({ companyId, slotId, patientName, patientPhone, patientEmail, issue, notes, source, whatsappJid });
            // Atomic find-and-update — only succeeds if slot is still available
            const slot = await Slot.findOneAndUpdate(
                {
                    _id: toOid(slotId),
                    company: toOid(companyId?._id),
                    status: SLOT_STATUS.AVAILABLE,   // ← prevents double-booking
                    isDeleted: false,
                },
                {
                    $set: {
                        status: SLOT_STATUS.BOOKED,
                        updatedBy: toOid(req.user!.id),
                        booking: {
                            patientName: patientName.trim(),
                            patientPhone: patientPhone.trim(),
                            patientEmail: patientEmail?.trim().toLowerCase(),
                            issue: issue?.trim(),
                            notes: notes?.trim(),
                            bookedAt: new Date(),
                            bookedBy: toOid(req.user!.id),
                            source,
                            confirmationId: generateConfirmationId(),
                            whatsappJid,
                        },
                    },
                },
                { new: true }
            ).lean();

            if (!slot) {
                // Either not found or already booked — check which
                const exists = await Slot.findOne({ _id: toOid(slotId), isDeleted: false }).lean();
                if (!exists) {
                    res.status(404).json({ message: 'Slot not found' }); return;
                }
                res.status(409).json({
                    message: `Slot is already ${exists.status}. Choose a different time.`,
                    status: exists.status,
                });
                return;
            }

            res.json({
                message: 'Slot booked successfully',
                data: {
                    slotId: slot._id,
                    date: slot.date,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    confirmationId: slot.booking!.confirmationId,
                    patientName: slot.booking!.patientName,
                    patientPhone: slot.booking!.patientPhone,
                    issue: slot.booking!.issue,
                },
            });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to book slot', error: (err as Error).message });
        }
    }

    // ── PATCH /slots/:slotId/cancel ───────────────────────────────────────────
    // Cancel a booked slot → returns it to available.
    async cancelBooking(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            const { slotId } = req.params as any;
            const { reason } = req.body as { reason?: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const slot = await Slot.findOneAndUpdate(
                {
                    _id: toOid(slotId),
                    company: toOid(companyId?._id),
                    status: SLOT_STATUS.BOOKED,
                    isDeleted: false,
                },
                {
                    $set: {
                        status: SLOT_STATUS.AVAILABLE,
                        booking: null,
                        updatedBy: toOid(req.user!.id),
                        'booking.notes': reason ? `Cancelled: ${reason}` : undefined,
                    },
                },
                { new: true }
            ).lean();

            if (!slot) {
                res.status(404).json({ message: 'Booked slot not found' }); return;
            }
            res.json({ message: 'Booking cancelled. Slot is now available.', data: { slotId: slot._id, status: slot.status } });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to cancel booking', error: (err as Error).message });
        }
    }

    // ── PATCH /slots/:slotId/block ────────────────────────────────────────────
    // Admin blocks an available slot (e.g. lunch break).
    async blockSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            const { slotId } = req.params as any;

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const slot = await Slot.findOneAndUpdate(
                { _id: toOid(slotId), company: toOid(companyId?._id), status: SLOT_STATUS.AVAILABLE, isDeleted: false },
                { $set: { status: SLOT_STATUS.BLOCKED, updatedBy: toOid(req.user!.id) } },
                { new: true }
            ).lean();

            if (!slot) { res.status(404).json({ message: 'Available slot not found' }); return; }
            res.json({ message: 'Slot blocked', data: slot });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to block slot', error: (err as Error).message });
        }
    }

    // ── PATCH /slots/:slotId/unblock ──────────────────────────────────────────
    async unblockSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            const { slotId } = req.params as any;

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const slot = await Slot.findOneAndUpdate(
                { _id: toOid(slotId), company: toOid(companyId?._id), status: SLOT_STATUS.BLOCKED, isDeleted: false },
                { $set: { status: SLOT_STATUS.AVAILABLE, updatedBy: toOid(req.user!.id) } },
                { new: true }
            ).lean();

            if (!slot) { res.status(404).json({ message: 'Blocked slot not found' }); return; }
            res.json({ message: 'Slot unblocked', data: slot });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to unblock slot', error: (err as Error).message });
        }
    }

    // ── PATCH /slots/:slotId ──────────────────────────────────────────────────
    // Edit a slot's time (only if still available/blocked — not if booked).
    async updateSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            const { slotId } = req.params as any;

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const { startTime, durationMins } = req.body as {
                startTime?: string; durationMins?: number;
            };

            if (!startTime && !durationMins) {
                res.status(400).json({ message: 'Provide startTime or durationMins to update' }); return;
            }

            // Fetch existing to recalculate endTime
            const existing = await Slot.findOne({
                _id: toOid(slotId),
                company: toOid(companyId?._id),
                status: { $in: [SLOT_STATUS.AVAILABLE, SLOT_STATUS.BLOCKED] },
                isDeleted: false,
            }).lean();

            if (!existing) {
                res.status(404).json({ message: 'Slot not found or already booked' }); return;
            }

            const newStart = startTime ?? existing.startTime;
            const newDuration = durationMins ?? existing.durationMins;
            const endMins = timeToMins(newStart) + newDuration;
            const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;

            const slot = await Slot.findByIdAndUpdate(
                slotId,
                { $set: { startTime: newStart, endTime, durationMins: newDuration, updatedBy: toOid(req.user!.id) } },
                { new: true, runValidators: true }
            ).lean();

            res.json({ message: 'Slot updated', data: slot });
        } catch (err: unknown) {
            if ((err as any).code === 11000) {
                res.status(409).json({ message: 'A slot at this time already exists' }); return;
            }
            res.status(500).json({ message: 'Failed to update slot', error: (err as Error).message });
        }
    }

    // ── DELETE /slots/:slotId ─────────────────────────────────────────────────
    // Soft-delete — only if not booked.
    async deleteSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            const { slotId } = req.params as any;

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const slot = await Slot.findOneAndUpdate(
                {
                    _id: toOid(slotId),
                    company: toOid(companyId?._id),
                    status: { $ne: SLOT_STATUS.BOOKED },  // cannot delete booked slots
                    isDeleted: false,
                },
                { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: toOid(req.user!.id) } },
                { new: true }
            ).lean();

            if (!slot) {
                res.status(404).json({ message: 'Slot not found or is booked (cancel booking first)' }); return;
            }
            res.json({ message: 'Slot deleted' });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to delete slot', error: (err as Error).message });
        }
    }

    // ── DELETE /slots/bulk?date=YYYY-MM-DD&status=available ──────────────────
    // Bulk delete all available/blocked slots on a date.
    async bulkDeleteSlots(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId:any = resolveCompanyId(req);
            const { date, status } = req.query as { date?: string; status?: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!date || !isValidDate(date)) {
                res.status(400).json({ message: 'date query param required' }); return;
            }

            const filter: Record<string, unknown> = {
                company: toOid(companyId?._id),
                date,
                status: { $ne: SLOT_STATUS.BOOKED },
                isDeleted: false,
            };
            if (status) filter.status = status;

            const result = await Slot.updateMany(filter, {
                $set: { isDeleted: true, deletedAt: new Date(), updatedBy: toOid(req.user!.id) },
            });

            res.json({ message: `Deleted ${result.modifiedCount} slot(s)`, data: { deleted: result.modifiedCount } });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to bulk delete', error: (err as Error).message });
        }
    }
}