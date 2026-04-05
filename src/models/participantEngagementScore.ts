import type { ParticipantEngagementScore } from "../types/engagement.js";

/**
 * Bulk save engagement scores. Uses Prisma transaction with upsert.
 * Stub — full implementation provided by dependency task.
 */
export async function bulkSaveEngagementScores(
  scores: ParticipantEngagementScore[]
): Promise<void> {
  throw new Error("Not implemented — awaiting dependency task merge");
}
