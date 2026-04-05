// routes/slot.router.ts
import { Router } from 'express';
import SlotController from '../controller/slot.controller';
import { authenticate, enforceTenant, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';

const slotRouter = Router();
const ctrl       = new SlotController();

slotRouter.use(authenticate, enforceTenant);

// ── Read ──────────────────────────────────────────────────────────────────────
slotRouter.get('/',          ctrl.getSlotsByDate.bind(ctrl));   // ?date=YYYY-MM-DD
slotRouter.get('/range',     ctrl.getSlotsByRange.bind(ctrl));  // ?from=&to=

// ── Create ────────────────────────────────────────────────────────────────────
slotRouter.post('/',               authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]), ctrl.createSlot.bind(ctrl));
slotRouter.post('/bulk-generate',  authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]), ctrl.bulkGenerateSlots.bind(ctrl));

// ── Booking lifecycle ─────────────────────────────────────────────────────────
slotRouter.post('/:slotId/book',      ctrl.bookSlot.bind(ctrl));
slotRouter.patch('/:slotId/cancel',   ctrl.cancelBooking.bind(ctrl));
slotRouter.patch('/:slotId/block',    authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]), ctrl.blockSlot.bind(ctrl));
slotRouter.patch('/:slotId/unblock',  authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]), ctrl.unblockSlot.bind(ctrl));

// ── Edit / Delete ─────────────────────────────────────────────────────────────
slotRouter.patch('/:slotId',           authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]), ctrl.updateSlot.bind(ctrl));
slotRouter.delete('/bulk',             authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]), ctrl.bulkDeleteSlots.bind(ctrl));
slotRouter.delete('/:slotId',          authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]), ctrl.deleteSlot.bind(ctrl));

export default slotRouter;