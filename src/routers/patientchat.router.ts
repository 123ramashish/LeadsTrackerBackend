
// ─────────────────────────────────────────────────────────────────────────────
// routes/chat.router.ts
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate, enforceTenant, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';
import ChatController from '../controller/patientchat.controller';
 
const chatRouter = Router();
const cCtrl      = new ChatController();
 
chatRouter.use(authenticate, enforceTenant);
 
const ADMIN_ONLY_C = authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);
 
// ── Threads ───────────────────────────────────────────────────────────────────
chatRouter.get('/',         ADMIN_ONLY_C, cCtrl.listChats.bind(cCtrl));    // inbox view
chatRouter.get('/:chatId',  cCtrl.getChat.bind(cCtrl));
chatRouter.post('/',        ADMIN_ONLY_C, cCtrl.createChat.bind(cCtrl));
 
// ── Messaging ─────────────────────────────────────────────────────────────────
chatRouter.post('/:chatId/messages',          cCtrl.sendMessage.bind(cCtrl));
// Webhook endpoint — called by WhatsApp handler (no auth middleware here in real usage)
chatRouter.post('/:chatId/messages/inbound',  cCtrl.receivePatientMessage.bind(cCtrl));
 
// ── Management ────────────────────────────────────────────────────────────────
chatRouter.patch('/:chatId/read',     cCtrl.markAsRead.bind(cCtrl));
chatRouter.patch('/:chatId/assign',   ADMIN_ONLY_C, cCtrl.assignChat.bind(cCtrl));
chatRouter.patch('/:chatId/status',   ADMIN_ONLY_C, cCtrl.updateChatStatus.bind(cCtrl));
chatRouter.delete('/:chatId/messages/:messageId', ADMIN_ONLY_C, cCtrl.deleteMessage.bind(cCtrl));
 
export default chatRouter;