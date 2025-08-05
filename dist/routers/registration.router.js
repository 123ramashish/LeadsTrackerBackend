"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const registration_controller_1 = __importDefault(require("../controller/registration.controller"));
const router = (0, express_1.Router)();
const registrationController = new registration_controller_1.default();
router.post("/register", registrationController.registerCompany);
router.post("/signin", registrationController.companySignin);
router.post("/signout", registrationController.companySignout);
exports.default = router;
