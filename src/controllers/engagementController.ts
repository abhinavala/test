import type { Request, Response } from "express";
import {
  getEngagementScoresBySession,
  getEngagementScoreByParticipant,
} from "../models/participantEngagementScore.js";
import type { ParticipantEngagementScore } from "../types/engagement.js";
import type {
  GetEngagementScoresResponse,
  EngagementScoreSummary,
} from "../types/api.js";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isValidSessionId(sessionId: string): boolean {
  return sessionId.length > 0 && sessionId.length <= 256 && SESSION_ID_PATTERN.test(sessionId);
}

function buildSummary(scores: ParticipantEngagementScore[]): EngagementScoreSummary {
  const scoreValues = scores.map((s) => s.score);
  return {
    averageScore: Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 100) / 100,
    highestScore: Math.max(...scoreValues),
    lowestScore: Math.min(...scoreValues),
    participantCount: scores.length,
  };
}

export async function getEngagementScores(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;

  if (!sessionId || !isValidSessionId(sessionId)) {
    res.status(400).json({ success: false, error: "Invalid sessionId format" });
    return;
  }

  const participantId = req.query.participantId as string | undefined;

  try {
    let scores: ParticipantEngagementScore[];

    if (participantId) {
      const score = await getEngagementScoreByParticipant(sessionId, participantId);
      scores = score ? [score] : [];
    } else {
      scores = await getEngagementScoresBySession(sessionId);
    }

    if (scores.length === 0) {
      res.status(404).json({
        success: false,
        error: `Engagement scores not found for session: ${sessionId}`,
      });
      return;
    }

    const response: GetEngagementScoresResponse = {
      success: true,
      scores,
      summary: buildSummary(scores),
    };

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}
