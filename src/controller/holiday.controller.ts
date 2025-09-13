import { Request, Response, NextFunction } from "express";
import holidaySchema from "../DataBase/Schema/holiday.schema";

export class HolidayController {
  // Create holiday
  static async createHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, date, type, isRecurring, company, description } = req.body;
      console.log("body", req.body);
      // Validate required fields
      if (!name || !date) {
        return res.status(400).json({
          message: "Name and date are required fields",
        });
      }

      const holidayData: any = {
        name,
        date,
        type: type || "public",
        isRecurring: isRecurring || false,
        description: description || "",
      };

      // Only add company if it's provided and not empty
      if (company && company.trim()) {
        holidayData.company = company;
      }

      const holiday = new holidaySchema(holidayData);
      const savedHoliday = await holiday.save();

      res.status(201).json(savedHoliday);
    } catch (err) {
      console.error("Create holiday error:", err);
      next(err);
    }
  }

  // Update holiday
  static async updateHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };

      // Remove empty company field to avoid validation issues
      if (updateData.company === "") {
        delete updateData.company;
      }

      const updatedHoliday = await holidaySchema.findByIdAndUpdate(
        id,
        updateData,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!updatedHoliday) {
        return res.status(404).json({ message: "Holiday not found" });
      }

      res.status(200).json(updatedHoliday);
    } catch (err) {
      console.error("Update holiday error:", err);
      next(err);
    }
  }

  // Get all holidays
  static async getAllHolidays(req: Request, res: Response, next: NextFunction) {
    try {
      const holidays = await holidaySchema
        .find()
        .populate("company", "name")
        .sort({ date: 1 });

      res.status(200).json(holidays);
    } catch (err) {
      console.error("Get holidays error:", err);
      next(err);
    }
  }

  // Get holiday by ID
  static async getHolidayById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const holiday = await holidaySchema
        .findById(id)
        .populate("company", "name");

      if (!holiday) {
        return res.status(404).json({ message: "Holiday not found" });
      }

      res.status(200).json(holiday);
    } catch (err) {
      console.error("Get holiday by ID error:", err);
      next(err);
    }
  }

  // Delete holiday
  static async deleteHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const deletedHoliday = await holidaySchema.findByIdAndDelete(id);

      if (!deletedHoliday) {
        return res.status(404).json({ message: "Holiday not found" });
      }

      res.status(200).json({
        message: "Holiday deleted successfully",
        holiday: deletedHoliday,
      });
    } catch (err) {
      console.error("Delete holiday error:", err);
      next(err);
    }
  }
}
