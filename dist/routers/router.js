"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_router_1 = __importDefault(require("./notification.router"));
const user_router_1 = require("./user.router");
const auth_router_1 = require("./auth.router");
const company_router_1 = require("./company.router");
const chat_router_1 = __importDefault(require("./chat.router"));
const lead_router_1 = __importDefault(require("./lead.router"));
const router = (0, express_1.Router)();
router.use("/users", user_router_1.userRouter);
router.use("/companies", company_router_1.companyRouter);
router.use("/auth", auth_router_1.authRouter);
router.use("/chat", chat_router_1.default);
router.use("/leads", lead_router_1.default);
router.use("/notifications", notification_router_1.default);
router.use("/", (req, res) => {
    res.status(200).json({ message: "Welcome to the Task Management API!" });
});
exports.default = router;
