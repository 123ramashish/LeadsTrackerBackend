import { Router } from "express";
import TaskController from "../controller/task.controller";
import { authenticate } from "../middlewares/auth.middleware";

const taskController = new TaskController();
const taskRouter = Router();

taskRouter.post("/create",authenticate,taskController.createTask.bind(taskController));
// Future endpoints
taskRouter.get("/bucket",authenticate, taskController.getTaskBucket);
taskRouter.get("/", authenticate,taskController.getAllTask);
taskRouter.get("/totalTaskAmountTime", authenticate,taskController.getTaskAmountTime);
taskRouter.get("/message", authenticate,taskController.getTaskMessages); 
taskRouter.put("/status", authenticate, taskController.updateTaskStatus);
taskRouter.put("/status", authenticate, taskController.updateTaskStatus);
taskRouter.post("/message", authenticate,taskController.addTaskMessage); 
taskRouter.get("/:userId",authenticate, taskController.getTaskById);
taskRouter.put("/timeline", authenticate, taskController.updateTaskTimeline);
taskRouter.put("/details", authenticate, taskController.updateTaskDetails);
taskRouter.put("/individualBucket", authenticate, taskController.individualBucket);
taskRouter.put("/companyBucket", authenticate, taskController.companyBucket);
taskRouter.put("/bucketShift", authenticate, taskController.bucketShift);
taskRouter.put("/estimatedTime", authenticate, taskController.estimatedTimeUpdate);
taskRouter.put("/tags", authenticate, taskController.updateTags);

// taskRouter.delete("/:id",  taskController.deleteTask);

export default taskRouter;
