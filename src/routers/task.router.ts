import { Router } from "express";
import TaskController from "../controller/task.controller";

const taskController = new TaskController();
const taskRouter = Router();

taskRouter.post("/create", taskController.createTask.bind(taskController));
// Future endpoints
// taskRouter.get("/:id", taskController.getTaskById);
// taskRouter.put("/:id",  taskController.updateTask);
// taskRouter.delete("/:id",  taskController.deleteTask);

export default taskRouter;
