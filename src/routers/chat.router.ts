import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../controller/lead.controller';
import ChatController from '../controller/chat.controller';

const router = Router();
const chatController = new ChatController();

// ===== MESSAGING OPERATIONS =====
// Send message to lead (admin → lead)
router.post('/', authenticate, chatController.createChat.bind(chatController));

// Receive message from lead (webhook/integration endpoint)
// Note: This might need different auth for external integrations
router.post(
  '/receive',
  // authenticate, // Use different auth middleware for webhooks if needed
  chatController.receiveLeadMessage.bind(chatController)
);

// ===== CHAT HISTORY =====
router.get(
  '/lead/:leadId',
  authenticate,
  chatController.getChatHistory.bind(chatController)
);

// ===== READ STATUS =====
router.post(
  '/lead/:leadId/mark-as-read',
  authenticate,
  chatController.markLeadMessagesAsRead.bind(chatController)
);

router.get(
  '/unread',
  authenticate,
  chatController.getUnreadCount.bind(chatController)
);

// ===== SEARCH & ANALYTICS =====
router.get(
  '/search',
  authenticate,
  chatController.searchMessages.bind(chatController)
);

router.get(
  '/analytics/statistics',
  authenticate,
  authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]),
  chatController.getChatStatistics.bind(chatController)
);

// ===== MESSAGE MANAGEMENT =====
router.delete(
  '/:id',
  authenticate,
  chatController.deleteMessage.bind(chatController)
);

export default router;