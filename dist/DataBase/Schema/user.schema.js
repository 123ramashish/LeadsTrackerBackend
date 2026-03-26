"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_ROLES = void 0;
// src/models/user.schema.ts
const mongoose_1 = __importDefault(require("mongoose"));
const bcrypt_1 = __importDefault(require("bcrypt"));
exports.USER_ROLES = {
    SUPER_ADMIN: 'superAdmin',
    ADMIN: 'admin',
    USER: 'user'
};
// ✅ STEP 4: Create schema with proper typing
const userSchema = new mongoose_1.default.Schema({
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
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Company',
        validate: {
            validator: function () {
                return this.userRole === exports.USER_ROLES.SUPER_ADMIN || !!this.company;
            },
            message: 'Company is required for non-SuperAdmin users'
        }
    },
    userRole: {
        type: String,
        enum: Object.values(exports.USER_ROLES),
        default: exports.USER_ROLES.USER,
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
userSchema.methods.comparePassword = function (candidate) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield bcrypt_1.default.compare(candidate, this.password);
        }
        catch (error) {
            console.error('Password comparison error:', error);
            return false;
        }
    });
};
// ✅ STEP 6: Pre-save hook for password hashing
userSchema.pre('save', function (next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!this.isModified('password'))
            return next();
        if ((_a = this.password) === null || _a === void 0 ? void 0 : _a.startsWith('$2b$'))
            return next();
        try {
            this.password = yield bcrypt_1.default.hash(this.password, 12);
            next();
        }
        catch (error) {
            next(error);
        }
    });
});
// ✅ STEP 7: Prevent deleting last SuperAdmin
userSchema.pre('findOneAndUpdate', function (next) {
    return __awaiter(this, void 0, void 0, function* () {
        const update = this.getUpdate();
        if (!update || typeof update !== 'object') {
            return next();
        }
        const setUpdate = update.$set;
        if (!setUpdate)
            return next();
        if (setUpdate.userRole === exports.USER_ROLES.SUPER_ADMIN && setUpdate.isDeleted) {
            const superAdminCount = yield this.model.countDocuments({
                userRole: exports.USER_ROLES.SUPER_ADMIN,
                isDeleted: false
            });
            if (superAdminCount <= 1) {
                return next(new Error('Cannot delete the last SuperAdmin account'));
            }
        }
        next();
    });
});
// ✅ STEP 8: Create and export model with proper types
const User = mongoose_1.default.model('User', userSchema);
exports.default = User;
//# sourceMappingURL=user.schema.js.map