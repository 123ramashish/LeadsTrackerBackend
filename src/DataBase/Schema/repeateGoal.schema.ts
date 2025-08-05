
import mongoose, { Schema, Document } from 'mongoose';

export interface IRepeatGoal extends Document {
  title: string;
  description: string;
  repeatInterval: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: Date;
  endDate?: Date;
  user: mongoose.Types.ObjectId;
  completedDates: Date[];
  status?: 'pending' | 'in-progress' | 'completed';
}

const RepeatGoalSchema: Schema = new Schema<IRepeatGoal>({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters'],
    maxlength: [100, 'Title must be at most 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [5, 'Description must be at least 5 characters'],
    maxlength: [500, 'Description must be at most 500 characters']
  },
  repeatInterval: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: [true, 'Repeat interval is required']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  completedDates: {
    type: [Date],
    default: []
  },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed'],
        default: 'pending'
    }
}, {
  timestamps: true
});

export default mongoose.model<IRepeatGoal>('RepeatGoal', RepeatGoalSchema);
