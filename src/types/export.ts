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
