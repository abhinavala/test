import type { MeetingSessionSummary } from "./meeting-summary.js";

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
