import { Router } from "express";
import { getEngagementScores } from "../../controllers/engagementController.js";
import { requireAuth } from "../../middleware/summaryValidation.js";

const router = Router();

router.get(
  "/sessions/:sessionId/engagement-scores",
  requireAuth,
  getEngagementScores,
);

export default router;
