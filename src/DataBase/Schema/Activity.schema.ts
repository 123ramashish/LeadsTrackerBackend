import mongoose, { Schema, Document } from 'mongoose';

// Activity types for comprehensive tracking
export enum ActivityType {
  // Status Changes
  STATUS_CHANGED = 'status_changed',
  TYPE_CHANGED = 'type_changed',
  PRIORITY_CHANGED = 'priority_changed',
  
  // Communication
  EMAIL_SENT = 'email_sent',
  EMAIL_RECEIVED = 'email_received',
  CALL_MADE = 'call_made',
  CALL_RECEIVED = 'call_received',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_RECEIVED = 'message_received',
  
  // Meetings & Events
  MEETING_SCHEDULED = 'meeting_scheduled',
  MEETING_COMPLETED = 'meeting_completed',
  MEETING_CANCELLED = 'meeting_cancelled',
  
  // Lead Management
  LEAD_CREATED = 'lead_created',
  LEAD_UPDATED = 'lead_updated',
  LEAD_ASSIGNED = 'lead_assigned',
  LEAD_CONVERTED = 'lead_converted',
  NOTE_ADDED = 'note_added',
  TASK_CREATED = 'task_created',
  TASK_COMPLETED = 'task_completed',
  
  // Documents
  DOCUMENT_UPLOADED = 'document_uploaded',
  PROPOSAL_SENT = 'proposal_sent',
  CONTRACT_SIGNED = 'contract_signed',
  
  // Other
  FOLLOW_UP_SCHEDULED = 'follow_up_scheduled',
  REMINDER_SET = 'reminder_set',
  TAG_ADDED = 'tag_added',
  TAG_REMOVED = 'tag_removed'
}

export interface IActivity extends Document {
  leadId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  
  // Activity Details
  type: ActivityType;
  title: string;
  description?: string;
  
  // User & Assignment
  performedBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  
  // Change Tracking
  previousValue?: any;
  newValue?: any;
  
  // Additional Data
  metadata?: {
    duration?: number; // For calls, meetings
    subject?: string; // For emails
    outcome?: string; // For calls, meetings
    attachments?: string[];
    tags?: string[];
    [key: string]: any;
  };
  
  // Timestamps
  activityDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    
    // ===== ACTIVITY DETAILS =====
    type: {
      type: String,
      enum: {
        values: Object.values(ActivityType),
        message: '{VALUE} is not a valid activity type'
      },
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    
    // ===== USER & ASSIGNMENT =====
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    
    // ===== CHANGE TRACKING =====
    previousValue: {
      type: Schema.Types.Mixed
    },
    newValue: {
      type: Schema.Types.Mixed
    },
    
    // ===== ADDITIONAL DATA =====
    metadata: {
      duration: Number,
      subject: String,
      outcome: String,
      attachments: [String],
      tags: [String],
      type: Schema.Types.Mixed
    },
    
    // ===== TIMESTAMPS =====
    activityDate: {
      type: Date,
      default: Date.now,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// ===== INDEXES =====
activitySchema.index({ leadId: 1, activityDate: -1 });
activitySchema.index({ companyId: 1, type: 1, activityDate: -1 });
activitySchema.index({ companyId: 1, performedBy: 1, activityDate: -1 });
activitySchema.index({ leadId: 1, type: 1 });

// ===== STATIC METHODS =====
activitySchema.statics.getLeadTimeline = function (
  leadId: string,
  limit: number = 50
) {
  return this.find({ leadId })
    .sort({ activityDate: -1 })
    .limit(limit)
    .populate('performedBy', 'name email')
    .populate('assignedTo', 'name email')
    .lean();
};

activitySchema.statics.getActivityStats = async function (
  companyId: string,
  startDate: Date,
  endDate: Date
) {
  return this.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        activityDate: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

const Activity = mongoose.model<IActivity>('Activity', activitySchema);

export default Activity;