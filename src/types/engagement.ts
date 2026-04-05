/**
 * Represents an individual participant's engagement score for a session.
 */
export interface ParticipantEngagementScore {
  id: string;
  sessionId: string;
  participantId: string;
  score: number;
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
  calculatedAt: Date;
}

/**
 * Summary of engagement scores across all participants in a session.
 */
export interface SessionEngagementSummary {
  sessionId: string;
  scores: ParticipantEngagementScore[];
  averageScore: number;
  calculatedAt: Date;
}

/** Error codes for engagement score calculation failures. */
export type EngagementScoreErrorCode =
  | "CALCULATION_FAILED"
  | "SESSION_NOT_FOUND"
  | "PARTICIPANT_NOT_FOUND"
  | "INSUFFICIENT_DATA";

/**
 * Error thrown when engagement score calculation or retrieval fails.
 */
export class EngagementScoreError extends Error {
  readonly code: EngagementScoreErrorCode;
  readonly sessionId?: string;
  readonly participantId?: string;

  constructor(
    message: string,
    code: EngagementScoreErrorCode,
    sessionId?: string,
    participantId?: string
  ) {
    super(message);
    this.name = "EngagementScoreError";
    this.code = code;
    this.sessionId = sessionId;
    this.participantId = participantId;
  }
}
