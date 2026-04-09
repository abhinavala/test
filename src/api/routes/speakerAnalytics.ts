import { Router } from "express";
import { getSpeakerStatsHandler } from "../../controllers/speakerAnalyticsController.js";

const router = Router();

router.get("/sessions/:sessionId/speaker-stats", getSpeakerStatsHandler);

export default router;
