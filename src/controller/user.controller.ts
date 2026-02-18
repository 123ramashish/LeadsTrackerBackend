// import { Request, Response } from 'express';
// import User, { IUser, USER_ROLES } from '../DataBase/Schema/user.schema';
// import Company from '../DataBase/Schema/registration.schema';
// import mongoose from 'mongoose';
// interface AuthRequest extends Request {
//   user?: {
//     id: string;
//     email: string;
//     role: string;
//     company: string;
//   };
// }

// export default class UserController {
  
//   // 👤 GET CURRENT USER PROFILE (authenticated users)
//   async getProfile(req: AuthRequest, res: Response) {
//     try {
//       // req.user populated by auth middleware
//       const user = await User.findById(req?.user?.id)
//         .select('-password -resetToken -resetTokenExpiry')
//         .populate('company', 'name type');
      
//       if (!user || user.isDeleted) {
//         return res.status(404).json({ message: 'User not found' });
//       }
      
//       res.json(user);
//     } catch (error: any) {
//       res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
//     }
//   }

//   // 🔒 UPDATE OWN PASSWORD (authenticated users)
//  async updateOwnPassword(req: AuthRequest, res: Response) {
//   try {
//     const { currentPassword, newPassword } = req.body;
    
//     // ✅ Cast to IUser to access comparePassword method
//     const user = await User.findById(req?.user?.id).select('+password') as IUser;
    
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }
    
//     // ✅ Now TypeScript recognizes the method
//     const isMatch = await user.comparePassword(currentPassword);
    
//     if (!isMatch) {
//       return res.status(401).json({ message: 'Current password is incorrect' });
//     }
    
//     user.password = newPassword;
//     await user.save();
    
//     res.json({ message: 'Password updated successfully' });
//   } catch (error: any) {
//     res.status(500).json({ message: 'Password update failed', error: error.message });
//   }
// }

//   // 👥 CREATE USER (Admin/SuperAdmin only - middleware enforced)
//   async createUser(req: AuthRequest, res: Response) {
//     try {
//       const { name, email, phone, password, userRole = USER_ROLES.USER } = req.body;
//       const creator:any = req.user; // From auth middleware
      
//       // 🔒 COMPANY ISOLATION: Non-SuperAdmins can only create users in their company
//       let companyId = req.body.company;
//       if (creator.role !== USER_ROLES.SUPER_ADMIN) {
//         if (companyId && companyId !== creator.companyId) {
//           return res.status(403).json({ 
//             message: 'You can only create users for your company' 
//           });
//         }
//         companyId = creator.companyId; // Enforce creator's company
//       }
      
//       // Validate company exists (if provided)
//       if (companyId) {
//         const company = await Company.findById(companyId);
//         if (!company || !company.isActive) {
//           return res.status(400).json({ message: 'Invalid or inactive company' });
//         }
//       }
      
//       // Role validation
//       if (!Object.values(USER_ROLES).includes(userRole)) {
//         return res.status(400).json({ message: 'Invalid user role' });
//       }
      
//       // SuperAdmin cannot be created by non-SuperAdmins
//       if (userRole === USER_ROLES.SUPER_ADMIN && creator.role !== USER_ROLES.SUPER_ADMIN) {
//         return res.status(403).json({ message: 'Only SuperAdmin can create SuperAdmins' });
//       }
      
//       // Create user
//       const newUser = await User.create({
//         name,
//         email: email?.toLowerCase(),
//         phone,
//         password, // Will be hashed
//         company: companyId,
//         userRole,
//         isVerified: true
//       });
      
//       res.status(201).json({
//         message: 'User created successfully',
//         user: {
//           id: newUser._id,
//           name: newUser.name,
//           email: newUser.email,
//           phone: newUser.phone,
//           role: newUser.userRole,
//           companyId: newUser.company
//         }
//       });
//     } catch (error: any) {
//       if (error.code === 11000) {
//         return res.status(409).json({ message: 'Phone number already exists' });
//       }
//       res.status(500).json({ message: 'User creation failed', error: error.message });
//     }
//   }

//   // 👥 GET USERS (with company isolation)
//   async getUsers(req: AuthRequest, res: Response) {
//   try {
//     const { role: roleQuery, company: companyQuery, page = 1, limit = 20 } = req.query;
//     const currentUser:any = req.user;

//     // 🔒 BUILD QUERY WITH COMPANY ISOLATION & VALIDATION
//     const query: any = { isDeleted: false };

//     // ✅ ENFORCE COMPANY ISOLATION (CRITICAL SECURITY FIX)
//     if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
//       // Non-SuperAdmins can ONLY see their own company's users
//       query.company = currentUser.companyId;
//     } else {
//       // SuperAdmins: validate and allow company filter
//       if (typeof companyQuery === 'string' && mongoose.Types.ObjectId.isValid(companyQuery.trim())) {
//         query.company = companyQuery.trim();
//       }
//       // If invalid company ID provided, ignore it (show all companies)
//     }

//     // ✅ VALIDATE ROLE PARAMETER (FIXES TYPESCRIPT ERROR)
//     if (typeof roleQuery === 'string') {
//       // Create type-safe role validator
//       const isValidRole = (r: string): r is keyof typeof USER_ROLES => {
//         return Object.values(USER_ROLES).includes(r as any);
//       };
      
//       if (isValidRole(roleQuery)) {
//         query.userRole = roleQuery;
//       }
//       // Silently ignore invalid roles instead of erroring
//     }

//     // ✅ VALIDATE PAGINATION
//     const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
//     const skip = (pageNum - 1) * limitNum;

//     // ✅ FETCH USERS
//     const users = await User.find(query)
//       .select('-password -resetToken -resetTokenExpiry -__v')
//       .populate('company', 'name type')
//       .skip(skip)
//       .limit(limitNum)
//       .lean();

//     const total = await User.countDocuments(query);

//     return res.status(200).json({
//       users,
//       pagination: {
//         total,
//         page: pageNum,
//         pages: Math.ceil(total / limitNum),
//         limit: limitNum
//       }
//     });
//   } catch (error: any) {
//     console.error('Error fetching users:', error);
//     return res.status(500).json({
//       message: 'Error fetching users',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// }

//   // 🗑️ SOFT DELETE USER (Admin/SuperAdmin)
//   async deleteUser(req: AuthRequest, res: Response) {
//     try {
//       const { id } = req.params;
//       const currentUser:any = req.user;
      
//       // Prevent self-deletion
//       if (id === currentUser.id) {
//         return res.status(400).json({ message: 'Cannot delete your own account' });
//       }
      
//       const user = await User.findById(id);
//       if (!user || user.isDeleted) {
//         return res.status(404).json({ message: 'User not found' });
//       }
      
//       // 🔒 COMPANY ISOLATION CHECK
//       if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
//         if (String(user.company) !== currentUser.companyId) {
//           return res.status(403).json({ message: 'Cannot delete users from other companies' });
//         }
//         // Non-SuperAdmins cannot delete other admins
//         if (user.userRole === USER_ROLES.ADMIN && currentUser.role !== USER_ROLES.SUPER_ADMIN) {
//           return res.status(403).json({ message: 'Only SuperAdmin can delete admin accounts' });
//         }
//       }
      
//       user.isDeleted = true;
//       await user.save();
      
//       res.json({ message: 'User deleted successfully' });
//     } catch (error: any) {
//       res.status(500).json({ message: 'Deletion failed', error: error.message });
//     }
//   }
// }


import { Response } from 'express';
import mongoose from 'mongoose';
import User, { IUser, USER_ROLES, UserRole } from '../DataBase/Schema/user.schema';
import Company from '../DataBase/Schema/company.schema';
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    company: string;
  };
  query?:any,
  params?:any
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toPublicUser = (user: IUser | Record<string, unknown>) => ({
  id: (user as any)._id,
  name: (user as any).name,
  email: (user as any).email,
  phone: (user as any).phone,
  role: (user as any).userRole,
  company: (user as any).company,
  isVerified: (user as any).isVerified,
  isLocked: (user as any).isLocked,
  lastLogin: (user as any).lastLogin,
  createdAt: (user as any).createdAt,
});

const isValidRole = (role: string): role is UserRole =>
  Object.values(USER_ROLES).includes(role as UserRole);

export default class UserController {
  // ─── GET OWN PROFILE ───────────────────────────────────────────────────────
  async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = await User.findById(req?.user?.id)
        .select('-password -resetToken -resetTokenExpiry')
        .populate('company', 'name type isActive');

      if (!user || user.isDeleted) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      res.json({ data: user });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Failed to fetch profile', error: msg });
    }
  }

  // ─── UPDATE OWN PROFILE ────────────────────────────────────────────────────
  async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, email } = req.body as { name?: string; email?: string };

      const updatePayload: Record<string, unknown> = {};
      if (name) updatePayload.name = name;
      if (email) updatePayload.email = email.toLowerCase();

      if (Object.keys(updatePayload).length === 0) {
        res.status(400).json({ message: 'No valid fields to update' });
        return;
      }

      const user = await User.findOneAndUpdate(
        { _id: req?.user?.id, isDeleted: false },
        { $set: updatePayload },
        { new: true, runValidators: true }
      ).select('-password -resetToken -resetTokenExpiry');

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      res.json({ message: 'Profile updated successfully', data: user });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Profile update failed', error: msg });
    }
  }

  // ─── UPDATE OWN PASSWORD ──────────────────────────────────────────────────
  async updateOwnPassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body as any

      if (!currentPassword || !newPassword) {
        res.status(400).json({ message: 'currentPassword and newPassword are required' });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({ message: 'New password must be at least 8 characters' });
        return;
      }

      const user = await User.findById(req?.user?.id).select('+password') as IUser;

      if (!user || user.isDeleted) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        res.status(401).json({ message: 'Current password is incorrect' });
        return;
      }

      user.password = newPassword; // pre-save hook will hash
      await user.save();

      res.json({ message: 'Password updated successfully' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Password update failed', error: msg });
    }
  }

  // ─── CREATE USER (Admin/SuperAdmin) ──────────────────────────────────────
  async createUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, email, phone, password, userRole = USER_ROLES.USER, companyId } = req.body as any

      const creator :any= req.user;

      if (!name || !phone || !password) {
        res.status(400).json({ message: 'name, phone, and password are required' });
        return;
      }

      // Role validation
      if (!isValidRole(userRole)) {
        res.status(400).json({
          message: `Invalid role. Valid roles: ${Object.values(USER_ROLES).join(', ')}`,
        });
        return;
      }

      // Only SuperAdmin can create another SuperAdmin
      if (userRole === USER_ROLES.SUPER_ADMIN && !creator.isSuperAdmin) {
        res.status(403).json({ message: 'Only SuperAdmin can create SuperAdmin accounts' });
        return;
      }

      // Determine which company to assign
      let targetCompanyId: string | undefined;

      if (creator.isSuperAdmin) {
        targetCompanyId = companyId; // SuperAdmin can create users for any company
      } else {
        // Admins/Managers: enforce their own company
        if (companyId && companyId !== creator.companyId) {
          res.status(403).json({ message: 'You can only create users for your company' });
          return;
        }
        targetCompanyId = creator.companyId;
      }

      // Validate company exists and is active
      if (targetCompanyId) {
        if (!mongoose.Types.ObjectId.isValid(targetCompanyId)) {
          res.status(400).json({ message: 'Invalid company ID' });
          return;
        }
        const company = await Company.findById(targetCompanyId).lean();
        if (!company || !company.isActive || company.isDeleted) {
          res.status(400).json({ message: 'Invalid or inactive company' });
          return;
        }
      }

      // SuperAdmin doesn't need a company
      if (!targetCompanyId && userRole !== USER_ROLES.SUPER_ADMIN) {
        res.status(400).json({ message: 'Company is required for non-SuperAdmin users' });
        return;
      }

      const newUser = await User.create({
        name,
        email: email?.toLowerCase(),
        phone,
        password,
        company: targetCompanyId,
        userRole,
        isVerified: true,
      });

      res.status(201).json({
        message: 'User created successfully',
        data: toPublicUser(newUser),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if ((error as any)?.code === 11000) {
        res.status(409).json({ message: 'Phone number already in use' });
        return;
      }
      res.status(500).json({ message: 'User creation failed', error: msg });
    }
  }

  // ─── GET USERS (with company isolation + pagination + filters) ────────────
  async getUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        role: roleQuery,
        company: companyQuery,
        page = '1',
        limit = '20',
        search,
        isLocked,
      } = req.query as any

      const currentUser :any= req.user;
      const query: mongoose.FilterQuery<IUser> = { isDeleted: false };

      // ── Tenant isolation ────────────────────────────────────────────────────
      if (!currentUser.isSuperAdmin) {
        query.company = new mongoose.Types.ObjectId(currentUser.companyId!);
      } else if (companyQuery && mongoose.Types.ObjectId.isValid(companyQuery)) {
        query.company = new mongoose.Types.ObjectId(companyQuery);
      }

      // ── Optional filters ────────────────────────────────────────────────────
      if (roleQuery && isValidRole(roleQuery)) query.userRole = roleQuery;
      if (isLocked !== undefined) query.isLocked = isLocked === 'true';
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }

      // ── Pagination ───────────────────────────────────────────────────────────
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

      const [users, total] = await Promise.all([
        User.find(query)
          .select('-password -resetToken -resetTokenExpiry')
          .populate('company', 'name type')
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .sort({ createdAt: -1 })
          .lean(),
        User.countDocuments(query),
      ]);

      res.json({
        data: users,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum,
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Failed to fetch users', error: msg });
    }
  }

  // ─── GET SINGLE USER ──────────────────────────────────────────────────────
  async getUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params as any;
      const currentUser :any= req.user;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      const user = await User.findById(id)
        .select('-password -resetToken -resetTokenExpiry')
        .populate('company', 'name type')
        .lean();

      if (!user || user.isDeleted) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      // Tenant isolation check
      if (!currentUser.isSuperAdmin) {
        const userCompanyId = user.company
          ? String((user.company as any)._id ?? user.company)
          : null;
        if (userCompanyId !== currentUser.companyId) {
          res.status(403).json({ message: 'Access denied' });
          return;
        }
      }

      res.json({ data: user });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Failed to fetch user', error: msg });
    }
  }

  // ─── UPDATE USER (Admin/SuperAdmin) ──────────────────────────────────────
  async updateUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params as any;
      const currentUser:any = req.user;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      const user = await User.findOne({ _id: id, isDeleted: false });

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      // Tenant isolation
      if (!currentUser.isSuperAdmin) {
        if (String(user.company) !== currentUser.companyId) {
          res.status(403).json({ message: 'Access denied' });
          return;
        }
      }

      const { name, email, userRole, isVerified, isLocked } = req.body as {
        name?: string;
        email?: string;
        userRole?: UserRole;
        isVerified?: boolean;
        isLocked?: boolean;
      };

      const updatePayload: Record<string, unknown> = {};
      if (name !== undefined) updatePayload.name = name;
      if (email !== undefined) updatePayload.email = email.toLowerCase();

      // Role updates only by SuperAdmin
      if (userRole !== undefined) {
        if (!currentUser.isSuperAdmin) {
          res.status(403).json({ message: 'Only SuperAdmin can change user roles' });
          return;
        }
        if (!isValidRole(userRole)) {
          res.status(400).json({ message: 'Invalid role' });
          return;
        }
        updatePayload.userRole = userRole;
      }

      // Admins can verify/lock users in their company
      if (isVerified !== undefined) updatePayload.isVerified = isVerified;
      if (isLocked !== undefined) updatePayload.isLocked = isLocked;
      if (isLocked === false) updatePayload.loginAttempts = 0; // auto-reset attempts on unlock

      if (Object.keys(updatePayload).length === 0) {
        res.status(400).json({ message: 'No valid fields to update' });
        return;
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $set: updatePayload },
        { new: true, runValidators: true }
      ).select('-password -resetToken -resetTokenExpiry');

      res.json({ message: 'User updated successfully', data: updatedUser });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'User update failed', error: msg });
    }
  }

  // ─── SOFT DELETE USER ─────────────────────────────────────────────────────
  async deleteUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const currentUser:any = req.user;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      // Prevent self-deletion
      if (id === currentUser.id) {
        res.status(400).json({ message: 'Cannot delete your own account' });
        return;
      }

      const user = await User.findOne({ _id: id, isDeleted: false });

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      // Tenant isolation
      if (!currentUser.isSuperAdmin) {
        if (String(user.company) !== currentUser.companyId) {
          res.status(403).json({ message: 'Cannot delete users from another company' });
          return;
        }
        // Admins cannot delete other admins
        if (user.userRole === USER_ROLES.ADMIN) {
          res.status(403).json({ message: 'Only SuperAdmin can delete admin accounts' });
          return;
        }
      }

      // Cannot delete a SuperAdmin if they're the last one
      if (user.userRole === USER_ROLES.SUPER_ADMIN) {
        const count = await User.countDocuments({
          userRole: USER_ROLES.SUPER_ADMIN,
          isDeleted: false,
        });
        if (count <= 1) {
          res.status(400).json({ message: 'Cannot delete the last SuperAdmin account' });
          return;
        }
      }

      user.isDeleted = true;
      user.deletedAt = new Date();
      await user.save();

      res.json({ message: 'User deleted successfully' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Deletion failed', error: msg });
    }
  }

  // ─── ADMIN RESET PASSWORD ─────────────────────────────────────────────────
  async adminResetPassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { newPassword } = req.body as any
      const currentUser:any = req.user;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      if (!newPassword || newPassword.length < 8) {
        res.status(400).json({ message: 'newPassword must be at least 8 characters' });
        return;
      }

      const user = await User.findOne({ _id: id, isDeleted: false });

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      // Tenant isolation
      if (!currentUser.isSuperAdmin && String(user.company) !== currentUser.companyId) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      user.password = newPassword;
      user.loginAttempts = 0;
      user.isLocked = false;
      await user.save();

      res.json({ message: 'User password reset successfully' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Password reset failed', error: msg });
    }
  }
}