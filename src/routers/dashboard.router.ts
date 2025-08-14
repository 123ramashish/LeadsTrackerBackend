import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import DashboardController from "../controller/dashboard.controller";

const dashboardRouter = Router();



// ✅ Get 
dashboardRouter.get(
  "/dashboard",
  authenticate,
  DashboardController.getDashboardData
);


export default dashboardRouter;
