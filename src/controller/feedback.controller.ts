import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Feedback, { IFeedback, FEEDBACK_STATUS, FEEDBACK_SENTIMENT } from '../DataBase/Schema/feedback.schema';
import User, { USER_ROLES, IUser } from '../DataBase/Schema/user.schema';
import Company from '../DataBase/Schema/company.schema';

// ─── Helper: Derive sentiment from rating ─────────────────────────────────────
const deriveSentiment = (rating: number): any => {
  if (rating >= 4) return FEEDBACK_SENTIMENT.POSITIVE;
  if (rating === 3) return FEEDBACK_SENTIMENT.NEUTRAL;
  return FEEDBACK_SENTIMENT.NEGATIVE;
};

// ─── Helper: Sanitize submitter data ──────────────────────────────────────────
const sanitizeSubmitterData = (data: Partial<IFeedback>) => {
  const sanitized: Partial<IFeedback> = {};
  if (data.submitterName) sanitized.submitterName = data.submitterName.trim().slice(0, 100);
  if (data.submitterPhone) sanitized.submitterPhone = data.submitterPhone.replace(/\D/g, '').slice(0, 15);
  if (data.submitterEmail) sanitized.submitterEmail = data.submitterEmail?.toLowerCase().trim();
  return sanitized;
};

export default class FeedbackController {
  // ─── SUBMIT FEEDBACK (Public or Authenticated) ─────────────────────────────
  async submitFeedback(req: Request, res: Response) {
    console.log("api calljjh")
    try {
      const {
        companyId,
        rating,
        comment,
        submitterName,
        submitterPhone,
        submitterEmail,
        tags,
        inputMode = 'text',
      } =  req.body;
console.log("api call",req.body)
      // Validation
      if (!companyId) {
       return res.status(400).json({ message: 'Valid companyId is required' });
      }
      if (!rating || rating < 1 || rating > 5) {
        res.status(400).json({ message: 'Rating must be between 1 and 5' });
        return;
      }
      if (comment && comment.length > 1000) {
        res.status(400).json({ message: 'Comment cannot exceed 1000 characters' });
        return;
      }

      // Verify company exists and is active
      const company = await Company.findById(new mongoose.Types.ObjectId(companyId)).select('isActive isDeleted');
      if (!company || company.isDeleted || !company.isActive) {
        res.status(404).json({ message: 'Company not found or inactive' });
        return;
      }

      // Prepare feedback document
      const feedbackData: Partial<IFeedback> = {
        company: new mongoose.Types.ObjectId(companyId),
        rating,
        comment: comment?.trim(),
        sentiment: deriveSentiment(rating),
        inputMode,
        tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
        status: FEEDBACK_STATUS.NEW,
        ...sanitizeSubmitterData({ submitterName, submitterPhone, submitterEmail }),
      };

      // Attach authenticated user if present
      const authUser = (req as any).user;
      if (authUser?.id) {
        feedbackData.user = new mongoose.Types.ObjectId(authUser.id) as any;
        // Prefer authenticated user's details if submitter info not provided
        if (!feedbackData.submitterName || !feedbackData.submitterEmail) {
          const user = await User.findById(authUser.id).select('name email phone');
          if (user) {
            if (!feedbackData.submitterName) feedbackData.submitterName = user.name;
            if (!feedbackData.submitterEmail) feedbackData.submitterEmail = user.email;
            if (!feedbackData.submitterPhone) feedbackData.submitterPhone = user.phone;
          }
        }
      }

      const feedback = await Feedback.create(feedbackData);

      // Return minimal response (don't expose internal IDs unnecessarily)
      res.status(201).json({
        message: 'Feedback submitted successfully',
        feedbackId: feedback._id,
        sentiment: feedback.sentiment,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[submitFeedback]', error);
     return res.status(500).json({ message: 'Failed to submit feedback', error: msg });
    }
  }

  // ─── GET COMPANY FEEDBACK (Paginated, Role-Aware) ──────────────────────────
  async getCompanyFeedback(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user as { id: string; role: string; companyId?: string };
      const { page = '1', limit = '20', sentiment, status, rating, search } = req.query as any;

      // Build filter
      const filter: mongoose.FilterQuery<IFeedback> = { isDeleted: false };

      // Company scoping: SuperAdmin sees all, others see only their company
      if (authUser.role === USER_ROLES.SUPER_ADMIN) {
        if (req.query.companyId && mongoose.Types.ObjectId.isValid(req.query.companyId as string)) {
          filter.company = new mongoose.Types.ObjectId(req.query.companyId as string);
        }
      } else if (authUser.companyId) {
        filter.company = new mongoose.Types.ObjectId(authUser.companyId);
      } else {
        res.status(403).json({ message: 'Access denied: No company association' });
        return;
      }

      // Optional filters
      if (sentiment && (Object.values(FEEDBACK_SENTIMENT) as string[]).includes(sentiment as string)) {
        filter.sentiment = sentiment as any;
      }
      if (status && (Object.values(FEEDBACK_STATUS) as string[]).includes(status as string)) {
        filter.status = status as any;
      }
      if (rating) {
        const r = Number(rating);
        if (r >= 1 && r <= 5) filter.rating = r;
      }
      if (search && typeof search === 'string') {
        filter.$or = [
          { comment: { $regex: search, $options: 'i' } },
          { submitterName: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } },
        ];
      }

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const [data, total] = await Promise.all([
        Feedback.find(filter)
          .populate('user', 'name email')
          .populate('reviewedBy', 'name')
          .select('-__v')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Feedback.countDocuments(filter),
      ]);

      res.json({
        data,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum,
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[getCompanyFeedback]', error);
      res.status(500).json({ message: 'Failed to fetch feedback', error: msg });
    }
  }

  // ─── GET FEEDBACK ANALYTICS ────────────────────────────────────────────────
  async getFeedbackAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user as { id: string; role: string; companyId?: string };
      const { days = 30 } = req.query;

      // Company scoping
      const matchStage: any = { isDeleted: false };
      if (authUser.role === USER_ROLES.SUPER_ADMIN) {
        if (req.query.companyId && mongoose.Types.ObjectId.isValid(req.query.companyId as string)) {
          matchStage.company = new mongoose.Types.ObjectId(req.query.companyId as string);
        }
      } else if (authUser.companyId) {
        matchStage.company = new mongoose.Types.ObjectId(authUser.companyId);
      } else {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      // Date filter
      const since = new Date();
      since.setDate(since.getDate() - Number(days));
      matchStage.createdAt = { $gte: since };

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avgRating: { $avg: '$rating' },
            positive: { $sum: { $cond: [{ $eq: ['$sentiment', FEEDBACK_SENTIMENT.POSITIVE] }, 1, 0] } },
            neutral: { $sum: { $cond: [{ $eq: ['$sentiment', FEEDBACK_SENTIMENT.NEUTRAL] }, 1, 0] } },
            negative: { $sum: { $cond: [{ $eq: ['$sentiment', FEEDBACK_SENTIMENT.NEGATIVE] }, 1, 0] } },
            byRating: {
              $push: {
                rating: '$rating',
                sentiment: '$sentiment',
                status: '$status',
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            total: 1,
            avgRating: { $round: ['$avgRating', 2] },
            positive: 1,
            neutral: 1,
            negative: 1,
            satisfactionRate: {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: [
                        { $sum: { $cond: [{ $eq: ['$sentiment', FEEDBACK_SENTIMENT.POSITIVE] }, 1, 0] } },
                        { $max: [{ $sum: 1 }, 1] },
                      ],
                    },
                    100,
                  ],
                },
                1,
              ],
            },
          },
        },
      ];

      const [analytics] = await Feedback.aggregate(pipeline);

      res.json({
        periodDays: Number(days),
        ...(analytics || {
          total: 0,
          avgRating: 0,
          positive: 0,
          neutral: 0,
          negative: 0,
          satisfactionRate: 0,
        }),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[getFeedbackAnalytics]', error);
      res.status(500).json({ message: 'Failed to fetch analytics', error: msg });
    }
  }

  // ─── GET SINGLE FEEDBACK ───────────────────────────────────────────────────
  async getFeedbackById(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user as { id: string; role: string; companyId?: string };
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id as string)) {
        res.status(400).json({ message: 'Invalid feedback ID' });
        return;
      }

      const feedback = await Feedback.findOne({ _id: id, isDeleted: false })
        .populate('user', 'name email phone')
        .populate('company', 'name type')
        .populate('reviewedBy', 'name')
        .select('-__v')
        .lean();

      if (!feedback) {
        res.status(404).json({ message: 'Feedback not found' });
        return;
      }

      // Authorization: SuperAdmin sees all, others only their company's feedback
      if (authUser.role !== USER_ROLES.SUPER_ADMIN) {
        const feedbackCompany = (feedback as any).company?._id || (feedback as any).company;
        if (!authUser.companyId || feedbackCompany.toString() !== authUser.companyId) {
          res.status(403).json({ message: 'Access denied' });
          return;
        }
      }

      res.json({ data: feedback });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[getFeedbackById]', error);
      res.status(500).json({ message: 'Failed to fetch feedback', error: msg });
    }
  }

  // ─── UPDATE FEEDBACK (Status, Notes) ───────────────────────────────────────
  async updateFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      const authUser = (req as any).user as { id: string; role: string };

      if (!mongoose.Types.ObjectId.isValid(id as string)) {
        res.status(400).json({ message: 'Invalid feedback ID' });
        return;
      }

      const update: Partial<IFeedback> = {};
      if (status && (Object.values(FEEDBACK_STATUS) as string[]).includes(status as string)) {
        update.status = status as any;
      }
      if (adminNotes !== undefined) {
        update.adminNotes = adminNotes?.trim().slice(0, 500);
      }
      if (status) {
        update.reviewedBy = new mongoose.Types.ObjectId(authUser.id) as any;
        update.reviewedAt = new Date();
      }

      if (Object.keys(update).length === 0) {
        res.status(400).json({ message: 'No valid fields to update' });
        return;
      }

      const feedback = await Feedback.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $set: update },
        { new: true, runValidators: true }
      ).select('-__v');

      if (!feedback) {
        res.status(404).json({ message: 'Feedback not found' });
        return;
      }

      res.json({ message: 'Feedback updated successfully', data: feedback });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[updateFeedback]', error);
      res.status(500).json({ message: 'Failed to update feedback', error: msg });
    }
  }

  // ─── DELETE FEEDBACK (Soft Delete - SuperAdmin Only) ───────────────────────
  async deleteFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id as string)) {
        res.status(400).json({ message: 'Invalid feedback ID' });
        return;
      }

      const feedback = await Feedback.findById(id);
      if (!feedback || feedback.isDeleted) {
        res.status(404).json({ message: 'Feedback not found' });
        return;
      }

      feedback.isDeleted = true;
      feedback.deletedAt = new Date();
      await feedback.save();

      res.json({ message: 'Feedback deleted successfully' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[deleteFeedback]', error);
      res.status(500).json({ message: 'Failed to delete feedback', error: msg });
    }
  }
}