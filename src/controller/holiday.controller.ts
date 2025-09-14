import { Request, Response, NextFunction } from "express";
import holidaySchema from "../DataBase/Schema/holiday.schema";
import { DateTime } from "luxon";

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
    company: string;
    timezone?: string; // optional, can default to server TZ
  };
}

export class HolidayController {
  // Create holiday
  static async createHoliday(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { name, date, type, isRecurring, description } = req.body;

      if (!user?.company) {
        return res.status(400).json({ message: "User company missing" });
      }

      if (!name || !date) {
        return res.status(400).json({ message: "Name and date are required" });
      }

      const timezone = user.timezone || DateTime.local().zoneName;

      // Normalize date: convert provided date to UTC while preserving local meaning
      const localDate = DateTime.fromISO(date, { zone: timezone });
      if (!localDate.isValid) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      const holidayData: any = {
        name,
        type: type || "public",
        isRecurring: isRecurring || false,
        description: description || "",
        company: user.company,
        date: localDate.toUTC().toISO(),
      };

      const holiday = new holidaySchema(holidayData);
      const savedHoliday = await holiday.save();

      res.status(201).json(savedHoliday);
    } catch (err) {
      console.error("Create holiday error:", err);
      next(err);
    }
  }

  // Update holiday
  static async updateHoliday(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { id } = req.params;

      if (!user?.company) {
        return res.status(400).json({ message: "User company missing" });
      }

      const updateData = { ...req.body };

      if (updateData.date) {
        const timezone = user.timezone || DateTime.local().zoneName;
        const localDate = DateTime.fromISO(updateData.date, { zone: timezone });
        if (!localDate.isValid) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        updateData.date = localDate.toUTC().toISO();
      }

      const updatedHoliday = await holidaySchema.findOneAndUpdate(
        { _id: id, company: user.company },
        updateData,
        { new: true, runValidators: true }
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
  static async getAllHolidays(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.company) {
        return res.status(400).json({ message: "User company missing" });
      }

      const holidays = await holidaySchema
        .find({ company: user.company })
        .sort({ date: 1 });

      res.status(200).json(holidays);
    } catch (err) {
      console.error("Get holidays error:", err);
      next(err);
    }
  }

  // Get holiday by ID
  static async getHolidayById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { id } = req.params;

      if (!user?.company) {
        return res.status(400).json({ message: "User company missing" });
      }

      const holiday = await holidaySchema.findOne({ _id: id, company: user.company });

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
  static async deleteHoliday(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { id } = req.params;

      if (!user?.company) {
        return res.status(400).json({ message: "User company missing" });
      }

      const deletedHoliday = await holidaySchema.findOneAndDelete({
        _id: id,
        company: user.company,
      });

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
