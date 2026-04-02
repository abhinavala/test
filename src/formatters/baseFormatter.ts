/**
 * Abstract base class for all export formatters.
 *
 * Provides shared infrastructure for extracting meeting data, generating
 * content hashes, and validating output. Concrete formatters (e.g. Markdown,
 * Plaintext) extend this class and implement the format-specific `formatContent`
 * method.
 */

import crypto from "crypto";
import type {
  ExportContent,
  ExportFormat,
  ExportMetadata,
} from "../types/exportContent.js";
import {
  extractMeetingData,
  generateContentHash,
  generateMeetingDataHash,
  normalizeForHashing,
  extractSpeakers,
  buildExportMetadata,
} from "../utils/exportUtils.js";
import type { MeetingData, RawMeetingData } from "../utils/exportUtils.js";

/** Result returned by the format method. */
export interface FormatResult {
  /** The formatted content string. */
  content: string;
  /** SHA-256 hash of the formatted content. */
  contentHash: string;
  /** Unique ID for this export operation. */
  exportId: string;
  /** Export metadata (session, format, timestamp, version). */
  metadata: ExportMetadata;
}

/**
 * Abstract base formatter that all export format implementations must extend.
 */
export abstract class BaseFormatter {
  /** Unique identifier for this export operation. */
  readonly exportId: string;

  /** The export format this formatter produces. */
  abstract readonly formatType: ExportFormat;

  constructor() {
    this.exportId = crypto.randomUUID();
  }

  /**
   * Format raw meeting data into the target format.
   *
   * Handles extraction, validation, formatting, and hash generation
   * in a single pipeline.
   */
  format(sessionId: string, rawMeetingData: RawMeetingData | null | undefined): FormatResult {
    const meetingData = extractMeetingData(rawMeetingData);
    const content = this.formatContent(meetingData);
    const contentHash = generateContentHash(content);
    const metadata = buildExportMetadata(sessionId, this.formatType);

    return {
      content,
      contentHash,
      exportId: this.exportId,
      metadata,
    };
  }

  /**
   * Format-specific content generation. Subclasses must implement this
   * to produce the actual formatted string from structured meeting data.
   */
  protected abstract formatContent(meetingData: MeetingData): string;

  /**
   * Extract and normalize raw meeting data into a structured MeetingData object.
   * Exposed for subclasses that need to access meeting data directly.
   */
  protected extractMeetingData(raw: RawMeetingData | null | undefined): MeetingData {
    return extractMeetingData(raw);
  }

  /**
   * Generate a SHA-256 hash for content.
   */
  protected generateContentHash(content: string): string {
    return generateContentHash(content);
  }

  /**
   * Generate a deterministic hash for meeting data (key-order independent).
   */
  protected generateMeetingDataHash(meetingData: MeetingData): string {
    return generateMeetingDataHash(meetingData);
  }

  /**
   * Extract unique speaker names from transcript segments, preserving order.
   */
  protected extractSpeakers(meetingData: MeetingData): string[] {
    return extractSpeakers(meetingData.transcript);
  }

  /**
   * Validate that exported content is non-empty and return integrity info.
   */
  validateExport(exportedContent: string): { valid: boolean; hash: string; exportId: string } {
    const hash = generateContentHash(exportedContent);
    return {
      valid: exportedContent.length > 0,
      hash,
      exportId: this.exportId,
    };
  }
}
