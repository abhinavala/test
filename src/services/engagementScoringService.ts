import type { ParticipantEngagementScore } from "../types/engagement.js";
import type { TranscriptSegment } from "../types/transcript.js";

/**
 * Error thrown when engagement score calculation fails.
 */
export class EngagementCalculationError extends Error {
  readonly code: string;
  readonly sessionId?: string;

  constructor(message: string, code: string, sessionId?: string) {
    super(message);
    this.name = "EngagementCalculationError";
    this.code = code;
    this.sessionId = sessionId;
  }
}

/** Weights for each component of the engagement score. */
export interface EngagementWeights {
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
}

/** Input for calculating a single participant's engagement score. */
export interface EngagementCalculationInput {
  sessionId: string;
  participantId: string;
  segments: TranscriptSegment[];
  sessionDuration: number;
  sentimentScore?: number;
  weights?: EngagementWeights;
}

/** Input for calculating engagement scores for an entire session. */
export interface SessionEngagementInput {
  sessionId: string;
  segments: TranscriptSegment[];
  sessionDuration: number;
  sentimentScores?: Map<string, number>;
  weights?: EngagementWeights;
}

/** Summary of engagement scores for a session. */
export interface SessionEngagementSummary {
  sessionId: string;
  averageScore: number;
  participantScores: ParticipantEngagementScore[];
  calculatedAt: Date;
}

const DEFAULT_WEIGHTS: EngagementWeights = {
  talkTimeRatio: 0.25,
  questionCount: 0.25,
  responseRate: 0.25,
  sentimentScore: 0.25,
};

/**
 * Round a number to two decimal places.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Clamp a value between 0 and 100.
 */
function clamp0to100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Calculate the talk time ratio for a participant.
 * Returns the raw ratio of participant talk time to session duration.
 */
export function calculateTalkTimeRatio(
  participantTalkTime: number,
  sessionDuration: number
): number {
  if (sessionDuration <= 0) return 0;
  return round2(participantTalkTime / sessionDuration);
}

/**
 * Calculate the response score for a participant (0-100 scale).
 * Based on how often the participant responds when spoken to by others.
 */
export function calculateResponseScore(
  segments: TranscriptSegment[],
  participantId: string
): number {
  const rate = calculateResponseRate(segments, participantId);
  return calculateResponseRateScore(rate);
}

/**
 * Calculate the final weighted engagement score from component scores.
 * Each component is on a 0-100 scale. Result is clamped to 0-100.
 */
export function calculateFinalScore(
  components: {
    talkTimeScore: number;
    questionScore: number;
    responseRateScore: number;
    sentimentScore: number;
  },
  weights: EngagementWeights = DEFAULT_WEIGHTS
): number {
  return round2(clamp0to100(
    components.talkTimeScore * weights.talkTimeRatio +
    components.questionScore * weights.questionCount +
    components.responseRateScore * weights.responseRate +
    components.sentimentScore * weights.sentimentScore
  ));
}

/**
 * Calculate the talk time score for a participant (0-100 scale).
 * A balanced talk time relative to session duration scores higher.
 * Optimal ratio depends on number of participants.
 */
function calculateTalkTimeScore(
  participantTalkTime: number,
  sessionDuration: number,
  totalParticipants: number
): number {
  if (sessionDuration <= 0 || totalParticipants <= 0) return 0;
  if (participantTalkTime <= 0) return 0;

  const ratio = participantTalkTime / sessionDuration;
  const idealRatio = 1 / totalParticipants;

  // Score based on how close to ideal ratio. Perfect = 100, 0 talk = 0.
  // Use a bell curve centered on ideal ratio, but also reward any participation.
  const deviation = Math.abs(ratio - idealRatio) / idealRatio;
  const balanceScore = Math.max(0, 1 - deviation) * 100;

  // Also factor in raw participation (having some talk time is good)
  const participationScore = Math.min(ratio / idealRatio, 1) * 100;

  return round2((balanceScore * 0.6 + participationScore * 0.4));
}

/**
 * Calculate question score (0-100 scale).
 * More questions indicate higher engagement, with diminishing returns.
 */
function calculateQuestionScore(questionCount: number): number {
  if (questionCount <= 0) return 0;
  // Logarithmic scaling: 1 question = ~43, 3 = ~69, 5 = ~80, 10 = ~100
  const score = Math.log(questionCount + 1) / Math.log(11) * 100;
  return round2(clamp0to100(score));
}

/**
 * Calculate response rate score (0-100 scale).
 * responseRate is already 0-1, so scale to 0-100.
 */
function calculateResponseRateScore(responseRate: number): number {
  return round2(clamp0to100(responseRate * 100));
}

/**
 * Calculate sentiment score component (0-100 scale).
 * Input sentiment is expected on a -1 to 1 scale, mapped to 0-100.
 */
function calculateSentimentScoreComponent(sentiment: number): number {
  // Map -1..1 to 0..100
  const score = ((sentiment + 1) / 2) * 100;
  return round2(clamp0to100(score));
}

/**
 * Count questions in transcript segments for a given participant.
 * A question is identified by a sentence ending with '?'.
 */
function countQuestions(
  segments: TranscriptSegment[],
  participantId: string
): number {
  let count = 0;
  for (const segment of segments) {
    if (segment.speakerId === participantId) {
      const sentences = segment.text.split(/[.!?]+/).length - 1;
      const questions = (segment.text.match(/\?/g) ?? []).length;
      count += questions;
    }
  }
  return count;
}

/**
 * Calculate the response rate for a participant.
 * Measures how often a participant responds when spoken to (i.e., speaks after another participant).
 */
function calculateResponseRate(
  segments: TranscriptSegment[],
  participantId: string
): number {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);

  let opportunities = 0;
  let responses = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    // When another participant finishes speaking, it's an opportunity for our participant
    if (prev.speakerId !== participantId) {
      opportunities++;
      if (curr.speakerId === participantId) {
        responses++;
      }
    }
  }

  if (opportunities === 0) return 0;
  return round2(responses / opportunities);
}

/**
 * Calculate the total talk time for a participant in milliseconds.
 */
function calculateParticipantTalkTime(
  segments: TranscriptSegment[],
  participantId: string
): number {
  let total = 0;
  for (const segment of segments) {
    if (segment.speakerId === participantId) {
      total += segment.endTime - segment.startTime;
    }
  }
  return total;
}

/**
 * Get the set of unique participant IDs from segments.
 */
function getUniqueParticipants(segments: TranscriptSegment[]): string[] {
  return [...new Set(segments.map((s) => s.speakerId))];
}

/**
 * Validate engagement calculation input.
 */
function validateInput(input: EngagementCalculationInput): void {
  if (!input.sessionId || typeof input.sessionId !== "string") {
    throw new EngagementCalculationError(
      "Invalid or missing sessionId",
      "INVALID_SESSION_ID"
    );
  }

  if (!input.participantId || typeof input.participantId !== "string") {
    throw new EngagementCalculationError(
      "Invalid or missing participantId",
      "INVALID_PARTICIPANT_ID",
      input.sessionId
    );
  }

  if (input.sessionDuration <= 0) {
    throw new EngagementCalculationError(
      "Session duration must be greater than zero",
      "INVALID_SESSION_DURATION",
      input.sessionId
    );
  }

  if (typeof input.sessionDuration !== "number" || isNaN(input.sessionDuration)) {
    throw new EngagementCalculationError(
      "Session duration must be a valid number",
      "INVALID_SESSION_DURATION",
      input.sessionId
    );
  }
}

/**
 * Validate that engagement weights sum to 1.
 */
function validateWeights(weights: EngagementWeights): void {
  const sum = weights.talkTimeRatio + weights.questionCount + weights.responseRate + weights.sentimentScore;
  if (Math.abs(sum - 1) > 0.001) {
    throw new EngagementCalculationError(
      `Engagement weights must sum to 1, got ${sum}`,
      "INVALID_WEIGHTS"
    );
  }
}

/**
 * Calculate the engagement score for a single participant.
 */
export async function calculateEngagementScore(
  input: EngagementCalculationInput
): Promise<ParticipantEngagementScore> {
  validateInput(input);

  const weights = input.weights ?? DEFAULT_WEIGHTS;
  validateWeights(weights);

  const { sessionId, participantId, segments, sessionDuration } = input;

  const participants = getUniqueParticipants(segments);
  const totalParticipants = Math.max(participants.length, 1);

  const talkTime = calculateParticipantTalkTime(segments, participantId);
  const talkTimeRatio = round2(sessionDuration > 0 ? talkTime / sessionDuration : 0);

  const questionCount = countQuestions(segments, participantId);
  const responseRate = calculateResponseRate(segments, participantId);

  // Use provided sentiment or default to neutral (0)
  const rawSentiment = input.sentimentScore ?? 0;

  // Calculate component scores (each 0-100)
  const talkTimeScore = calculateTalkTimeScore(talkTime, sessionDuration, totalParticipants);
  const questionScore = calculateQuestionScore(questionCount);
  const responseRateScore = calculateResponseRateScore(responseRate);
  const sentimentScoreComponent = calculateSentimentScoreComponent(rawSentiment);

  // Weighted final score
  const finalScore = round2(clamp0to100(
    talkTimeScore * weights.talkTimeRatio +
    questionScore * weights.questionCount +
    responseRateScore * weights.responseRate +
    sentimentScoreComponent * weights.sentimentScore
  ));

  return {
    id: "",
    sessionId,
    participantId,
    score: finalScore,
    talkTimeRatio,
    questionCount,
    responseRate,
    sentimentScore: round2(rawSentiment),
    calculatedAt: new Date(),
  };
}

/**
 * Calculate engagement scores for all participants in a session.
 */
export async function calculateSessionEngagement(
  input: SessionEngagementInput
): Promise<SessionEngagementSummary> {
  if (!input.sessionId || typeof input.sessionId !== "string") {
    throw new EngagementCalculationError(
      "Invalid or missing sessionId",
      "INVALID_SESSION_ID"
    );
  }

  if (input.sessionDuration <= 0) {
    throw new EngagementCalculationError(
      "Session duration must be greater than zero",
      "INVALID_SESSION_DURATION",
      input.sessionId
    );
  }

  const participants = getUniqueParticipants(input.segments);

  if (participants.length === 0) {
    return {
      sessionId: input.sessionId,
      averageScore: 0,
      participantScores: [],
      calculatedAt: new Date(),
    };
  }

  const participantScores: ParticipantEngagementScore[] = [];

  for (const participantId of participants) {
    const sentiment = input.sentimentScores?.get(participantId) ?? 0;

    const score = await calculateEngagementScore({
      sessionId: input.sessionId,
      participantId,
      segments: input.segments,
      sessionDuration: input.sessionDuration,
      sentimentScore: sentiment,
      weights: input.weights,
    });

    participantScores.push(score);
  }

  const totalScore = participantScores.reduce((sum, s) => sum + s.score, 0);
  const averageScore = round2(totalScore / participantScores.length);

  return {
    sessionId: input.sessionId,
    averageScore,
    participantScores,
    calculatedAt: new Date(),
  };
}

export const engagementScoringService = {
  calculateEngagementScore,
  calculateSessionEngagement,
  calculateTalkTimeRatio,
  calculateResponseScore,
  calculateFinalScore,
};
