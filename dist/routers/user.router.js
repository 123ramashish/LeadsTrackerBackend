"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const user_controller_1 = __importDefault(require("../controller/user.controller"));
const userRouter = (0, express_1.Router)();
// Create user (admin only)
userRouter.post("/create", auth_middleware_1.authenticate, (0, auth_middleware_1.authorizeRoles)(["admin", "teamLeader"]), user_controller_1.default.createUser);
// Get all users (admin and team leaders)
userRouter.get("/", auth_middleware_1.authenticate, user_controller_1.default.getUsers);
// Get single user
userRouter.get("/:id", auth_middleware_1.authenticate, user_controller_1.default.getUserById);
// Update user
userRouter.put("/:id", auth_middleware_1.authenticate, user_controller_1.default.updateUser);
// Delete user (admin only)
userRouter.delete("/:id", auth_middleware_1.authenticate, (0, auth_middleware_1.authorizeRoles)(["admin"]), user_controller_1.default.deleteUser);
// Update password
userRouter.put("/:id/password", auth_middleware_1.authenticate, user_controller_1.default.updatePassword);
exports.default = userRouter;
