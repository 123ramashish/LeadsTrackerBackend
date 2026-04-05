import mongoose, { Document, Model, Schema } from 'mongoose';

// ─── Sentiment & Feedback Types ───────────────────────────────────────────────
export const FEEDBACK_SENTIMENT = {
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
} as const;
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENT)[keyof typeof FEEDBACK_SENTIMENT];

export const FEEDBACK_STATUS = {
  NEW: 'new',
  REVIEWED: 'reviewed',
  RESOLVED: 'resolved',
  ARCHIVED: 'archived',
  IGNORED: 'ignored',
   GOOGLE_UPLOADED: 'google_uploaded',
} as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUS)[keyof typeof FEEDBACK_STATUS];

// ─── Document Interface ───────────────────────────────────────────────────────
export interface IFeedback extends Document {
  _id: mongoose.Types.ObjectId;
  company: mongoose.Types.ObjectId;
  user?: mongoose.Types.ObjectId; // Optional: linked to authenticated user
  rating: number; // 1-5
  comment?: string;
  sentiment: FeedbackSentiment;
  // Submitter info (for anonymous/partial submissions)
  submitterName?: string;
  submitterPhone?: string;
  submitterEmail?: string;
  // Metadata
  tags?: string[];
  inputMode?: 'text' | 'voice';
  status: FeedbackStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  adminNotes?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Model Interface ──────────────────────────────────────────────────────────
export interface IFeedbackModel extends Model<IFeedback> {
  findByCompany(
    companyId: mongoose.Types.ObjectId,
    filter?: mongoose.FilterQuery<IFeedback>
  ): mongoose.Query<IFeedback[], IFeedback>;
  findByUser(
    userId: mongoose.Types.ObjectId,
    filter?: mongoose.FilterQuery<IFeedback>
  ): mongoose.Query<IFeedback[], IFeedback>;
}

// ─── Schema Definition ────────────────────────────────────────────────────────
const feedbackSchema = new Schema<IFeedback, IFeedbackModel>(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company reference is required'],
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    comment: {
      type: String,
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
      trim: true,
    },
    sentiment: {
      type: String,
      enum: Object.values(FEEDBACK_SENTIMENT),
      default: FEEDBACK_SENTIMENT.NEUTRAL,
      index: true,
    },
    // Anonymous submitter details (optional)
    submitterName: { type: String, trim: true, maxlength: 100 },
    submitterPhone: {
      type: String,
      match: [/^\d{10,15}$/, 'Invalid phone format'],
    },
    submitterEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    tags: { type: [String], default: [] },
    inputMode: { type: String, enum: ['text', 'voice'], default: 'text' },
    status: {
      type: String,
      enum: Object.values(FEEDBACK_STATUS),
      default: FEEDBACK_STATUS.NEW,
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    adminNotes: { type: String, maxlength: 500 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
feedbackSchema.index({ company: 1, sentiment: 1, isDeleted: 1 });
feedbackSchema.index({ company: 1, rating: 1, isDeleted: 1 });
feedbackSchema.index({ createdAt: -1, isDeleted: 1 });

// ─── Pre-save: Auto-calculate sentiment from rating ───────────────────────────
feedbackSchema.pre('save', function (next) {
  if (this.isModified('rating') && !this.isModified('sentiment')) {
    if (this.rating >= 4) this.sentiment = FEEDBACK_SENTIMENT.POSITIVE;
    else if (this.rating === 3) this.sentiment = FEEDBACK_SENTIMENT.NEUTRAL;
    else this.sentiment = FEEDBACK_SENTIMENT.NEGATIVE;
  }
  next();
});

// ─── Static Methods ───────────────────────────────────────────────────────────
feedbackSchema.statics.findByCompany = function (
  companyId: mongoose.Types.ObjectId,
  filter: mongoose.FilterQuery<IFeedback> = {}
) {
  return this.find({ ...filter, company: companyId, isDeleted: false });
};

feedbackSchema.statics.findByUser = function (
  userId: mongoose.Types.ObjectId,
  filter: mongoose.FilterQuery<IFeedback> = {}
) {
  return this.find({ ...filter, user: userId, isDeleted: false });
};

// ─── Virtual: Company name (for population) ───────────────────────────────────
feedbackSchema.virtual('companyDetails', {
  ref: 'Company',
  localField: 'company',
  foreignField: '_id',
  justOne: true,
});

const Feedback = mongoose.model<IFeedback, IFeedbackModel>('Feedback', feedbackSchema);
export default Feedback;