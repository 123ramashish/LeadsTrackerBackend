"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const registration_schema_1 = __importDefault(require("../DataBase/Schema/registration.schema"));
const user_schema_1 = __importStar(require("../DataBase/Schema/user.schema"));
class CompanyController {
    // 🌐 PUBLIC: Register new company + create admin user
    async register(req, res) {
        try {
            const { companyName, companyType, contactEmail, contactPhone, adminName, adminEmail, adminPhone, password } = req.body;
            // Validate required fields
            if (!companyName || !companyType || !contactPhone ||
                !adminName || !adminPhone || !password) {
                return res.status(400).json({
                    message: 'Missing required fields: companyName, companyType, contactPhone, adminName, adminPhone, password'
                });
            }
            // Check if company contact exists
            const existingCompany = await registration_schema_1.default.findOne({
                $or: [
                    { contactPhone },
                    { contactEmail: contactEmail?.toLowerCase() }
                ]
            });
            if (existingCompany) {
                return res.status(409).json({ message: 'Company contact already registered' });
            }
            // Check if admin phone exists
            const existingUser = await user_schema_1.default.findOne({
                phone: adminPhone,
                isDeleted: false
            });
            if (existingUser) {
                return res.status(409).json({ message: 'Admin phone already in use' });
            }
            // Create company
            const company = await registration_schema_1.default.create({
                name: companyName,
                type: companyType,
                contactEmail: contactEmail?.toLowerCase(),
                contactPhone,
                isActive: true
            });
            // Create admin user linked to company
            const adminUser = await user_schema_1.default.create({
                name: adminName,
                email: adminEmail?.toLowerCase(),
                phone: adminPhone,
                password, // Will be hashed by pre-save hook
                company: company._id,
                userRole: user_schema_1.USER_ROLES.ADMIN,
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
        }
        catch (error) {
            console.error('Company registration error:', error);
            if (error.code === 11000) {
                return res.status(409).json({ message: 'Duplicate contact information' });
            }
            res.status(500).json({ message: 'Registration failed', error: error.message });
        }
    }
}
exports.default = CompanyController;
//# sourceMappingURL=registration.controller.js.map