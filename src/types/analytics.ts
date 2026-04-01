// Type definitions for the Meeting Analytics Dashboard API

export type AggregationPeriod = "daily" | "weekly" | "monthly";

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

export interface AnalyticsQueryParams {
  startDate: string; // ISO 8601 date string (YYYY-MM-DD)
  endDate: string;   // ISO 8601 date string (YYYY-MM-DD)
  period?: AggregationPeriod;
  meetingIds?: number[];
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export interface TimeSeriesPoint {
  timestamp: string; // ISO 8601 datetime string
  value: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Health score types
// ---------------------------------------------------------------------------

export interface HealthScoreResponse {
  data: TimeSeriesPoint[];
  totalRecords: number;
  averageScore: number;
  cacheHit: boolean;
}

// ---------------------------------------------------------------------------
// Completion rate types
// ---------------------------------------------------------------------------

export interface CompletionRatePoint {
  timestamp: string;
  completionRate: number; // 0–100 (percentage)
  totalItems: number;
  completedItems: number;
}

export interface CompletionRateResponse {
  data: CompletionRatePoint[];
  totalRecords: number;
  overallCompletionRate: number; // 0–100 (percentage)
  cacheHit: boolean;
}

// ---------------------------------------------------------------------------
// Engagement types
// ---------------------------------------------------------------------------

export interface EngagementPoint {
  timestamp: string;
  engagementScore: number; // 0–100 normalised score
  avgParticipants: number;
  meetingCount: number;
}

export interface EngagementResponse {
  data: EngagementPoint[];
  totalRecords: number;
  averageEngagement: number;
  cacheHit: boolean;
}

// ---------------------------------------------------------------------------
// API error
// ---------------------------------------------------------------------------

export interface AnalyticsApiError {
  detail: string;
  status: number;
}

// ---------------------------------------------------------------------------
// Union of all response types (useful for generic hooks/utilities)
// ---------------------------------------------------------------------------

export type AnalyticsResponse =
  | HealthScoreResponse
  | CompletionRateResponse
  | EngagementResponse;
