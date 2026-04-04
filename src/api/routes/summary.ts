import { Router } from "express";
import {
  generateSummaryHandler,
  getSummaryHandler,
  getProgressHandler,
  listSummariesHandler,
} from "../../controllers/summaryController.js";
import {
  validateSessionId,
  validateGenerateBody,
  requireAuth,
} from "../../middleware/summaryValidation.js";

const router = Router();

router.get(
  "/api/summaries",
  requireAuth,
  listSummariesHandler,
);

router.post(
  "/sessions/:sessionId/summary",
  requireAuth,
  validateSessionId,
  validateGenerateBody,
  generateSummaryHandler,
);

router.get(
  "/sessions/:sessionId/summary",
  requireAuth,
  validateSessionId,
  getSummaryHandler,
);

router.get(
  "/sessions/:sessionId/summary/progress",
  requireAuth,
  validateSessionId,
  getProgressHandler,
);

export default router;
