import type { TranscriptSegment } from "../../types/transcript.js";
import type { SpeakerStats } from "../../types/speaker-stats.js";

let segmentCounter = 0;

/**
 * Create a single transcript segment with sensible defaults.
 */
export function makeSegment(overrides: Partial<TranscriptSegment> & { speakerId: string; startTime: number; endTime: number }): TranscriptSegment {
  segmentCounter++;
  return {
    id: `seg-${segmentCounter}`,
    sessionId: "test-session",
    text: `Transcript text ${segmentCounter}`,
    ...overrides,
  };
}

/**
 * Reset the internal segment counter (call in beforeEach).
 */
export function resetSegmentCounter(): void {
  segmentCounter = 0;
}

/**
 * Generate a multi-speaker meeting transcript with realistic timing.
 * Speakers alternate turns with configurable durations.
 */
export function generateMultiSpeakerTranscript(options: {
  sessionId: string;
  speakerIds: string[];
  turnsPerSpeaker: number;
  turnDurationMs?: number;
  gapMs?: number;
}): TranscriptSegment[] {
  const { sessionId, speakerIds, turnsPerSpeaker, turnDurationMs = 5000, gapMs = 200 } = options;
  const segments: TranscriptSegment[] = [];
  let currentTime = 0;

  for (let turn = 0; turn < turnsPerSpeaker; turn++) {
    for (const speakerId of speakerIds) {
      segments.push(makeSegment({
        sessionId,
        speakerId,
        startTime: currentTime,
        endTime: currentTime + turnDurationMs,
      }));
      currentTime += turnDurationMs + gapMs;
    }
  }

  return segments;
}

/**
 * Generate a transcript with interruptions (overlapping segments between speakers).
 * The overlap exceeds the default 500ms threshold.
 */
export function generateTranscriptWithInterruptions(options: {
  sessionId: string;
  interruptionCount: number;
  overlapMs?: number;
}): TranscriptSegment[] {
  const { sessionId, interruptionCount, overlapMs = 800 } = options;
  const segments: TranscriptSegment[] = [];
  let currentTime = 0;
  const turnDuration = 5000;

  for (let i = 0; i < interruptionCount; i++) {
    // Speaker A talks
    segments.push(makeSegment({
      sessionId,
      speakerId: "speaker-A",
      startTime: currentTime,
      endTime: currentTime + turnDuration,
    }));

    // Speaker B interrupts speaker A (starts before A ends, with overlap > threshold)
    const interruptStart = currentTime + turnDuration - overlapMs;
    segments.push(makeSegment({
      sessionId,
      speakerId: "speaker-B",
      startTime: interruptStart,
      endTime: interruptStart + turnDuration,
    }));

    currentTime = interruptStart + turnDuration + 200;
  }

  return segments;
}

/**
 * Generate a single-speaker meeting transcript.
 */
export function generateSingleSpeakerTranscript(options: {
  sessionId: string;
  speakerId: string;
  turnCount: number;
  turnDurationMs?: number;
}): TranscriptSegment[] {
  const { sessionId, speakerId, turnCount, turnDurationMs = 3000 } = options;
  const segments: TranscriptSegment[] = [];
  let currentTime = 0;
  const gapMs = 500;

  for (let i = 0; i < turnCount; i++) {
    segments.push(makeSegment({
      sessionId,
      speakerId,
      startTime: currentTime,
      endTime: currentTime + turnDurationMs,
    }));
    currentTime += turnDurationMs + gapMs;
  }

  return segments;
}

/**
 * Generate a large transcript for performance testing.
 */
export function generateLargeTranscript(options: {
  sessionId: string;
  segmentCount: number;
  speakerCount?: number;
}): TranscriptSegment[] {
  const { sessionId, segmentCount, speakerCount = 5 } = options;
  const segments: TranscriptSegment[] = [];
  let currentTime = 0;
  const turnDuration = 2000;
  const gap = 100;

  for (let i = 0; i < segmentCount; i++) {
    const speakerId = `speaker-${i % speakerCount}`;
    segments.push(makeSegment({
      sessionId,
      speakerId,
      startTime: currentTime,
      endTime: currentTime + turnDuration,
    }));
    currentTime += turnDuration + gap;
  }

  return segments;
}

/**
 * Create mock transcript segments for a given session with specified speakers and timing.
 * This is the primary factory for building test transcript data.
 */
export function createMockTranscriptSegments(options: {
  sessionId: string;
  speakers: Array<{ speakerId: string; segments: Array<{ startTime: number; endTime: number; text?: string }> }>;
}): TranscriptSegment[] {
  const { sessionId, speakers } = options;
  const result: TranscriptSegment[] = [];

  for (const speaker of speakers) {
    for (const seg of speaker.segments) {
      result.push(makeSegment({
        sessionId,
        speakerId: speaker.speakerId,
        startTime: seg.startTime,
        endTime: seg.endTime,
        ...(seg.text ? { text: seg.text } : {}),
      }));
    }
  }

  return result.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Verify that speaker stats contain expected properties and valid ranges.
 */
export function assertValidSpeakerStats(stats: SpeakerStats[]): void {
  for (const stat of stats) {
    if (typeof stat.speakerId !== "string" || stat.speakerId.length === 0) {
      throw new Error(`Invalid speakerId: ${stat.speakerId}`);
    }
    if (stat.talkTime < 0) {
      throw new Error(`Negative talkTime for ${stat.speakerId}: ${stat.talkTime}`);
    }
    if (stat.percentageOfMeeting < 0 || stat.percentageOfMeeting > 100) {
      throw new Error(`Invalid percentageOfMeeting for ${stat.speakerId}: ${stat.percentageOfMeeting}`);
    }
    if (stat.turnCount < 0 || !Number.isInteger(stat.turnCount)) {
      throw new Error(`Invalid turnCount for ${stat.speakerId}: ${stat.turnCount}`);
    }
    if (stat.averageTurnDuration < 0) {
      throw new Error(`Negative averageTurnDuration for ${stat.speakerId}: ${stat.averageTurnDuration}`);
    }
    if (stat.interruptionCount < 0 || !Number.isInteger(stat.interruptionCount)) {
      throw new Error(`Invalid interruptionCount for ${stat.speakerId}: ${stat.interruptionCount}`);
    }
  }
}
