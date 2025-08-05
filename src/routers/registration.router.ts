import { Router } from "express";
import RegistrationController from "../controller/registration.controller";

const router = Router();
const registrationController = new RegistrationController();

router.post("/register",  registrationController.registerCompany);
router.post("/signin", registrationController.companySignin);
router.post("/signout", registrationController.companySignout);

export default router;
