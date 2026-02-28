"use strict";
// import { Request, Response } from 'express';
// import jwt from 'jsonwebtoken';
// import User, { USER_ROLES } from '../DataBase/Schema/user.schema';
// import Company from '../DataBase/Schema/registration.schema';
// import { sendOTPEmail, sendOTPSMS } from '../utils/otpService';
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
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_schema_1 = __importStar(require("../DataBase/Schema/user.schema"));
const company_schema_1 = __importDefault(require("../DataBase/Schema/company.schema"));
const otpService_1 = require("../utils/otpService");
// ─── Token Helper ─────────────────────────────────────────────────────────────
const generateAccessToken = async (user) => {
    let companyName = null;
    if (user.company && user.userRole !== user_schema_1.USER_ROLES.SUPER_ADMIN) {
        const company = await company_schema_1.default.findById(user.company).select('name').lean();
        companyName = company?.name ?? null;
    }
    const payload = {
        id: String(user._id),
        role: user.userRole,
        companyId: user.company ? String(user.company) : undefined,
        companyName: companyName ?? undefined,
        isSuperAdmin: user.userRole === user_schema_1.USER_ROLES.SUPER_ADMIN,
    };
    return jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });
};
// ─── Safe user payload (no sensitive fields) ──────────────────────────────────
const toPublicUser = (user, companyName) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.userRole,
    companyId: user.company,
    companyName: companyName ?? null,
    lastLogin: user.lastLogin,
});
class AuthController {
    // ─── LOGIN ────────────────────────────────────────────────────────────────
    async login(req, res) {
        try {
            const { identifier, password, usePhone = false } = req.body;
            if (!identifier || !password) {
                res.status(400).json({ message: 'Identifier and password are required' });
                return;
            }
            const query = usePhone
                ? { phone: identifier, isDeleted: false }
                : { email: identifier.toLowerCase(), isDeleted: false };
            const user = await user_schema_1.default.findOne(query).select('+password');
            // Always return generic error to prevent user enumeration
            if (!user) {
                res.status(401).json({ message: 'Invalid credentials' });
                return;
            }
            if (user.isLocked) {
                res.status(403).json({ message: 'Account locked. Contact your administrator.' });
                return;
            }
            if (!user.isVerified) {
                res.status(403).json({ message: 'Account not verified. Check your email or contact admin.' });
                return;
            }
            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                user.loginAttempts += 1;
                if (user.loginAttempts >= 5) {
                    user.isLocked = true;
                    await user.save();
                    res.status(403).json({ message: 'Account locked after 5 failed attempts. Contact admin.' });
                    return;
                }
                await user.save();
                res.status(401).json({
                    message: 'Invalid credentials',
                    attemptsLeft: 5 - user.loginAttempts,
                });
                return;
            }
            // Successful login
            user.loginAttempts = 0;
            user.lastLogin = new Date();
            await user.save();
            const accessToken = await generateAccessToken(user);
            let companyName = null;
            if (user.company) {
                const company = await company_schema_1.default.findById(user.company).select('name').lean();
                companyName = company?.name ?? null;
            }
            res.status(200).json({
                message: 'Login successful',
                user: toPublicUser(user, companyName),
                accessToken,
            });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error('Login error:', error);
            res.status(500).json({ message: 'Authentication failed', error: msg });
        }
    }
    // ─── OTP REQUEST ─────────────────────────────────────────────────────────
    async requestOTP(req, res) {
        try {
            const { identifier, purpose = 'Password Reset', } = req.body;
            if (!identifier) {
                res.status(400).json({ message: 'Phone or email identifier is required' });
                return;
            }
            // ── Rate limit: max 5 OTP requests per hour per identifier ────────────
            try {
                (0, otpService_1.checkOTPRateLimit)(identifier);
            }
            catch (err) {
                if (err instanceof otpService_1.OTPRateLimitError) {
                    res.status(429).json({
                        message: err.message,
                        retryAfterSeconds: Math.ceil(err.retryAfterMs / 1000),
                    });
                    return;
                }
                throw err;
            }
            // ── Look up user ───────────────────────────────────────────────────────
            // Always return 200 regardless of whether the user exists → prevents
            // user enumeration attacks.
            const user = await user_schema_1.default.findOne({
                $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
                isDeleted: false,
            }).select('+resetToken +resetTokenExpiry');
            if (!user) {
                // Delay response to neutralise timing attacks
                await new Promise((r) => setTimeout(r, 400));
                res.json({ message: 'If that account exists, an OTP has been sent.' });
                return;
            }
            // ── Generate, hash, and persist OTP ───────────────────────────────────
            // generateAndHashOTP() uses crypto.randomInt (CSPRNG) and bcrypt-hashes
            // the result. We store ONLY the hash in the DB — never the plain OTP.
            const { otp, hashedOTP, expiry } = await (0, otpService_1.generateAndHashOTP)(10);
            user.resetToken = hashedOTP; // ← bcrypt hash stored, not plain text
            user.resetTokenExpiry = expiry;
            await user.save();
            // ── Dispatch OTP via appropriate channel ───────────────────────────────
            const isEmail = identifier.includes('@');
            if (isEmail && user.email) {
                await (0, otpService_1.sendOTPEmail)(user.email, otp, purpose, user.name);
            }
            else if (user.phone) {
                await (0, otpService_1.sendOTPSMS)(user.phone, otp, purpose);
            }
            else {
                // Fallback: user has neither email nor matching channel
                res.status(400).json({ message: 'No valid contact channel found for this account' });
                return;
            }
            res.json({
                message: 'If that account exists, an OTP has been sent.',
                expiresInMinutes: 10,
                // ⚠️ Dev convenience — REMOVE before going to production
                ...(process.env.NODE_ENV === 'development' && { otp }),
            });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error('[requestOTP]', error);
            res.status(500).json({ message: 'Failed to send OTP', error: msg });
        }
    }
    // ─── PASSWORD RESET ───────────────────────────────────────────────────────
    async resetPassword(req, res) {
        try {
            const { identifier, otp, newPassword } = req.body;
            if (!identifier || !otp || !newPassword) {
                res.status(400).json({ message: 'identifier, otp, and newPassword are required' });
                return;
            }
            if (newPassword.length < 8) {
                res.status(400).json({ message: 'Password must be at least 8 characters' });
                return;
            }
            // ── Find user with a non-expired reset token ───────────────────────────
            // We look up by identifier + expiry, then do bcrypt comparison separately.
            // Never query by plain OTP value (the DB stores only hashes).
            const user = await user_schema_1.default.findOne({
                $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
                resetTokenExpiry: { $gt: new Date() }, // token not yet expired
                isDeleted: false,
            }).select('+resetToken +resetTokenExpiry');
            if (!user || !user.resetToken) {
                // Uniform error — don't reveal whether user exists or token expired
                res.status(400).json({ message: 'Invalid or expired OTP' });
                return;
            }
            // ── Verify OTP via bcrypt comparison ──────────────────────────────────
            const isValid = await (0, otpService_1.verifyOTP)(otp, user.resetToken);
            if (!isValid) {
                res.status(400).json({ message: 'Invalid or expired OTP' });
                return;
            }
            // ── Consume the token and update password ─────────────────────────────
            user.password = newPassword; // pre-save hook bcrypt-hashes this
            user.resetToken = undefined; // invalidate immediately (one-time use)
            user.resetTokenExpiry = undefined;
            user.loginAttempts = 0;
            user.isLocked = false; // auto-unlock on successful reset
            await user.save();
            res.json({ message: 'Password reset successfully. You can now log in.' });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message: 'Password reset failed', error: msg });
        }
    }
    // ─── CREATE FIRST SUPERADMIN (run once via seed or protected endpoint) ────
    async initSuperAdmin(req, res) {
        try {
            const existing = await user_schema_1.default.findOne({
                userRole: user_schema_1.USER_ROLES.SUPER_ADMIN,
                isDeleted: false,
            });
            if (existing) {
                res.status(403).json({ message: 'SuperAdmin already initialised' });
                return;
            }
            const { name, email, phone, password } = req.body;
            if (!name || !phone || !password) {
                res.status(400).json({ message: 'name, phone, and password are required' });
                return;
            }
            const superAdmin = await user_schema_1.default.create({
                name,
                email: email?.toLowerCase(),
                phone,
                password,
                userRole: user_schema_1.USER_ROLES.SUPER_ADMIN,
                isVerified: true,
            });
            res.status(201).json({
                message: 'SuperAdmin created successfully',
                user: {
                    id: superAdmin._id,
                    name: superAdmin.name,
                    email: superAdmin.email,
                    phone: superAdmin.phone,
                    role: superAdmin.userRole,
                },
            });
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ message: 'Failed to create SuperAdmin', error: msg });
        }
    }
    // ─── LOGOUT ───────────────────────────────────────────────────────────────
    async logout(_req, res) {
        // JWT is stateless – client must discard the token.
        // If refresh tokens are added, invalidate them here.
        res.json({ message: 'Logged out successfully' });
    }
}
exports.default = AuthController;
