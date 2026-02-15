// src/models/user.schema.ts
import mongoose, { Document, Model } from 'mongoose';
import bcrypt from 'bcrypt';

export const USER_ROLES = {
  SUPER_ADMIN: 'superAdmin',
  ADMIN: 'admin',
  USER: 'user'
} as const;

// ✅ STEP 1: Define interface for User document WITH methods
export interface IUser extends Document {
  name: string;
  email?: string;
  phone: string;
  password: string;
  company?: mongoose.Types.ObjectId;
  userRole: typeof USER_ROLES[keyof typeof USER_ROLES];
  isVerified: boolean;
  isLocked: boolean;
  loginAttempts: number;
  lastLogin?: Date;
  resetToken?: string;
  resetTokenExpiry?: Date;
  isDeleted: boolean;
  
  // ✅ STEP 2: Declare instance methods
  comparePassword(candidate: string): Promise<boolean>;
}

// ✅ STEP 3: Define interface for User model (static methods)
export interface IUserModel extends Model<IUser> {
  // Add static methods here if needed
}

// ✅ STEP 4: Create schema with proper typing
const userSchema = new mongoose.Schema<IUser, IUserModel>({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    unique: true,
    match: [/^\d{10,14}$/, 'Phone must be 10-14 digits']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    validate: {
      validator: function(this: IUser) {
        return this.userRole === USER_ROLES.SUPER_ADMIN || !!this.company;
      },
      message: 'Company is required for non-SuperAdmin users'
    }
  },
  userRole: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.USER,
    required: true
  },
  isVerified: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  loginAttempts: { type: Number, default: 0 },
  lastLogin: Date,
  resetToken: String,
  resetTokenExpiry: Date,
  isDeleted: { type: Boolean, default: false }
}, {
  timestamps: true
});

// ✅ STEP 5: Define methods using proper TypeScript syntax
userSchema.methods.comparePassword = async function(candidate: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidate, this.password);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

// ✅ STEP 6: Pre-save hook for password hashing
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  if (this.password?.startsWith('$2b$')) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// ✅ STEP 7: Prevent deleting last SuperAdmin
userSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();
  
  if (!update || typeof update !== 'object') {
    return next();
  }
  
  const setUpdate = (update as any).$set;
  if (!setUpdate) return next();
  
  if (setUpdate.userRole === USER_ROLES.SUPER_ADMIN && setUpdate.isDeleted) {
    const superAdminCount = await this.model.countDocuments({
      userRole: USER_ROLES.SUPER_ADMIN,
      isDeleted: false
    });
    
    if (superAdminCount <= 1) {
      return next(new Error('Cannot delete the last SuperAdmin account'));
    }
  }
  
  next();
});

// ✅ STEP 8: Create and export model with proper types
const User = mongoose.model<IUser, IUserModel>('User', userSchema);
export default User;