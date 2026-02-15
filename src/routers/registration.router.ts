import { Router } from "express";
import RegistrationController from "../controller/registration.controller";

const router = Router();
const registrationController = new RegistrationController();

router.post("/register",  registrationController.register);

export default router;
