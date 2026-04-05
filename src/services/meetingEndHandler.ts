import type { MeetingEndEvent } from "../types/events.js";
import type { TranscriptSegment } from "../types/transcript.js";
import type { SpeakerAnalyticsConfig } from "../types/config.js";
import type { SpeakerStats } from "../types/speaker-stats.js";
import type { ParticipantEngagementScore } from "../types/engagement.js";
import { calculateSpeakerStats } from "./speakerAnalyticsService.js";
import { saveSpeakerStats } from "../models/speakerStats.js";

export type { MeetingEndEvent } from "../types/events.js";

export interface SessionEngagementSummary {
  sessionId: string;
  scores: ParticipantEngagementScore[];
  processedAt: Date;
  errors: Array<{ participantId: string; error: string }>;
}

export interface EngagementCalculationInput {
  participantId: string;
  segments: TranscriptSegment[];
  totalSegments: TranscriptSegment[];
}

export interface EngagementScoringConfig {
  weights?: EngagementWeights;
}

export interface EngagementWeights {
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
}

const DEFAULT_WEIGHTS: EngagementWeights = {
  talkTimeRatio: 0.3,
  questionCount: 0.25,
  responseRate: 0.25,
  sentimentScore: 0.2,
};

export interface MeetingEndHandlerConfig {
  analyticsEnabled: boolean;
  engagementScoringEnabled?: boolean;
  analyticsConfig?: SpeakerAnalyticsConfig;
  engagementScoringConfig?: EngagementScoringConfig;
  getTranscriptSegments: (sessionId: string) => Promise<TranscriptSegment[]>;
  saveEngagementScore?: (score: Omit<ParticipantEngagementScore, "id">) => Promise<ParticipantEngagementScore>;
  logger?: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
}

const defaultLogger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(message, meta);
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(message, meta);
  },
};

/**
 * Clamp a value between 0 and 100.
 */
function clamp0to100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Calculate talk time ratio score for a participant (0-100).
 * Ratio of participant's talk time to total meeting talk time.
 */
export function calculateTalkTimeRatio(
  participantSegments: TranscriptSegment[],
  allSegments: TranscriptSegment[]
): number {
  if (allSegments.length === 0) return 0;

  const participantTalkTime = participantSegments.reduce(
    (sum, seg) => sum + (seg.endTime - seg.startTime),
    0
  );
  const totalTalkTime = allSegments.reduce(
    (sum, seg) => sum + (seg.endTime - seg.startTime),
    0
  );

  if (totalTalkTime === 0) return 0;

  const ratio = participantTalkTime / totalTalkTime;
  return clamp0to100(ratio * 100);
}

/**
 * Calculate question count score using logarithmic scaling (0-100).
 */
export function calculateQuestionScore(segments: TranscriptSegment[]): number {
  const questionCount = segments.filter((seg) => seg.text.includes("?")).length;
  if (questionCount === 0) return 0;
  // Logarithmic scaling: log2(count + 1) * 25, capped at 100
  return clamp0to100(Math.log2(questionCount + 1) * 25);
}

/**
 * Calculate response rate score (0-100).
 * Measures how often a participant responds after other speakers.
 */
export function calculateResponseScore(
  participantId: string,
  allSegments: TranscriptSegment[]
): number {
  if (allSegments.length < 2) return 0;

  const sorted = [...allSegments].sort((a, b) => a.startTime - b.startTime);
  let opportunities = 0;
  let responses = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    if (prev.speakerId !== participantId) {
      opportunities++;
      if (curr.speakerId === participantId) {
        responses++;
      }
    }
  }

  if (opportunities === 0) return 0;
  return clamp0to100((responses / opportunities) * 100);
}

/**
 * Calculate sentiment score (0-100).
 * Maps from -1..1 range to 0..100 range.
 * Uses a simple heuristic based on text content since no external sentiment pipeline is available.
 */
export function calculateSentimentScore(segments: TranscriptSegment[]): number {
  if (segments.length === 0) return 50; // neutral default

  // Simple sentiment heuristic: positive words vs negative words
  const positiveWords = ["good", "great", "agree", "yes", "thanks", "excellent", "perfect", "wonderful", "happy", "love"];
  const negativeWords = ["bad", "no", "disagree", "wrong", "issue", "problem", "terrible", "hate", "unfortunately", "fail"];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const seg of segments) {
    const words = seg.text.toLowerCase().split(/\W+/);
    for (const word of words) {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    }
  }

  const total = positiveCount + negativeCount;
  if (total === 0) return 50; // neutral

  // Map to -1..1 range then to 0..100
  const sentimentRatio = (positiveCount - negativeCount) / total; // -1 to 1
  return clamp0to100((sentimentRatio + 1) * 50); // 0 to 100
}

/**
 * Calculate the final engagement score from component scores using weights.
 */
export function calculateFinalScore(
  components: { talkTimeRatio: number; questionCount: number; responseRate: number; sentimentScore: number },
  weights: EngagementWeights = DEFAULT_WEIGHTS
): number {
  const weighted =
    components.talkTimeRatio * weights.talkTimeRatio +
    components.questionCount * weights.questionCount +
    components.responseRate * weights.responseRate +
    components.sentimentScore * weights.sentimentScore;

  return clamp0to100(Math.round(weighted * 100) / 100);
}

/**
 * Calculate engagement score for a single participant.
 */
export function calculateEngagementScore(
  input: EngagementCalculationInput,
  weights?: EngagementWeights
): Omit<ParticipantEngagementScore, "id" | "calculatedAt"> {
  const talkTimeRatio = calculateTalkTimeRatio(input.segments, input.totalSegments);
  const questionCount = calculateQuestionScore(input.segments);
  const responseRate = calculateResponseScore(input.participantId, input.totalSegments);
  const sentimentScore = calculateSentimentScore(input.segments);

  const score = calculateFinalScore(
    { talkTimeRatio, questionCount, responseRate, sentimentScore },
    weights
  );

  return {
    sessionId: input.segments[0]?.sessionId ?? "",
    participantId: input.participantId,
    score,
    talkTimeRatio,
    questionCount,
    responseRate,
    sentimentScore,
  };
}

/**
 * Extract engagement calculation inputs from transcript segments.
 * Groups segments by participant and returns EngagementCalculationInput for each.
 */
export function extractEngagementData(
  segments: TranscriptSegment[]
): EngagementCalculationInput[] {
  if (segments.length === 0) return [];

  const participantMap = new Map<string, TranscriptSegment[]>();

  for (const segment of segments) {
    const existing = participantMap.get(segment.speakerId);
    if (existing) {
      existing.push(segment);
    } else {
      participantMap.set(segment.speakerId, [segment]);
    }
  }

  const inputs: EngagementCalculationInput[] = [];
  for (const [participantId, participantSegments] of participantMap) {
    inputs.push({
      participantId,
      segments: participantSegments,
      totalSegments: segments,
    });
  }

  return inputs;
}

/**
 * Handle engagement scoring error for a single participant.
 * Logs the error but does not throw, allowing other participants to be processed.
 */
export function handleEngagementScoringError(
  error: unknown,
  sessionId: string,
  participantId: string,
  logger: { info: (message: string, meta?: Record<string, unknown>) => void; error: (message: string, meta?: Record<string, unknown>) => void }
): { participantId: string; error: string } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error("Engagement scoring failed for participant", {
    sessionId,
    participantId,
    error: errorMessage,
  });
  return { participantId, error: errorMessage };
}

/**
 * Process engagement scoring for all participants in a session.
 * Calculates scores for each participant and persists them.
 * Handles individual participant failures gracefully.
 */
export async function processEngagementScoring(
  sessionId: string,
  getTranscriptSegments: (sessionId: string) => Promise<TranscriptSegment[]>,
  config?: {
    engagementScoringConfig?: EngagementScoringConfig;
    saveEngagementScore?: (score: Omit<ParticipantEngagementScore, "id">) => Promise<ParticipantEngagementScore>;
    logger?: { info: (message: string, meta?: Record<string, unknown>) => void; error: (message: string, meta?: Record<string, unknown>) => void };
  }
): Promise<SessionEngagementSummary> {
  const logger = config?.logger ?? defaultLogger;
  const weights = config?.engagementScoringConfig?.weights;

  logger.info("Starting engagement scoring", { sessionId });

  const segments = await getTranscriptSegments(sessionId);
  const inputs = extractEngagementData(segments);

  const scores: ParticipantEngagementScore[] = [];
  const errors: Array<{ participantId: string; error: string }> = [];

  for (const input of inputs) {
    try {
      const scoreData = calculateEngagementScore(input, weights);
      const scoreWithSession = {
        ...scoreData,
        sessionId,
        calculatedAt: new Date(),
      };

      if (config?.saveEngagementScore) {
        const saved = await config.saveEngagementScore(scoreWithSession);
        scores.push(saved);
      } else {
        scores.push({ id: "", ...scoreWithSession });
      }
    } catch (error) {
      const errorEntry = handleEngagementScoringError(
        error,
        sessionId,
        input.participantId,
        logger
      );
      errors.push(errorEntry);
    }
  }

  logger.info("Engagement scoring completed", {
    sessionId,
    participantsScored: scores.length,
    participantsFailed: errors.length,
  });

  return {
    sessionId,
    scores,
    processedAt: new Date(),
    errors,
  };
}

/**
 * Process speaker analytics for a session. Calculates and persists stats.
 * Returns the calculated stats, or an empty array if no segments are found.
 */
export async function processSpeakerAnalytics(
  sessionId: string,
  getTranscriptSegments: (sessionId: string) => Promise<TranscriptSegment[]>,
  config?: SpeakerAnalyticsConfig
): Promise<SpeakerStats[]> {
  const segments = await getTranscriptSegments(sessionId);
  const stats = await calculateSpeakerStats(segments, config);
  await saveSpeakerStats(sessionId, stats);
  return stats;
}

/**
 * Handle a meeting end event. Triggers speaker analytics and engagement scoring
 * if enabled, but ensures failures never break the main workflow.
 */
export async function handleMeetingEnd(
  event: MeetingEndEvent,
  handlerConfig: MeetingEndHandlerConfig
): Promise<void> {
  const logger = handlerConfig.logger ?? defaultLogger;
  const { sessionId } = event;

  // Process speaker analytics if enabled
  if (handlerConfig.analyticsEnabled) {
    try {
      const stats = await processSpeakerAnalytics(
        sessionId,
        handlerConfig.getTranscriptSegments,
        handlerConfig.analyticsConfig
      );
      logger.info("Speaker analytics calculated and persisted successfully", {
        sessionId,
        speakerCount: stats.length,
      });
    } catch (error) {
      logger.error("Speaker analytics calculation failed", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    logger.info("Speaker analytics disabled, skipping calculation", {
      sessionId,
    });
  }

  // Process engagement scoring if enabled
  if (handlerConfig.engagementScoringEnabled) {
    try {
      const result = await processEngagementScoring(sessionId, handlerConfig.getTranscriptSegments, {
        engagementScoringConfig: handlerConfig.engagementScoringConfig,
        saveEngagementScore: handlerConfig.saveEngagementScore,
        logger,
      });
      logger.info("Engagement scoring completed successfully", {
        sessionId,
        participantsScored: result.scores.length,
        errors: result.errors.length,
      });
    } catch (error) {
      logger.error("Engagement scoring failed", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    logger.info("Engagement scoring disabled, skipping calculation", {
      sessionId,
    });
  }
}

export const meetingEndHandlerService = {
  handleMeetingEnd,
  processSpeakerAnalytics,
  processEngagementScoring,
  extractEngagementData,
  calculateEngagementScore,
  handleEngagementScoringError,
};
