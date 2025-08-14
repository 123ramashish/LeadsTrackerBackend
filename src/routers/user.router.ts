import { Router } from "express";
import { authenticate,authorizeRoles } from "../middlewares/auth.middleware";
import UserController from "../controller/user.controller";

const userRouter = Router();

// Create user (admin only)
userRouter.post(
  "/create",
  authenticate,
  authorizeRoles(["admin","teamLeader"]),
  UserController.createUser
);

// Get all users (admin and team leaders)
userRouter.get(
  "/",
  authenticate,
  authorizeRoles(["admin", "teamLeader"]),
  UserController.getUsers
);

// Get single user
userRouter.get(
  "/:id",
  authenticate,
  UserController.getUserById
);

// Update user
userRouter.put(
  "/:id",
  authenticate,
  UserController.updateUser
);

// Delete user (admin only)
userRouter.delete(
  "/:id",
  authenticate,
  authorizeRoles(["admin"]),
  UserController.deleteUser
);

// Update password
userRouter.put(
  "/:id/password",
  authenticate,
  UserController.updatePassword
);

export default userRouter;