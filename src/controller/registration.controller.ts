import { Request, Response } from "express";
import passwordHash from "password-hash";
import jwt from "jsonwebtoken";
import Registration from "../DataBase/Schema/registration.schema";
import User from "../DataBase/Schema/user.schema";
import bcrypt from "bcrypt";

export default class RegistrationController {
  async registerCompany(req: Request, res: Response) {
    try {
      const { userType, name, email, phone, password, role } = req.body;
      // Validate userType presence
      if (!userType) {
        return res.status(400).json({ message: "User type is required" });
      }

      // Check if registration exists
      const existingRegistration = await Registration.findOne({
        $or: [{ email }, { phone }],
      });
      if (existingRegistration) {
        return res
          .status(409)
          .json({ message: "Email or phone already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(
        password + process.env.JWT_SECRET,
        10
      );
      // Create registration
      const newRegistration = new Registration({
        userType,
        name,
        email,
        phone,
        password: hashedPassword,
        role,
      });
      const savedRegistration = await newRegistration.save();
      const newUser = new User({
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
    } catch (error: any) {
      console.error("Error:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

  async companySignin(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const user: any = await User.findOne({ email });
      if (!user) {
        return res.status(404).send("User does not exist!");
      }

      const isPasswordValid = passwordHash.verify(
        String(password),
        user.password
      );
      if (!isPasswordValid) {
        return res.status(401).send("Invalid Password!");
      }

      // Generate JWT
      const token = jwt.sign(
        {
          id: user._id,
          email: user.email,
          userRole: user.userRole,
          company: user.company,
        },
        process.env.JWT_SECRET || "secretkey",
        { expiresIn: "7d" }
      );

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
    } catch (error: any) {
      console.error("Error:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }

  async companySignout(req: Request, res: Response) {
    try {
      res
        .clearCookie("SessionID")
        .status(200)
        .json({ message: "Signout successful" });
    } catch (error: any) {
      console.error("Error:", error.message);
      return res.status(500).json({ message: error.message });
    }
  }
}
