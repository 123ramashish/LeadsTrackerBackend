import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../controller/lead.controller';
import LeadController from '../controller/lead.controller';

const router = Router();
const leadController = new LeadController();

// ===== CRUD OPERATIONS =====
router.post('/', authenticate, leadController.createLead.bind(leadController));
router.get('/', authenticate, leadController.getLeads.bind(leadController));
router.get('/:id', authenticate, leadController.getLeadById.bind(leadController));
router.put('/:id', authenticate, leadController.updateLead.bind(leadController));

// ===== STATUS & TYPE MANAGEMENT =====
router.patch(
  '/:id/status',
  authenticate,
  leadController.updateLeadStatus.bind(leadController)
);
router.patch(
  '/:id/type',
  authenticate,
  leadController.updateLeadType.bind(leadController)
);
router.patch(
  '/:id/priority',
  authenticate,
  leadController.updateLeadPriority.bind(leadController)
);
router.patch(
  '/:id/favorite',
  authenticate,
  leadController.toggleFavorite.bind(leadController)
);

// ===== ASSIGNMENT & FOLLOW-UP =====
router.patch(
  '/:id/assign',
  authenticate,
  authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]),
  leadController.assignLead.bind(leadController)
);
router.post(
  '/:id/follow-up',
  authenticate,
  leadController.scheduleFollowUp.bind(leadController)
);

// ===== NOTES & ACTIVITIES =====
router.post(
  '/:id/notes',
  authenticate,
  leadController.addNote.bind(leadController)
);

// ===== DELETE OPERATIONS =====
router.delete(
  '/:id',
  authenticate,
  authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]),
  leadController.deleteLead.bind(leadController)
);

// ===== BULK OPERATIONS =====
router.patch(
  '/bulk/status',
  authenticate,
  authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]),
  leadController.bulkUpdateStatus.bind(leadController)
);

// ===== ANALYTICS & REPORTS =====
router.get(
  '/analytics/overview',
  authenticate,
  leadController.getLeadAnalytics.bind(leadController)
);
router.get(
  '/analytics/funnel',
  authenticate,
  leadController.getConversionFunnel.bind(leadController)
);
router.get(
  '/analytics/overdue',
  authenticate,
  leadController.getOverdueFollowUps.bind(leadController)
);

export default router;