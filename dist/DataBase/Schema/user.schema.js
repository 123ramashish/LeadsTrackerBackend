"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_ROLES = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const bcrypt_1 = __importDefault(require("bcrypt"));
// ─── Role Constants ───────────────────────────────────────────────────────────
exports.USER_ROLES = {
    SUPER_ADMIN: 'superAdmin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    USER: 'user',
};
// ─── Schema ───────────────────────────────────────────────────────────────────
const userSchema = new mongoose_1.Schema({
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Company',
    },
    userRole: {
        type: String,
        enum: Object.values(exports.USER_ROLES),
        default: exports.USER_ROLES.USER,
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
}, { timestamps: true });
// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ company: 1, isDeleted: 1 });
userSchema.index({ email: 1 }, { sparse: true });
// ─── Instance Methods ─────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
    try {
        return await bcrypt_1.default.compare(candidate, this.password);
    }
    catch {
        return false;
    }
};
// ─── Static Methods ───────────────────────────────────────────────────────────
userSchema.statics.findActive = function (filter = {}) {
    return this.find({ ...filter, isDeleted: false });
};
// ─── Pre-save: Hash password ──────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
    if (!this.isModified('password'))
        return next();
    if (this.password?.startsWith('$2b$'))
        return next(); // already hashed
    try {
        this.password = await bcrypt_1.default.hash(this.password, 12);
        next();
    }
    catch (err) {
        next(err);
    }
});
// ─── Guard: Cannot delete last SuperAdmin ─────────────────────────────────────
userSchema.pre('save', async function (next) {
    if (!this.isModified('isDeleted') || !this.isDeleted)
        return next();
    if (this.userRole !== exports.USER_ROLES.SUPER_ADMIN)
        return next();
    const count = await mongoose_1.default
        .model('User')
        .countDocuments({ userRole: exports.USER_ROLES.SUPER_ADMIN, isDeleted: false });
    if (count <= 1) {
        return next(new Error('Cannot delete the last SuperAdmin account'));
    }
    next();
});
``;
const User = mongoose_1.default.model('User', userSchema);
exports.default = User;
