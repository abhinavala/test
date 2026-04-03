import {
  ExportFormat,
  ExportServiceError,
  type ExportRecord,
  type ExportServiceErrorCode,
} from "../types/export.js";
import type { ExportFormat as FormatterFormat } from "../types/exportContent.js";
import type { RawMeetingData } from "../utils/exportUtils.js";
import { MarkdownFormatter } from "../formatters/markdownFormatter.js";
import { PlainTextFormatter } from "../formatters/plainTextFormatter.js";
import {
  findExport,
  createExport,
  getExportHistory,
  getExportById,
} from "../models/exportHistory.js";

// Re-export error types for consumers importing from the service
export { ExportServiceError, type ExportServiceErrorCode } from "../types/export.js";

/**
 * Supported formatter formats and their mapping to database ExportFormat.
 */
const FORMAT_MAP: Record<FormatterFormat, ExportFormat> = {
  markdown: ExportFormat.MARKDOWN,
  plaintext: ExportFormat.JSON, // DB enum doesn't have PLAINTEXT; use JSON as placeholder
};

// Reverse map for DB format → formatter format
const REVERSE_FORMAT_MAP: Partial<Record<ExportFormat, FormatterFormat>> = {
  [ExportFormat.MARKDOWN]: "markdown",
  [ExportFormat.JSON]: "plaintext",
};

/**
 * Map a formatter format string to the database ExportFormat enum.
 */
function toDbFormat(format: FormatterFormat): ExportFormat {
  const mapped = FORMAT_MAP[format];
  if (!mapped) {
    throw new ExportServiceError(
      `Unsupported export format: ${format as string}`,
      "UNSUPPORTED_FORMAT",
      { format }
    );
  }
  return mapped;
}

/**
 * Create the appropriate formatter for the given format.
 */
function createFormatter(format: FormatterFormat) {
  switch (format) {
    case "markdown":
      return new MarkdownFormatter();
    case "plaintext":
      return new PlainTextFormatter();
    default:
      throw new ExportServiceError(
        `Unsupported export format: ${format as string}`,
        "UNSUPPORTED_FORMAT",
        { format }
      );
  }
}

/**
 * Validate that a sessionId is a non-empty string.
 */
function validateSessionId(sessionId: unknown): asserts sessionId is string {
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new ExportServiceError(
      "Invalid or missing sessionId",
      "INVALID_SESSION",
      { sessionId }
    );
  }
}

/**
 * Validate that a format is a supported FormatterFormat.
 */
function validateFormat(format: unknown): asserts format is FormatterFormat {
  if (format !== "markdown" && format !== "plaintext") {
    throw new ExportServiceError(
      `Unsupported export format: ${String(format)}`,
      "UNSUPPORTED_FORMAT",
      { format }
    );
  }
}

/** Options for generating an export. */
export interface GenerateExportOptions {
  sessionId: string;
  format: FormatterFormat;
  meetingData: RawMeetingData;
}

/**
 * Central ExportService that orchestrates the export process with cache-first logic.
 */
export const exportService = {
  /**
   * Generate an export with cache-first logic.
   *
   * 1. Validate inputs
   * 2. Check cache for existing export (sessionId + format)
   * 3. If cached, return immediately
   * 4. Otherwise, format content, save to DB, and return
   */
  async generateExport(options: GenerateExportOptions): Promise<ExportRecord> {
    validateSessionId(options.sessionId);
    validateFormat(options.format);

    const sessionId = options.sessionId.trim();
    const dbFormat = toDbFormat(options.format);

    // Cache-first: check for existing export
    let cached: ExportRecord | null;
    try {
      cached = await findExport(sessionId, dbFormat);
    } catch (err) {
      throw new ExportServiceError(
        "Failed to check export cache",
        "DATABASE_ERROR",
        { sessionId, format: options.format, cause: String(err) }
      );
    }

    if (cached) {
      return cached;
    }

    // Generate new export via formatter
    let content: string;
    let contentHash: string;
    try {
      const formatter = createFormatter(options.format);
      const result = formatter.format(sessionId, options.meetingData);
      content = result.content;
      contentHash = result.contentHash;
    } catch (err) {
      if (err instanceof ExportServiceError) throw err;
      throw new ExportServiceError(
        "Formatter failed to generate export content",
        "FORMATTER_ERROR",
        { sessionId, format: options.format, cause: String(err) }
      );
    }

    // Validate generated content
    if (!content || content.trim().length === 0) {
      throw new ExportServiceError(
        "Formatter produced empty content",
        "FORMATTER_ERROR",
        { sessionId, format: options.format }
      );
    }

    // Save to database
    try {
      const record = await createExport({
        sessionId,
        format: dbFormat,
        content,
      });
      return record;
    } catch (err) {
      throw new ExportServiceError(
        "Failed to save export to database",
        "DATABASE_ERROR",
        { sessionId, format: options.format, cause: String(err) }
      );
    }
  },

  /**
   * Retrieve export history for a session.
   */
  async getHistory(sessionId: string): Promise<ExportRecord[]> {
    validateSessionId(sessionId);
    try {
      return await getExportHistory(sessionId.trim());
    } catch (err) {
      throw new ExportServiceError(
        "Failed to retrieve export history",
        "DATABASE_ERROR",
        { sessionId, cause: String(err) }
      );
    }
  },

  /**
   * Retrieve a single export by its ID.
   */
  async getById(id: string): Promise<ExportRecord | null> {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new ExportServiceError(
        "Invalid export ID",
        "VALIDATION_ERROR",
        { id }
      );
    }
    try {
      return await getExportById(id.trim());
    } catch (err) {
      throw new ExportServiceError(
        "Failed to retrieve export",
        "DATABASE_ERROR",
        { id, cause: String(err) }
      );
    }
  },

  /**
   * Validate an export request without executing it.
   */
  validateRequest(options: {
    sessionId: unknown;
    format: unknown;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof options.sessionId !== "string" || (options.sessionId as string).trim().length === 0) {
      errors.push("sessionId is required and must be a non-empty string");
    }

    if (options.format !== "markdown" && options.format !== "plaintext") {
      errors.push(
        `Unsupported format: ${String(options.format)}. Supported formats: markdown, plaintext`
      );
    }

    return { valid: errors.length === 0, errors };
  },
};
