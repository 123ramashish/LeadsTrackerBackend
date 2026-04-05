// controller/whatsappConnection.controller.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import WhatsAppConnection, {
  WA_CONNECTION_STATUS,
} from '../DataBase/Schema/clinivo/whatsappconnection.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Types (for inline service)
// ─────────────────────────────────────────────────────────────────────────────

interface QRResult {
  qrCode: string;     // base64 PNG data URI
  qrCodeRaw: string;  // raw pairing string
  expiresAt: Date;
}

interface ConnectionResult {
  phoneNumber: string;
  displayName: string;
  sessionData: string;
}

type QRCallback = (result: QRResult) => void;
type ConnectCallback = (result: ConnectionResult) => void;
type DisconnectCb = (reason: string) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Augmented Request
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

// ─────────────────────────────────────────────────────────────────────────────
// Inline WhatsApp Session Manager (Singleton Pattern)
// ─────────────────────────────────────────────────────────────────────────────

interface SessionEntry {
  socket: any; // WASocket (typed via dynamic import)
  messageCache: Map<string, any>;
  qrCallback?: QRCallback;
  connectCallback?: ConnectCallback;
  disconnectCb?: DisconnectCb;
}

class InlineWhatsAppService {
  private sessions = new Map<string, SessionEntry>();
  private SESSION_ROOT = path.resolve(process.cwd(), 'sessions');

  constructor() {
    if (!fs.existsSync(this.SESSION_ROOT)) {
      fs.mkdirSync(this.SESSION_ROOT, { recursive: true });
    }
  }

  private sessionDir(companyId: string): string {
    const dir = path.join(this.SESSION_ROOT, companyId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private clearSessionFiles(companyId: string): void {
    const dir = path.join(this.SESSION_ROOT, companyId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }

  // ── Dynamic import helper for ESM modules ──────────────────────────────────
private async importBaileys(): Promise<typeof import('@whiskeysockets/baileys')> {
  return new Function('return import("@whiskeysockets/baileys")')();
}

private async importQRCode(): Promise<typeof import('qrcode')> {
  return new Function('return import("qrcode")')();
}

private async importBoom(): Promise<typeof import("@hapi/boom")> {
  return new Function('return import("@hapi/boom")')();
}

  // ── Main session initializer ───────────────────────────────────────────────
  async initSession(
    companyId: string,
    systemUserId: string,
    onQR: QRCallback,
    onConnect: ConnectCallback,
    onDisconnect: DisconnectCb,
  ): Promise<void> {
    // Close existing session first
    if (this.sessions.has(companyId)) {
      await this.closeSession(companyId, 'Reinitialising');
    }

    // Dynamic imports for ESM modules
    const baileys = await this.importBaileys();
    const QRCode = await this.importQRCode();
    const { Boom } = await this.importBoom();

    const {  fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState, makeWASocket, DisconnectReason } = baileys;
    
    const { version: latestVersion } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir(companyId));
    const messageCache = new Map<string, any>();

    const socket = makeWASocket({
      version: latestVersion,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, console as any),
      },
      getMessage: async (key: any) => {
        const cacheKey = `${key.remoteJid}:${key.id}`;
        return messageCache.get(cacheKey) ?? undefined;
      },
    });

    // Cache incoming messages
    socket.ev.on('messages.upsert', ({ messages }: any) => {
      for (const msg of messages) {
        if (msg.key?.remoteJid && msg.key?.id) {
          messageCache.set(`${msg.key.remoteJid}:${msg.key.id}`, msg.message);
        }
      }
    });

    const entry: SessionEntry = {
      socket,
      messageCache,
      qrCallback: onQR,
      connectCallback: onConnect,
      disconnectCb: onDisconnect,
    };
    this.sessions.set(companyId, entry);

    // ── Connection event handler ─────────────────────────────────────────────
    socket.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code received
      if (qr) {
        const expiresAt = new Date(Date.now() + 90_000);
        const qrCode = await QRCode.toDataURL(qr);

        onQR({ qrCode, qrCodeRaw: qr, expiresAt });

        await WhatsAppConnection.findOneAndUpdate(
          { company: new mongoose.Types.ObjectId(companyId), isDeleted: false },
          {
            $set: {
              status: WA_CONNECTION_STATUS.QR_PENDING,
              qrCode,
              qrCodeRaw: qr,
              qrGeneratedAt: new Date(),
              qrExpiresAt: expiresAt,
              updatedBy: new mongoose.Types.ObjectId(systemUserId),
            },
            $push: {
              history: {
                $each: [{ event: 'qr_generated', at: new Date() }],
                $position: 0,
                $slice: 20,
              },
            },
          },
          { upsert: true }
        );
      }

      // Connected
      if (connection === 'open') {
        const me:any = socket.user;
        const phoneNumber = me.id.split(':')[0];
        const displayName = me.name ?? '';
        const sessionData = JSON.stringify(state.creds);

        onConnect({ phoneNumber: `+${phoneNumber}`, displayName, sessionData });

        await WhatsAppConnection.findOneAndUpdate(
          { company: new mongoose.Types.ObjectId(companyId), isDeleted: false },
          {
            $set: {
              status: WA_CONNECTION_STATUS.CONNECTED,
              phoneNumber: `+${phoneNumber}`,
              displayName,
              connectedAt: new Date(),
              lastSeenAt: new Date(),
              qrCode: null,
              qrCodeRaw: null,
              qrExpiresAt: null,
              updatedBy: new mongoose.Types.ObjectId(systemUserId),
            },
            $push: {
              history: {
                $each: [{ event: 'connected', at: new Date(), meta: { phoneNumber } }],
                $position: 0,
                $slice: 20,
              },
            },
          }
        );
      }

      // Disconnected
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const reason = (DisconnectReason as any)[statusCode] || 'unknown';

        onDisconnect(reason);

        await WhatsAppConnection.findOneAndUpdate(
          { company: new mongoose.Types.ObjectId(companyId), isDeleted: false },
          {
            $set: {
              status: WA_CONNECTION_STATUS.DISCONNECTED,
              disconnectedAt: new Date(),
              disconnectReason: reason,
              qrCode: null,
              qrCodeRaw: null,
              qrExpiresAt: null,
              updatedBy: new mongoose.Types.ObjectId(systemUserId),
            },
            $push: {
              history: {
                $each: [{ event: 'disconnected', at: new Date(), meta: { reason } }],
                $position: 0,
                $slice: 20,
              },
            },
          }
        );

        this.sessions.delete(companyId);

        if (!shouldReconnect) {
          this.clearSessionFiles(companyId);
        } else {
          setTimeout(() => {
            this.initSession(companyId, systemUserId, onQR, onConnect, onDisconnect)
              .catch(console.error);
          }, 3000);
        }
      }
    });

    socket.ev.on('creds.update', saveCreds);
  }

  async closeSession(companyId: string, reason = 'Manual disconnect'): Promise<void> {
    const entry = this.sessions.get(companyId);
    if (!entry) return;

    try {
      await entry.socket.logout();
    } catch {
      // Ignore if already dead
    }

    entry.socket.end(new Error(reason));
    this.sessions.delete(companyId);
  }

  isConnected(companyId: string): boolean {
    return this.sessions.has(companyId);
  }

  async sendTextMessage(companyId: string, to: string, text: string): Promise<boolean> {
    const entry = this.sessions.get(companyId);
    if (!entry) throw new Error('No active session for this company');

    const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
    await entry.socket.sendMessage(jid, { text });
    return true;
  }

  async restoreAllSessions(): Promise<void> {
    const conns = await WhatsAppConnection.find({
      status: WA_CONNECTION_STATUS.CONNECTED,
      isDeleted: false,
    }).lean();

    for (const c of conns) {
      const companyId = String(c.company);
      const userId = String(c.updatedBy);
      const sessionPath = path.join(this.SESSION_ROOT, companyId);

      if (!fs.existsSync(sessionPath)) continue;

      console.log(`[WA] Restoring session for company ${companyId}`);

      await this.initSession(
        companyId,
        userId,
        () => {},
        () => {},
        (reason) => console.warn(`[WA] Company ${companyId} disconnected: ${reason}`)
      ).catch((e) => console.error(`[WA] Restore failed for ${companyId}:`, e));
    }
  }
}

// Singleton instance
const inlineWaService = new InlineWhatsAppService();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveCompanyId(req: AuthRequest): string | null {
  const user = req.user!;
  if (user.isSuperAdmin && req.query.companyId) {
    const id = String(req.query.companyId);
    return mongoose.Types.ObjectId.isValid(id) ? id : null;
  }
  return user.companyId ?? null;
}

function toObjectId(id: string) {
  return new mongoose.Types.ObjectId(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────────────────────────────────────

export default class WhatsAppConnectionController {

  // ───────────────────────────────────────────────────────────────────────────
  // GET /whatsapp-connection
  // ───────────────────────────────────────────────────────────────────────────
  async getStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      let conn = await WhatsAppConnection.findOne({ company: companyId, isDeleted: false })
        .select('-sessionData')
        .lean();

      if (!conn) {
        const created = await WhatsAppConnection.create({
          company: companyId,
          status: WA_CONNECTION_STATUS.DISCONNECTED,
          createdBy: toObjectId(req.user!.id),
          updatedBy: toObjectId(req.user!.id),
        });
        conn = created.toObject() as any;
      }

      // Auto-expire stale QR
      if (
        conn!.status === WA_CONNECTION_STATUS.QR_PENDING &&
        conn!.qrExpiresAt &&
        new Date() > conn!.qrExpiresAt
      ) {
        await WhatsAppConnection.findOneAndUpdate(
          { company: companyId },
          {
            $set: { 
              status: WA_CONNECTION_STATUS.EXPIRED, 
              qrCode: null, 
              qrCodeRaw: null, 
              updatedBy: toObjectId(req.user!.id) 
            },
            $push: { 
              history: { 
                $each: [{ event: 'expired', at: new Date() }], 
                $slice: -20 
              } 
            },
          }
        );
        conn!.status = WA_CONNECTION_STATUS.EXPIRED;
        conn!.qrCode = undefined;
      }

      res.json({
        data: {
          status: conn!.status,
          isConnected: inlineWaService.isConnected(companyId),
          phoneNumber: conn!.phoneNumber ?? null,
          displayName: conn!.displayName ?? null,
          connectedAt: conn!.connectedAt ?? null,
          lastSeenAt: conn!.lastSeenAt ?? null,
          qrCode: conn!.qrCode ?? null,
          qrExpiresAt: conn!.qrExpiresAt ?? null,
          qrValid: conn!.qrExpiresAt ? new Date() < conn!.qrExpiresAt : false,
          stats: conn!.stats,
          history: conn!.history?.slice(0, 5) ?? [],
          webhook: conn!.webhook ?? null,
        },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to get status', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /generate-qr
  // ───────────────────────────────────────────────────────────────────────────
  async generateQR(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const existing = await WhatsAppConnection.findOne({ company: companyId, isDeleted: false });
      if (existing?.status === WA_CONNECTION_STATUS.CONNECTED && inlineWaService.isConnected(companyId)) {
        res.status(409).json({ message: 'Already connected. Disconnect first to re-link.' });
        return;
      }

      let qrResolved = false;

      const qrPromise = new Promise<QRResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!qrResolved) reject(new Error('QR generation timed out'));
        }, 30_000);

        inlineWaService.initSession(
          companyId,
          req.user!.id,
          (result) => {
            if (!qrResolved) {
              qrResolved = true;
              clearTimeout(timeout);
              resolve(result);
            }
          },
          (_conn) => { console.log(`[WA] Company ${companyId} connected`); },
          (reason) => { console.warn(`[WA] Company ${companyId} disconnected: ${reason}`); }
        ).catch(reject);
      });

      const { qrCode, qrCodeRaw, expiresAt } = await qrPromise;

      res.json({
        message: 'QR code generated. Scan within 5 minutes.',
        data: {
          qrCode,
          qrCodeRaw,
          qrExpiresAt: expiresAt,
          expiresInSeconds: 300,
          status: WA_CONNECTION_STATUS.QR_PENDING,
        },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to generate QR', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /refresh-qr
  // ───────────────────────────────────────────────────────────────────────────
  async refreshQR(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const existing = await WhatsAppConnection.findOne({ company: companyId, isDeleted: false });
      if (existing?.status === WA_CONNECTION_STATUS.CONNECTED && inlineWaService.isConnected(companyId)) {
        res.status(409).json({ message: 'Already connected. Disconnect before re-scanning.' });
        return;
      }

      return this.generateQR(req, res);
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to refresh QR', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /confirm
  // ───────────────────────────────────────────────────────────────────────────
  async confirmConnection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const { phoneNumber, displayName, sessionData } = req.body as {
        phoneNumber: string; displayName?: string; sessionData?: string;
      };

      if (!phoneNumber?.trim()) {
        res.status(400).json({ message: 'phoneNumber is required' }); return;
      }

      const now = new Date();
      const updatePayload: Record<string, unknown> = {
        status: WA_CONNECTION_STATUS.CONNECTED,
        phoneNumber: phoneNumber.trim(),
        displayName: displayName?.trim(),
        connectedAt: now,
        lastSeenAt: now,
        qrCode: null, qrCodeRaw: null, qrExpiresAt: null,
        updatedBy: toObjectId(req.user!.id),
      };
      if (sessionData) updatePayload.sessionData = sessionData;

      const conn = await WhatsAppConnection.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $set: updatePayload,
          $push: {
            history: {
              $each: [{ event: 'connected', at: now, triggeredBy: toObjectId(req.user!.id), meta: { phoneNumber } }],
              $position: 0, $slice: 20,
            },
          },
        },
        { new: true, select: '-sessionData' }
      ).lean();

      if (!conn) { res.status(404).json({ message: 'Connection record not found' }); return; }

      res.json({
        message: 'WhatsApp connected successfully',
        data: { status: conn.status, phoneNumber: conn.phoneNumber, connectedAt: conn.connectedAt },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to confirm connection', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /disconnect
  // ───────────────────────────────────────────────────────────────────────────
  async disconnect(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const { reason = 'Manual disconnect' } = req.body as { reason?: string };

      await inlineWaService.closeSession(companyId, reason);

      const now = new Date();
      const conn = await WhatsAppConnection.findOneAndUpdate(
        { company: companyId, isDeleted: false },
        {
          $set: {
            status: WA_CONNECTION_STATUS.DISCONNECTED,
            disconnectedAt: now,
            disconnectReason: reason,
            qrCode: null, qrCodeRaw: null, qrExpiresAt: null,
            sessionData: null,
            updatedBy: toObjectId(req.user!.id),
          },
          $push: {
            history: {
              $each: [{ event: 'disconnected', at: now, triggeredBy: toObjectId(req.user!.id), meta: { reason } }],
              $position: 0, $slice: 20,
            },
          },
        },
        { new: true, select: '-sessionData' }
      ).lean();

      if (!conn) { res.status(404).json({ message: 'Connection record not found' }); return; }

      res.json({ message: 'WhatsApp disconnected', data: { status: conn.status, disconnectedAt: conn.disconnectedAt } });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to disconnect', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PATCH /webhook
  // ───────────────────────────────────────────────────────────────────────────
  async updateWebhook(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const { url, secret, events, isActive } = req.body as {
        url?: string; secret?: string; events?: string[]; isActive?: boolean;
      };

      const setFields: Record<string, unknown> = { updatedBy: req.user!.id };
      if (url !== undefined) setFields['webhook.url'] = url;
      if (secret !== undefined) setFields['webhook.secret'] = secret;
      if (events !== undefined) setFields['webhook.events'] = events;
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
  // PATCH /stats (SUPER_ADMIN only)
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

      const setFields: Record<string, unknown> = { 'stats.lastUpdated': new Date(), updatedBy: req.user!.id };
      if (totalEnquiries !== undefined) setFields['stats.totalEnquiries'] = totalEnquiries;
      if (totalSlotsBooked !== undefined) setFields['stats.totalSlotsBooked'] = totalSlotsBooked;
      if (totalMsgSent !== undefined) setFields['stats.totalMsgSent'] = totalMsgSent;
      if (totalMsgReceived !== undefined) setFields['stats.totalMsgReceived'] = totalMsgReceived;
      if (avgResponseMs !== undefined) setFields['stats.avgResponseMs'] = avgResponseMs;

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
  // GET /dashboard
  // ───────────────────────────────────────────────────────────────────────────
  async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

      const conn = await WhatsAppConnection.findOne(
        { company: companyId, isDeleted: false },
        '-sessionData'
      ).lean();

      const stats: any = conn?.stats ?? {};

      res.json({
        data: {
          connection: {
            status: conn?.status ?? WA_CONNECTION_STATUS.DISCONNECTED,
            isLive: inlineWaService.isConnected(companyId),
            phoneNumber: conn?.phoneNumber ?? null,
            displayName: conn?.displayName ?? null,
            connectedAt: conn?.connectedAt ?? null,
            lastSeenAt: conn?.lastSeenAt ?? null,
          },
          metrics: {
            totalEnquiries: { value: stats.totalEnquiries ?? 0, change: '+12%', up: true },
            totalSlotsBooked: { value: stats.totalSlotsBooked ?? 0, change: '+8%', up: true },
            avgResponseMs: {
              value: stats.avgResponseMs ?? 0,
              label: stats.avgResponseMs ? `${(stats.avgResponseMs / 60000).toFixed(1)}m` : '—',
              change: '-15%',
              up: true,
            },
            totalMsgSent: { value: stats.totalMsgSent ?? 0, change: '+5%', up: true },
            totalMsgReceived: { value: stats.totalMsgReceived ?? 0, change: '+5%', up: true },
          },
          recentHistory: (conn?.history ?? []).slice(0, 10),
          webhook: conn?.webhook ?? null,
        },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to get dashboard', error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GET /history
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