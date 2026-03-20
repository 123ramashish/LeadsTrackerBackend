
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
    type: 'access', // distinguish token type
  };

  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '2h' });
};

const generateRefreshToken = async (user: IUser): Promise<string> => {
  const { token } = await (user as any).generateRefreshToken();
  await user.save();
  return token;
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
  // ─── REFRESH ACCESS TOKEN ─────────────────────────────────────────────────────
async refreshAccessToken(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ message: 'Refresh token is required' });
      return;
    }

    // Find user with valid, non-expired refresh token
    const user:any = await User.findOne({
      refreshTokenExpiry: { $gt: new Date() },
      isDeleted: false,
    }).select('+refreshToken +refreshTokenExpiry');

    if (!user || !user.refreshToken) {
      res.status(401).json({ message: 'Invalid refresh token' });
      return;
    }

    // Verify the token using bcrypt comparison
    const isValid = await user.compareRefreshToken(refreshToken);
    if (!isValid) {
      res.status(401).json({ message: 'Invalid refresh token' });
      return;
    }

    // 🔄 Token rotation: invalidate old token, issue new pair (optional but recommended)
    // For stricter security, uncomment the rotation logic below:
    /*
    const newRefreshToken = await generateRefreshToken(user);
    await user.save();
    */

    // Generate new access token
    const newAccessToken = await generateAccessToken(user);

    // Fetch company name
    let companyName: string | null = null;
    if (user.company) {
      const company = await Company.findById(user.company).select('name').lean();
      companyName = company?.name ?? null;
    }

    res.json({
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
      // If using rotation, also return newRefreshToken:
      // refreshToken: newRefreshToken,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[refreshAccessToken]', error);
    res.status(500).json({ message: 'Token refresh failed', error: msg });
  }
}
  // ─── LOGIN ────────────────────────────────────────────────────────────────
async login(req: Request, res: Response) {
  try {
    const { identifier, password, usePhone = false } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Identifier and password are required' });
    }

    const query = usePhone
      ? { phone: identifier, isDeleted: false }
      : { email: identifier.toLowerCase(), isDeleted: false };

    const user = await User.findOne(query).select('+password');
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isLocked) {
      return res.status(403).json({ message: 'Account locked. Contact your administrator.' });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      user.loginAttempts += 1;

      if (user.loginAttempts >= 5) {
        user.isLocked = true;
        await user.save();
        return res.status(403).json({
          message: 'Account locked after 5 failed attempts. Contact admin.',
        });
      }

      await user.save();
      return res.status(401).json({
        message: 'Invalid credentials',
        attemptsLeft: 5 - user.loginAttempts,
      });
    }

    // ✅ Successful login - reset attempts & update last login
    user.loginAttempts = 0;
    user.lastLogin = new Date();
    
    // 🔁 Generate BOTH tokens
    const accessToken = await generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user); // saves hashed token to DB
    
    await user.save();

    // Fetch company name for response
    let companyName: string | null = null;
    if (user.company) {
      const company = await Company.findById(user.company).select('name').lean();
      companyName = company?.name ?? null;
    }

    // 🎯 Return ONLY accessToken + user info (refresh token NOT exposed here)
    return res.status(200).json({
      message: 'Login successful',
      user: toPublicUser(user, companyName),
      accessToken,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Authentication failed', error: msg });
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
async logout(req: AuthRequest, res: Response): Promise<void> {
  try {
    // If user is authenticated, invalidate their refresh token
    if (req.user?.id) {
      const user = await User.findById(req.user.id);
      if (user) {
        await (user as any).invalidateRefreshToken();
      }
    }
    
    // Client should also discard tokens locally
    res.json({ message: 'Logged out successfully' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[logout]', error);
    res.status(500).json({ message: 'Logout failed', error: msg });
  }
}
}