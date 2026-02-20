import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../controller/lead.controller';
import LeadController from '../controller/lead.controller';

const leadRouter = Router();
const leadController = new LeadController();

// ===== CRUD OPERATIONS =====
leadRouter.post('/', authenticate, leadController.createLead.bind(leadController));
leadRouter.get('/', authenticate, leadController.getLeads.bind(leadController));
leadRouter.get('/:id', authenticate, leadController.getLeadById.bind(leadController));
leadRouter.put('/:id', authenticate, leadController.updateLead.bind(leadController));

// ===== STATUS & TYPE MANAGEMENT =====
leadRouter.patch(
  '/:id/status',
  authenticate,
  leadController.updateLeadStatus.bind(leadController)
);
leadRouter.patch(
  '/:id/type',
  authenticate,
  leadController.updateLeadType.bind(leadController)
);
leadRouter.patch(
  '/:id/priority',
  authenticate,
  leadController.updateLeadPriority.bind(leadController)
);
leadRouter.patch(
  '/:id/favorite',
  authenticate,
  leadController.toggleFavorite.bind(leadController)
);

// ===== ASSIGNMENT & FOLLOW-UP =====
leadRouter.patch(
  '/:id/assign',
  authenticate,
  authorizeRoles([USER_ROLES.ADMIN]),
  leadController.assignLead.bind(leadController)
);
leadRouter.post(
  '/:id/follow-up',
  authenticate,
  leadController.scheduleFollowUp.bind(leadController)
);

// ===== NOTES & ACTIVITIES =====
leadRouter.post(
  '/:id/notes',
  authenticate,
  leadController.addNote.bind(leadController)
);

// ===== DELETE OPERATIONS =====
leadRouter.delete(
  '/:id',
  authenticate,
  authorizeRoles([USER_ROLES.ADMIN]),
  leadController.deleteLead.bind(leadController)
);

// ===== BULK OPERATIONS =====
leadRouter.patch(
  '/bulk/status',
  authenticate,
  authorizeRoles([USER_ROLES.ADMIN]),
  leadController.bulkUpdateStatus.bind(leadController)
);

// ===== ANALYTICS & REPORTS =====
leadRouter.get(
  '/analytics/overview',
  authenticate,
  leadController.getLeadAnalytics.bind(leadController)
);
leadRouter.get(
  '/analytics/funnel',
  authenticate,
  leadController.getConversionFunnel.bind(leadController)
);
leadRouter.get(
  '/analytics/overdue',
  authenticate,
  leadController.getOverdueFollowUps.bind(leadController)
);

export default leadRouter;