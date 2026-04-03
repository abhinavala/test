import type { SpeakerStats } from "../types/speaker-stats.js";
import type { TranscriptSegment } from "../types/transcript.js";
import type { SpeakerAnalyticsConfig } from "../types/config.js";
import { SpeakerAnalyticsError } from "../types/errors.js";

export type { TranscriptSegment } from "../types/transcript.js";
export type { SpeakerAnalyticsConfig } from "../types/config.js";

const DEFAULT_INTERRUPTION_THRESHOLD_MS = 500;

/**
 * Validate that all transcript segments have valid data.
 */
function validateSegments(segments: TranscriptSegment[]): void {
  for (const segment of segments) {
    if (!segment.id || typeof segment.id !== "string") {
      throw new SpeakerAnalyticsError(
        "Segment is missing a valid id",
        "INVALID_SEGMENTS"
      );
    }
    if (!segment.speakerId || typeof segment.speakerId !== "string") {
      throw new SpeakerAnalyticsError(
        "Segment is missing a valid speakerId",
        "INVALID_SEGMENTS"
      );
    }
    if (typeof segment.startTime !== "number" || isNaN(segment.startTime)) {
      throw new SpeakerAnalyticsError(
        `Segment ${segment.id} has invalid startTime`,
        "INVALID_SEGMENTS"
      );
    }
    if (typeof segment.endTime !== "number" || isNaN(segment.endTime)) {
      throw new SpeakerAnalyticsError(
        `Segment ${segment.id} has invalid endTime`,
        "INVALID_SEGMENTS"
      );
    }
    if (segment.endTime < segment.startTime) {
      throw new SpeakerAnalyticsError(
        `Segment ${segment.id} has endTime before startTime`,
        "INVALID_SEGMENTS"
      );
    }
  }
}

/**
 * Count interruptions per speaker. An interruption occurs when a segment from a
 * different speaker starts before the previous segment ends, with overlap
 * exceeding the configured threshold.
 */
function calculateInterruptions(
  sortedSegments: TranscriptSegment[],
  thresholdMs: number
): Map<string, number> {
  const interruptions = new Map<string, number>();

  for (let i = 1; i < sortedSegments.length; i++) {
    const prev = sortedSegments[i - 1];
    const curr = sortedSegments[i];

    if (curr.speakerId !== prev.speakerId) {
      const overlap = prev.endTime - curr.startTime;
      if (overlap > thresholdMs) {
        // The previous speaker was interrupted
        const count = interruptions.get(prev.speakerId) ?? 0;
        interruptions.set(prev.speakerId, count + 1);
      }
    }
  }

  return interruptions;
}

/**
 * Round a number to two decimal places.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate talk time per speaker from an array of transcript segments.
 * Returns a map of speakerId to total talk time in milliseconds.
 */
export function calculateTalkTime(
  segments: TranscriptSegment[]
): Map<string, number> {
  const talkTimeMap = new Map<string, number>();

  for (const segment of segments) {
    const duration = segment.endTime - segment.startTime;
    const existing = talkTimeMap.get(segment.speakerId) ?? 0;
    talkTimeMap.set(segment.speakerId, existing + duration);
  }

  return talkTimeMap;
}

/**
 * Calculate per-speaker statistics from an array of transcript segments.
 *
 * Returns an empty array if no segments are provided.
 */
export async function calculateSpeakerStats(
  segments: TranscriptSegment[],
  config?: SpeakerAnalyticsConfig
): Promise<SpeakerStats[]> {
  if (segments.length === 0) {
    return [];
  }

  validateSegments(segments);

  const thresholdMs =
    config?.interruptionThresholdMs ?? DEFAULT_INTERRUPTION_THRESHOLD_MS;

  // Sort segments by startTime for consistent processing
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);

  // Calculate total meeting duration from earliest start to latest end
  const meetingStart = sorted[0].startTime;
  const meetingEnd = Math.max(...sorted.map((s) => s.endTime));
  const totalMeetingDuration = meetingEnd - meetingStart;

  // Aggregate per-speaker talk time and turn count
  const speakerMap = new Map<
    string,
    { talkTime: number; turnCount: number }
  >();

  for (const segment of sorted) {
    const duration = segment.endTime - segment.startTime;
    const existing = speakerMap.get(segment.speakerId);
    if (existing) {
      existing.talkTime += duration;
      existing.turnCount += 1;
    } else {
      speakerMap.set(segment.speakerId, {
        talkTime: duration,
        turnCount: 1,
      });
    }
  }

  // Calculate interruptions
  const interruptions = calculateInterruptions(sorted, thresholdMs);

  // Build results
  const results: SpeakerStats[] = [];

  for (const [speakerId, data] of speakerMap) {
    const percentageOfMeeting =
      totalMeetingDuration > 0
        ? round2((data.talkTime / totalMeetingDuration) * 100)
        : 0;

    results.push({
      speakerId,
      talkTime: round2(data.talkTime),
      percentageOfMeeting,
      turnCount: data.turnCount,
      averageTurnDuration: round2(data.talkTime / data.turnCount),
      interruptionCount: interruptions.get(speakerId) ?? 0,
    });
  }

  return results;
}

export const speakerAnalyticsService = {
  calculateSpeakerStats,
  calculateTalkTime,
};
