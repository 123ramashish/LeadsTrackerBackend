import { Router } from "express";
import notificationRouter from "./notification.router";
import { authenticate } from "../middlewares/auth.middleware";
import { userRouter } from "./user.router";
import { authRouter } from "./auth.router";
import { companyRouter } from "./company.router";
import chatRouter from "./chat.router";
import leadRouter from "./lead.router";
import { feedbackRouter } from "./feedback.router";
import whatsappTemplateRouter from "./whatsappTemplate.router";
import scrapperrouter from "./scraper.routes";
import { googleSyncRouter } from "./google-sync.routes";
import { whatsappConnectionRouter } from "./whatsappconnection.router";
import slotRouter from "./slot.router";

const router = Router();

router.use("/companies", companyRouter);
router.use("/users", userRouter);
router.use("/auth", authRouter);
router.use("/chat", chatRouter);
router.use("/leads", leadRouter);
router.use("/scrapper", scrapperrouter);
router.use("/whatsapp-templates", whatsappTemplateRouter);
router.use("/whatsapp-connections", whatsappConnectionRouter);
router.use("/whatsappslotbooking",slotRouter);
router.use("/feedback", feedbackRouter);
router.use("/notifications", notificationRouter);
router.use('/google-sync', googleSyncRouter); 


router.use("/", (req, res) => {
  res.status(200).json({ message: "Welcome to the Task Management API!" });
});
export default router;
