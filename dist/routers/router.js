"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_router_1 = __importDefault(require("./user.router"));
const registration_router_1 = __importDefault(require("./registration.router"));
const auth_router_1 = __importDefault(require("./auth.router"));
const notification_router_1 = __importDefault(require("./notification.router"));
const router = (0, express_1.Router)();
router.use("/users", user_router_1.default);
router.use("/companies", registration_router_1.default);
router.use("/auth", auth_router_1.default);
router.use("/notifications", notification_router_1.default);
router.use("/", (req, res) => {
    res.status(200).json({ message: "Welcome to the Task Management API!" });
});
exports.default = router;
//# sourceMappingURL=router.js.map