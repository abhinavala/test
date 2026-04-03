import { Router } from "express";
import { exportController } from "../../controllers/exportController.js";

const router = Router();

/**
 * POST /api/exports — Generate a new export.
 */
router.post("/", (req, res, next) => {
  exportController.generateExport(req, res, next).catch(next);
});

/**
 * GET /api/exports/:sessionId/:format — Retrieve a specific export by session and format.
 */
router.get("/:sessionId/:format", (req, res, next) => {
  exportController.getExport(req, res, next).catch(next);
});

/**
 * GET /api/exports/:sessionId — List export history for a session.
 */
router.get("/:sessionId", (req, res, next) => {
  exportController.getExportHistory(req, res, next).catch(next);
});

export default router;
