import type { KeyDecision, OpenQuestion, NextStep } from "./meeting-summary.js";
import type { TranscriptSegment } from "./transcript.js";
import type { ActionItem } from "./exportContent.js";

/** Input context for AI summary extraction. */
export interface ExtractionContext {
  /** The meeting session identifier. */
  meetingSessionId: string;
  /** Transcript segments to analyze. */
  transcriptSegments: TranscriptSegment[];
  /** Action items from the meeting. */
  actionItems: ActionItem[];
  /** Optional participant names for attribution. */
  participantNames?: string[];
}

/** Result of AI-powered summary extraction. */
export interface SummaryExtractionResult {
  /** Key decisions identified in the meeting. */
  keyDecisions: KeyDecision[];
  /** Open questions that remain unresolved. */
  openQuestions: OpenQuestion[];
  /** Next steps with owner assignments. */
  nextSteps: NextStep[];
  /** Confidence score between 0 and 1. */
  confidence: number;
  /** Processing time in milliseconds. */
  processingTime: number;
}

/** Configuration for the AI service. */
export interface AIServiceConfig {
  /** OpenAI API key. */
  apiKey: string;
  /** Model to use for extraction. */
  model: string;
  /** Maximum tokens for the response. */
  maxTokens: number;
  /** Temperature for generation. */
  temperature: number;
  /** Maximum number of retries on failure. */
  maxRetries: number;
  /** Base delay in ms for exponential backoff. */
  retryBaseDelayMs: number;
  /** Request timeout in ms. */
  timeoutMs: number;
}

/** Raw AI response structure before mapping to domain types. */
export interface AIExtractionResponse {
  keyDecisions: Array<{
    decision: string;
    participants: string[];
    timestamp?: string;
    context?: string;
  }>;
  openQuestions: Array<{
    question: string;
    raisedBy?: string;
    context?: string;
  }>;
  nextSteps: Array<{
    description: string;
    assignee?: string;
    priority: string;
    dueDate?: string;
  }>;
}
