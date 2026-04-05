// ─────────────────────────────────────────────────────────────────────────────
// routes/booking.router.ts
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import BookingController from '../controller/booking.controller';
import { authenticate, enforceTenant, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';
 
const bookingRouter = Router();
const bCtrl         = new BookingController();
 
bookingRouter.use(authenticate, enforceTenant);
 
const ADMIN_ONLY_B = authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);
 
// ── Read ──────────────────────────────────────────────────────────────────────
bookingRouter.get('/',             bCtrl.listBookings.bind(bCtrl));   // ?slotId=&status=&page=&limit=
bookingRouter.get('/:bookingId',   bCtrl.getBooking.bind(bCtrl));
 
// ── Create ────────────────────────────────────────────────────────────────────
// POST /bookings/:slotId — open to authenticated users (WhatsApp bot posts here too)
bookingRouter.post('/:slotId', bCtrl.bookSlot.bind(bCtrl));
 
// ── Lifecycle ─────────────────────────────────────────────────────────────────
bookingRouter.patch('/:bookingId/cancel',   bCtrl.cancelBooking.bind(bCtrl));
bookingRouter.patch('/:bookingId/complete', ADMIN_ONLY_B, bCtrl.completeBooking.bind(bCtrl));
bookingRouter.patch('/:bookingId/no-show',  ADMIN_ONLY_B, bCtrl.markNoShow.bind(bCtrl));
bookingRouter.patch('/:bookingId/issues',   bCtrl.updateIssues.bind(bCtrl));
 
export default bookingRouter;
 