// controller/whatsappConnection.controller.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import WhatsAppConnection, {
  WA_CONNECTION_STATUS,
  IWhatsAppConnection,
} from '../DataBase/Schema/clinivo/whatsappconnection.schema';

// ── NOTE: Replace these imports with your actual WA library ───────────────────
// Popular choices: @whiskeysockets/baileys, whatsapp-web.js, or a cloud API
// The controller is library-agnostic; inject your WA client via a service layer.
// ─────────────────────────────────────────────────────────────────────────────

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    companyId: string;
    isSuperAdmin?: boolean;
  };
}

function resolveCompanyId(req: AuthRequest): string | null {
  const user = req.user!;
  if (user.isSuperAdmin && req.query.companyId) {
    const id = String(req.query.companyId);
    return mongoose.Types.ObjectId.isValid(id) ? id : null;
  }
  return user.companyId ?? null;
}

// ── Simulate QR generation (replace with real Baileys / cloud-API call) ───────
async function generateQRCode(companyId: string): Promise<{ qrCode: string; qrCodeRaw: string; expiresAt: Date }> {
  // TODO: Replace with:
  //   const { qr } = await waClientService.initSession(companyId)
  //   const qrCode = await QRCode.toDataURL(qr)   // npm i qrcode
  //
  // For now we return a placeholder so the API is wired correctly.
  const mockRaw = `2@${companyId}-${Date.now()},randomAuthKey,serverKey,clientPublic`;
  const expiresAt = new Date(Date.now() + 90_000); // 90 seconds
  return {
    qrCode:    `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScAAAAAElFTkSuQmCC`,
    qrCodeRaw: mockRaw,
    expiresAt,
  };
}

export default class WhatsAppConnectionController {

  // ───────────────────────────────────────────────────────────────────────────
  // GET /whatsapp-connection
  // Returns current connection state (status, QR validity, phone, etc.)
  // ───────────────────────────────────────────────────────────────────────────
  async getStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      let conn = await WhatsAppConnection.findOne({ company: companyId, isDeleted: false })
        .select('-sessionData') // never expose session
        .lean();

      // Auto-create empty record on first call
      if (!conn) {
        const created = await WhatsAppConnection.create({
          company:   companyId,
          status:    WA_CONNECTION_STATUS.DISCONNECTED,
          createdBy: req.user!.id,
          updatedBy: req.user!.id,
        });
        conn = created.toObject() as any;
      }

      // Expire stale QR_PENDING records automatically
      if (
        conn!.status === WA_CONNECTION_STATUS.QR_PENDING &&
        conn!.qrExpiresAt &&
        new Date() > conn!.qrExpiresAt
      ) {
        await WhatsAppConnection.findOneAndUpdate(
          { company: companyId },
          {
            $set: { status: WA_CONNECTION_STATUS.EXPIRED, updatedBy: req.user!.id },
            $push: {
              history: {
                $each: [{ event: 'expired', at: new Date() }],
                $slice: -20,
              },
            },
          }
        );
        conn!.status = WA_CONNECTION_STATUS.EXPIRED;
        conn!.qrCode = undefined;
      }

      res.json({
        data: {
          status:       conn!.status,
          phoneNumber:  conn!.phoneNumber  ?? null,
          displayName:  conn!.displayName  ?? null,
          connectedAt:  conn!.connectedAt  ?? null,
          lastSeenAt:   conn!.lastSeenAt   ?? null,
          qrCode:       conn!.qrCode       ?? null,
          qrExpiresAt:  conn!.qrExpiresAt  ?? null,
          qrValid:      conn!.qrExpiresAt ? new Date() < conn!.qrExpiresAt : false,
          stats:        conn!.stats,
          history:      conn!.history.slice(0, 5),
          webhook:      conn!.webhook       ?? null,
        },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to get status', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /whatsapp-connection/generate-qr
  // Generates a fresh QR code and transitions status → QR_PENDING.
  // ───────────────────────────────────────────────────────────────────────────
  async generateQR(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      // Guard: already connected
      const existing = await WhatsAppConnection.findOne({ company: companyId, isDeleted: false });
      if (existing?.status === WA_CONNECTION_STATUS.CONNECTED) {
        res.status(409).json({ message: 'Already connected. Disconnect first to re-link.' });
        return;
      }

      const { qrCode, qrCodeRaw, expiresAt } = await generateQRCode(companyId);

      const historyEntry = { event: 'qr_generated' as const, at: new Date(), triggeredBy: new mongoose.Types.ObjectId(req.user!.id) };

      const conn = await WhatsAppConnection.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $set: {
            status:        WA_CONNECTION_STATUS.QR_PENDING,
            qrCode,
            qrCodeRaw,
            qrGeneratedAt: new Date(),
            qrExpiresAt:   expiresAt,
            updatedBy:     new mongoose.Types.ObjectId(req.user!.id),
          },
          $push: {
            history: { $each: [historyEntry], $position: 0, $slice: 20 },
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, select: '-sessionData' }
      ).lean();

      res.json({
        message: 'QR code generated successfully',
        data: {
          qrCode,
          qrCodeRaw,
          qrExpiresAt: expiresAt,
          expiresInSeconds: 90,
          status: WA_CONNECTION_STATUS.QR_PENDING,
        },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to generate QR', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /whatsapp-connection/confirm
  // Called by your WA library webhook / event emitter when connection succeeds.
  // Body: { phoneNumber, displayName, sessionData? }
  // ───────────────────────────────────────────────────────────────────────────
  async confirmConnection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const { phoneNumber, displayName, sessionData } = req.body as {
        phoneNumber: string;
        displayName?: string;
        sessionData?: string;
      };

      if (!phoneNumber?.trim()) {
        res.status(400).json({ message: 'phoneNumber is required' }); return;
      }

      const now = new Date();
      const historyEntry = {
        event:       'connected' as const,
        at:          now,
        triggeredBy: new mongoose.Types.ObjectId(req.user!.id),
        meta:        { phoneNumber },
      };

      const updatePayload: Record<string, unknown> = {
        status:       WA_CONNECTION_STATUS.CONNECTED,
        phoneNumber:  phoneNumber.trim(),
        displayName:  displayName?.trim(),
        connectedAt:  now,
        lastSeenAt:   now,
        // Clear QR after successful connect
        qrCode:       null,
        qrCodeRaw:    null,
        qrExpiresAt:  null,
        updatedBy:    new mongoose.Types.ObjectId(req.user!.id),
      };
      if (sessionData) updatePayload.sessionData = sessionData;

      const conn = await WhatsAppConnection.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $set: updatePayload,
          $push: {
            history: { $each: [historyEntry], $position: 0, $slice: 20 },
          },
        },
        { new: true, select: '-sessionData' }
      ).lean();

      if (!conn) { res.status(404).json({ message: 'Connection record not found' }); return; }

      res.json({ message: 'WhatsApp connected successfully', data: { status: conn.status, phoneNumber: conn.phoneNumber, connectedAt: conn.connectedAt } });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to confirm connection', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /whatsapp-connection/disconnect
  // Manually disconnect. Body: { reason? }
  // ───────────────────────────────────────────────────────────────────────────
  async disconnect(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const { reason = 'Manual disconnect' } = req.body as { reason?: string };

      const now = new Date();
      const historyEntry = {
        event:       'disconnected' as const,
        at:          now,
        triggeredBy: new mongoose.Types.ObjectId(req.user!.id),
        meta:        { reason },
      };

      const conn = await WhatsAppConnection.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $set: {
            status:           WA_CONNECTION_STATUS.DISCONNECTED,
            disconnectedAt:   now,
            disconnectReason: reason,
            qrCode:           null,
            qrCodeRaw:        null,
            qrExpiresAt:      null,
            sessionData:      null,
            updatedBy:        new mongoose.Types.ObjectId(req.user!.id),
          },
          $push: {
            history: { $each: [historyEntry], $position: 0, $slice: 20 },
          },
        },
        { new: true, select: '-sessionData' }
      ).lean();

      if (!conn) { res.status(404).json({ message: 'Connection record not found' }); return; }

      // TODO: Call your WA library to close the socket:
      //   await waClientService.closeSession(companyId)

      res.json({ message: 'WhatsApp disconnected', data: { status: conn.status } });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to disconnect', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PATCH /whatsapp-connection/webhook
  // Configure webhook for inbound message forwarding.
  // Body: { url, secret?, events?, isActive? }
  // ───────────────────────────────────────────────────────────────────────────
  async updateWebhook(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const { url, secret, events, isActive } = req.body as {
        url?: string; secret?: string; events?: string[]; isActive?: boolean;
      };

      const setFields: Record<string, unknown> = { updatedBy: req.user!.id };
      if (url      !== undefined) setFields['webhook.url']      = url;
      if (secret   !== undefined) setFields['webhook.secret']   = secret;
      if (events   !== undefined) setFields['webhook.events']   = events;
      if (isActive !== undefined) setFields['webhook.isActive'] = isActive;

      const conn = await WhatsAppConnection.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        { $set: setFields },
        { new: true, upsert: true, setDefaultsOnInsert: true, select: '-sessionData' }
      ).lean();

      res.json({ message: 'Webhook updated', data: conn!.webhook });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to update webhook', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PATCH /whatsapp-connection/stats
  // Called by background jobs to update rolling usage stats.
  // Body: Partial<IUsageStats>
  // ───────────────────────────────────────────────────────────────────────────
  async updateStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const {
        totalEnquiries, totalSlotsBooked, totalMsgSent,
        totalMsgReceived, avgResponseMs,
      } = req.body as Partial<{
        totalEnquiries: number; totalSlotsBooked: number; totalMsgSent: number;
        totalMsgReceived: number; avgResponseMs: number;
      }>;

      const setFields: Record<string, unknown> = {
        'stats.lastUpdated': new Date(),
        updatedBy: req.user!.id,
      };
      if (totalEnquiries   !== undefined) setFields['stats.totalEnquiries']   = totalEnquiries;
      if (totalSlotsBooked !== undefined) setFields['stats.totalSlotsBooked'] = totalSlotsBooked;
      if (totalMsgSent     !== undefined) setFields['stats.totalMsgSent']     = totalMsgSent;
      if (totalMsgReceived !== undefined) setFields['stats.totalMsgReceived'] = totalMsgReceived;
      if (avgResponseMs    !== undefined) setFields['stats.avgResponseMs']    = avgResponseMs;

      const conn = await WhatsAppConnection.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        { $set: setFields },
        { new: true, select: 'stats' }
      ).lean();

      if (!conn) { res.status(404).json({ message: 'Connection record not found' }); return; }
      res.json({ message: 'Stats updated', data: conn.stats });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to update stats', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GET /whatsapp-connection/dashboard
  // Aggregates connection stats + recent activity for the dashboard view.
  // ───────────────────────────────────────────────────────────────────────────
  async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const conn = await WhatsAppConnection.findOne(
        { company: companyId, isDeleted: false },
        '-sessionData'
      ).lean();

      // ── Mock/computed dashboard metrics ─────────────────────────────────────
      // In production replace these with real aggregation queries across your
      // Enquiry / Appointment collections.
      const stats = conn?.stats ?? {};

      const dashboard = {
        connection: {
          status:      conn?.status      ?? WA_CONNECTION_STATUS.DISCONNECTED,
          phoneNumber: conn?.phoneNumber ?? null,
          displayName: conn?.displayName ?? null,
          connectedAt: conn?.connectedAt ?? null,
          lastSeenAt:  conn?.lastSeenAt  ?? null,
        },
        metrics: {
          totalEnquiries:   { value: stats.totalEnquiries   ?? 0, change: '+12%', up: true  },
          totalSlotsBooked: { value: stats.totalSlotsBooked ?? 0, change: '+8%',  up: true  },
          avgResponseMs:    {
            value:  stats.avgResponseMs ?? 0,
            label:  stats.avgResponseMs ? `${(stats.avgResponseMs / 60000).toFixed(1)}m` : '—',
            change: '-15%',
            up:     true,
          },
          totalMsgSent:     { value: stats.totalMsgSent     ?? 0, change: '+5%', up: true },
          totalMsgReceived: { value: stats.totalMsgReceived ?? 0, change: '+5%', up: true },
        },
        recentHistory: (conn?.history ?? []).slice(0, 10),
        webhook:       conn?.webhook ?? null,
      };

      res.json({ data: dashboard });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to get dashboard', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /whatsapp-connection/refresh-qr
  // Refreshes an expired / stale QR without resetting everything.
  // ───────────────────────────────────────────────────────────────────────────
  async refreshQR(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const existing = await WhatsAppConnection.findOne({ company: companyId, isDeleted: false });
      if (existing?.status === WA_CONNECTION_STATUS.CONNECTED) {
        res.status(409).json({ message: 'Already connected. Disconnect before re-scanning.' });
        return;
      }

      // Delegate to generateQR handler
      return this.generateQR(req, res);
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to refresh QR', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GET /whatsapp-connection/history
  // Returns the last N connection events for this company.
  // Query: ?limit=20
  // ───────────────────────────────────────────────────────────────────────────
  async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const limit = Math.min(parseInt(String(req.query.limit ?? '20')), 50);

      const conn = await WhatsAppConnection.findOne(
        { company: companyId, isDeleted: false },
        { history: { $slice: limit } }
      ).lean();

      res.json({ data: conn?.history ?? [] });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to get history', error: (err as Error).message });
    }
  }
}