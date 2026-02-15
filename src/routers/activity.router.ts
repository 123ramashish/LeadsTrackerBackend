import { Router } from 'express';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../controller/lead.controller';
import Activity, { ActivityType } from '../DataBase/Schema/Activity.schema';
import Lead from '../DataBase/Schema/Leads.schema';

const router = Router();

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: USER_ROLES;
    companyId: string;
  };
}

// GET ACTIVITY TIMELINE FOR A SPECIFIC LEAD
router.get('/lead/:leadId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { leadId } = req.params;
    const { limit = 50, page = 1, type } = req.query;
    const currentUser = req.user!;

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ message: 'Invalid lead ID' });
    }

    // Verify lead access
    const leadQuery: any = { _id: leadId, isDeleted: false };
    if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
      leadQuery.company = new mongoose.Types.ObjectId(currentUser.companyId);
    }

    const lead = await Lead.findOne(leadQuery);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found or access denied' });
    }

    // Build query
    const query: any = { leadId: new mongoose.Types.ObjectId(leadId) };
    if (type && Object.values(ActivityType).includes(type as ActivityType)) {
      query.type = type;
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [activities, total] = await Promise.all([
      Activity.find(query)
        .sort({ activityDate: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('performedBy', 'name email avatar')
        .populate('assignedTo', 'name email avatar')
        .lean(),
      Activity.countDocuments(query)
    ]);

    res.json({
      lead: {
        id: lead._id,
        name: lead.name,
        email: lead.email
      },
      activities,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum
      }
    });
  } catch (error: any) {
    console.error('Activity timeline error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch activity timeline',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// GET RECENT ACTIVITIES FOR COMPANY
router.get('/recent', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 20, type, performedBy } = req.query;
    const currentUser = req.user!;

    const query: any = {};
    
    // Company isolation
    if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
      query.companyId = new mongoose.Types.ObjectId(currentUser.companyId);
    }

    // Filter by activity type
    if (type && Object.values(ActivityType).includes(type as ActivityType)) {
      query.type = type;
    }

    // Filter by user
    if (performedBy && mongoose.Types.ObjectId.isValid(performedBy as string)) {
      query.performedBy = new mongoose.Types.ObjectId(performedBy as string);
    }

    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

    const activities = await Activity.find(query)
      .sort({ activityDate: -1 })
      .limit(limitNum)
      .populate('leadId', 'name email phone status')
      .populate('performedBy', 'name email avatar')
      .populate('assignedTo', 'name email avatar')
      .lean();

    res.json({ activities });
  } catch (error: any) {
    console.error('Recent activities error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch recent activities',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// GET ACTIVITY STATISTICS
router.get(
  '/statistics',
  authenticate,
  authorizeRoles([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query;
      const currentUser = req.user!;

      const companyId = currentUser.role === USER_ROLES.SUPER_ADMIN && req.query.companyId
        ? req.query.companyId
        : currentUser.companyId;

      const dateFilter: any = {};
      if (dateFrom) dateFilter.$gte = new Date(dateFrom as string);
      if (dateTo) dateFilter.$lte = new Date(dateTo as string);

      const matchQuery: any = {
        companyId: new mongoose.Types.ObjectId(companyId as string)
      };

      if (Object.keys(dateFilter).length > 0) {
        matchQuery.activityDate = dateFilter;
      }

      // Get activity distribution by type
      const activityByType = await Activity.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Get most active users
      const topPerformers = await Activity.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$performedBy',
            activityCount: { $sum: 1 }
          }
        },
        { $sort: { activityCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            userId: '$_id',
            userName: '$user.name',
            userEmail: '$user.email',
            activityCount: 1
          }
        }
      ]);

      // Get daily activity trend
      const dailyTrend = await Activity.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$activityDate' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } },
        { $limit: 30 }
      ]);

      res.json({
        activityByType,
        topPerformers,
        dailyTrend
      });
    } catch (error: any) {
      console.error('Activity statistics error:', error);
      res.status(500).json({ 
        message: 'Failed to fetch activity statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }
);

// GET ACTIVITY SUMMARY FOR A USER
router.get('/user/:userId/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { dateFrom, dateTo } = req.query;
    const currentUser = req.user!;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Check access
    if (currentUser.role !== USER_ROLES.SUPER_ADMIN && 
        currentUser.role !== USER_ROLES.ADMIN && 
        currentUser.id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const dateFilter: any = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom as string);
    if (dateTo) dateFilter.$lte = new Date(dateTo as string);

    const matchQuery: any = {
      performedBy: new mongoose.Types.ObjectId(userId)
    };

    if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
      matchQuery.companyId = new mongoose.Types.ObjectId(currentUser.companyId);
    }

    if (Object.keys(dateFilter).length > 0) {
      matchQuery.activityDate = dateFilter;
    }

    const summary = await Activity.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const totalActivities = await Activity.countDocuments(matchQuery);

    res.json({
      userId,
      totalActivities,
      activityBreakdown: summary
    });
  } catch (error: any) {
    console.error('User activity summary error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user activity summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

export default router;