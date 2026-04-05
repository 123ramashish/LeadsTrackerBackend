// controller/chat.controller.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Chat, {
    CHAT_STATUS,
    MESSAGE_SENDER,
    MESSAGE_TYPE,
} from '../DataBase/Schema/clinivo/chat.schema';

// ── Augmented Request ─────────────────────────────────────────────────────────
interface AuthRequest extends Request {
    user?: { id: string; companyId: string; isSuperAdmin?: boolean };
}

function resolveCompanyId(req: AuthRequest): string | null {
    const user = req.user!;
    if (user.isSuperAdmin && req.query.companyId) {
        const id = String(req.query.companyId);
        return mongoose.Types.ObjectId.isValid(id) ? id : null;
    }
    return user.companyId ?? null;
}

function toOid(id: string) { return new mongoose.Types.ObjectId(id); }

export default class ChatController {

    // ── POST /chats ───────────────────────────────────────────────────────────
    // Manually open a chat thread for a booking (if not auto-created during booking)
    async createChat(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const { bookingId, slotId, patientName, patientPhone, patientJid } = req.body as {
                bookingId: string; slotId: string;
                patientName: string; patientPhone: string; patientJid?: string;
            };

            if (!mongoose.Types.ObjectId.isValid(bookingId) || !mongoose.Types.ObjectId.isValid(slotId)) {
                res.status(400).json({ message: 'Invalid bookingId or slotId' }); return;
            }
            if (!patientName?.trim() || !patientPhone?.trim()) {
                res.status(400).json({ message: 'patientName and patientPhone are required' }); return;
            }

            // One chat per booking enforced by unique index
            const chat = new Chat({
                company: toOid(companyId),
                booking: toOid(bookingId),
                slot:    toOid(slotId),
                patientName:  patientName.trim(),
                patientPhone: patientPhone.trim(),
                patientJid,
                messages: [],
            });

            await chat.save();
            res.status(201).json({ message: 'Chat created', data: chat });
        } catch (err: unknown) {
            if ((err as any).code === 11000) {
                res.status(409).json({ message: 'A chat already exists for this booking' }); return;
            }
            res.status(500).json({ message: 'Failed to create chat', error: (err as Error).message });
        }
    }

    // ── GET /chats — inbox view ───────────────────────────────────────────────
    // Admin/doctor inbox: list all chats (paginated, filterable by status)
    async listChats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const {
                status,
                assignedTo,
                patientPhone,
                page  = '1',
                limit = '20',
            } = req.query as { status?: string; assignedTo?: string; patientPhone?: string; page?: string; limit?: string };

            const filter: Record<string, unknown> = { company: toOid(companyId), isDeleted: false };
            if (status && Object.values(CHAT_STATUS).includes(status as CHAT_STATUS)) filter.status = status;
            if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) filter.assignedTo = toOid(assignedTo);
            if (patientPhone) filter.patientPhone = patientPhone.trim();

            const skip     = (Math.max(1, parseInt(page)) - 1) * Math.min(50, parseInt(limit));
            const pageSize = Math.min(50, parseInt(limit));

            const [chats, total] = await Promise.all([
                Chat.find(filter)
                    .select('-messages')                          // exclude message array in list view
                    .populate('booking', 'confirmationId status')
                    .sort({ lastMessageAt: -1 })
                    .skip(skip)
                    .limit(pageSize)
                    .lean(),
                Chat.countDocuments(filter),
            ]);

            res.json({ data: chats, meta: { total, page: parseInt(page), limit: pageSize } });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to list chats', error: (err as Error).message });
        }
    }

    // ── GET /chats/:chatId ────────────────────────────────────────────────────
    // Fetch full chat thread including all messages
    async getChat(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { chatId } = req.params as { chatId: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!mongoose.Types.ObjectId.isValid(chatId)) {
                res.status(400).json({ message: 'Invalid chat ID' }); return;
            }

            const chat = await Chat.findOne({ _id: toOid(chatId), company: toOid(companyId), isDeleted: false })
                .populate('booking', 'confirmationId patientName patientPhone issues status')
                .populate('slot',    'date startTime endTime')
                .populate('assignedTo', 'name email')
                .lean();

            if (!chat) { res.status(404).json({ message: 'Chat not found' }); return; }

            // Filter out soft-deleted messages before sending
            (chat as any).messages = chat.messages.filter(m => !m.isDeleted);

            res.json({ data: chat });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to fetch chat', error: (err as Error).message });
        }
    }

    // ── POST /chats/:chatId/messages ──────────────────────────────────────────
    // Doctor/admin sends a message into the thread
    async sendMessage(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { chatId } = req.params as { chatId: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!mongoose.Types.ObjectId.isValid(chatId)) {
                res.status(400).json({ message: 'Invalid chat ID' }); return;
            }

            const {
                content,
                messageType = MESSAGE_TYPE.TEXT,
                mediaUrl,
                mediaSize,
                mediaMimeType,
                sender = MESSAGE_SENDER.DOCTOR,
            } = req.body as {
                content:        string;
                messageType?:   MESSAGE_TYPE;
                mediaUrl?:      string;
                mediaSize?:     number;
                mediaMimeType?: string;
                sender?:        MESSAGE_SENDER;
            };

            if (!content?.trim()) { res.status(400).json({ message: 'content is required' }); return; }

            const newMessage = {
                sender,
                senderRef:   sender !== MESSAGE_SENDER.PATIENT ? toOid(req.user!.id) : undefined,
                content:     content.trim(),
                messageType,
                mediaUrl,
                mediaSize,
                mediaMimeType,
                isRead:      false,
                timestamp:   new Date(),
                isDeleted:   false,
            };

            const chat = await Chat.findOneAndUpdate(
                { _id: toOid(chatId), company: toOid(companyId), status: CHAT_STATUS.OPEN, isDeleted: false },
                { $push: { messages: newMessage } },
                { new: true }
            );

            if (!chat) {
                res.status(404).json({ message: 'Open chat not found' }); return;
            }

            // Trigger pre-save hook manually (updateOne skips it)
            const lastMsg = chat.messages[chat.messages.length - 1];
            await Chat.updateOne(
                { _id: chat._id },
                {
                    $set: {
                        lastMessageAt:      lastMsg.timestamp,
                        lastMessageSnippet: lastMsg.content.slice(0, 80),
                        unreadByDoctor:     chat.messages.filter(m => m.sender === MESSAGE_SENDER.PATIENT && !m.isRead && !m.isDeleted).length,
                        unreadByPatient:    chat.messages.filter(m => m.sender === MESSAGE_SENDER.DOCTOR  && !m.isRead && !m.isDeleted).length,
                    },
                }
            );

            res.status(201).json({
                message: 'Message sent',
                data: { chatId: chat._id, message: lastMsg },
            });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to send message', error: (err as Error).message });
        }
    }

    // ── POST /chats/:chatId/messages/inbound ──────────────────────────────────
    // Receive an inbound patient message (called by WhatsApp webhook handler)
    async receivePatientMessage(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { chatId } = req.params as { chatId: string };
            if (!mongoose.Types.ObjectId.isValid(chatId)) {
                res.status(400).json({ message: 'Invalid chat ID' }); return;
            }

            const {
                content,
                messageType       = MESSAGE_TYPE.TEXT,
                whatsappMessageId,
                mediaUrl,
            } = req.body as {
                content:            string;
                messageType?:       MESSAGE_TYPE;
                whatsappMessageId?: string;
                mediaUrl?:          string;
            };

            if (!content?.trim()) { res.status(400).json({ message: 'content is required' }); return; }

            const newMessage = {
                sender:            MESSAGE_SENDER.PATIENT,
                content:           content.trim(),
                messageType,
                whatsappMessageId,
                mediaUrl,
                isRead:            false,
                timestamp:         new Date(),
                isDeleted:         false,
            };

            const chat = await Chat.findOneAndUpdate(
                { _id: toOid(chatId), status: CHAT_STATUS.OPEN, isDeleted: false },
                {
                    $push: { messages: newMessage },
                    $inc:  { unreadByDoctor: 1 },
                    $set:  {
                        lastMessageAt:      newMessage.timestamp,
                        lastMessageSnippet: newMessage.content.slice(0, 80),
                    },
                },
                { new: true }
            );

            if (!chat) { res.status(404).json({ message: 'Open chat not found' }); return; }
            res.status(201).json({ message: 'Message received', data: { chatId: chat._id } });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to receive message', error: (err as Error).message });
        }
    }

    // ── PATCH /chats/:chatId/read ─────────────────────────────────────────────
    // Mark all messages as read from the doctor's perspective
    async markAsRead(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { chatId } = req.params as { chatId: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            await Chat.updateOne(
                { _id: toOid(chatId), company: toOid(companyId) },
                {
                    $set: {
                        'messages.$[msg].isRead': true,
                        'messages.$[msg].readAt': new Date(),
                        unreadByDoctor: 0,
                    },
                },
                {
                    arrayFilters: [{ 'msg.sender': MESSAGE_SENDER.PATIENT, 'msg.isRead': false }],
                    multi: true,
                }
            );

            res.json({ message: 'Messages marked as read' });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to mark as read', error: (err as Error).message });
        }
    }

    // ── PATCH /chats/:chatId/assign ───────────────────────────────────────────
    // Assign chat to a specific doctor/staff member
    async assignChat(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { chatId } = req.params as { chatId: string };
            const { userId } = req.body as { userId: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                res.status(400).json({ message: 'Invalid userId' }); return;
            }

            const chat = await Chat.findOneAndUpdate(
                { _id: toOid(chatId), company: toOid(companyId), isDeleted: false },
                { $set: { assignedTo: toOid(userId) } },
                { new: true }
            ).lean();

            if (!chat) { res.status(404).json({ message: 'Chat not found' }); return; }
            res.json({ message: 'Chat assigned', data: { chatId: chat._id, assignedTo: chat.assignedTo } });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to assign chat', error: (err as Error).message });
        }
    }

    // ── PATCH /chats/:chatId/status ───────────────────────────────────────────
    // Close or resolve a chat thread
    async updateChatStatus(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { chatId } = req.params as { chatId: string };
            const { status } = req.body as { status: CHAT_STATUS };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }
            if (!Object.values(CHAT_STATUS).includes(status)) {
                res.status(400).json({ message: `status must be one of: ${Object.values(CHAT_STATUS).join(', ')}` }); return;
            }

            const chat = await Chat.findOneAndUpdate(
                { _id: toOid(chatId), company: toOid(companyId), isDeleted: false },
                { $set: { status } },
                { new: true }
            ).lean();

            if (!chat) { res.status(404).json({ message: 'Chat not found' }); return; }
            res.json({ message: `Chat ${status}`, data: { chatId: chat._id, status: chat.status } });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to update chat status', error: (err as Error).message });
        }
    }

    // ── DELETE /chats/:chatId/messages/:messageId ─────────────────────────────
    // Soft-delete a single message (doctor only)
    async deleteMessage(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = resolveCompanyId(req);
            const { chatId, messageId } = req.params as { chatId: string; messageId: string };

            if (!companyId) { res.status(400).json({ message: 'Invalid company ID' }); return; }

            const result = await Chat.updateOne(
                { _id: toOid(chatId), company: toOid(companyId) },
                { $set: { 'messages.$[msg].isDeleted': true } },
                { arrayFilters: [{ 'msg._id': toOid(messageId) }] }
            );

            if (!result.modifiedCount) {
                res.status(404).json({ message: 'Message not found' }); return;
            }
            res.json({ message: 'Message deleted' });
        } catch (err: unknown) {
            res.status(500).json({ message: 'Failed to delete message', error: (err as Error).message });
        }
    }
}