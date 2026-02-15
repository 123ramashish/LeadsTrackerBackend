import { Request, Response } from 'express';
import Company from '../DataBase/Schema/registration.schema';
import User, { USER_ROLES } from '../DataBase/Schema/user.schema';

export default class CompanyController {
  // 🌐 PUBLIC: Register new company + create admin user
  async register(req: Request, res: Response) {
    try {
      const { 
        companyName, 
        companyType, 
        contactEmail, 
        contactPhone,
        adminName,
        adminEmail,
        adminPhone,
        password 
      } = req.body;
      
      // Validate required fields
      if (!companyName || !companyType || !contactPhone || 
          !adminName || !adminPhone || !password) {
        return res.status(400).json({ 
          message: 'Missing required fields: companyName, companyType, contactPhone, adminName, adminPhone, password' 
        });
      }
      
      // Check if company contact exists
      const existingCompany = await Company.findOne({ 
        $or: [
          { contactPhone },
          { contactEmail: contactEmail?.toLowerCase() }
        ] 
      });
      if (existingCompany) {
        return res.status(409).json({ message: 'Company contact already registered' });
      }
      
      // Check if admin phone exists
      const existingUser = await User.findOne({ 
        phone: adminPhone,
        isDeleted: false 
      });
      if (existingUser) {
        return res.status(409).json({ message: 'Admin phone already in use' });
      }
      
      // Create company
      const company = await Company.create({
        name: companyName,
        type: companyType,
        contactEmail: contactEmail?.toLowerCase(),
        contactPhone,
        isActive: true
      });
      
      // Create admin user linked to company
      const adminUser = await User.create({
        name: adminName,
        email: adminEmail?.toLowerCase(),
        phone: adminPhone,
        password, // Will be hashed by pre-save hook
        company: company._id,
        userRole: USER_ROLES.ADMIN,
        isVerified: true
      });
      
      res.status(201).json({
        message: 'Company registered successfully',
        company: {
          id: company._id,
          name: company.name,
          type: company.type
        },
        admin: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          phone: adminUser.phone
        }
      });
    } catch (error: any) {
      console.error('Company registration error:', error);
      if (error.code === 11000) {
        return res.status(409).json({ message: 'Duplicate contact information' });
      }
      res.status(500).json({ message: 'Registration failed', error: error.message });
    }
  }
}