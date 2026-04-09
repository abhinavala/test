/**
 * Export format types supported by the system.
 */
export enum ExportFormat {
  PDF = "PDF",
  MARKDOWN = "MARKDOWN",
  HTML = "HTML",
  JSON = "JSON",
}

/**
 * Represents a stored export record in the database.
 */
export interface ExportRecord {
  id: string;
  sessionId: string;
  format: ExportFormat;
  content: string;
  contentHash: string;
  createdAt: Date;
}

/**
 * Request payload for creating a new export.
 */
export interface ExportRequest {
  sessionId: string;
  format: ExportFormat;
  content: string;
}

/**
 * Maximum allowed content size in bytes (16MB).
 */
export const MAX_CONTENT_SIZE = 16 * 1024 * 1024;

// Re-export content model types for downstream consumers
export type {
  MeetingMetadata,
  ActionItem,
  TranscriptSegment,
} from "./exportContent.js";

export type { MeetingData } from "../utils/exportUtils.js";

/**
 * Options for exporting a meeting in a specific format.
 */
export interface ExportOptions {
  format: "markdown" | "plaintext" | "csv" | "notion" | "jira";
  meetingId: string;
}

/**
 * Error codes for ExportService failures.
 */
export type ExportServiceErrorCode =
  | "INVALID_SESSION"
  | "UNSUPPORTED_FORMAT"
  | "FORMATTER_ERROR"
  | "DATABASE_ERROR"
  | "VALIDATION_ERROR";

/**
 * Structured error thrown by the ExportService.
 */
export class ExportServiceError extends Error {
  readonly code: ExportServiceErrorCode;
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    code: ExportServiceErrorCode,
    context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ExportServiceError";
    this.code = code;
    this.context = context;
  }
}
