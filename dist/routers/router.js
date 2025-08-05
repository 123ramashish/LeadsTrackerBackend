"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_router_1 = __importDefault(require("./user.router"));
const registration_router_1 = __importDefault(require("./registration.router"));
const auth_router_1 = __importDefault(require("./auth.router"));
const task_router_1 = __importDefault(require("./task.router"));
const router = (0, express_1.Router)();
router.use("/user", user_router_1.default);
router.use("/registration", registration_router_1.default);
router.use("/auth", auth_router_1.default);
router.use("/task", task_router_1.default);
exports.default = router;
