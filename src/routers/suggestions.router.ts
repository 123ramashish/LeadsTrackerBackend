import { Router } from "express";
import { authenticate, authorizeRoles } from "../middlewares/auth.middleware";
import SuggestionController from "../controller/suggestions.controller";

const suggestionRouter = Router();

// Suggestions
suggestionRouter.post("/", authenticate, SuggestionController.createSuggestion);
suggestionRouter.get("/", authenticate, SuggestionController.getSuggestions);
suggestionRouter.put("/", authenticate, SuggestionController.updateSuggestionLike);
suggestionRouter.post(
  "/adminAction",
  authenticate,
  SuggestionController.updateSuggestionAdmin
);
suggestionRouter.patch("/", authenticate, SuggestionController.updateSuggestion);
suggestionRouter.delete("/", authenticate, SuggestionController.deleteSuggestion);

// Comments
suggestionRouter.get("/comments", authenticate, SuggestionController.getCommentsSuggestions);
suggestionRouter.post("/comments", authenticate, SuggestionController.addCommentSuggestions);
suggestionRouter.put("/comments", authenticate, SuggestionController.updateCommentSuggestions);

export default suggestionRouter;
