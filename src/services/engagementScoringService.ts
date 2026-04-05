import type { ParticipantEngagementScore } from "../types/engagement.js";

/**
 * Error thrown when engagement scoring calculation fails.
 */
export class EngagementScoringError extends Error {
  readonly code: string;
  readonly sessionId?: string;

  constructor(message: string, code: string, sessionId?: string) {
    super(message);
    this.name = "EngagementScoringError";
    this.code = code;
    this.sessionId = sessionId;
  }
}

/** Weights for each engagement component (must sum to 1.0). */
const WEIGHTS = {
  talkTimeRatio: 0.3,
  questionCount: 0.25,
  responseRate: 0.25,
  sentimentScore: 0.2,
} as const;

/** Input data for a single participant's engagement calculation. */
export interface ParticipantInput {
  participantId: string;
  /** Total talk time in milliseconds for this participant. */
  talkTimeMs: number;
  /** Number of questions asked by this participant. */
  questionCount: number;
  /** Number of questions directed at this participant. */
  questionsReceived: number;
  /** Number of those questions that were answered. */
  questionsAnswered: number;
  /** Sentiment score from -1 (negative) to 1 (positive). */
  sentimentScore: number;
}

/** Input for calculating engagement scores for a session. */
export interface EngagementCalculationInput {
  sessionId: string;
  participants: ParticipantInput[];
  /** Total session duration in milliseconds. */
  totalDurationMs: number;
}

/** Result of a single participant's engagement calculation. */
export interface EngagementMetrics {
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
}

/**
 * Round a number to four decimal places.
 */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate the talk time ratio score (0-100) for a participant.
 *
 * A balanced talk time (equal share among participants) yields the highest score.
 * Participants who dominate or are silent score lower.
 */
function calculateTalkTimeScore(
  talkTimeMs: number,
  totalDurationMs: number,
  participantCount: number
): number {
  if (totalDurationMs <= 0 || participantCount <= 0) {
    return 0;
  }

  const ratio = talkTimeMs / totalDurationMs;
  const idealRatio = 1 / participantCount;

  // Score based on how close to the ideal ratio
  // Deviation of 0 => score 100, deviation of idealRatio => score 0
  const deviation = Math.abs(ratio - idealRatio);
  const maxDeviation = Math.max(idealRatio, 1 - idealRatio);
  const score = Math.max(0, 100 * (1 - deviation / maxDeviation));

  return score;
}

/**
 * Calculate the question count score (0-100).
 *
 * Having at least a few questions yields a high score. The score increases
 * with more questions up to a reasonable cap.
 */
function calculateQuestionScore(questionCount: number): number {
  if (questionCount <= 0) {
    return 0;
  }
  // Logarithmic scale: 1 question ~33, 3 questions ~63, 5+ questions ~80+
  // Cap at 100 for ~10+ questions
  const score = Math.min(100, 100 * (Math.log(questionCount + 1) / Math.log(11)));
  return score;
}

/**
 * Calculate the response rate score (0-100).
 *
 * Based on the fraction of received questions that were answered.
 * If no questions were received, returns a neutral score (50).
 */
function calculateResponseRateScore(
  questionsAnswered: number,
  questionsReceived: number
): number {
  if (questionsReceived <= 0) {
    return 50; // Neutral — no questions to respond to
  }
  const rate = clamp(questionsAnswered / questionsReceived, 0, 1);
  return rate * 100;
}

/**
 * Calculate the sentiment score (0-100).
 *
 * Maps sentiment from [-1, 1] to [0, 100].
 * Missing or NaN sentiment defaults to neutral (50).
 */
function calculateSentimentScoreNormalized(sentimentScore: number): number {
  if (!Number.isFinite(sentimentScore)) {
    return 50; // Neutral for missing data
  }
  const clamped = clamp(sentimentScore, -1, 1);
  return ((clamped + 1) / 2) * 100;
}

/**
 * Calculate the engagement metrics for a single participant.
 */
export function calculateParticipantMetrics(
  participant: ParticipantInput,
  totalDurationMs: number,
  participantCount: number
): EngagementMetrics {
  const talkTimeRatio = totalDurationMs > 0
    ? round4(participant.talkTimeMs / totalDurationMs)
    : 0;

  const responseRate = participant.questionsReceived > 0
    ? round4(participant.questionsAnswered / participant.questionsReceived)
    : 0;

  return {
    talkTimeRatio,
    questionCount: participant.questionCount,
    responseRate,
    sentimentScore: round4(clamp(participant.sentimentScore, -1, 1)),
  };
}

/**
 * Calculate the weighted engagement score (0-100) for a single participant.
 */
export function calculateEngagementScore(
  participant: ParticipantInput,
  totalDurationMs: number,
  participantCount: number
): number {
  const talkTimeScore = calculateTalkTimeScore(
    participant.talkTimeMs,
    totalDurationMs,
    participantCount
  );
  const questionScore = calculateQuestionScore(participant.questionCount);
  const responseRateScore = calculateResponseRateScore(
    participant.questionsAnswered,
    participant.questionsReceived
  );
  const sentimentScoreNorm = calculateSentimentScoreNormalized(
    participant.sentimentScore
  );

  const weighted =
    WEIGHTS.talkTimeRatio * talkTimeScore +
    WEIGHTS.questionCount * questionScore +
    WEIGHTS.responseRate * responseRateScore +
    WEIGHTS.sentimentScore * sentimentScoreNorm;

  return Math.round(clamp(weighted, 0, 100));
}

/**
 * Calculate engagement scores for all participants in a session.
 *
 * Returns an array of ParticipantEngagementScore objects.
 */
export function calculateSessionEngagement(
  input: EngagementCalculationInput
): ParticipantEngagementScore[] {
  if (!input.sessionId) {
    throw new EngagementScoringError(
      "sessionId is required",
      "INVALID_INPUT"
    );
  }

  if (!input.participants || input.participants.length === 0) {
    return [];
  }

  const now = new Date();
  const participantCount = input.participants.length;

  return input.participants.map((participant) => {
    const metrics = calculateParticipantMetrics(
      participant,
      input.totalDurationMs,
      participantCount
    );

    const score = calculateEngagementScore(
      participant,
      input.totalDurationMs,
      participantCount
    );

    return {
      id: `${input.sessionId}-${participant.participantId}`,
      sessionId: input.sessionId,
      participantId: participant.participantId,
      score,
      talkTimeRatio: metrics.talkTimeRatio,
      questionCount: metrics.questionCount,
      responseRate: metrics.responseRate,
      sentimentScore: metrics.sentimentScore,
      calculatedAt: now,
    };
  });
}

export const engagementScoringService = {
  calculateEngagementScore,
  calculateParticipantMetrics,
  calculateSessionEngagement,
};
