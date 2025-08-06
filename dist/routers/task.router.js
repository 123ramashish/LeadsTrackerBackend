"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const task_controller_1 = __importDefault(require("../controller/task.controller"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const taskController = new task_controller_1.default();
const taskRouter = (0, express_1.Router)();
taskRouter.post("/create", auth_middleware_1.authenticate, taskController.createTask.bind(taskController));
// Future endpoints
// taskRouter.get("/:id", taskController.getTaskById);
// taskRouter.put("/:id",  taskController.updateTask);
// taskRouter.delete("/:id",  taskController.deleteTask);
exports.default = taskRouter;
