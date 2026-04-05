import type { MeetingSessionSummary } from "./meeting-summary.js";
import type { ParticipantEngagementScore } from "./engagement.js";

/** Request body for triggering summary generation. */
export interface SummaryGenerationRequest {
  meetingSessionId: string;
  includeTranscript?: boolean;
  includeActionItems?: boolean;
}

/** Response envelope for summary generation. */
export interface SummaryGenerationResponse {
  success: boolean;
  summary?: MeetingSessionSummary;
  wasRegenerated?: boolean;
  processingTime?: number;
  message?: string;
  error?: string;
}

/** Pagination metadata for list responses. */
export interface PaginationMetadata {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Response envelope for listing summaries. */
export interface SummaryListResponse {
  success: boolean;
  summaries: MeetingSessionSummary[];
  pagination: PaginationMetadata;
}

/** Request parameters for retrieving engagement scores. */
export interface GetEngagementScoresRequest {
  sessionId: string;
  participantId?: string;
}

/** Summary statistics for engagement scores in a session. */
export interface EngagementScoreSummary {
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  participantCount: number;
}

/** Response envelope for engagement scores retrieval. */
export interface GetEngagementScoresResponse {
  success: boolean;
  scores: ParticipantEngagementScore[];
  summary: EngagementScoreSummary;
  error?: string;
}

/** Request body for triggering engagement score calculation. */
export interface CalculateEngagementRequest {
  sessionId: string;
}

/** Response envelope for engagement score calculation. */
export interface CalculateEngagementResponse {
  success: boolean;
  scores?: ParticipantEngagementScore[];
  summary?: EngagementScoreSummary;
  processingTime?: number;
  error?: string;
}
