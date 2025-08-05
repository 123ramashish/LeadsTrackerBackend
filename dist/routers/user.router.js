"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userRouter = (0, express_1.Router)();
// Example route
userRouter.post("/create-user", (req, res) => {
    res.json({ message: "User created successfully!" });
});
exports.default = userRouter;
