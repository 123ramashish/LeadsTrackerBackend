import { Router } from "express";
import { authenticate,authorizeRoles } from "../middlewares/auth.middleware";

import GoalController from "../controller/goal.controller";

const goalRouter = Router();

// ✅ Create goal (for authenticated users, maybe only teamLeader/admin can create for others)
goalRouter.post(
  "/create",
  authenticate,
  GoalController.createGoal
);

// ✅ Get all goals (admin/teamLeader can see all, user sees only their goals)
goalRouter.get(
  "/",
  authenticate,
  GoalController.getGoals
);

// ✅ Get single goal by ID
goalRouter.get(
  "/:id",
  authenticate,
  GoalController.getGoalById
);

// ✅ Update goal
goalRouter.put(
  "/:id",
  authenticate,
  authorizeRoles(["admin", "teamLeader", "user"]),
  GoalController.updateGoal
);

// ✅ Delete goal (admin or teamLeader only)
goalRouter.delete(
  "/:id",
  authenticate,
  authorizeRoles(["admin", "teamLeader"]),
  GoalController.deleteGoal
);

export default goalRouter;
