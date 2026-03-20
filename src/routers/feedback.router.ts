import { Router } from 'express';
import FeedbackController from '../controller/feedback.controller';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';

const feedbackRouter = Router();
const feedbackController = new FeedbackController();

// ─── Public Routes ────────────────────────────────────────────────────────────
// Submit feedback (anonymous or authenticated)
feedbackRouter.post('/submit',(req, res)=>{console.log("api call")}, feedbackController.submitFeedback.bind(feedbackController));

// ─── Protected Routes ─────────────────────────────────────────────────────────
feedbackRouter.use(authenticate);

// Get feedback for authenticated user's company (Admin/Manager) or all (SuperAdmin)
feedbackRouter.get(
  '/',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  feedbackController.getCompanyFeedback.bind(feedbackController)
);

// Get feedback analytics for company dashboard
feedbackRouter.get(
  '/analytics',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  feedbackController.getFeedbackAnalytics.bind(feedbackController)
);

// Get single feedback by ID (with company authorization)
feedbackRouter.get(
  '/:id',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  feedbackController.getFeedbackById.bind(feedbackController)
);

// Update feedback status/notes (Admin+ only)
feedbackRouter.patch(
  '/:id',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  feedbackController.updateFeedback.bind(feedbackController)
);

// Soft-delete feedback (SuperAdmin only)
feedbackRouter.delete(
  '/:id',
  // authorizeRoles(USER_ROLES.SUPER_ADMIN),
  feedbackController.deleteFeedback.bind(feedbackController)
);

export { feedbackRouter };