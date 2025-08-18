import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import LeadController from "../controller/lead.controller";

const leadRouter = Router();

leadRouter.post("/", authenticate, LeadController.createLead);
leadRouter.get("/", authenticate, LeadController.getLeads);
leadRouter.put("/assign", authenticate, LeadController.assignLeads);

export default leadRouter;
