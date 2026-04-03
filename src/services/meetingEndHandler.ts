import type { MeetingEndEvent } from "../types/events.js";
import type { TranscriptSegment } from "../types/transcript.js";
import type { SpeakerAnalyticsConfig } from "../types/config.js";
import type { SpeakerStats } from "../types/speaker-stats.js";
import { calculateSpeakerStats } from "./speakerAnalyticsService.js";
import { saveSpeakerStats } from "../models/speakerStats.js";

export type { MeetingEndEvent } from "../types/events.js";

export interface MeetingEndHandlerConfig {
  analyticsEnabled: boolean;
  analyticsConfig?: SpeakerAnalyticsConfig;
  getTranscriptSegments: (sessionId: string) => Promise<TranscriptSegment[]>;
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
 * Handle a meeting end event. Triggers speaker analytics calculation
 * if enabled, but ensures analytics failures never break the main workflow.
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
}

export const meetingEndHandlerService = {
  handleMeetingEnd,
  processSpeakerAnalytics,
};
