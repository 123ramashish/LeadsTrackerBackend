import mongoose, { Document, Schema } from "mongoose";

export interface INotification extends Document {
  _id: string;
  title: string;
  description: string;
  createFor: string[]; // Array of user IDs who should receive this notification
  read: string[]; // Array of user IDs who have read this notification
  archived?: boolean;
  priority?: 'low' | 'medium' | 'high';
  type?: 'info' | 'warning' | 'error' | 'success';
  metadata?: {
    actionUrl?: string;
    actionText?: string;
    category?: string;
    tags?: string[];
  };
  createAt: Date;
  updatedAt?: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"]
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"]
    },
    createFor: [{
      type: String,
      required: [true, "CreateFor is required"],
      index: true // Index for better query performance
    }],
    read: [{
      type: String,
      index: true // Index for better query performance
    }],
    archived: {
      type: Boolean,
      default: false,
      index: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    type: {
      type: String,
      enum: ['info', 'warning', 'error', 'success'],
      default: 'info'
    },
    metadata: {
      actionUrl: {
        type: String,
        trim: true
      },
      actionText: {
        type: String,
        trim: true,
        maxlength: [50, "Action text cannot exceed 50 characters"]
      },
      category: {
        type: String,
        trim: true,
        maxlength: [50, "Category cannot exceed 50 characters"]
      },
      tags: [{
        type: String,
        trim: true
      }]
    },
    createAt: {
      type: Date,
      default: Date.now,
      index: true // Index for sorting by creation date
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false, // We're handling timestamps manually
    versionKey: false
  }
);

// Compound indexes for better query performance
notificationSchema.index({ createFor: 1, read: 1 });
notificationSchema.index({ createFor: 1, archived: 1 });
notificationSchema.index({ createFor: 1, createAt: -1 });

// Pre-save middleware to update the updatedAt field
notificationSchema.pre('findOneAndUpdate', function() {
  this.set({ updatedAt: new Date() });
});

notificationSchema.pre('updateMany', function() {
  this.set({ updatedAt: new Date() });
});

// Virtual for checking if notification is read by a specific user
notificationSchema.methods.isReadByUser = function(userId: string): boolean {
  return this.read.includes(userId);
};

// Virtual for checking if notification is for a specific user
notificationSchema.methods.isForUser = function(userId: string): boolean {
  return this.createFor.includes(userId);
};

// Static method to find notifications for a user
notificationSchema.statics.findForUser = function(userId: string, options: any = {}) {
  const query:any = { createFor: { $in: [userId] } };
  
  if (options.unreadOnly) {
    query['read'] = { $nin: [userId] };
  }
  
  if (options.readOnly) {
    query['read'] = { $in: [userId] };
  }
  
  if (options.includeArchived === false) {
    query['archived'] = { $ne: true };
  }
  
  return this.find(query).sort({ createAt: -1 });
};

const Notification = mongoose.model<INotification>("Notification", notificationSchema);

export default Notification;