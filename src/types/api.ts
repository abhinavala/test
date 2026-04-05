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

/** Response envelope for engagement scores retrieval. */
export interface GetEngagementScoresResponse {
  success: boolean;
  sessionId: string;
  scores: ParticipantEngagementScore[];
}

/** Request parameters for triggering engagement score calculation. */
export interface CalculateEngagementRequest {
  sessionId: string;
  segments: unknown[];
  sessionDuration: number;
  sentimentScores?: Record<string, number>;
}

/** Response envelope for engagement score calculation. */
export interface CalculateEngagementResponse {
  success: boolean;
  sessionId: string;
  scores: ParticipantEngagementScore[];
  summary: {
    averageScore: number;
    participantCount: number;
    calculatedAt: Date;
  };
}
