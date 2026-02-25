import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User, { USER_ROLES } from '../DataBase/Schema/user.schema';
import Company, { ICompany } from '../DataBase/Schema/company.schema';
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    company: string;
  };
}
export default class CompanyController {
  // ─── PUBLIC: Register company + Admin user ────────────────────────────────
  async register(req: Request, res: Response): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        companyName,
        companyType,
        contactEmail,
        contactPhone,
        industry,
        website,
        address,
        adminName,
        adminEmail,
        adminPhone,
        password,
      } = req.body as {
        companyName: string;
        companyType: string;
        contactEmail?: string;
        contactPhone: string;
        industry?: string;
        website?: string;
        address?: string;
        adminName: string;
        adminEmail?: string;
        adminPhone: string;
        password: string;
      };

      // Required field validation
      if (!companyName || !companyType || !contactPhone || !adminName || !adminPhone || !password) {
        await session.abortTransaction();
        res.status(400).json({
          message: 'Required: companyName, companyType, contactPhone, adminName, adminPhone, password',
        });
        return;
      }

      // Duplicate company check
      const existingCompany = await Company.findOne({
        $or: [
          { contactPhone },
          ...(contactEmail ? [{ contactEmail: contactEmail.toLowerCase() }] : []),
        ],
        isDeleted: false,
      }).session(session);

      if (existingCompany) {
        await session.abortTransaction();
        res.status(409).json({ message: 'Company with this phone/email already registered' });
        return;
      }

      // Duplicate admin phone check
      const existingUser = await User.findOne({
        phone: adminPhone,
        isDeleted: false,
      }).session(session);

      if (existingUser) {
        await session.abortTransaction();
        res.status(409).json({ message: 'Admin phone number already in use' });
        return;
      }

      // Create company
      const [company] = await Company.create(
        [
          {
            name: companyName,
            type: companyType.toLowerCase(),
            contactEmail: contactEmail?.toLowerCase(),
            contactPhone,
            industry,
            website,
            address,
            isActive: true,
          },
        ],
        { session }
      );

      // Create admin user linked to company
      const [adminUser] = await User.create(
        [
          {
            name: adminName,
            email: adminEmail?.toLowerCase(),
            phone: adminPhone,
            password,
            company: company._id,
            userRole: USER_ROLES.ADMIN,
            isVerified: true,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      res.status(201).json({
        message: 'Company registered successfully',
        company: {
          id: company._id,
          name: company.name,
          type: company.type,
        },
        admin: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          phone: adminUser.phone,
        },
      });
    } catch (error: unknown) {
      await session.abortTransaction();
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Company registration error:', error);
      if ((error as any)?.code === 11000) {
        res.status(409).json({ message: 'Duplicate company name + phone combination' });
        return;
      }
      res.status(500).json({ message: 'Registration failed', error: msg });
    } finally {
      session.endSession();
    }
  }

  // ─── GET ALL COMPANIES (SuperAdmin only) ──────────────────────────────────
  async getCompanies(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = '1',
        limit = '20',
        isActive,
        search,
        type,
      } = req.query as {
        page?: string;
        limit?: string;
        isActive?: string;
        search?: string;
        type?: string;
      };

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

      const query: mongoose.FilterQuery<ICompany> = { isDeleted: false };

      if (isActive !== undefined) query.isActive = isActive === 'true';
      if (type) query.type = type.toLowerCase();
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { contactEmail: { $regex: search, $options: 'i' } },
          { contactPhone: { $regex: search, $options: 'i' } },
        ];
      }

      const [companies, total] = await Promise.all([
        Company.find(query)
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .sort({ createdAt: -1 })
          .lean(),
        Company.countDocuments(query),
      ]);

      res.json({
        data: companies,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum,
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Failed to fetch companies', error: msg });
    }
  }

  // ─── GET SINGLE COMPANY ───────────────────────────────────────────────────
  async getCompany(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params as any;
      const currentUser:any = req.user;

      // Non-SuperAdmins can only view their own company
      if (!currentUser.isSuperAdmin && currentUser.companyId !== id) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid company ID' });
        return;
      }

      const company = await Company.findOne({ _id: id, isDeleted: false }).lean();

      if (!company) {
        res.status(404).json({ message: 'Company not found' });
        return;
      }

      res.json({ data: company });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Failed to fetch company', error: msg });
    }
  }

  // ─── UPDATE COMPANY ───────────────────────────────────────────────────────
  async updateCompany(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params as any;
      const currentUser :any= req.user;

      // Non-SuperAdmins can only update their own company
      if (!currentUser.isSuperAdmin && currentUser.companyId !== id) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid company ID' });
        return;
      }

      // Whitelist updatable fields
      const {
        name,
        type,
        contactEmail,
        contactPhone,
        industry,
        website,
        address,
        isActive,
      } = req.body as Partial<{
        name: string;
        type: string;
        contactEmail: string;
        contactPhone: string;
        industry: string;
        website: string;
        address: string;
        isActive: boolean;
      }>;

      const updatePayload: Record<string, unknown> = {};
      if (name !== undefined) updatePayload.name = name;
      if (type !== undefined) updatePayload.type = type.toLowerCase();
      if (contactEmail !== undefined) updatePayload.contactEmail = contactEmail.toLowerCase();
      if (contactPhone !== undefined) updatePayload.contactPhone = contactPhone;
      if (industry !== undefined) updatePayload.industry = industry;
      if (website !== undefined) updatePayload.website = website;
      if (address !== undefined) updatePayload.address = address;
      if (isActive !== undefined && currentUser.isSuperAdmin) {
        updatePayload.isActive = isActive; // only SuperAdmin can toggle isActive
      }

      if (Object.keys(updatePayload).length === 0) {
        res.status(400).json({ message: 'No valid fields to update' });
        return;
      }

      const company = await Company.findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $set: updatePayload },
        { new: true, runValidators: true }
      ).lean();

      if (!company) {
        res.status(404).json({ message: 'Company not found' });
        return;
      }

      res.json({ message: 'Company updated successfully', data: company });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if ((error as any)?.code === 11000) {
        res.status(409).json({ message: 'Company name + phone combination already exists' });
        return;
      }
      res.status(500).json({ message: 'Company update failed', error: msg });
    }
  }

  // ─── SOFT DELETE COMPANY (SuperAdmin only) ────────────────────────────────
  async deleteCompany(req: AuthRequest, res: Response): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params as any;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        await session.abortTransaction();
        res.status(400).json({ message: 'Invalid company ID' });
        return;
      }

      const company = await Company.findOne({
        _id: id,
        isDeleted: false,
      }).session(session);

      if (!company) {
        await session.abortTransaction();
        res.status(404).json({ message: 'Company not found' });
        return;
      }

      // Soft-delete company
      company.isDeleted = true;
      company.deletedAt = new Date();
      company.isActive = false;
      await company.save({ session });

      // Soft-delete all users of this company
      await User.updateMany(
        { company: id, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date() } },
        { session }
      );

      await session.commitTransaction();

      res.json({ message: 'Company and associated users deactivated successfully' });
    } catch (error: unknown) {
      await session.abortTransaction();
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Deletion failed', error: msg });
    } finally {
      session.endSession();
    }
  }
}