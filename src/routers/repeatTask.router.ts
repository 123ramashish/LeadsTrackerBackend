import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import RepeatTaskController from "../controller/repeatTask.controller";

const repeatTaskController = new RepeatTaskController();

const repeatTaskRouter = Router();

// Use instance method, properly bound
repeatTaskRouter.post(
  "/create",
  authenticate,
  repeatTaskController.createTask.bind(repeatTaskController)
);

// Future endpoints
repeatTaskRouter.get("/", authenticate,repeatTaskController.getAllRepeatTask.bind(repeatTaskController));
// repeatTaskRouter.get("/:id", repeatTaskController.getTaskById.bind(repeatTaskController));
// repeatTaskRouter.put("/:id", repeatTaskController.updateTask.bind(repeatTaskController));
// repeatTaskRouter.delete("/:id", repeatTaskController.deleteTask.bind(repeatTaskController));

export default repeatTaskRouter;
