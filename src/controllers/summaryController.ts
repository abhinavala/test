import type { Request, Response } from "express";
import {
  generateSummary,
  getSummary,
  getGenerationProgress,
} from "../services/summaryGenerationService.js";
import { SummaryGenerationError } from "../types/errors.js";
import type { SummaryGenerationOptions } from "../types/summary-generation.js";

export interface SummaryGenerationRequest {
  meetingSessionId: string;
  includeTranscript?: boolean;
  includeActionItems?: boolean;
}

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
