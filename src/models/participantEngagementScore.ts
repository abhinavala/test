import type { ParticipantEngagementScore } from "../types/engagement.js";

export type EngagementCalculationErrorCode =
  | "CONSTRAINT_VIOLATION"
  | "DATABASE_ERROR"
  | "VALIDATION_ERROR";

export class EngagementCalculationError extends Error {
  readonly code: EngagementCalculationErrorCode;
  readonly sessionId?: string;

  constructor(
    message: string,
    code: EngagementCalculationErrorCode,
    sessionId?: string
  ) {
    super(message);
    this.name = "EngagementCalculationError";
    this.code = code;
    this.sessionId = sessionId;
  }
}

export async function saveEngagementScore(
  _input: Omit<ParticipantEngagementScore, "id" | "calculatedAt">
): Promise<ParticipantEngagementScore> {
  throw new Error("Not implemented - provided by dependency task");
}

export async function bulkSaveEngagementScores(
  _scores: Omit<ParticipantEngagementScore, "id" | "calculatedAt">[]
): Promise<ParticipantEngagementScore[]> {
  throw new Error("Not implemented - provided by dependency task");
}

export async function getEngagementScoresBySession(
  _sessionId: string
): Promise<ParticipantEngagementScore[]> {
  throw new Error("Not implemented - provided by dependency task");
}

export async function getEngagementScore(
  _id: string
): Promise<ParticipantEngagementScore | null> {
  throw new Error("Not implemented - provided by dependency task");
}

export async function getEngagementScoreByParticipant(
  _sessionId: string,
  _participantId: string
): Promise<ParticipantEngagementScore | null> {
  throw new Error("Not implemented - provided by dependency task");
}

export async function deleteEngagementScoresBySession(
  _sessionId: string
): Promise<number> {
  throw new Error("Not implemented - provided by dependency task");
}

export async function disconnect(): Promise<void> {
  // no-op stub
}
