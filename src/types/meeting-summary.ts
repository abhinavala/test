/**
 * Data models for the Meeting Summary Generation feature.
 *
 * Defines the complete structure for meeting summaries including
 * key decisions, open questions, and next steps with priority
 * tracking and participant context.
 */

/** Priority level for a next step action. */
export enum NextStepPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

/** A key decision made during the meeting. */
export interface KeyDecision {
  /** Unique identifier for this decision. */
  id: string;
  /** Description of the decision that was made. */
  description: string;
  /** Participants involved in making this decision. */
  participants: string[];
  /** ISO-8601 timestamp for when this decision was made. */
  madeAt?: string;
  /** Additional context or rationale for the decision. */
  context?: string;
}

/** An open question raised during the meeting that remains unresolved. */
export interface OpenQuestion {
  /** Unique identifier for this question. */
  id: string;
  /** The question text. */
  question: string;
  /** Person responsible for following up on this question. */
  ownerId?: string;
  /** Name of the person who raised the question. */
  raisedBy?: string;
  /** Additional context about the question. */
  context?: string;
}

/** A next step or action item derived from the meeting. */
export interface NextStep {
  /** Unique identifier for this next step. */
  id: string;
  /** Description of the action to be taken. */
  description: string;
  /** Person assigned to this next step. */
  assigneeId?: string;
  /** Name of the assignee. */
  assigneeName?: string;
  /** Priority level for this next step. */
  priority: NextStepPriority;
  /** ISO-8601 date string for when this step is due. */
  dueDate?: string;
}

/** A complete meeting session summary. */
export interface MeetingSessionSummary {
  /** Unique identifier for this summary. */
  id: string;
  /** The meeting session this summary belongs to. */
  meetingSessionId: string;
  /** Key decisions made during the meeting. */
  keyDecisions: KeyDecision[];
  /** Open questions that remain unresolved. */
  openQuestions: OpenQuestion[];
  /** Next steps and action items from the meeting. */
  nextSteps: NextStep[];
  /** Timestamp when this summary was generated. */
  generatedAt: Date;
  /** Identifier for the service or user that generated this summary. */
  generatedBy: string;
}
