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
taskRouter.get("/", auth_middleware_1.authenticate, taskController.getAllTask);
taskRouter.get("/totalTaskAmountTime", auth_middleware_1.authenticate, taskController.getTaskAmountTime);
taskRouter.get("/message", auth_middleware_1.authenticate, taskController.getTaskMessages);
taskRouter.put("/status", auth_middleware_1.authenticate, taskController.updateTaskStatus);
taskRouter.put("/status", auth_middleware_1.authenticate, taskController.updateTaskStatus);
taskRouter.post("/message", auth_middleware_1.authenticate, taskController.addTaskMessage);
taskRouter.get("/:userId", auth_middleware_1.authenticate, taskController.getTaskById);
taskRouter.put("/timeline", taskController.updateTaskTimeline);
// taskRouter.delete("/:id",  taskController.deleteTask);
exports.default = taskRouter;
