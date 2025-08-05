import { Router, Request, Response } from "express";

const userRouter = Router();

// Example route
userRouter.post("/create-user", (req: Request, res: Response) => {
  res.json({ message: "User created successfully!" });
});

export default userRouter;
