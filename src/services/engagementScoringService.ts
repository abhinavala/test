import type { ParticipantEngagementScore } from "../types/engagement.js";
import type { TranscriptSegment } from "../types/transcript.js";

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

export interface EngagementWeights {
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
}

export interface EngagementCalculationInput {
  sessionId: string;
  participantId: string;
  segments: TranscriptSegment[];
  sessionDuration: number;
  sentimentScore?: number;
  weights?: EngagementWeights;
}

export interface SessionEngagementInput {
  sessionId: string;
  segments: TranscriptSegment[];
  sessionDuration: number;
  sentimentScores?: Map<string, number>;
  weights?: EngagementWeights;
}

export interface SessionEngagementSummary {
  sessionId: string;
  averageScore: number;
  participantScores: ParticipantEngagementScore[];
  calculatedAt: Date;
}

export async function calculateEngagementScore(
  _input: EngagementCalculationInput
): Promise<ParticipantEngagementScore> {
  throw new Error("Not implemented - provided by dependency task");
}

export async function calculateSessionEngagement(
  _input: SessionEngagementInput
): Promise<SessionEngagementSummary> {
  throw new Error("Not implemented - provided by dependency task");
}

export function calculateTalkTimeRatio(
  _participantTalkTime: number,
  _sessionDuration: number
): number {
  throw new Error("Not implemented - provided by dependency task");
}

export function calculateResponseScore(
  _segments: TranscriptSegment[],
  _participantId: string
): number {
  throw new Error("Not implemented - provided by dependency task");
}

export function calculateFinalScore(
  _components: {
    talkTimeScore: number;
    questionScore: number;
    responseRateScore: number;
    sentimentScore: number;
  },
  _weights?: EngagementWeights
): number {
  throw new Error("Not implemented - provided by dependency task");
}
