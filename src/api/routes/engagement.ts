import { Router } from "express";
import {
  getEngagementScores,
  calculateEngagementScores,
} from "../../controllers/engagementController.js";
import { requireAuth } from "../../middleware/summaryValidation.js";

const router = Router();

router.get(
  "/sessions/:sessionId/engagement-scores",
  requireAuth,
  getEngagementScores,
);

router.post(
  "/sessions/:sessionId/engagement-scores/calculate",
  requireAuth,
  calculateEngagementScores,
);

export default router;
