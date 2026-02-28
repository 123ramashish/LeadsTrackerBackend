// src/routes/templateRoutes.ts
import { Router } from 'express';
import {
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  incrementTemplateUsage,
} from '../controllers/templateController.js';

const router = Router();

/**
 * @route   GET /api/templates
 * @desc    Get all templates (paginated, filterable by channel)
 * @query   page, limit, channel, search
 */
router.get('/', getTemplates);

/**
 * @route   GET /api/templates/:id
 * @desc    Get a single template
 */
router.get('/:id', getTemplateById);

/**
 * @route   POST /api/templates
 * @desc    Create a new template
 * @body    { name, channel, subject?, body }
 */
router.post('/', createTemplate);

/**
 * @route   PUT /api/templates/:id
 * @desc    Update a template
 * @body    { name?, channel?, subject?, body? }
 */
router.put('/:id', updateTemplate);

/**
 * @route   DELETE /api/templates/:id
 * @desc    Delete a template
 */
router.delete('/:id', deleteTemplate);

/**
 * @route   POST /api/templates/:id/use
 * @desc    Increment template usage counter (called when template is applied)
 */
router.post('/:id/use', incrementTemplateUsage);

export default router;