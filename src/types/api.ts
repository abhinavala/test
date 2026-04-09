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

/** Configuration for the API client instance. */
export interface ApiClientConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
}

/** Configuration for an individual HTTP request. */
export interface RequestConfig {
  method: string;
  url: string;
  data?: any;
  headers?: Record<string, string>;
}

/** Standardized API response wrapper. */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  status: number;
  message?: string;
}

/** Error codes for API client errors. */
export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "VALIDATION_ERROR"
  | "SERVER_ERROR"
  | "TIMEOUT_ERROR"
  | "UNKNOWN_ERROR";

/** Standardized API error. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: ApiErrorCode, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
