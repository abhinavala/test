import type { Request, Response } from "express";
import {
  getEngagementScoresBySession,
  getEngagementScoreByParticipant,
  bulkSaveEngagementScores,
  EngagementCalculationError,
} from "../models/participantEngagementScore.js";
import {
  calculateSessionEngagement,
} from "../services/engagementScoringService.js";
import type {
  GetEngagementScoresResponse,
  CalculateEngagementResponse,
} from "../types/api.js";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isValidSessionId(sessionId: string): boolean {
  return sessionId.length > 0 && sessionId.length <= 256 && SESSION_ID_PATTERN.test(sessionId);
}

export async function getEngagementScores(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;

  if (!sessionId || !isValidSessionId(sessionId)) {
    res.status(400).json({ success: false, error: "Invalid sessionId format" });
    return;
  }

  const participantId = req.query.participantId as string | undefined;

  try {
    if (participantId) {
      const score = await getEngagementScoreByParticipant(sessionId, participantId);

      if (!score) {
        res.status(404).json({ success: false, error: "Session not found" });
        return;
      }

      const response: GetEngagementScoresResponse = {
        success: true,
        sessionId,
        scores: [score],
      };
      res.status(200).json(response);
      return;
    }

    const scores = await getEngagementScoresBySession(sessionId);

    if (scores.length === 0) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }

    const response: GetEngagementScoresResponse = {
      success: true,
      sessionId,
      scores,
    };
    res.status(200).json(response);
  } catch (error) {
    if (error instanceof EngagementCalculationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function calculateEngagementScores(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;

  if (!sessionId || !isValidSessionId(sessionId)) {
    res.status(400).json({ success: false, error: "Invalid sessionId format" });
    return;
  }

  const { segments, sessionDuration, sentimentScores } = req.body as {
    segments?: unknown[];
    sessionDuration?: number;
    sentimentScores?: Record<string, number>;
  };

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    res.status(400).json({ success: false, error: "segments is required and must be a non-empty array" });
    return;
  }

  if (typeof sessionDuration !== "number" || sessionDuration <= 0) {
    res.status(400).json({ success: false, error: "sessionDuration is required and must be a positive number" });
    return;
  }

  try {
    const sentimentMap = sentimentScores
      ? new Map(Object.entries(sentimentScores))
      : undefined;

    const result = await calculateSessionEngagement({
      sessionId,
      segments: segments as import("../types/transcript.js").TranscriptSegment[],
      sessionDuration,
      sentimentScores: sentimentMap,
    });

    const savedScores = await bulkSaveEngagementScores(
      result.participantScores.map((s) => ({
        sessionId: s.sessionId,
        participantId: s.participantId,
        score: s.score,
        talkTimeRatio: s.talkTimeRatio,
        questionCount: s.questionCount,
        responseRate: s.responseRate,
        sentimentScore: s.sentimentScore,
      }))
    );

    const response: CalculateEngagementResponse = {
      success: true,
      sessionId,
      scores: savedScores,
      summary: {
        averageScore: result.averageScore,
        participantCount: savedScores.length,
        calculatedAt: result.calculatedAt,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof EngagementCalculationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}
