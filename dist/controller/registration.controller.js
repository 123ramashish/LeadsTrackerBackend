"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const password_hash_1 = __importDefault(require("password-hash"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const registration_schema_1 = __importDefault(require("../DataBase/Schema/registration.schema"));
const user_schema_1 = __importDefault(require("../DataBase/Schema/user.schema"));
const bcrypt_1 = __importDefault(require("bcrypt"));
class RegistrationController {
    async registerCompany(req, res) {
        try {
            const { userType, name, email, phone, password, role } = req.body;
            // Validate userType presence
            console.log("body", req.body);
            if (!userType) {
                return res.status(400).json({ message: "User type is required" });
            }
            // Check if registration exists
            // const existingRegistration = await Registration.findOne({
            //   $or: [{ email }, { phone }],
            // });
            // if (existingRegistration) {
            //   return res
            //     .status(409)
            //     .json({ message: "Email or phone already registered" });
            // }
            // Hash password
            const hashedPassword = await bcrypt_1.default.hash(password + process.env.JWT_SECRET, 10);
            // Create registration
            const newRegistration = new registration_schema_1.default({
                userType,
                name,
                email,
                phone,
                password: hashedPassword,
                role,
            });
            const savedRegistration = await newRegistration.save();
            const newUser = new user_schema_1.default({
                name,
                email,
                phone,
                password: hashedPassword,
                company: savedRegistration._id,
                userRole: "admin",
            });
            const savedUser = await newUser.save();
            return res.status(201).json({
                message: "Registration successful",
                registration: savedRegistration,
            });
        }
        catch (error) {
            console.error("Error:", error.message);
            return res.status(500).json({ message: error.message });
        }
    }
    async companySignin(req, res) {
        try {
            const { email, password } = req.body;
            const user = await user_schema_1.default.findOne({ email });
            if (!user) {
                return res.status(404).send("User does not exist!");
            }
            const isPasswordValid = password_hash_1.default.verify(String(password), user.password);
            if (!isPasswordValid) {
                return res.status(401).send("Invalid Password!");
            }
            // Generate JWT
            const token = jsonwebtoken_1.default.sign({
                id: user._id,
                email: user.email,
                userRole: user.userRole,
                company: user.company,
            }, process.env.JWT_SECRET || "secretkey", { expiresIn: "7d" });
            const options = {
                maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
            };
            const { password: pass, ...rest } = user.toObject();
            return res
                .status(200)
                .cookie("SessionID", token, options)
                .json({ user: rest });
        }
        catch (error) {
            console.error("Error:", error.message);
            return res.status(500).json({ message: error.message });
        }
    }
    async companySignout(req, res) {
        try {
            res
                .clearCookie("SessionID")
                .status(200)
                .json({ message: "Signout successful" });
        }
        catch (error) {
            console.error("Error:", error.message);
            return res.status(500).json({ message: error.message });
        }
    }
}
exports.default = RegistrationController;
