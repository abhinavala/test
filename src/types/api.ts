import type { MeetingSessionSummary } from "./meeting-summary.js";

/** Configuration for the API client. */
export interface ApiClientConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
}

/** Configuration for an individual API request. */
export interface RequestConfig {
  method: string;
  url: string;
  data?: any;
  headers?: Record<string, string>;
}

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
