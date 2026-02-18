// import { Request, Response } from 'express';
// import jwt from 'jsonwebtoken';
// import User, { USER_ROLES } from '../DataBase/Schema/user.schema';
// import Company from '../DataBase/Schema/registration.schema';
// import { sendOTPEmail, sendOTPSMS } from '../utils/otpService';

// export default class AuthController {
//   // 🔑 UNIFIED LOGIN (EMAIL OR PHONE)
//   async login(req: Request, res: Response) {
//     try {
//       const { identifier, password, usePhone = false } = req.body;
      
//       // Find user by email or phone
//       const query = usePhone 
//         ? { phone: identifier, isDeleted: false }
//         : { email: identifier, isDeleted: false };
      
//       const user = await User.findOne(query).select('+password');
//       if (!user) {
//         return res.status(401).json({ message: 'Invalid credentials' });
//       }
      
//       // Check account status
//       if (user.isLocked) return res.status(403).json({ message: 'Account locked. Contact admin.' });
//       if (!user.isVerified) return res.status(403).json({ message: 'Verify your account first' });
      
//       // Verify password
//       const isMatch = await user.comparePassword(password);
//       if (!isMatch) {
//         // Security: Track failed attempts
//         user.loginAttempts += 1;
//         if (user.loginAttempts >= 5) {
//           user.isLocked = true;
//           await user.save();
//           return res.status(403).json({ message: 'Account locked after 5 failed attempts' });
//         }
//         await user.save();
//         return res.status(401).json({ message: 'Invalid credentials' });
//       }
      
//       // Reset login attempts on success
//       user.loginAttempts = 0;
//       user.lastLogin = new Date();
//       await user.save();
      
//       // Generate tokens with role-aware payload
//       const tokens = await this.generateTokens(user);
      
//       // Return user profile without sensitive data
//       const userPayload = {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         phone: user.phone,
//         role: user.userRole,
//         companyId: user.company?._id,
//         companyName: (user.company as any)?.name || null
//       };
      
//       res.status(200).json({
//         message: 'Login successful',
//         user: userPayload,
//         accessToken: tokens.accessToken
//       });
//     } catch (error: any) {
//       console.error('Login error:', error);
//       res.status(500).json({ message: 'Authentication failed', error: error.message });
//     }
//   }

//   // 🌐 SUPERADMIN-ONLY: Create initial SuperAdmin (run once via seed script)
//   async createSuperAdmin(req: Request, res: Response) {
//     try {
//       // Check if any superadmin exists
//       const existingSuperAdmin = await User.findOne({ 
//         userRole: USER_ROLES.SUPER_ADMIN,
//         isDeleted: false 
//       });
      
//       if (existingSuperAdmin) {
//         return res.status(403).json({ message: 'SuperAdmin already exists' });
//       }
      
//       const { name, email, phone, password } = req.body;
//       const superAdmin = await User.create({
//         name,
//         email,
//         phone,
//         password,
//         userRole: USER_ROLES.SUPER_ADMIN,
//         isVerified: true
//       });
      
//       res.status(201).json({
//         message: 'SuperAdmin created successfully',
//         user: {
//           id: superAdmin._id,
//           name: superAdmin.name,
//           email: superAdmin.email,
//           role: superAdmin.userRole
//         }
//       });
//     } catch (error: any) {
//       res.status(500).json({ message: 'Failed to create SuperAdmin', error: error.message });
//     }
//   }

//   // 🔐 TOKEN GENERATION (role-aware)
//   private async generateTokens(user: any) {
//     // Get company name if exists
//     let companyName = null;
//     if (user.company && user.userRole !== USER_ROLES.SUPER_ADMIN) {
//       const company = await Company.findById(user.company).select('name');
//       companyName = company?.name || null;
//     }
    
//     const payload = {
//       id: user._id,
//       role: user.userRole,
//       companyId: user.company,
//       companyName,
//       isSuperAdmin: user.userRole === USER_ROLES.SUPER_ADMIN
//     };
    
//     const accessToken = jwt.sign(
//       payload,
//       process.env.JWT_SECRET!,
//       { expiresIn: '2h' }
//     );
    
//     // Refresh token logic can be added here
    
//     return { accessToken };
//   }

//   // 📱 OTP GENERATION (for password reset/phone login)
//   async requestOTP(req: Request, res: Response) {
//     try {
//       const { identifier, forPasswordReset = false } = req.body;
//       const user = await User.findOne({
//         $or: [{ email: identifier }, { phone: identifier }],
//         isDeleted: false
//       });
      
//       if (!user) {
//         return res.status(404).json({ message: 'User not found' });
//       }
      
//       // Generate OTP
//       const otp = Math.floor(100000 + Math.random() * 900000).toString();
//       const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
//       // Save to user (in production, use Redis)
//       user.resetToken = otp;
//       user.resetTokenExpiry = expiry;
//       await user.save();
      
//       // Send via appropriate channel
//       if (forPasswordReset) {
//         if (user.email && identifier.includes('@')) {
//           await sendOTPEmail(user.email, otp, 'Password Reset');
//         } else if (user.phone) {
//           await sendOTPSMS(user.phone, otp, 'Password Reset');
//         }
//       }
      
//       res.json({ 
//         message: 'OTP sent successfully', 
//         // ⚠️ Only for development! Remove in production
//         ...(process.env.NODE_ENV === 'development' && { otp }) 
//       });
//     } catch (error: any) {
//       res.status(500).json({ message: 'Failed to send OTP', error: error.message });
//     }
//   }

//   // 🔄 PASSWORD RESET
//   async resetPassword(req: Request, res: Response) {
//     try {
//       const { identifier, otp, newPassword } = req.body;
      
//       const user = await User.findOne({
//         $or: [{ email: identifier }, { phone: identifier }],
//         resetToken: otp,
//         resetTokenExpiry: { $gt: new Date() },
//         isDeleted: false
//       });
      
//       if (!user) {
//         return res.status(400).json({ message: 'Invalid or expired OTP' });
//       }
      
//       // Update password (will be hashed by pre-save hook)
//       user.password = newPassword;
//       user.resetToken = undefined;
//       user.resetTokenExpiry = undefined;
//       await user.save();
      
//       res.json({ message: 'Password reset successfully' });
//     } catch (error: any) {
//       res.status(500).json({ message: 'Password reset failed', error: error.message });
//     }
//   }

//   // 🚪 LOGOUT (client-side token discard)
//   async logout(req: Request, res: Response) {
//     // For JWT, logout is client-side token removal
//     // For refresh tokens, invalidate here
//     res.json({ message: 'Logged out successfully' });
//   }
// }

import { Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import User, { USER_ROLES, IUser } from '../DataBase/Schema/user.schema';
import Company from '../DataBase/Schema/company.schema';
import { checkOTPRateLimit, generateAndHashOTP, OTPPurpose, OTPRateLimitError, sendOTPEmail, sendOTPSMS, verifyOTP } from '../utils/otpService';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    company: string;
  };
}

// ─── Token Helper ─────────────────────────────────────────────────────────────
const generateAccessToken = async (user: IUser): Promise<string> => {
  let companyName: string | null = null;

  if (user.company && user.userRole !== USER_ROLES.SUPER_ADMIN) {
    const company = await Company.findById(user.company).select('name').lean();
    companyName = company?.name ?? null;
  }

  const payload: JwtPayload = {
    id: String(user._id),
    role: user.userRole,
    companyId: user.company ? String(user.company) : undefined,
    companyName: companyName ?? undefined,
    isSuperAdmin: user.userRole === USER_ROLES.SUPER_ADMIN,
  };

  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '2h' });
};

// ─── Safe user payload (no sensitive fields) ──────────────────────────────────
const toPublicUser = (user: IUser, companyName?: string | null) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.userRole,
  companyId: user.company,
  companyName: companyName ?? null,
  lastLogin: user.lastLogin,
});

export default class AuthController {
  // ─── LOGIN ────────────────────────────────────────────────────────────────
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { identifier, password, usePhone = false } = req.body as {
        identifier: string;
        password: string;
        usePhone?: boolean;
      };

      if (!identifier || !password) {
        res.status(400).json({ message: 'Identifier and password are required' });
        return;
      }

      const query = usePhone
        ? { phone: identifier, isDeleted: false }
        : { email: identifier.toLowerCase(), isDeleted: false };

      const user = await User.findOne(query).select('+password');

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

      let companyName: string | null = null;
      if (user.company) {
        const company = await Company.findById(user.company).select('name').lean();
        companyName = company?.name ?? null;
      }

      res.status(200).json({
        message: 'Login successful',
        user: toPublicUser(user, companyName),
        accessToken,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Login error:', error);
      res.status(500).json({ message: 'Authentication failed', error: msg });
    }
  }

  // ─── OTP REQUEST ─────────────────────────────────────────────────────────
  async requestOTP(req: Request, res: Response): Promise<void> {
    try {
      const {
        identifier,
        purpose = 'Password Reset',
      } = req.body as {
        identifier: string;
        purpose?: OTPPurpose;
      };

      if (!identifier) {
        res.status(400).json({ message: 'Phone or email identifier is required' });
        return;
      }

      // ── Rate limit: max 5 OTP requests per hour per identifier ────────────
      try {
        checkOTPRateLimit(identifier);
      } catch (err) {
        if (err instanceof OTPRateLimitError) {
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
      const user = await User.findOne({
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
      const { otp, hashedOTP, expiry } = await generateAndHashOTP(10);

      user.resetToken = hashedOTP;       // ← bcrypt hash stored, not plain text
      user.resetTokenExpiry = expiry;
      await user.save();

      // ── Dispatch OTP via appropriate channel ───────────────────────────────
      const isEmail = identifier.includes('@');

      if (isEmail && user.email) {
        await sendOTPEmail(user.email, otp, purpose, user.name);
      } else if (user.phone) {
        await sendOTPSMS(user.phone, otp, purpose);
      } else {
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[requestOTP]', error);
      res.status(500).json({ message: 'Failed to send OTP', error: msg });
    }
  }

  // ─── PASSWORD RESET ───────────────────────────────────────────────────────
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { identifier, otp, newPassword } = req.body as {
        identifier: string;
        otp: string;
        newPassword: string;
      };

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
      const user = await User.findOne({
        $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
        resetTokenExpiry: { $gt: new Date() },   // token not yet expired
        isDeleted: false,
      }).select('+resetToken +resetTokenExpiry');

      if (!user || !user.resetToken) {
        // Uniform error — don't reveal whether user exists or token expired
        res.status(400).json({ message: 'Invalid or expired OTP' });
        return;
      }

      // ── Verify OTP via bcrypt comparison ──────────────────────────────────
      const isValid = await verifyOTP(otp, user.resetToken);

      if (!isValid) {
        res.status(400).json({ message: 'Invalid or expired OTP' });
        return;
      }

      // ── Consume the token and update password ─────────────────────────────
      user.password = newPassword;         // pre-save hook bcrypt-hashes this
      user.resetToken = undefined;         // invalidate immediately (one-time use)
      user.resetTokenExpiry = undefined;
      user.loginAttempts = 0;
      user.isLocked = false;               // auto-unlock on successful reset
      await user.save();

      res.json({ message: 'Password reset successfully. You can now log in.' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Password reset failed', error: msg });
    }
  }

  // ─── CREATE FIRST SUPERADMIN (run once via seed or protected endpoint) ────
  async initSuperAdmin(req: Request, res: Response): Promise<void> {
    try {
      const existing = await User.findOne({
        userRole: USER_ROLES.SUPER_ADMIN,
        isDeleted: false,
      });

      if (existing) {
        res.status(403).json({ message: 'SuperAdmin already initialised' });
        return;
      }

      const { name, email, phone, password } = req.body as {
        name: string;
        email: string;
        phone: string;
        password: string;
      };

      if (!name || !phone || !password) {
        res.status(400).json({ message: 'name, phone, and password are required' });
        return;
      }

      const superAdmin = await User.create({
        name,
        email: email?.toLowerCase(),
        phone,
        password,
        userRole: USER_ROLES.SUPER_ADMIN,
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Failed to create SuperAdmin', error: msg });
    }
  }

  // ─── LOGOUT ───────────────────────────────────────────────────────────────
  async logout(_req: AuthRequest, res: Response): Promise<void> {
    // JWT is stateless – client must discard the token.
    // If refresh tokens are added, invalidate them here.
    res.json({ message: 'Logged out successfully' });
  }
}