import type { ExportRecord } from "./export.js";

/**
 * Request body for POST /api/exports.
 */
export interface GenerateExportRequestBody {
  sessionId: string;
  format: string;
  meetingData: Record<string, unknown>;
}

/**
 * Successful API response wrapper.
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Error API response wrapper.
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: unknown;
  timestamp: string;
}

/**
 * Union type for all API responses.
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Typed response data for export generation.
 */
export type GenerateExportResponse = ApiResponse<ExportRecord>;

/**
 * Typed response data for a single export.
 */
export type ExportResponse = ApiResponse<ExportRecord>;

/**
 * Typed response data for export retrieval.
 */
export type GetExportResponse = ApiResponse<ExportRecord>;

/**
 * Typed response data for export history listing.
 */
export type ExportHistoryResponse = ApiResponse<ExportRecord[]>;

/**
 * Typed response data for export history listing.
 */
export type GetExportHistoryResponse = ApiResponse<ExportRecord[]>;
