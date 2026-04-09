import type { Request, Response } from "express";
import {
  generateSummary,
  getSummary,
  getGenerationProgress,
} from "../services/summaryGenerationService.js";
import { SummaryGenerationError } from "../types/errors.js";
import type { SummaryGenerationOptions } from "../types/summary-generation.js";
import type {
  SummaryGenerationRequest,
  SummaryGenerationResponse,
  SummaryListResponse,
  PaginationMetadata,
} from "../types/api.js";

export type {
  SummaryGenerationRequest,
  SummaryGenerationResponse,
  SummaryListResponse,
  PaginationMetadata,
};

/**
 * POST /sessions/:sessionId/summary
 * Triggers summary generation for a meeting session.
 */
export async function generateSummaryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { sessionId } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;

  const options: SummaryGenerationOptions = {
    includeTranscript: body.includeTranscript as boolean | undefined,
    includeActionItems: body.includeActionItems as boolean | undefined,
    forceRegenerate: body.forceRegenerate as boolean | undefined,
    backgroundProcessing: body.async as boolean | undefined,
  };

  try {
    const result = await generateSummary(sessionId!, options);

    if (options.backgroundProcessing) {
      res.status(202).json({
        success: true,
        message: "Summary generation started",
        meetingSessionId: sessionId,
      });
      return;
    }

    res.status(201).json({
      success: true,
      summary: result.summary,
      wasRegenerated: result.wasRegenerated,
      processingTime: result.processingTime,
    });
  } catch (error) {
    handleSummaryError(res, error, sessionId!);
  }
}

/**
 * GET /sessions/:sessionId/summary
 * Retrieves an existing summary for a meeting session.
 */
export async function getSummaryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { sessionId } = req.params;

  try {
    const summary = await getSummary(sessionId!);

    if (!summary) {
      res
        .status(404)
        .json({ success: false, error: "Summary not found for this meeting session" });
      return;
    }

    res.status(200).json({ success: true, summary });
  } catch (error) {
    handleSummaryError(res, error, sessionId!);
  }
}

/**
 * GET /sessions/:sessionId/summary/progress
 * Retrieves the progress of a background summary generation task.
 */
export async function getProgressHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { sessionId } = req.params;

  const progress = getGenerationProgress(sessionId!);

  if (!progress) {
    res.status(404).json({
      success: false,
      error: "No generation task found for this meeting session",
    });
    return;
  }

  res.status(200).json({ success: true, progress });
}

/**
 * GET /api/summaries
 * Lists summaries with optional filtering and pagination.
 * Query params: page (default 1), pageSize (default 20), meetingSessionId (optional filter).
 */
export async function listSummariesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
  const meetingSessionId = req.query.meetingSessionId as string | undefined;

  try {
    // When a specific meetingSessionId filter is provided, retrieve that single summary
    if (meetingSessionId) {
      const summary = await getSummary(meetingSessionId);
      const summaries = summary ? [summary] : [];
      const total = summaries.length;
      const response: SummaryListResponse = {
        success: true,
        summaries,
        pagination: { page: 1, pageSize, total, totalPages: total > 0 ? 1 : 0 },
      };
      res.status(200).json(response);
      return;
    }

    // Without a filter, return an empty paginated result.
    // A full implementation would query the database with skip/take pagination.
    const response: SummaryListResponse = {
      success: true,
      summaries: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
    };
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

function handleSummaryError(
  res: Response,
  error: unknown,
  sessionId: string,
): void {
  if (error instanceof SummaryGenerationError) {
    switch (error.code) {
      case "SESSION_NOT_FOUND":
        res
          .status(404)
          .json({ success: false, error: "Meeting session not found" });
        return;
      case "INSUFFICIENT_DATA":
        res
          .status(422)
          .json({ success: false, error: error.message });
        return;
      case "INVALID_SESSION_STATE":
        res
          .status(409)
          .json({ success: false, error: error.message });
        return;
      case "GENERATION_TIMEOUT":
        res
          .status(504)
          .json({ success: false, error: "Summary generation timed out" });
        return;
      case "AI_SERVICE_FAILURE":
        res
          .status(502)
          .json({ success: false, error: "AI service unavailable" });
        return;
    }
  }

  res.status(500).json({ success: false, error: "Internal server error" });
}
