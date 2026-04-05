
// ─────────────────────────────────────────────────────────────────────────────
// routes/slot.router.ts
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import SlotController from '../controller/slot.controller';
import { authenticate, enforceTenant, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';
 
const slotRouter = Router();
const ctrl       = new SlotController();
 
slotRouter.use(authenticate, enforceTenant);
 
const ADMIN_ONLY = authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);
 
// ── Read ──────────────────────────────────────────────────────────────────────
slotRouter.get('/',       ctrl.getSlotsByDate.bind(ctrl));    // ?date=YYYY-MM-DD&withBookings=true
slotRouter.get('/range',  ctrl.getSlotsByRange.bind(ctrl));   // ?from=&to=&status=
 
// ── Create ────────────────────────────────────────────────────────────────────
slotRouter.post('/',              ADMIN_ONLY, ctrl.createSlot.bind(ctrl));
slotRouter.post('/bulk-generate', ADMIN_ONLY, ctrl.bulkGenerateSlots.bind(ctrl));
 
// ── Lifecycle ─────────────────────────────────────────────────────────────────
slotRouter.patch('/:slotId/block',    ADMIN_ONLY, ctrl.blockSlot.bind(ctrl));
slotRouter.patch('/:slotId/unblock',  ADMIN_ONLY, ctrl.unblockSlot.bind(ctrl));
slotRouter.patch('/:slotId/cancel',   ADMIN_ONLY, ctrl.cancelSlot.bind(ctrl));
slotRouter.patch('/:slotId/capacity', ADMIN_ONLY, ctrl.updateCapacity.bind(ctrl));
 
// ── Edit / Delete ─────────────────────────────────────────────────────────────
slotRouter.patch('/:slotId',   ADMIN_ONLY, ctrl.updateSlot.bind(ctrl));
slotRouter.delete('/bulk',     ADMIN_ONLY, ctrl.bulkDeleteSlots.bind(ctrl));
slotRouter.delete('/:slotId',  ADMIN_ONLY, ctrl.deleteSlot.bind(ctrl));
 
export default slotRouter;
 