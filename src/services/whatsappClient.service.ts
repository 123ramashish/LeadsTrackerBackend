// services/whatsappClient.service.ts
// Multi-company WhatsApp session manager using @whiskeysockets/baileys
// Install: npm i @whiskeysockets/baileys qrcode @types/qrcode

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import WhatsAppConnection, {
  WA_CONNECTION_STATUS,
} from '../DataBase/Schema/clinivo/whatsappconnection.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface QRResult {
  qrCode: string;     // base64 PNG data URI
  qrCodeRaw: string;  // raw pairing string
  expiresAt: Date;
}

export interface ConnectionResult {
  phoneNumber: string;
  displayName: string;
  sessionData: string;
}

type QRCallback      = (result: QRResult) => void;
type ConnectCallback = (result: ConnectionResult) => void;
type DisconnectCb    = (reason: string) => void;

interface SessionEntry {
  socket:           WASocket;
  messageCache:     Map<string, any>;
  qrCallback?:      QRCallback;
  connectCallback?: ConnectCallback;
  disconnectCb?:    DisconnectCb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session storage root (one sub-folder per companyId)
// ─────────────────────────────────────────────────────────────────────────────
const SESSION_ROOT = path.resolve(process.cwd(), 'sessions');
if (!fs.existsSync(SESSION_ROOT)) fs.mkdirSync(SESSION_ROOT, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppClientService – singleton
// ─────────────────────────────────────────────────────────────────────────────
class WhatsAppClientService {
  // companyId → active session
  private sessions = new Map<string, SessionEntry>();

  // ── Helper: session directory per company ──────────────────────────────────
  private sessionDir(companyId: string): string {
    const dir = path.join(SESSION_ROOT, companyId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ── Persist / clear session files ─────────────────────────────────────────
  private clearSessionFiles(companyId: string): void {
    const dir = path.join(SESSION_ROOT, companyId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // initSession
  // Creates (or re-creates) a Baileys socket for the given company.
  // Returns a QR code immediately if no saved session exists.
  // ─────────────────────────────────────────────────────────────────────────
  async initSession(
    companyId: string,
    systemUserId: string,
    onQR: QRCallback,
    onConnect: ConnectCallback,
    onDisconnect: DisconnectCb,
  ): Promise<void> {
    // Tear down any stale socket first
    if (this.sessions.has(companyId)) {
      await this.closeSession(companyId, 'Reinitialising session');
    }

    const { version }          = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir(companyId));

    // Local message cache — replaces makeInMemoryStore
    const messageCache = new Map<string, any>();

    const socket: WASocket = makeWASocket({
      version,
      printQRInTerminal: false, // we emit QR ourselves
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, console as any),
      },
      getMessage: async (key) => {
        const cacheKey = `${key.remoteJid}:${key.id}`;
        return messageCache.get(cacheKey) ?? undefined;
      },
    });

    // Populate cache from incoming messages
    socket.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.remoteJid && msg.key.id) {
          messageCache.set(`${msg.key.remoteJid}:${msg.key.id}`, msg.message);
        }
      }
    });

    const entry: SessionEntry = {
      socket,
      messageCache,
      qrCallback:      onQR,
      connectCallback: onConnect,
      disconnectCb:    onDisconnect,
    };
    this.sessions.set(companyId, entry);

    // ── connection.update ────────────────────────────────────────────────────
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── New QR code ────────────────────────────────────────────────────────
      if (qr) {
        const expiresAt = new Date(Date.now() + 90_000);
        const qrCode    = await QRCode.toDataURL(qr); // base64 PNG

        onQR({ qrCode, qrCodeRaw: qr, expiresAt });

        await WhatsAppConnection.findOneAndUpdate(
          { company: new mongoose.Types.ObjectId(companyId), isDeleted: false },
          {
            $set: {
              status:        WA_CONNECTION_STATUS.QR_PENDING,
              qrCode,
              qrCodeRaw:     qr,
              qrGeneratedAt: new Date(),
              qrExpiresAt:   expiresAt,
              updatedBy:     new mongoose.Types.ObjectId(systemUserId),
            },
            $push: {
              history: {
                $each:     [{ event: 'qr_generated', at: new Date() }],
                $position: 0,
                $slice:    20,
              },
            },
          },
          { upsert: true },
        );
      }

      // ── Connected ──────────────────────────────────────────────────────────
      if (connection === 'open') {
        const me          = socket.user!;
        const phoneNumber = me.id.split(':')[0]; // "919876543210"
        const displayName = me.name ?? '';
        const sessionData = JSON.stringify(state.creds);

        onConnect({ phoneNumber: `+${phoneNumber}`, displayName, sessionData });

        await WhatsAppConnection.findOneAndUpdate(
          { company: new mongoose.Types.ObjectId(companyId), isDeleted: false },
          {
            $set: {
              status:      WA_CONNECTION_STATUS.CONNECTED,
              phoneNumber: `+${phoneNumber}`,
              displayName,
              connectedAt: new Date(),
              lastSeenAt:  new Date(),
              qrCode:      null,
              qrCodeRaw:   null,
              qrExpiresAt: null,
              updatedBy:   new mongoose.Types.ObjectId(systemUserId),
            },
            $push: {
              history: {
                $each: [{ event: 'connected', at: new Date(), meta: { phoneNumber } }],
                $position: 0,
                $slice:    20,
              },
            },
          },
        );
      }

      // ── Disconnected ───────────────────────────────────────────────────────
      if (connection === 'close') {
        const statusCode      = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const reason          = DisconnectReason[statusCode as number] ?? 'unknown';

        onDisconnect(reason);

        await WhatsAppConnection.findOneAndUpdate(
          { company: new mongoose.Types.ObjectId(companyId), isDeleted: false },
          {
            $set: {
              status:           WA_CONNECTION_STATUS.DISCONNECTED,
              disconnectedAt:   new Date(),
              disconnectReason: reason,
              qrCode:           null,
              qrCodeRaw:        null,
              qrExpiresAt:      null,
              updatedBy:        new mongoose.Types.ObjectId(systemUserId),
            },
            $push: {
              history: {
                $each: [{ event: 'disconnected', at: new Date(), meta: { reason } }],
                $position: 0,
                $slice:    20,
              },
            },
          },
        );

        this.sessions.delete(companyId);

        if (!shouldReconnect) {
          // Logged out → wipe creds so a fresh QR scan is required next time
          this.clearSessionFiles(companyId);
        } else {
          // Auto-reconnect with saved creds (no QR required)
          setTimeout(() => {
            this.initSession(companyId, systemUserId, onQR, onConnect, onDisconnect)
              .catch(console.error);
          }, 3_000);
        }
      }
    });

    // Persist updated auth creds whenever Baileys rotates them
    socket.ev.on('creds.update', saveCreds);
  }

  // ── closeSession ───────────────────────────────────────────────────────────
  async closeSession(companyId: string, reason = 'Manual disconnect'): Promise<void> {
    const entry = this.sessions.get(companyId);
    if (!entry) return;

    try {
      await entry.socket.logout();
    } catch {
      // socket may already be dead; ignore
    }

    entry.socket.end(new Error(reason));
    this.sessions.delete(companyId);
  }

  // ── isConnected ────────────────────────────────────────────────────────────
  isConnected(companyId: string): boolean {
    return this.sessions.has(companyId);
  }

  // ── sendTextMessage ────────────────────────────────────────────────────────
  async sendTextMessage(companyId: string, to: string, text: string): Promise<boolean> {
    const entry = this.sessions.get(companyId);
    if (!entry) throw new Error('No active session for this company');

    const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
    await entry.socket.sendMessage(jid, { text });
    return true;
  }

  // ── restoreAllSessions ─────────────────────────────────────────────────────
  // Call once on server startup to re-attach sockets for all previously
  // connected companies (no QR required – uses saved creds).
  async restoreAllSessions(): Promise<void> {
    const conns = await WhatsAppConnection.find({
      status:    WA_CONNECTION_STATUS.CONNECTED,
      isDeleted: false,
    }).lean();

    for (const c of conns) {
      const companyId   = String(c.company);
      const userId      = String(c.updatedBy);
      const sessionPath = path.join(SESSION_ROOT, companyId);

      if (!fs.existsSync(sessionPath)) continue; // creds missing, skip

      console.log(`[WA] Restoring session for company ${companyId}`);

      await this.initSession(
        companyId,
        userId,
        () => {},  // no QR expected on reconnect
        () => {},
        (reason) => console.warn(`[WA] Company ${companyId} disconnected: ${reason}`),
      ).catch((e) => console.error(`[WA] Restore failed for ${companyId}:`, e));
    }
  }
}

// Export as singleton
export const waClientService = new WhatsAppClientService();
export default waClientService;