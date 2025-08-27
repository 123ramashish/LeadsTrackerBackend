"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_schema_1 = __importDefault(require("../DataBase/Schema/user.schema"));
class AuthController {
    async loginWithEmail(req, res) {
        try {
            const { email, password } = req.body;
            console.log(email, password);
            const user = await user_schema_1.default.findOne({ email });
            if (!user)
                return res.status(401).json({ message: "User not found" });
            console.log("User found:", user.email, email, password);
            const isMatch = await bcrypt_1.default.compare(password, user.password);
            if (!isMatch)
                return res.status(401).json({ message: "Wrong Password!" });
            await this.updateLastLogin(user._id);
            const tokens = await this.generateTokens(user);
            return res.status(200).json(tokens);
        }
        catch (error) {
            console.error("Error:", error.message);
            return res.status(500).json({ message: error.message });
        }
    }
    async loginWithPhone(req, res) {
        try {
            const { phone, otp } = req.body;
            const user = await user_schema_1.default.findOne({ phone });
            if (!user)
                return res.status(401).json({ message: "User not found" });
            if (user.otp !== otp || user.otpExpires < new Date()) {
                return res.status(401).json({ message: "Invalid or expired OTP" });
            }
            await this.updateLastLogin(user._id);
            const tokens = await this.generateTokens(user);
            return res.status(200).json(tokens);
        }
        catch (error) {
            console.error("Error:", error.message);
            return res.status(500).json({ message: error.message });
        }
    }
    async generateTokens(user) {
        const payload = { sub: user._id, email: user.email, role: user.userRole };
        const accessToken = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET || "secret", {
            expiresIn: "1h",
        });
        const refreshToken = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET || "secret", {
            expiresIn: "7d",
        });
        user.refreshToken = refreshToken;
        await user.save();
        return {
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.userRole,
                company: user.company
            },
            accessToken,
            refreshToken,
        };
    }
    async refreshToken(req, res) {
        try {
            const { token } = req.body;
            if (!token)
                return res.status(400).json({ message: "Token is required" });
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "secret");
            const user = await user_schema_1.default.findById(decoded.sub);
            if (!user)
                return res.status(401).json({ message: "Invalid user" });
            const tokens = await this.generateTokens(user);
            return res.status(200).json(tokens);
        }
        catch (error) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }
    }
    async updateLastLogin(userId) {
        console.log("Updating last login for user:", userId);
        await user_schema_1.default.findByIdAndUpdate(userId, { lastLogin: new Date() });
    }
    async generateOtp(req, res) {
        try {
            const { phone } = req.body;
            const user = await user_schema_1.default.findOne({ phone });
            if (!user)
                return res.status(400).json({ message: "User not found" });
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiry = new Date(Date.now() + 5 * 60 * 1000);
            user.otp = otp;
            user.otpExpires = expiry;
            await user.save();
            // In production, send OTP via SMS gateway
            return res.status(200).json({ message: "OTP sent successfully", otp }); // For testing only
        }
        catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }
}
exports.default = AuthController;
