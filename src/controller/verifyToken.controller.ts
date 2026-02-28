import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../DataBase/Schema/user.schema";

export const verifyToken = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
      // ✅ Verify access token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as any;

      return res.status(200).json({
        valid: true,
        user: { sub: decoded.sub, email: decoded.email, role: decoded.role },
      });
    } catch (error: any) {
      if (error.name === "TokenExpiredError") {
        // ✅ Decode to get userId
        const decoded = jwt.decode(token) as any;
        const userId = decoded?.sub;

        if (!userId) {
          return res.status(401).json({ message: "Invalid token" });
        }

        const user:any = await User.findById(userId);
        if (!user || !user.refreshToken) {
          return res.status(401).json({ message: "Refresh token not found" });
        }

        try {
          // ✅ Verify refresh token
          jwt.verify(user.refreshToken, process.env.JWT_SECRET || "secret");

          // ✅ Generate new access token
          const newAccessToken = jwt.sign(
            { sub: user._id, email: user.email, role: user.userRole },
            process.env.JWT_SECRET || "secret",
            { expiresIn: "1h" }
          );

          // Send new token in response (frontend should replace it in Cookies)
          return res.status(200).json({
            valid: true,
            newAccessToken,
            user: { sub: user._id, email: user.email, role: user.userRole },
          });
        } catch (refreshError) {
          return res.status(401).json({ message: "Invalid refresh token" });
        }
      }

      return res.status(401).json({ message: "Invalid token" });
    }
  } catch (err) {
    return res.status(500).json({ message: "Token verification error" });
  }
};
