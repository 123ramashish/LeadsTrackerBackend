// routes/whatsappConnection.router.ts
import { Router } from 'express';
import WhatsAppConnectionController from '../controller/whatsappConnection.controller';
import { authenticate, authorizeRoles, enforceTenant } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';

const whatsappConnectionRouter = Router();
const connCtrl = new WhatsAppConnectionController();

// All routes require authentication + tenant isolation
whatsappConnectionRouter.use(authenticate, enforceTenant);

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /whatsapp-connection
 * Returns current status, QR validity, phone number, and stats.
 * Auto-creates an empty record on first call (upsert).
 */
whatsappConnectionRouter.get(
  '/',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  connCtrl.getStatus.bind(connCtrl)
);

/**
 * GET /whatsapp-connection/dashboard
 * Full dashboard payload: connection state + aggregated metrics + recent history.
 * Must be declared before /:id-style routes to avoid route collision.
 */
whatsappConnectionRouter.get(
  '/dashboard',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  connCtrl.getDashboard.bind(connCtrl)
);

/**
 * GET /whatsapp-connection/history?limit=20
 * Returns the last N connection lifecycle events (capped at 50).
 * Must be declared before /:id-style routes to avoid route collision.
 */
whatsappConnectionRouter.get(
  '/history',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  connCtrl.getHistory.bind(connCtrl)
);

// ─────────────────────────────────────────────────────────────────────────────
// QR Flow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /whatsapp-connection/generate-qr
 * Generates a fresh QR code (90 s TTL) and transitions status → qr_pending.
 * Returns: { qrCode (base64), qrCodeRaw, qrExpiresAt, expiresInSeconds }
 * Guards: returns 409 if already connected.
 */
whatsappConnectionRouter.post(
  '/generate-qr',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  connCtrl.generateQR.bind(connCtrl)
);

/**
 * POST /whatsapp-connection/refresh-qr
 * Re-generates the QR code when expired or not yet scanned.
 * Delegates internally to generateQR; returns the same shape.
 * Guards: returns 409 if already connected.
 */
whatsappConnectionRouter.post(
  '/refresh-qr',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  connCtrl.refreshQR.bind(connCtrl)
);

/**
 * POST /whatsapp-connection/confirm
 * Called by the WA library event handler (e.g. Baileys connection.update)
 * when authentication succeeds. Transitions status → connected.
 * Body: { phoneNumber: string, displayName?: string, sessionData?: string }
 */
whatsappConnectionRouter.post(
  '/confirm',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  connCtrl.confirmConnection.bind(connCtrl)
);

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /whatsapp-connection/disconnect
 * Manually disconnects, clears session data, and records the reason.
 * Transitions status → disconnected.
 * Body: { reason?: string }
 */
whatsappConnectionRouter.post(
  '/disconnect',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  connCtrl.disconnect.bind(connCtrl)
);

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /whatsapp-connection/webhook
 * Configure the inbound-message webhook (URL, secret, event types).
 * Body: { url?: string, secret?: string, events?: string[], isActive?: boolean }
 */
whatsappConnectionRouter.patch(
  '/webhook',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  connCtrl.updateWebhook.bind(connCtrl)
);

/**
 * PATCH /whatsapp-connection/stats
 * Internal route consumed by background jobs to update rolling usage stats.
 * Restricted to SUPER_ADMIN to prevent client-side manipulation.
 * Body: Partial<IUsageStats>
 */
whatsappConnectionRouter.patch(
  '/stats',
  authorizeRoles([USER_ROLES.SUPER_ADMIN]),
  connCtrl.updateStats.bind(connCtrl)
);

export { whatsappConnectionRouter };