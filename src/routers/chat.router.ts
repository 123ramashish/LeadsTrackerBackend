import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../controller/lead.controller';
import ChatController from '../controller/chat.controller';

const chatRouter = Router();
const chatController = new ChatController();

// ===== MESSAGING OPERATIONS =====
// Send message to lead (admin → lead)
chatRouter.post('/', authenticate, chatController.createChat.bind(chatController));

// Receive message from lead (webhook/integration endpoint)
// Note: This might need different auth for external integrations
chatRouter.post(
  '/receive',
  // authenticate, // Use different auth middleware for webhooks if needed
  chatController.receiveLeadMessage.bind(chatController)
);

// ===== CHAT HISTORY =====
chatRouter.get(
  '/lead/:leadId',
  authenticate,
  chatController.getChatHistory.bind(chatController)
);

// ===== READ STATUS =====
chatRouter.post(
  '/lead/:leadId/mark-as-read',
  authenticate,
  chatController.markLeadMessagesAsRead.bind(chatController)
);

chatRouter.get(
  '/unread',
  authenticate,
  chatController.getUnreadCount.bind(chatController)
);

// ===== SEARCH & ANALYTICS =====
chatRouter.get(
  '/search',
  authenticate,
  chatController.searchMessages.bind(chatController)
);

chatRouter.get(
  '/analytics/statistics',
  authenticate,
  authorizeRoles([USER_ROLES.ADMIN]),
  chatController.getChatStatistics.bind(chatController)
);

// ===== MESSAGE MANAGEMENT =====
chatRouter.delete(
  '/:id',
  authenticate,
  chatController.deleteMessage.bind(chatController)
);

export default chatRouter;