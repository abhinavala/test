import type { ParticipantEngagementScore } from "../types/engagement.js";
import type { TranscriptSegment } from "../types/transcript.js";

export interface EngagementParticipantInput {
  participantId: string;
  segments: TranscriptSegment[];
  sentimentScore: number;
}

/**
 * Calculate engagement scores for all participants in a session.
 * Stub — full implementation provided by dependency task.
 */
export function calculateSessionEngagement(
  sessionId: string,
  inputs: EngagementParticipantInput[]
): ParticipantEngagementScore[] {
  throw new Error("Not implemented — awaiting dependency task merge");
}
