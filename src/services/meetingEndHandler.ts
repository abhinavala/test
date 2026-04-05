import type { MeetingEndEvent } from "../types/events.js";
import type { TranscriptSegment } from "../types/transcript.js";
import type { SpeakerAnalyticsConfig } from "../types/config.js";
import type { SpeakerStats } from "../types/speaker-stats.js";
import type {
  ParticipantEngagementScore,
  SessionEngagementSummary,
} from "../types/engagement.js";
import { calculateSpeakerStats } from "./speakerAnalyticsService.js";
import { saveSpeakerStats } from "../models/speakerStats.js";
import { calculateSessionEngagement } from "./engagementScoringService.js";
import { bulkSaveEngagementScores } from "../models/participantEngagementScore.js";

export type { MeetingEndEvent } from "../types/events.js";

export interface MeetingEndHandlerConfig {
  analyticsEnabled: boolean;
  engagementScoringEnabled?: boolean;
  analyticsConfig?: SpeakerAnalyticsConfig;
  getTranscriptSegments: (sessionId: string) => Promise<TranscriptSegment[]>;
  getSentimentScores?: (
    sessionId: string
  ) => Promise<Map<string, number>>;
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
 * Extract engagement calculation input data from transcript segments,
 * reusing the same data sources as Speaker Analytics.
 */
export function extractEngagementInputData(
  segments: TranscriptSegment[],
  sentimentScores?: Map<string, number>
): {
  participantId: string;
  segments: TranscriptSegment[];
  sentimentScore: number;
}[] {
  if (segments.length === 0) {
    return [];
  }

  const participantSegments = new Map<string, TranscriptSegment[]>();
  for (const segment of segments) {
    const existing = participantSegments.get(segment.speakerId) ?? [];
    existing.push(segment);
    participantSegments.set(segment.speakerId, existing);
  }

  const inputs: {
    participantId: string;
    segments: TranscriptSegment[];
    sentimentScore: number;
  }[] = [];

  for (const [participantId, participantSegs] of participantSegments) {
    inputs.push({
      participantId,
      segments: participantSegs,
      sentimentScore: sentimentScores?.get(participantId) ?? 0,
    });
  }

  return inputs;
}

/**
 * Process engagement scoring for a session. Calculates scores for all participants
 * and stores them in the database. Returns a summary or null if no transcript data.
 */
export async function processEngagementScoring(
  sessionId: string,
  getTranscriptSegments: (sessionId: string) => Promise<TranscriptSegment[]>,
  getSentimentScores?: (sessionId: string) => Promise<Map<string, number>>
): Promise<SessionEngagementSummary | null> {
  const segments = await getTranscriptSegments(sessionId);

  if (segments.length === 0) {
    return null;
  }

  const sentimentScores = getSentimentScores
    ? await getSentimentScores(sessionId)
    : new Map<string, number>();

  const inputData = extractEngagementInputData(segments, sentimentScores);

  const participantScores = calculateSessionEngagement(
    sessionId,
    inputData.map((input) => ({
      participantId: input.participantId,
      segments: input.segments,
      sentimentScore: input.sentimentScore,
    }))
  );

  await bulkSaveEngagementScores(participantScores);

  const averageScore =
    participantScores.length > 0
      ? participantScores.reduce((sum, s) => sum + s.score, 0) /
        participantScores.length
      : 0;

  return {
    sessionId,
    averageScore,
    participantScores,
    calculatedAt: new Date(),
  };
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

  if (!handlerConfig.analyticsEnabled) {
    logger.info("Speaker analytics disabled, skipping calculation", {
      sessionId,
    });
    return;
  }

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

  if (handlerConfig.engagementScoringEnabled === true) {
    try {
      const summary = await processEngagementScoring(
        sessionId,
        handlerConfig.getTranscriptSegments,
        handlerConfig.getSentimentScores
      );
      if (summary) {
        logger.info(
          "Engagement scoring calculated and persisted successfully",
          {
            sessionId,
            participantCount: summary.participantScores.length,
            averageScore: summary.averageScore,
          }
        );
      } else {
        logger.info(
          "Engagement scoring skipped: no transcript data available",
          { sessionId }
        );
      }
    } catch (error) {
      logger.error("Engagement scoring calculation failed", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const meetingEndHandlerService = {
  handleMeetingEnd,
  processSpeakerAnalytics,
  processEngagementScoring,
  extractEngagementInputData,
};
