import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import Request from 'express';
import SaveSubscription from "../controller/save.subscription";


const subscriptionRouter = Router();
subscriptionRouter.use("/save",SaveSubscription.SaveSubscription)
export default subscriptionRouter;