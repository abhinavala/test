import type { MeetingSessionSummary } from "./meeting-summary.js";
import type { TranscriptSegment } from "./transcript.js";
import type { ActionItem } from "./exportContent.js";

/** Options for controlling summary generation behavior. */
export interface SummaryGenerationOptions {
  /** Force regeneration even if a summary already exists. */
  forceRegenerate?: boolean;
  /** Include transcript segments in the extraction context. */
  includeTranscript?: boolean;
  /** Include action items in the extraction context. */
  includeActionItems?: boolean;
  /** Run generation in background mode (non-blocking). */
  backgroundProcessing?: boolean;
  /** Transcript segments to use for extraction. When provided, skips data retrieval. */
  transcriptSegments?: TranscriptSegment[];
  /** Action items to use for extraction. When provided, skips data retrieval. */
  actionItems?: ActionItem[];
}

/** Result returned after summary generation completes. */
export interface SummaryGenerationResult {
  /** The generated or existing meeting summary. */
  summary: MeetingSessionSummary;
  /** Whether this result was from a forced regeneration. */
  wasRegenerated: boolean;
  /** Total processing time in milliseconds. */
  processingTime: number;
}

/** Status of a background summary generation task. */
export type SummaryGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

/** Progress tracking for background summary generation. */
export interface SummaryGenerationProgress {
  /** The meeting session ID being processed. */
  meetingSessionId: string;
  /** Current status of the generation task. */
  status: SummaryGenerationStatus;
  /** Progress percentage (0-100). */
  progress: number;
  /** Error message if status is 'failed'. */
  error?: string;
  /** Timestamp when processing started. */
  startedAt: Date;
  /** Timestamp when processing completed. */
  completedAt?: Date;
}
