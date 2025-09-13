import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { HolidayController } from "../controller/holiday.controller";

const holidayRouter = Router();

// Create holiday
holidayRouter.post("/", authenticate,HolidayController.createHoliday);

// Get all holidays
holidayRouter.get("/", authenticate,HolidayController.getAllHolidays);

// Get holiday by ID
holidayRouter.get("/:id", authenticate,HolidayController.getHolidayById);

// Update holiday
holidayRouter.put("/:id", authenticate,HolidayController.updateHoliday);

// Delete holiday
holidayRouter.delete("/:id", authenticate,HolidayController.deleteHoliday);

export default holidayRouter;
