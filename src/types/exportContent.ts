/**
 * Export content data model for the Meeting Notes Export system.
 *
 * Defines the complete structure for meeting export content including
 * metadata, summary, action items, and transcript segments. All types
 * are serializable for database caching and support both markdown and
 * plain text formatting pipelines.
 */

/** Supported export output formats. */
export type ExportFormat = 'markdown' | 'plaintext';

/** Status of an action item extracted from a meeting. */
export type ActionItemStatus = 'open' | 'in-progress' | 'completed';

/** Priority level for an action item. */
export type ActionItemPriority = 'low' | 'medium' | 'high';

/** Metadata describing the meeting itself. */
export interface MeetingMetadata {
  /** Unique identifier for the meeting. */
  meetingId: string;
  /** Display title of the meeting. */
  title: string;
  /** ISO-8601 date string for when the meeting occurred. */
  date: string;
  /** Duration of the meeting in minutes. */
  duration?: number;
  /** List of participant names or identifiers. */
  participants?: string[];
  /** Organizer or host of the meeting. */
  organizer?: string;
}

/** A single action item extracted from the meeting. */
export interface ActionItem {
  /** Unique identifier for the action item. */
  id: string;
  /** Description of the action to be taken. */
  description: string;
  /** Name of the person assigned to this action. */
  assigneeName?: string;
  /** System identifier for the assignee, if available. */
  assigneeId?: string;
  /** ISO-8601 date string for when the action is due. */
  dueDate?: string;
  /** Current status of the action item. */
  status: ActionItemStatus;
  /** Priority level for the action item. */
  priority?: ActionItemPriority;
}

/** A segment of the meeting transcript attributed to a speaker. */
export interface TranscriptSegment {
  /** Name of the speaker for this segment. */
  speakerName: string;
  /** System identifier for the speaker, if available. */
  speakerId?: string;
  /** ISO-8601 timestamp for when this segment was spoken. */
  timestamp: string;
  /** The transcribed text content. */
  text: string;
  /** Transcription confidence score between 0 and 1. */
  confidence?: number;
}

/**
 * Metadata about the export operation itself (as distinct from the meeting).
 *
 * Tracks the session, format, generation timestamp, and version so the
 * caching layer can deduplicate by sessionId+format and downstream
 * consumers can detect schema changes.
 */
export interface ExportMetadata {
  /** Unique identifier for this export session. */
  sessionId: string;
  /** The format this export was rendered in. */
  format: ExportFormat;
  /** ISO-8601 timestamp for when this export was generated. */
  generatedAt: string;
  /** Schema version for forward-compatible deserialization. */
  version: string;
}

/**
 * Complete export content structure representing all data needed
 * to render a meeting export in any supported format.
 *
 * Designed to be serializable (JSON-safe) for caching in the database.
 * All date/time fields use ISO-8601 strings rather than Date objects.
 */
export interface ExportContent {
  /** Unique identifier for this export session. */
  sessionId: string;
  /** Meeting metadata (title, date, participants, etc.). */
  metadata: MeetingMetadata;
  /** AI-generated summary of the meeting. */
  summary?: string;
  /** Action items extracted from the meeting. */
  actionItems: ActionItem[];
  /** Full transcript organized by speaker segments. */
  transcript: TranscriptSegment[];
  /** The format this content is intended to be rendered in. */
  format: ExportFormat;
  /** ISO-8601 timestamp for when this export was generated. */
  generatedAt: string;
}
