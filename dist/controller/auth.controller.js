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
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_schema_1 = __importStar(require("../DataBase/Schema/user.schema"));
const registration_schema_1 = __importDefault(require("../DataBase/Schema/registration.schema"));
const otpService_1 = require("../utils/otpService");
class AuthController {
    // 🔑 UNIFIED LOGIN (EMAIL OR PHONE)
    login(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const { identifier, password, usePhone = false } = req.body;
                // Find user by email or phone
                const query = usePhone
                    ? { phone: identifier, isDeleted: false }
                    : { email: identifier, isDeleted: false };
                const user = yield user_schema_1.default.findOne(query).select('+password');
                if (!user) {
                    return res.status(401).json({ message: 'Invalid credentials' });
                }
                // Check account status
                if (user.isLocked)
                    return res.status(403).json({ message: 'Account locked. Contact admin.' });
                if (!user.isVerified)
                    return res.status(403).json({ message: 'Verify your account first' });
                // Verify password
                const isMatch = yield user.comparePassword(password);
                if (!isMatch) {
                    // Security: Track failed attempts
                    user.loginAttempts += 1;
                    if (user.loginAttempts >= 5) {
                        user.isLocked = true;
                        yield user.save();
                        return res.status(403).json({ message: 'Account locked after 5 failed attempts' });
                    }
                    yield user.save();
                    return res.status(401).json({ message: 'Invalid credentials' });
                }
                // Reset login attempts on success
                user.loginAttempts = 0;
                user.lastLogin = new Date();
                yield user.save();
                // Generate tokens with role-aware payload
                const tokens = yield this.generateTokens(user);
                // Return user profile without sensitive data
                const userPayload = {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.userRole,
                    companyId: (_a = user.company) === null || _a === void 0 ? void 0 : _a._id,
                    companyName: ((_b = user.company) === null || _b === void 0 ? void 0 : _b.name) || null
                };
                res.status(200).json({
                    message: 'Login successful',
                    user: userPayload,
                    accessToken: tokens.accessToken
                });
            }
            catch (error) {
                console.error('Login error:', error);
                res.status(500).json({ message: 'Authentication failed', error: error.message });
            }
        });
    }
    // 🌐 SUPERADMIN-ONLY: Create initial SuperAdmin (run once via seed script)
    createSuperAdmin(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if any superadmin exists
                const existingSuperAdmin = yield user_schema_1.default.findOne({
                    userRole: user_schema_1.USER_ROLES.SUPER_ADMIN,
                    isDeleted: false
                });
                if (existingSuperAdmin) {
                    return res.status(403).json({ message: 'SuperAdmin already exists' });
                }
                const { name, email, phone, password } = req.body;
                const superAdmin = yield user_schema_1.default.create({
                    name,
                    email,
                    phone,
                    password,
                    userRole: user_schema_1.USER_ROLES.SUPER_ADMIN,
                    isVerified: true
                });
                res.status(201).json({
                    message: 'SuperAdmin created successfully',
                    user: {
                        id: superAdmin._id,
                        name: superAdmin.name,
                        email: superAdmin.email,
                        role: superAdmin.userRole
                    }
                });
            }
            catch (error) {
                res.status(500).json({ message: 'Failed to create SuperAdmin', error: error.message });
            }
        });
    }
    // 🔐 TOKEN GENERATION (role-aware)
    generateTokens(user) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get company name if exists
            let companyName = null;
            if (user.company && user.userRole !== user_schema_1.USER_ROLES.SUPER_ADMIN) {
                const company = yield registration_schema_1.default.findById(user.company).select('name');
                companyName = (company === null || company === void 0 ? void 0 : company.name) || null;
            }
            const payload = {
                id: user._id,
                role: user.userRole,
                companyId: user.company,
                companyName,
                isSuperAdmin: user.userRole === user_schema_1.USER_ROLES.SUPER_ADMIN
            };
            const accessToken = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });
            // Refresh token logic can be added here
            return { accessToken };
        });
    }
    // 📱 OTP GENERATION (for password reset/phone login)
    requestOTP(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { identifier, forPasswordReset = false } = req.body;
                const user = yield user_schema_1.default.findOne({
                    $or: [{ email: identifier }, { phone: identifier }],
                    isDeleted: false
                });
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }
                // Generate OTP
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
                // Save to user (in production, use Redis)
                user.resetToken = otp;
                user.resetTokenExpiry = expiry;
                yield user.save();
                // Send via appropriate channel
                if (forPasswordReset) {
                    if (user.email && identifier.includes('@')) {
                        yield (0, otpService_1.sendOTPEmail)(user.email, otp, 'Password Reset');
                    }
                    else if (user.phone) {
                        yield (0, otpService_1.sendOTPSMS)(user.phone, otp, 'Password Reset');
                    }
                }
                res.json(Object.assign({ message: 'OTP sent successfully' }, (process.env.NODE_ENV === 'development' && { otp })));
            }
            catch (error) {
                res.status(500).json({ message: 'Failed to send OTP', error: error.message });
            }
        });
    }
    // 🔄 PASSWORD RESET
    resetPassword(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { identifier, otp, newPassword } = req.body;
                const user = yield user_schema_1.default.findOne({
                    $or: [{ email: identifier }, { phone: identifier }],
                    resetToken: otp,
                    resetTokenExpiry: { $gt: new Date() },
                    isDeleted: false
                });
                if (!user) {
                    return res.status(400).json({ message: 'Invalid or expired OTP' });
                }
                // Update password (will be hashed by pre-save hook)
                user.password = newPassword;
                user.resetToken = undefined;
                user.resetTokenExpiry = undefined;
                yield user.save();
                res.json({ message: 'Password reset successfully' });
            }
            catch (error) {
                res.status(500).json({ message: 'Password reset failed', error: error.message });
            }
        });
    }
    // 🚪 LOGOUT (client-side token discard)
    logout(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            // For JWT, logout is client-side token removal
            // For refresh tokens, invalidate here
            res.json({ message: 'Logged out successfully' });
        });
    }
}
exports.default = AuthController;
//# sourceMappingURL=auth.controller.js.map