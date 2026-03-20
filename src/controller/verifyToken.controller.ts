// controllers/AuthController.ts
import { Request, Response } from "express";
import jwt, { TokenExpiredError, JwtPayload } from "jsonwebtoken";
import User, { IUser } from "../DataBase/Schema/user.schema";

export const verifyToken = async (req: Request, res: Response): Promise<void> => {
  try {
  

    const token = await req.body;
    console.log("tokenjnk",token)

     try {
      // ✅ Verify access token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload & {
        id: string;
        role: string;
        companyId?: string;
        isSuperAdmin: boolean;
      };
console.log("decoded",decoded)

      // Fetch fresh user data (exclude sensitive fields)
      const user = await User.findById(decoded.id)
        .select("-password -resetToken -resetTokenExpiry -refreshToken -refreshTokenExpiry")
        .lean();
console.log("user",user)
      if (!user || user.isDeleted) {
        res.status(401).json({ message: "User not found" });
        return;
      }

      // ✅ Token is valid - return user info
      res.status(200).json({
        valid: true,
        expired: false,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.userRole,
          companyId: user.company,
          isVerified: user.isVerified,
          lastLogin: user.lastLogin,
        },
      });
      return;

    } catch (error: unknown) {
      // ✅ Handle expired access token
      if (error instanceof TokenExpiredError) {
        const decoded = jwt.decode(token) as JwtPayload & { id?: string };
        const userId = decoded?.id;

        if (!userId) {
          res.status(401).json({ valid: false, expired: true, message: "Invalid token payload" });
          return;
        }

        // Check if user has a valid refresh token stored
        const user = await User.findById(userId)
          .select("+refreshToken +refreshTokenExpiry")
          .lean();

        if (!user || !user.refreshToken || !user.refreshTokenExpiry || user.refreshTokenExpiry < new Date()) {
          res.status(401).json({ 
            valid: false, 
            expired: true, 
            message: "No valid refresh token available",
            requiresLogin: true 
          });
          return;
        }

        // ✅ Token expired BUT refresh token exists - signal frontend to refresh
        // ⚠️ DO NOT send refresh token in response body (security risk)
        // Frontend should have it stored securely (httpOnly cookie or secure storage)
        res.status(200).json({
          valid: false,
          expired: true,
          message: "Access token expired - use refresh token to get new one",
          // 🔐 Refresh token is NOT included here - see security note below
        });
        return;
      }

      // ✅ Other token errors (invalid signature, malformed, etc.)
      res.status(401).json({ valid: false, expired: false, message: "Invalid token" });
      return;
    }
  } catch (err) {
    console.error("[verifyToken] Server error:", err);
    res.status(500).json({ message: "Token verification failed" });
  }
};