import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../DataBase/Schema/user.schema";

interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
      // ✅ Verify access token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "secret"
      ) as any;
      req.user = decoded;
      return next();
    } catch (error: any) {
      // ✅ Token expired or invalid → check if it's expiration error
      if (error.name === "TokenExpiredError") {
        const decoded = jwt.decode(token) as any;
        const userId = decoded?.sub;

        if (!userId) return res.status(401).json({ message: "Invalid token" });

        const user = await User.findById(userId);
        if (!user || !user.refreshToken) {
          return res.status(401).json({ message: "Refresh token not found" });
        }

        // ✅ Verify refresh token
        try {
          jwt.verify(user.refreshToken, process.env.JWT_SECRET || "secret");

          // ✅ Generate new access token
          const newAccessToken = jwt.sign(
            { sub: user._id, email: user.email, role: user.userRole },
            process.env.JWT_SECRET || "secret",
            { expiresIn: "1h" }
          );

          // Attach user & new token in header for client to update
          req.user = { sub: user._id, email: user.email, role: user.userRole ,company:user.company};
          res.setHeader("x-new-access-token", newAccessToken);
          res.cookie("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
          });

          return next();
        } catch (refreshError) {
          return res.status(401).json({ message: "Invalid refresh token" });
        }
      }

      return res.status(401).json({ message: "Invalid token" });
    }
  } catch (err) {
    return res.status(500).json({ message: "Authentication error" });
  }
};

// ✅ Role-based authorization
export const authorizeRoles = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Forbidden: You don't have permission" });
    }
    next();
  };
};
