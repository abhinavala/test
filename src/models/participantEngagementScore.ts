import type { ParticipantEngagementScore } from "../types/engagement.js";

export async function getEngagementScoresBySession(
  sessionId: string,
): Promise<ParticipantEngagementScore[]> {
  throw new Error("Not implemented - dependency task pending");
}

export async function getEngagementScoreByParticipant(
  sessionId: string,
  participantId: string,
): Promise<ParticipantEngagementScore | null> {
  throw new Error("Not implemented - dependency task pending");
}

export async function saveEngagementScore(
  score: ParticipantEngagementScore,
): Promise<void> {
  throw new Error("Not implemented - dependency task pending");
}

export async function bulkSaveEngagementScores(
  scores: ParticipantEngagementScore[],
): Promise<void> {
  throw new Error("Not implemented - dependency task pending");
}

export async function deleteEngagementScoresBySession(
  sessionId: string,
): Promise<void> {
  throw new Error("Not implemented - dependency task pending");
}

export async function disconnect(): Promise<void> {
  throw new Error("Not implemented - dependency task pending");
}
