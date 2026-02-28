// src/routes/messageRoutes.ts
import { Router } from 'express';
import {
  getStats,
  getMessageById,
  createMessage,
  updateMessageStatus,
  updateFollowUp,
  setReminder,
  addReply,
  deleteMessage,
  triggerBulkFollowUp,
  getMessages,
} from '../controller/message.controller.js';

const router = Router();

/**
 * @route   GET /api/messages
 * @desc    Get all messages (paginated + filtered)
 * @query   page, limit, channel, waStatus, emailStatus, followUpStatus,
 *          isBulk, needsFollowUp, search
 */
router.get('/', getMessages);

/**
 * @route   GET /api/messages/stats
 * @desc    Aggregate stats (total, replied, autoScheduled, needsFollowUp)
 * @query   channel (optional – filter to one channel)
 */
router.get('/stats', getStats);

/**
 * @route   GET /api/messages/:id
 * @desc    Get a single message (with populated templateId)
 */
router.get('/:id', getMessageById);

/**
 * @route   POST /api/messages
 * @desc    Send / create a new message record
 * @body    { leadId, leadName, leadEmail, leadPhone, channel, subject?,
 *            body, templateId?, waStatus?, emailStatus?, sentAt?,
 *            followUpScheduledAt?, isBulk?, bulkCount? }
 */
router.post('/', createMessage);

/**
 * @route   PATCH /api/messages/:id/status
 * @desc    Update delivery / read status (webhook handler)
 * @body    { waStatus? } | { emailStatus? }
 */
router.patch('/:id/status', updateMessageStatus);

/**
 * @route   PATCH /api/messages/:id/follow-up
 * @desc    Update follow-up status and optional schedule time
 * @body    { followUpStatus, followUpScheduledAt? }
 */
router.patch('/:id/follow-up', updateFollowUp);

/**
 * @route   PATCH /api/messages/:id/reminder
 * @desc    Set a reminder for a message
 * @body    { reminderAt, reminderNote? }
 */
router.patch('/:id/reminder', setReminder);

/**
 * @route   POST /api/messages/:id/replies
 * @desc    Record an inbound reply from the lead
 * @body    { text, receivedAt? }
 */
router.post('/:id/replies', addReply);

/**
 * @route   DELETE /api/messages/:id
 * @desc    Delete a message
 */
router.delete('/:id', deleteMessage);

/**
 * @route   POST /api/messages/bulk-follow-up
 * @desc    Trigger auto follow-up for all 7-day-overdue messages
 * @body    { channel? }
 */
router.post('/bulk-follow-up', triggerBulkFollowUp);

export default router;