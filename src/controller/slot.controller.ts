// controller/slot.controller.ts
import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import Slot, { SLOT_STATUS } from '../DataBase/Schema/clinivo/slot.schema';

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

function toOid(id: string)   { return new mongoose.Types.ObjectId(id); }
function isValidDate(d: string) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)); }
function isValidTime(t: string) { return /^\d{2}:\d{2}$/.test(t); }
function timeToMins(t: string)  { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

export default class SlotController {

    // ── GET /slots?date=YYYY-MM-DD ────────────────────────────────────────────
    async getSlotsByDate(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { date, withBookings } = req.query as { date?: string; withBookings?: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!date || !isValidDate(date)) {
                res.status(400).json({ message: 'date query param required (YYYY-MM-DD)' }); return;
            }

            let query = Slot.find({ company: toOid(companyId), date, isDeleted: false })
                .sort({ startTime: 1 });

            // Optionally populate confirmed bookings
            if (withBookings === 'true') {
                query = query.populate({
                    path:  'bookings',
                    match: { status: 'confirmed' },
                    select: 'patientName patientPhone confirmationId issues source bookedAt',
                });
            }

            const slots = await query.lean({ virtuals: true });

            // Auto-expire past available slots
            const now       = new Date();
            const todayStr  = now.toISOString().slice(0, 10);
            const nowMins   = now.getHours() * 60 + now.getMinutes();
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

    // ── GET /slots/range?from=&to=&status= ────────────────────────────────────
    async getSlotsByRange(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { from, to, status } = req.query as { from?: string; to?: string; status?: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!from || !to || !isValidDate(from) || !isValidDate(to)) {
                res.status(400).json({ message: 'from and to query params required (YYYY-MM-DD)' }); return;
            }
            if (from > to) { res.status(400).json({ message: 'from must be before to' }); return; }

            const diffDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
            if (diffDays > 31) { res.status(400).json({ message: 'Range cannot exceed 31 days' }); return; }

            const filter: Record<string, unknown> = {
                company:   toOid(companyId),
                date:      { $gte: from, $lte: to },
                isDeleted: false,
            };
            if (status) filter.status = status;

            const slots = await Slot.find(filter).sort({ date: 1, startTime: 1 }).lean({ virtuals: true });
            res.json({ data: slots });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to fetch slots', error: (err as Error).message });
        }
    }

    // ── POST /slots ───────────────────────────────────────────────────────────
    async createSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const {
                date,
                startTime,
                durationMins     = 60,
                maxBookingLimit  = 1,
            } = req.body as {
                date: string; startTime: string; durationMins?: number; maxBookingLimit?: number;
            };

            if (!date || !isValidDate(date)) {
                res.status(400).json({ message: 'date is required (YYYY-MM-DD)' }); return;
            }
            if (!startTime || !isValidTime(startTime)) {
                res.status(400).json({ message: 'startTime is required (HH:MM)' }); return;
            }
            if (durationMins < 15 || durationMins > 480) {
                res.status(400).json({ message: 'durationMins must be 15–480' }); return;
            }
            if (maxBookingLimit < 1 || maxBookingLimit > 50) {
                res.status(400).json({ message: 'maxBookingLimit must be 1–50' }); return;
            }

            const startMins = timeToMins(startTime);
            const endMins   = startMins + durationMins;
            if (endMins > 24 * 60) { res.status(400).json({ message: 'Slot cannot extend past midnight' }); return; }

            const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;

            const slot = await Slot.create({
                company:         toOid(companyId),
                date,
                startTime,
                endTime,
                durationMins,
                maxBookingLimit,
                currentBookings: 0,
                status:          SLOT_STATUS.AVAILABLE,
                createdBy:       toOid(req.user!.id),
                updatedBy:       toOid(req.user!.id),
            });

            res.status(201).json({ message: 'Slot created', data: slot });
        } catch (err: unknown) {
            if ((err as any).code === 11000) {
                res.status(409).json({ message: 'A slot at this time already exists for this date' }); return;
            }
            res.status(500).json({ message: 'Failed to create slot', error: (err as Error).message });
        }
    }

    // ── POST /slots/bulk-generate ─────────────────────────────────────────────
    async bulkGenerateSlots(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const {
                date,
                openTime        = '09:00',
                closeTime       = '18:00',
                durationMins    = 60,
                maxBookingLimit = 1,
            } = req.body as {
                date: string; openTime?: string; closeTime?: string;
                durationMins?: number; maxBookingLimit?: number;
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
            if (maxBookingLimit < 1 || maxBookingLimit > 50) {
                res.status(400).json({ message: 'maxBookingLimit must be 1–50' }); return;
            }

            const timePairs = (Slot as any).generateTimeSlots(openTime, closeTime, durationMins) as
                { startTime: string; endTime: string; durationMins: number }[];

            const userId = toOid(req.user!.id);
            const docs = timePairs.map(t => ({
                company:         toOid(companyId),
                date,
                startTime:       t.startTime,
                endTime:         t.endTime,
                durationMins:    t.durationMins,
                maxBookingLimit,
                currentBookings: 0,
                status:          SLOT_STATUS.AVAILABLE,
                createdBy:       userId,
                updatedBy:       userId,
            }));

            const result = await Slot.insertMany(docs, { ordered: false }).catch((e: any) => {
                if (e.code === 11000 || e.name === 'BulkWriteError') return e.insertedDocs ?? [];
                throw e;
            });

            const inserted = Array.isArray(result) ? result.length : 0;
            const skipped  = docs.length - inserted;

            res.status(201).json({
                message: `Generated ${inserted} slot(s). Skipped ${skipped} duplicate(s).`,
                data:    { inserted, skipped, total: docs.length },
            });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to generate slots', error: (err as Error).message });
        }
    }

    // ── PATCH /slots/:slotId/block ────────────────────────────────────────────
    async blockSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { slotId } = req.params as { slotId: string };
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const slot = await Slot.findOneAndUpdate(
                { _id: toOid(slotId), company: toOid(companyId), status: SLOT_STATUS.AVAILABLE, isDeleted: false },
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
            const companyId = resolveCompanyId(req);
            const { slotId } = req.params as { slotId: string };
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const slot = await Slot.findOneAndUpdate(
                { _id: toOid(slotId), company: toOid(companyId), status: SLOT_STATUS.BLOCKED, isDeleted: false },
                { $set: { status: SLOT_STATUS.AVAILABLE, updatedBy: toOid(req.user!.id) } },
                { new: true }
            ).lean();

            if (!slot) { res.status(404).json({ message: 'Blocked slot not found' }); return; }
            res.json({ message: 'Slot unblocked', data: slot });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to unblock slot', error: (err as Error).message });
        }
    }

    // ── PATCH /slots/:slotId/cancel ───────────────────────────────────────────
    // Admin cancels the whole slot (distinct from cancelling a single booking)
    async cancelSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { slotId } = req.params as { slotId: string };
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const slot = await Slot.findOneAndUpdate(
                {
                    _id:       toOid(slotId),
                    company:   toOid(companyId),
                    status:    { $in: [SLOT_STATUS.AVAILABLE, SLOT_STATUS.FULL, SLOT_STATUS.BLOCKED] },
                    isDeleted: false,
                },
                { $set: { status: SLOT_STATUS.CANCELLED, updatedBy: toOid(req.user!.id) } },
                { new: true }
            ).lean();

            if (!slot) { res.status(404).json({ message: 'Slot not found or already expired/cancelled' }); return; }
            res.json({ message: 'Slot cancelled. Notify patients with existing bookings separately.', data: slot });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to cancel slot', error: (err as Error).message });
        }
    }

    // ── PATCH /slots/:slotId/capacity ─────────────────────────────────────────
    // Update maxBookingLimit on a slot (re-opens FULL slots if limit is raised)
    async updateCapacity(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { slotId } = req.params as { slotId: string };
            const { maxBookingLimit } = req.body as { maxBookingLimit: number };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!maxBookingLimit || maxBookingLimit < 1 || maxBookingLimit > 50) {
                res.status(400).json({ message: 'maxBookingLimit must be 1–50' }); return;
            }

            const existing = await Slot.findOne({
                _id: toOid(slotId), company: toOid(companyId), isDeleted: false,
            }).lean();

            if (!existing) { res.status(404).json({ message: 'Slot not found' }); return; }

            // Re-open if limit is being raised above currentBookings
            const newStatus = (existing.status === SLOT_STATUS.FULL && maxBookingLimit > existing.currentBookings)
                ? SLOT_STATUS.AVAILABLE
                : existing.status;

            const slot = await Slot.findByIdAndUpdate(
                slotId,
                { $set: { maxBookingLimit, status: newStatus, updatedBy: toOid(req.user!.id) } },
                { new: true, runValidators: true }
            ).lean();

            res.json({ message: 'Capacity updated', data: slot });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to update capacity', error: (err as Error).message });
        }
    }

    // ── PATCH /slots/:slotId ──────────────────────────────────────────────────
    // Edit time — only if no confirmed bookings (available/blocked)
    async updateSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { slotId } = req.params as { slotId: string };
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const { startTime, durationMins } = req.body as { startTime?: string; durationMins?: number };
            if (!startTime && !durationMins) {
                res.status(400).json({ message: 'Provide startTime or durationMins to update' }); return;
            }

            const existing = await Slot.findOne({
                _id:       toOid(slotId),
                company:   toOid(companyId),
                status:    { $in: [SLOT_STATUS.AVAILABLE, SLOT_STATUS.BLOCKED] },
                isDeleted: false,
            }).lean();

            if (!existing) { res.status(404).json({ message: 'Slot not found or has active bookings' }); return; }

            const newStart    = startTime ?? existing.startTime;
            const newDuration = durationMins ?? existing.durationMins;
            const endMins     = timeToMins(newStart) + newDuration;
            const endTime     = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;

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
    async deleteSlot(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { slotId } = req.params as { slotId: string };
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const slot = await Slot.findOneAndUpdate(
                {
                    _id:       toOid(slotId),
                    company:   toOid(companyId),
                    // Cannot delete if there are active bookings (currentBookings > 0)
                    currentBookings: 0,
                    status:    { $ne: SLOT_STATUS.FULL },
                    isDeleted: false,
                },
                { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: toOid(req.user!.id) } },
                { new: true }
            ).lean();

            if (!slot) {
                res.status(404).json({ message: 'Slot not found or has active bookings (cancel them first)' }); return;
            }
            res.json({ message: 'Slot deleted' });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to delete slot', error: (err as Error).message });
        }
    }

    // ── DELETE /slots/bulk?date=&status= ─────────────────────────────────────
    async bulkDeleteSlots(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { date, status } = req.query as { date?: string; status?: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!date || !isValidDate(date)) {
                res.status(400).json({ message: 'date query param required' }); return;
            }

            const filter: Record<string, unknown> = {
                company:         toOid(companyId),
                date,
                currentBookings: 0,          // never delete slots with active bookings
                status:          { $nin: [SLOT_STATUS.FULL] },
                isDeleted:       false,
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