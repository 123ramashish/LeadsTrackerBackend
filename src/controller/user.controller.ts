import { Request, Response } from 'express';
import User, { IUser, USER_ROLES } from '../DataBase/Schema/user.schema';
import Company from '../DataBase/Schema/registration.schema';
import mongoose from 'mongoose';
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    company: string;
  };
}

export default class UserController {
  
  // 👤 GET CURRENT USER PROFILE (authenticated users)
  async getProfile(req: AuthRequest, res: Response) {
    try {
      // req.user populated by auth middleware
      const user = await User.findById(req?.user?.id)
        .select('-password -resetToken -resetTokenExpiry')
        .populate('company', 'name type');
      
      if (!user || user.isDeleted) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
    }
  }

  // 🔒 UPDATE OWN PASSWORD (authenticated users)
 async updateOwnPassword(req: AuthRequest, res: Response) {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // ✅ Cast to IUser to access comparePassword method
    const user = await User.findById(req?.user?.id).select('+password') as IUser;
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // ✅ Now TypeScript recognizes the method
    const isMatch = await user.comparePassword(currentPassword);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Password update failed', error: error.message });
  }
}

  // 👥 CREATE USER (Admin/SuperAdmin only - middleware enforced)
  async createUser(req: AuthRequest, res: Response) {
    try {
      const { name, email, phone, password, userRole = USER_ROLES.USER } = req.body;
      const creator:any = req.user; // From auth middleware
      
      // 🔒 COMPANY ISOLATION: Non-SuperAdmins can only create users in their company
      let companyId = req.body.company;
      if (creator.role !== USER_ROLES.SUPER_ADMIN) {
        if (companyId && companyId !== creator.companyId) {
          return res.status(403).json({ 
            message: 'You can only create users for your company' 
          });
        }
        companyId = creator.companyId; // Enforce creator's company
      }
      
      // Validate company exists (if provided)
      if (companyId) {
        const company = await Company.findById(companyId);
        if (!company || !company.isActive) {
          return res.status(400).json({ message: 'Invalid or inactive company' });
        }
      }
      
      // Role validation
      if (!Object.values(USER_ROLES).includes(userRole)) {
        return res.status(400).json({ message: 'Invalid user role' });
      }
      
      // SuperAdmin cannot be created by non-SuperAdmins
      if (userRole === USER_ROLES.SUPER_ADMIN && creator.role !== USER_ROLES.SUPER_ADMIN) {
        return res.status(403).json({ message: 'Only SuperAdmin can create SuperAdmins' });
      }
      
      // Create user
      const newUser = await User.create({
        name,
        email: email?.toLowerCase(),
        phone,
        password, // Will be hashed
        company: companyId,
        userRole,
        isVerified: true
      });
      
      res.status(201).json({
        message: 'User created successfully',
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone,
          role: newUser.userRole,
          companyId: newUser.company
        }
      });
    } catch (error: any) {
      if (error.code === 11000) {
        return res.status(409).json({ message: 'Phone number already exists' });
      }
      res.status(500).json({ message: 'User creation failed', error: error.message });
    }
  }

  // 👥 GET USERS (with company isolation)
  async getUsers(req: AuthRequest, res: Response) {
  try {
    const { role: roleQuery, company: companyQuery, page = 1, limit = 20 } = req.query;
    const currentUser:any = req.user;

    // 🔒 BUILD QUERY WITH COMPANY ISOLATION & VALIDATION
    const query: any = { isDeleted: false };

    // ✅ ENFORCE COMPANY ISOLATION (CRITICAL SECURITY FIX)
    if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
      // Non-SuperAdmins can ONLY see their own company's users
      query.company = currentUser.companyId;
    } else {
      // SuperAdmins: validate and allow company filter
      if (typeof companyQuery === 'string' && mongoose.Types.ObjectId.isValid(companyQuery.trim())) {
        query.company = companyQuery.trim();
      }
      // If invalid company ID provided, ignore it (show all companies)
    }

    // ✅ VALIDATE ROLE PARAMETER (FIXES TYPESCRIPT ERROR)
    if (typeof roleQuery === 'string') {
      // Create type-safe role validator
      const isValidRole = (r: string): r is keyof typeof USER_ROLES => {
        return Object.values(USER_ROLES).includes(r as any);
      };
      
      if (isValidRole(roleQuery)) {
        query.userRole = roleQuery;
      }
      // Silently ignore invalid roles instead of erroring
    }

    // ✅ VALIDATE PAGINATION
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // ✅ FETCH USERS
    const users = await User.find(query)
      .select('-password -resetToken -resetTokenExpiry -__v')
      .populate('company', 'name type')
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await User.countDocuments(query);

    return res.status(200).json({
      users,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum
      }
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      message: 'Error fetching users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

  // 🗑️ SOFT DELETE USER (Admin/SuperAdmin)
  async deleteUser(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const currentUser:any = req.user;
      
      // Prevent self-deletion
      if (id === currentUser.id) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }
      
      const user = await User.findById(id);
      if (!user || user.isDeleted) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // 🔒 COMPANY ISOLATION CHECK
      if (currentUser.role !== USER_ROLES.SUPER_ADMIN) {
        if (String(user.company) !== currentUser.companyId) {
          return res.status(403).json({ message: 'Cannot delete users from other companies' });
        }
        // Non-SuperAdmins cannot delete other admins
        if (user.userRole === USER_ROLES.ADMIN && currentUser.role !== USER_ROLES.SUPER_ADMIN) {
          return res.status(403).json({ message: 'Only SuperAdmin can delete admin accounts' });
        }
      }
      
      user.isDeleted = true;
      await user.save();
      
      res.json({ message: 'User deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ message: 'Deletion failed', error: error.message });
    }
  }
}