import { Request, Response } from "express";
import User from "../DataBase/Schema/user.schema";
import bcrypt from "bcrypt";
import mongoose from "mongoose";

export default class UserController {
  // Create a new user
  static async createUser(req: Request, res: Response) {
    try {
      const { name, email, phone, password, userRole, company } = req.body;
      // ✅ Validate required fields
      if (!name || !phone || !password || !userRole) {
        return res.status(400).json({
          message: "Name, phone, password, and userRole are required",
        });
      }

      // ✅ Check for existing user by phone
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        if (existingUser?.isDelete) {
          existingUser.isDelete = false;
          await existingUser.save();
          return res.status(200).json({
            message: "User already exists, data updated successfully!",
          });
        }

        return res.status(409).json({
          message: "User with this phone already exists",
        });
      }

      // ✅ Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      // ✅ Create user
      const newUser = new User({
        name: name.trim(),
        email: email?.trim(),
        phone,
        password: hashedPassword,
        userRole,
        company: company ? new mongoose.Types.ObjectId(company) : undefined,
      });

      const savedUser = await newUser.save();

      // ✅ Remove password before sending
      const userResponse: any = savedUser.toObject();
      delete userResponse.password;

      return res.status(201).json({
        message: "User created successfully",
        user: userResponse,
      });
    } catch (error: any) {
      console.error("User creation error:", error);

      // ✅ Mongoose validation errors
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map(
          (err: any) => err.message
        );
        return res.status(400).json({ message: messages.join(", ") });
      }

      // ✅ Duplicate key (phone, refreshToken, etc.)
      if (error.code === 11000) {
        const duplicatedField = Object.keys(error.keyPattern)[0];
        return res
          .status(409)
          .json({ message: `${duplicatedField} already exists` });
      }

      // ✅ Other internal error
      return res.status(500).json({
        message: "Error creating user",
        error: error.message,
      });
    }
  }

  // Get all users (with optional role-based filtering)
  static async getUsers(req: Request, res: Response) {
    try {
      const { role, page = 1, limit = 100, company } = req.query;
      console.log("com", company);
      // ✅ Build query
      const query: any = { isDelete: false };
      if (role) query.userRole = role;
      if (company) query.company = company; // ✅ Add company filter

      // ✅ Pagination
      const skip = (Number(page) - 1) * Number(limit);

      // ✅ Fetch users
      const users = await User.find(query)
        .select("-password -refreshToken -otp -otpExpires") // Remove sensitive fields
        .skip(skip)
        .limit(Number(limit))
        .populate("company", "name") // Populate company name only
        .lean();
      // ✅ Total count for pagination
      const total = await User.countDocuments(query);
      return res.status(200).json({
        users,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
          limit: Number(limit),
        },
      });
    } catch (error: any) {
      console.error("Error fetching users:", error.message);
      return res.status(500).json({
        message: "Error fetching users",
        error: error.message,
      });
    }
  }

  // Get single user by ID
  static async getUserById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const user = await User.findById(id)
        .select("-password -refreshToken -otp -otpExpires")
        .populate("company", "name")
        .lean();

      if (!user || user.isDelete) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error: any) {
      res.status(500).json({
        message: "Error fetching user",
        error: error.message,
      });
    }
  }

  // Update user
  static async updateUser(req: Request, res: Response) {
    try {
      console.log("api call")
      const { id } = req.params;
      const updateData = req.body;
      console.log("user", id, updateData);

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Prevent updating sensitive fields
      delete updateData.refreshToken;
      delete updateData.otp;
      delete updateData.otpExpires;
      delete updateData.company;
      let hashedPassword:any
      if(updateData?.password){
       hashedPassword = await bcrypt.hash(updateData?.password, 10);
       updateData.password = hashedPassword;
      }
      // If phone is being updated, check for conflicts
      if (updateData.phone) {
        const existingUser = await User.findOne({ phone: updateData.phone });
        if (existingUser && existingUser._id.toString() !== id) {
          return res
            .status(409)
            .json({ message: "Phone number already in use" });
        }
      }

      const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select("-password -refreshToken -otp -otpExpires");

      if (!updatedUser || updatedUser.isDelete) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        message: "User updated successfully",
        user: updatedUser,
      });
    } catch (error: any) {
      res.status(500).json({
        message: "Error updating user",
        error: error.message,
      });
    }
  }

  // Delete user (soft delete)
  static async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const user = await User.findByIdAndUpdate(
        id,
        { $set: { isDelete: true } },
        { new: true }
      ).select("-password -refreshToken -otp -otpExpires");

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        message: "User deleted successfully",
        user,
      });
    } catch (error: any) {
      res.status(500).json({
        message: "Error deleting user",
        error: error.message,
      });
    }
  }

  // Update password
  static async updatePassword(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const user: any = await User.findById(id);
      if (!user || user.isDelete) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ message: "Current password is incorrect" });
      }

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      user.password = hashedPassword;
      await user.save();

      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      res.status(500).json({
        message: "Error updating password",
        error: error.message,
      });
    }
  }
}
