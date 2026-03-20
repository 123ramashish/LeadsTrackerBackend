import mongoose, { Document, Model, Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// ─── Role Constants ───────────────────────────────────────────────────────────
export const USER_ROLES = {
  SUPER_ADMIN: 'superAdmin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// ─── Document Interface ───────────────────────────────────────────────────────
export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  phone: string;
  password: string;
  company?: mongoose.Types.ObjectId;
  userRole: UserRole;
  isVerified: boolean;
  isLocked: boolean;
  loginAttempts: number;
  lastLogin?: Date;
  resetToken?: string;
  resetTokenExpiry?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
 refreshToken?: string;        // Hashed refresh token
  refreshTokenExpiry?: Date;    // Expiry timestamp
  // Instance methods
  comparePassword(candidate: string): Promise<boolean>;
  compareRefreshToken(candidate: string): Promise<boolean>;
  generateRefreshToken(): Promise<{ token: string; expiry: Date }>;
  invalidateRefreshToken(): Promise<void>;
}

// ─── Model Interface (static methods) ─────────────────────────────────────────
export interface IUserModel extends Model<IUser> {
  findActive(filter?: mongoose.FilterQuery<IUser>): mongoose.Query<IUser[], IUser>;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const userSchema = new Schema<IUser, IUserModel>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true, // allows null without unique clash
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      unique: true,
      match: [/^\d{10,15}$/, 'Phone must be 10-15 digits'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
    },
    userRole: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.USER,
      required: true,
    },
    isVerified: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    loginAttempts: { type: Number, default: 0 },
    lastLogin: Date,
    resetToken: { type: String, select: false },
    resetTokenExpiry: { type: Date, select: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
     refreshToken: { type: String, select: false },
    refreshTokenExpiry: { type: Date, select: false },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ company: 1, isDeleted: 1 });
userSchema.index({ email: 1 }, { sparse: true });

// ─── Instance Methods ─────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(candidate, this.password);
  } catch {
    return false;
  }
};
// ─── Instance Method: Compare refresh token ───────────────────────────────────
userSchema.methods.compareRefreshToken = async function (
  candidate: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(candidate, this.refreshToken);
  } catch {
    return false;
  }
};

// ─── Instance Method: Generate and hash refresh token ─────────────────────────
userSchema.methods.generateRefreshToken = async function (): Promise<{
  token: string;
  expiry: Date;
}> {
  const token = crypto.randomBytes(40).toString('hex'); // 256-bit secure token
  const hashedToken = await bcrypt.hash(token, 12);
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  this.refreshToken = hashedToken;
  this.refreshTokenExpiry = expiry;
  
  return { token, expiry };
};

// ─── Instance Method: Invalidate refresh token ────────────────────────────────
userSchema.methods.invalidateRefreshToken = async function (): Promise<void> {
  this.refreshToken = undefined;
  this.refreshTokenExpiry = undefined;
  await this.save();
};
// ─── Static Methods ───────────────────────────────────────────────────────────
userSchema.statics.findActive = function (
  filter: mongoose.FilterQuery<IUser> = {}
) {
  return this.find({ ...filter, isDeleted: false });
};

// ─── Pre-save: Hash password ──────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  if (this.password?.startsWith('$2b$')) return next(); // already hashed
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (err) {
    next(err as Error);
  }
});

// ─── Guard: Cannot delete last SuperAdmin ─────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('isDeleted') || !this.isDeleted) return next();
  if (this.userRole !== USER_ROLES.SUPER_ADMIN) return next();

  const count = await mongoose
    .model('User')
    .countDocuments({ userRole: USER_ROLES.SUPER_ADMIN, isDeleted: false });

  if (count <= 1) {
    return next(new Error('Cannot delete the last SuperAdmin account'));
  }
  next();
});``

const User = mongoose.model<IUser, IUserModel>('User', userSchema);
export default User;