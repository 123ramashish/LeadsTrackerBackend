"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const taskRouter = (0, express_1.Router)();
taskRouter.post("/create-task", (req, res) => {
    res.json({ message: "Task created successfully!" });
});
exports.default = taskRouter;
