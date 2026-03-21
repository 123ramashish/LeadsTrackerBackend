// src/routes/lead.routes.ts
import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../types/index'; // ← Import USER_ROLES

import { createLead ,  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  updateLeadStatus,
  updateLeadType,
  updateLeadPriority,
  toggleFavorite,
  assignLead,
  scheduleFollowUp,
  addNote,
  bulkUpdateStatus,
  getLeadAnalytics,
  getConversionFunnel,
  getOverdueFollowUps,
  bulkCreateLeads,} from '../controller/lead.controller';

const leadRouter = Router();

// ─── Shorthand bound methods (no .bind() needed for standalone functions) ─────
const ctrl = {
  // CRUD
  create:          createLead,
  bulkCreateLeads: bulkCreateLeads,
  getAll:          getLeads,
  getById:         getLeadById,
  update:          updateLead,
  delete:          deleteLead,

  // Status / Classification
  updateStatus:    updateLeadStatus,
  updateType:      updateLeadType,
  updatePriority:  updateLeadPriority,
  toggleFavorite:  toggleFavorite,

  // Assignment & Follow-up
  assign:          assignLead,
  scheduleFollowUp:scheduleFollowUp,

  // Notes & Activities
  addNote:         addNote,

  // Bulk
  bulkUpdateStatus:bulkUpdateStatus,

  // Analytics
  analyticsOverview: getLeadAnalytics,
  analyticsFunnel:   getConversionFunnel,
  analyticsOverdue:  getOverdueFollowUps,
};

const admin = authorizeRoles([USER_ROLES.ADMIN]);

// ─── Analytics (must be declared BEFORE /:id to avoid route conflicts) ────────
/**
 * @route   GET /api/leads/analytics/overview
 * @desc    Overall lead stats (totals by status, source, priority, etc.)
 * @access  Authenticated
 */
leadRouter.get('/analytics/overview', ctrl.analyticsOverview);

/**
 * @route   GET /api/leads/analytics/funnel
 * @desc    Conversion funnel across pipeline stages
 * @access  Authenticated
 */
leadRouter.get('/analytics/funnel', ctrl.analyticsFunnel);

/**
 * @route   GET /api/leads/analytics/overdue
 * @desc    Leads whose nextFollowUp date has passed
 * @access  Authenticated
 */
leadRouter.get('/analytics/overdue',  ctrl.analyticsOverdue);

// ─── Bulk Operations (also before /:id) ──────────────────────────────────────
/**
 * @route   PATCH /api/leads/bulk/status
 * @desc    Bulk-update status for multiple leads
 * @body    { ids: string[], status: LeadStatus }
 * @access  Admin
 */
leadRouter.patch('/bulk/status', ctrl.bulkUpdateStatus);

// ─── CRUD ─────────────────────────────────────────────────────────────────────
/**
 * @route   GET /api/leads
 * @desc    List leads (paginated, filterable, text search)
 * @query   page, limit, search, status, type, source, priority, assignedTo, isFavorite
 * @access  Authenticated
 */
leadRouter.get('/', ctrl.getAll);

/**
 * @route   POST /api/leads
 * @desc    Create a new lead
 * @body    { name, email?, phone?, whatsapp?, website?, address?, company,
 *            companyName?, status?, type?, source?, priority?, tags?,
 *            assignedTo?, estimatedValue?, nextFollowUp? }
 * @access  Authenticated
 */
leadRouter.post('/',authenticate, ctrl.create);

//. create bul leads
leadRouter.post('/bulk', ctrl.bulkCreateLeads);
/**
 * @route   GET /api/leads/:id
 * @desc    Get a single lead by ID
 * @access  Authenticated
 */
leadRouter.get('/:id', ctrl.getById);

/**
 * @route   PUT /api/leads/:id
 * @desc    Full / partial update of a lead
 * @body    Any writable lead fields
 * @access  Authenticated
 */
leadRouter.put('/:id',  ctrl.update);

/**
 * @route   DELETE /api/leads/:id
 * @desc    Soft-delete a lead
 * @access  Admin
 */
leadRouter.delete('/:id',   ctrl.delete);

// ─── Status & Classification ─────────────────────────────────────────────────
/**
 * @route   PATCH /api/leads/:id/status
 * @body    { status: LeadStatus }
 * @access  Authenticated
 */
leadRouter.patch('/:id/status', ctrl.updateStatus);

/**
 * @route   PATCH /api/leads/:id/type
 * @body    { type: LeadType }
 * @access  Authenticated
 */
leadRouter.patch('/:id/type', ctrl.updateType);

/**
 * @route   PATCH /api/leads/:id/priority
 * @body    { priority: LeadPriority }
 * @access  Authenticated
 */
leadRouter.patch('/:id/priority',  ctrl.updatePriority);

/**
 * @route   PATCH /api/leads/:id/favorite
 * @desc    Toggle isFavorite flag
 * @access  Authenticated
 */
leadRouter.patch('/:id/favorite',  ctrl.toggleFavorite);

// ─── Assignment & Follow-up ──────────────────────────────────────────────────
/**
 * @route   PATCH /api/leads/:id/assign
 * @body    { assignedTo: string }
 * @access  Admin
 */
leadRouter.patch('/:id/assign',   ctrl.assign);

/**
 * @route   POST /api/leads/:id/follow-up
 * @body    { nextFollowUp: ISO date string, note?: string }
 * @access  Authenticated
 */
leadRouter.post('/:id/follow-up', ctrl.scheduleFollowUp);

// ─── Notes & Activities ──────────────────────────────────────────────────────
/**
 * @route   POST /api/leads/:id/notes
 * @body    { text: string }
 * @access  Authenticated
 */
leadRouter.post('/:id/notes',  ctrl.addNote);

export default leadRouter;