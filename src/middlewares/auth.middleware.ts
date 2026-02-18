// import * as dotenv from 'dotenv';
// dotenv.config();
// import { NextFunction, Request, Response } from "express";
// import jwt from "jsonwebtoken";
// import User from "../DataBase/Schema/user.schema";

// interface AuthRequest extends Request {
//   user?: any;
// }

// export const authenticate = async (
//   req: AuthRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
      
//       return res.status(401).json({ message: "No token provided" });
//     }

//     const token = authHeader.split(" ")[1];
//     try {
//       // ✅ Verify access token
//       const decoded = jwt.verify(
//         token,
//         process.env.JWT_SECRET || "secret" 
//       ) as any;
//       req.user = decoded;
//       return next();
//     } catch (error: any) {
//       // ✅ Token expired or invalid → check if it's expiration error
//       if (error.name === "TokenExpiredError") {
//         const decoded = jwt.decode(token) as any;
//         const userId = decoded?.sub;

//         if (!userId) return res.status(401).json({ message: "Invalid token" });

//         const user:any= await User.findById(userId);
//         if (!user || !user.refreshToken) {
//           return res.status(401).json({ message: "Refresh token not found" });
//         }

//         // ✅ Verify refresh token
//         try {
//           jwt.verify(user.refreshToken, process.env.JWT_SECRET || "secret");

//           // ✅ Generate new access token
          
//           const newAccessToken = jwt.sign(
//             { sub: user._id, email: user.email, role: user.userRole },
//             process.env.JWT_SECRET || "secret",
//             { expiresIn: "1h" }
//           );
//           // Attach user & new token in header for client to update
//           req.user = { sub: user._id, email: user.email, role: user.userRole ,company:user.company};
//           res.setHeader("x-new-access-token", newAccessToken);
//           res.cookie("accessToken", newAccessToken);

//           return next();
//         } catch (refreshError) {
//           return res.status(401).json({ message: "Invalid refresh token" });
//         }
//       }

//       return res.status(401).json({ message: "Invalid token" });
//     }
//   } catch (err) {
//     return res.status(500).json({ message: "Authentication error" });
//   }
// };

// // ✅ Role-based authorization
// export const authorizeRoles = (roles: string[]) => {
//   return (req: AuthRequest, res: Response, next:NextFunction) => {
//     if (!req.user || !roles.includes(req.user.role)) {
//       return res
//         .status(403)
//         .json({ message: "Forbidden: You don't have permission" });
//     }
//     next();
//   };
// };



// import { Request, Response, NextFunction } from 'express';
// import jwt, { JwtPayload } from 'jsonwebtoken';
// import { USER_ROLES, UserRole } from '../DataBase/Schema/user.schema';
// import User from '../DataBase/Schema/user.schema';
// interface AuthRequest extends Request {
//   user?: {
//     id: string;
//     email: string;
//     role: string;
//     company: string;
//   };
// }
// // ─── Authenticate JWT (with silent refresh token fallback) ────────────────────
// export const authenticate = async (
//   req: any,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     // ── 1. Extract bearer token ────────────────────────────────────────────────
//     const authHeader = req.headers.authorization;

//     if (!authHeader?.startsWith('Bearer ')) {
//       res.status(401).json({ message: 'Authorization token required' });
//       return;
//     }

//     const token = authHeader.split(' ')[1];

//     // ── 2. Try verifying the access token ─────────────────────────────────────
//     try {
//       const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
//       req.user = decoded;  // ← no optional chaining on LHS (was `req?.user`)
//       next();
//       return;
//     } catch (err) {
//       // Only attempt refresh on expiry — not on a malformed/tampered token
//       if (!(err instanceof jwt.TokenExpiredError)) {
//         res.status(401).json({ message: 'Invalid token' });
//         return;
//       }
//     }

//     // ── 3. Access token expired → attempt silent refresh ──────────────────────
//     // Decode without verifying to extract the user ID from the expired token
//     const expiredPayload = jwt.decode(token) as JwtPayload | null;
//     const userId = expiredPayload?.id;

//     if (!userId) {
//       res.status(401).json({ message: 'Invalid token payload' });
//       return;
//     }

//     // Fetch the user and their stored refresh token
//     const user = await User.findById(userId).select('+refreshToken');
//     if (!user || !(user as any).refreshToken) {
//       res.status(401).json({ message: 'Session expired. Please log in again.' });
//       return;
//     }

//     // Verify the refresh token
//     try {
//       jwt.verify((user as any).refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!);
//     } catch {
//       res.status(401).json({ message: 'Session expired. Please log in again.' });
//       return;
//     }

//     // ── 4. Issue a new access token ───────────────────────────────────────────
//     const newPayload: JwtPayload = {
//       id:           String(user._id),
//       role:         user.userRole,
//       companyId:    user.company ? String(user.company) : undefined,
//       isSuperAdmin: user.userRole === USER_ROLES.SUPER_ADMIN,
//     };

//     const newAccessToken = jwt.sign(newPayload, process.env.JWT_SECRET!, { expiresIn: '2h' });

//     // Return the new token in a response header so the client can store it
//     res.setHeader('x-new-access-token', newAccessToken);

//     // Attach decoded payload so downstream middleware/controllers work normally
//     req.user = newPayload;
//     next();
//   } catch (err) {
//     console.error('[authenticate] Unexpected error:', err);
//     res.status(500).json({ message: 'Authentication error' });
//   }
// };

// // ─── Authorize Roles ──────────────────────────────────────────────────────────
// export const authorizeRoles = (roles: UserRole[]) => {
//   return (req: any, res: Response, next: NextFunction): void => {
//     // `req.user` is guaranteed non-undefined by AuthRequest type, but guard anyway
//     if (!req.user) {
//       res.status(401).json({ message: 'Not authenticated' });
//       return;
//     }

//     // `req.user.role` is typed as UserRole (matches the roles array element type)
//     // so Array.prototype.includes() is fully type-safe here
//     if (!roles.includes(req.user.role)) {
//       res.status(403).json({
//         message: `Access denied. Required roles: ${roles.join(', ')}`,
//       });
//       return;
//     }

//     next();
//   };
// };

// // ─── Company Isolation Guard ──────────────────────────────────────────────────
// // Blocks non-SuperAdmins who have no company attached to their token.
// // Must be used AFTER `authenticate` (relies on req.user being populated).
// export const enforceTenant = (
//   req: AuthRequest,
//   res: Response,
//   next: NextFunction
// ): void => {
//   // AuthRequest guarantees req.user is defined — no optional chaining needed
//   const { isSuperAdmin, companyId }  = req.user as any;

//   if (!isSuperAdmin && !companyId) {
//     res.status(403).json({ message: 'No company associated with this account' });
//     return;
//   }

//   next();
// };

// // ─── Optional Auth (attaches user if token present, doesn't block if absent) ──
// // Useful for public endpoints that behave differently for logged-in users
// export const optionalAuth = (
//   req: any,
//   _res: Response,
//   next: NextFunction
// ): void => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader?.startsWith('Bearer ')) {
//     next();
//     return;
//   }

//   try {
//     const token   = authHeader.split(' ')[1];
//     const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
//     req.user = decoded;
//   } catch {
//     // Invalid/expired token on an optional route → just continue unauthenticated
//   }

//   next();
// };


// import { Request, Response, NextFunction, RequestHandler } from 'express';
// import jwt, { JwtPayload } from 'jsonwebtoken';
// import { USER_ROLES, UserRole } from '../DataBase/Schema/user.schema';
// import User from '../DataBase/Schema/user.schema';

// // ─── Async wrapper ────────────────────────────────────────────────────────────
// // Express's RequestHandler must return `void`, not `Promise<void>`.
// // This wrapper makes async middleware type-safe AND forwards thrown errors to
// // Express's error handler via next(err) rather than leaving unhandled rejections.
// const asyncHandler = (
//   fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
// ): RequestHandler =>
//   (req, res, next) => {
//     fn(req, res, next).catch(next);
//   };

// // ─── Authenticate JWT (with silent access-token refresh) ──────────────────────
// // Exported as RequestHandler so router.use() / router.get() accept it without
// // complaint. Internal casting (req as AuthRequest) is safe because we only call
// // this middleware on routes that need authentication.
// export const authenticate: RequestHandler = asyncHandler(
//   async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     const authReq = req as any; // internal cast — safe in this context

//     // ── 1. Extract bearer token ──────────────────────────────────────────────
//     const authHeader = authReq.headers.authorization;

//     if (!authHeader?.startsWith('Bearer ')) {
//       res.status(401).json({ message: 'Authorization token required' });
//       return;
//     }

//     const token = authHeader.split(' ')[1];

//     // ── 2. Verify access token ───────────────────────────────────────────────
//     try {
//       const decoded  = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
//       authReq.user   = decoded;
//       next();
//       return;
//     } catch (err) {
//       // Only fall through to refresh logic on expiry, not on tampered tokens
//       if (!(err instanceof jwt.TokenExpiredError)) {
//         res.status(401).json({ message: 'Invalid token' });
//         return;
//       }
//     }

//     // ── 3. Access token expired → attempt silent refresh ─────────────────────
//     const expiredPayload = jwt.decode(token) as JwtPayload | null;
//     const userId         = expiredPayload?.id;

//     if (!userId) {
//       res.status(401).json({ message: 'Invalid token payload' });
//       return;
//     }

//     const user = await User.findById(userId).select('+refreshToken');
//     const refreshToken = (user as any)?.refreshToken as string | undefined;

//     if (!user || !refreshToken) {
//       res.status(401).json({ message: 'Session expired. Please log in again.' });
//       return;
//     }

//     // Verify the stored refresh token
//     try {
//       jwt.verify(
//         refreshToken,
//         process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!
//       );
//     } catch {
//       res.status(401).json({ message: 'Session expired. Please log in again.' });
//       return;
//     }

//     // ── 4. Issue new access token ─────────────────────────────────────────────
//     const newPayload: JwtPayload = {
//       id:           String(user._id),
//       role:         user.userRole,
//       companyId:    user.company ? String(user.company) : undefined,
//       isSuperAdmin: user.userRole === USER_ROLES.SUPER_ADMIN,
//     };

//     const newAccessToken = jwt.sign(
//       newPayload,
//       process.env.JWT_SECRET!,
//       { expiresIn: '2h' }
//     );

//     // Send the new token in a header — client should update its stored copy
//     res.setHeader('x-new-access-token', newAccessToken);

//     authReq.user = newPayload;
//     next();
//   }
// );

// // ─── Authorize Roles ──────────────────────────────────────────────────────────
// // Returns a RequestHandler — Express accepts it anywhere a middleware is expected.
// export const authorizeRoles = (roles: UserRole[]): RequestHandler =>
//   (req: Request, res: Response, next: NextFunction): void => {
//     const authReq = req as any;

//     if (!authReq.user) {
//       res.status(401).json({ message: 'Not authenticated' });
//       return;
//     }

//     // req.user.role is typed as UserRole, same as roles element type → type-safe
//     if (!roles.includes(authReq.user.role)) {
//       res.status(403).json({
//         message: `Access denied. Required roles: ${roles.join(', ')}`,
//       });
//       return;
//     }

//     next();
//   };

// // ─── Company Isolation Guard ──────────────────────────────────────────────────
// // Blocks non-SuperAdmins who have no company in their JWT.
// // Always place AFTER `authenticate` in the middleware chain.
// export const enforceTenant: RequestHandler = (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): void => {
//   const { isSuperAdmin, companyId } = (req as any).user;

//   if (!isSuperAdmin && !companyId) {
//     res.status(403).json({ message: 'No company associated with this account' });
//     return;
//   }

//   next();
// };

// // ─── Optional Auth ────────────────────────────────────────────────────────────
// // Attaches user to req if a valid token is present, but never blocks the request.
// // Useful for public routes that serve richer data to authenticated callers.
// export const optionalAuth: RequestHandler = (
//   req: Request,
//   _res: Response,
//   next: NextFunction
// ): void => {
//   const authHeader = req.headers.authorization;

//   if (authHeader?.startsWith('Bearer ')) {
//     try {
//       const token              = authHeader.split(' ')[1];
//       const decoded            = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
//       (req as any).user = decoded;
//     } catch {
//       // Silently ignore — optional route continues without auth context
//     }
//   }

//   next();
// };

import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import User, { USER_ROLES, UserRole } from '../DataBase/Schema/user.schema';

/* ─────────────────────────────────────────────────────────────── */
/* Async Wrapper (prevents unhandled promise rejections)          */
/* ─────────────────────────────────────────────────────────────── */
const asyncHandler =
  (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
  ): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/* ─────────────────────────────────────────────────────────────── */
/* AUTHENTICATE (Access + Silent Refresh)                         */
/* ─────────────────────────────────────────────────────────────── */
export const authenticate: RequestHandler = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Authorization token required' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // 1️⃣ Try verifying access token
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as JwtPayload;

      (req as any).user = decoded;
      next();
      return;
    } catch (err) {
      if (!(err instanceof jwt.TokenExpiredError)) {
        res.status(401).json({ message: 'Invalid token' });
        return;
      }
    }

    // 2️⃣ Token expired → attempt refresh
    const expiredPayload = jwt.decode(token) as JwtPayload | null;
    const userId = expiredPayload?.id;

    if (!userId) {
      res.status(401).json({ message: 'Invalid token payload' });
      return;
    }

    const user = await User.findById(userId).select('+refreshToken');
    const refreshToken = (user as any)?.refreshToken;

    if (!user || !refreshToken) {
      res.status(401).json({ message: 'Session expired. Please log in again.' });
      return;
    }

    try {
      jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!
      );
    } catch {
      res.status(401).json({ message: 'Session expired. Please log in again.' });
      return;
    }

    // 3️⃣ Issue new access token
    const newPayload: JwtPayload = {
      id: String(user._id),
      role: user.userRole,
      companyId: user.company ? String(user.company) : undefined,
      isSuperAdmin: user.userRole === USER_ROLES.SUPER_ADMIN,
    };

    const newAccessToken = jwt.sign(
      newPayload,
      process.env.JWT_SECRET!,
      { expiresIn: '2h' }
    );

    res.setHeader('x-new-access-token', newAccessToken);
    (req as any).user = newPayload;

    next();
  }
);

/* ─────────────────────────────────────────────────────────────── */
/* ROLE AUTHORIZATION                                              */
/* ─────────────────────────────────────────────────────────────── */
export const authorizeRoles = (
  roles: UserRole[]
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        message: `Access denied. Required roles: ${roles.join(', ')}`,
      });
      return;
    }

    next();
  };
};

/* ─────────────────────────────────────────────────────────────── */
/* TENANT ENFORCEMENT (Multi-tenant safety)                       */
/* ─────────────────────────────────────────────────────────────── */
export const enforceTenant: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }

  if (!user.isSuperAdmin && !user.companyId) {
    res.status(403).json({
      message: 'No company associated with this account',
    });
    return;
  }

  next();
};

/* ─────────────────────────────────────────────────────────────── */
/* OPTIONAL AUTH                                                   */
/* ─────────────────────────────────────────────────────────────── */
export const optionalAuth: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as JwtPayload;

      (req as any).user = decoded;
    } catch {
      // ignore silently
    }
  }

  next();
};
