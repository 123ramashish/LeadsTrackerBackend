import { Router, Request, Response } from "express";

const taskRouter = Router();

taskRouter.post("/create-task", (req: Request, res: Response) => {
  res.json({ message: "Task created successfully!" });
});

export default taskRouter;
