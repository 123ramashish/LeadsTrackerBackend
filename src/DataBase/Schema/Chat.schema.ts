import mongoose, { Schema, Document, Model } from 'mongoose';

export enum MessageSender {
  LEAD = 'lead',
  ADMIN = 'admin'
}

export interface IReadReceipt {
  userId: mongoose.Types.ObjectId;
  readAt: Date;
}

export interface IChat extends Document {
  leadId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  
  // Message Details
  sentBy: string; // 'lead' or admin user ID
  senderType: MessageSender;
  content?: string;
  fileUrls: string[];
  
  // Read Tracking
  readBy: IReadReceipt[];
  
  // Timestamps
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  isReadBy(userId: string): boolean;
}

interface IChatModel extends Model<IChat> {
  markAsRead(leadId: string, userId: string): Promise<any>;
  getUnreadCount(leadId: string, userId: string): Promise<number>;
  getLastMessage(leadId: string): Promise<IChat | null>;
}

const readReceiptSchema = new Schema<IReadReceipt>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  { _id: false }
);

const chatSchema = new Schema<IChat, IChatModel>(
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
    
    // ===== MESSAGE DETAILS =====
    sentBy: {
      type: String,
      required: true,
      trim: true
    },
    senderType: {
      type: String,
      enum: {
        values: Object.values(MessageSender),
        message: '{VALUE} is not a valid sender type'
      },
      required: true
    },
    content: {
      type: String,
      trim: true,
      maxlength: [10000, 'Message content cannot exceed 10,000 characters']
    },
    fileUrls: {
      type: [String],
      default: [],
      validate: {
        validator: function (urls: string[]) {
          return urls.length <= 10;
        },
        message: 'Cannot attach more than 10 files per message'
      }
    },
    
    // ===== READ TRACKING =====
    readBy: {
      type: [readReceiptSchema],
      default: []
    },
    
    // ===== TIMESTAMPS =====
    sentAt: {
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
chatSchema.index({ leadId: 1, sentAt: -1 });
chatSchema.index({ companyId: 1, sentAt: -1 });
chatSchema.index({ leadId: 1, senderType: 1 });

// ===== STATIC METHODS =====
chatSchema.statics.markAsRead = async function (
  leadId: string,
  userId: string
): Promise<any> {
  return this.updateMany(
    {
      leadId: new mongoose.Types.ObjectId(leadId),
      senderType: MessageSender.LEAD,
      'readBy.userId': { $ne: new mongoose.Types.ObjectId(userId) }
    },
    {
      $addToSet: {
        readBy: {
          userId: new mongoose.Types.ObjectId(userId),
          readAt: new Date()
        }
      }
    }
  );
};

chatSchema.statics.getUnreadCount = async function (
  leadId: string,
  userId: string
): Promise<number> {
  return this.countDocuments({
    leadId: new mongoose.Types.ObjectId(leadId),
    senderType: MessageSender.LEAD,
    'readBy.userId': { $ne: new mongoose.Types.ObjectId(userId) }
  });
};

chatSchema.statics.getLastMessage = async function (
  leadId: string
): Promise<IChat | null> {
  return this.findOne({ leadId: new mongoose.Types.ObjectId(leadId) })
    .sort({ sentAt: -1 })
    .lean();
};

// ===== INSTANCE METHODS =====
chatSchema.methods.isReadBy = function (this: IChat, userId: string): boolean {
  return this.readBy.some(
    (receipt) => receipt.userId.toString() === userId
  );
};

const Chat = mongoose.model<IChat, IChatModel>('Chat', chatSchema);

export default Chat;