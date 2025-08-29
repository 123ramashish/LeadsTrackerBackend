import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../DataBase/Schema/user.schema";
import axios from 'axios'
export default class AuthController {
  async loginWithEmail(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      console.log(email, password);
      const user: any = await User.findOne({ email });
      if (!user) return res.status(401).json({ message: "User not found" });
      console.log("User found:", user.email, email, password);
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ message: "Wrong Password!" });

      await this.updateLastLogin(user._id);

      const tokens = await this.generateTokens(user);

      return res.status(200).json(tokens);
    } catch (error: any) {
      console.error("Error:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

  async loginWithPhone(req: Request, res: Response) {
    try {
      const { phone, otp } = req.body;
      console.log("phone", phone);
      const user: any = await User.findOne({ phone });
      if (!user) return res.status(401).json({ message: "User not found" });

      if (user.otp !== otp || user.otpExpires < new Date()) {
        return res.status(401).json({ message: "Invalid or expired OTP" });
      }

      await this.updateLastLogin(user._id);

      const tokens = await this.generateTokens(user);

      return res.status(200).json(tokens);
    } catch (error: any) {
      console.error("Error:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

  private async generateTokens(user: any) {
    const payload = { sub: user._id, email: user.email, role: user.userRole };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET || "secret", {
      expiresIn: "1h",
    });

    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET || "secret", {
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
        company: user.company,
      },
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(req: Request, res: Response) {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "Token is required" });

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "secret"
      ) as any;
      const user = await User.findById(decoded.sub);
      if (!user) return res.status(401).json({ message: "Invalid user" });

      const tokens = await this.generateTokens(user);

      return res.status(200).json(tokens);
    } catch (error: any) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
  }

  private async updateLastLogin(userId: string) {
    console.log("Updating last login for user:", userId);
    await User.findByIdAndUpdate(userId, { lastLogin: new Date() });
  }

  async generateOtp(req: Request, res: Response) {
    try {
      const { phone } = req.body;
      const user = await User.findOne({ phone });
      if (!user) return res.status(400).json({ message: "User not found" });

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 5 * 60 * 1000);

      user.otp = otp;
      user.otpExpires = expiry;
      await user.save();
// Send OTP via SMS using Fast2SMS API
    const fast2smsApiKey =
      process.env.FAST2SMS_API_KEY! ||
      "IXjRJ6DPuaTqy4M5Sxk9CwlgWctYnL0O1B2Qo8pAzhfGEZKU7sDJzdRbOP96nXZF4LifwHlx5k1GrhMB";
    // console.log('Sending OTP to:', phone , " fast2smsApiKey ", fast2smsApiKey);
    const message = `Your OTP is ${otp}. This OTP is valid for 10 minutes.`;
    // 1201172171239468318
    const url = `https://www.fast2sms.com/dev/bulkV2`;

    const response = await axios.post(
      url,
      {
        sender_id: "INTERZ",
        message: "181436",
        variables_values: otp,
        route: "dlt",
        numbers: phone,
      },
      {
        headers: {
          authorization: fast2smsApiKey,
          "Content-Type": "application/json",
        },
      }
    );
    // console.log('Response:', response);
    if (response.status === 200) {
      // console.log('OTP sent successfully');
    } else {
      console.error("Failed to send OTP:", response.data);
      return res.status(500).send({
        message: "Failed to send OTP",
      });
    }
      // In production, send OTP via SMS gateway
      return res.status(200).json({ message: "OTP sent successfully", otp }); // For testing only
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }
}
