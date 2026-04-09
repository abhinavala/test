/**
 * Error thrown when speaker analytics calculation fails.
 */
export class SpeakerAnalyticsError extends Error {
  readonly code: string;
  readonly sessionId?: string;

  constructor(message: string, code: string, sessionId?: string) {
    super(message);
    this.name = "SpeakerAnalyticsError";
    this.code = code;
    this.sessionId = sessionId;
  }
}

/**
 * Error thrown when a session cannot be found.
 */
export class SessionNotFoundError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
    this.sessionId = sessionId;
  }
}

/** Error codes for summary generation failures. */
export type SummaryGenerationErrorCode =
  | "SESSION_NOT_FOUND"
  | "INSUFFICIENT_DATA"
  | "AI_SERVICE_FAILURE"
  | "GENERATION_TIMEOUT"
  | "INVALID_SESSION_STATE";

/**
 * Error thrown when meeting filter validation fails.
 */
export class MeetingFilterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetingFilterValidationError";
  }
}

/**
 * Error thrown when a meeting cannot be found.
 */
export class MeetingNotFoundError extends Error {
  readonly meetingId: string;

  constructor(meetingId: string) {
    super(`Meeting not found: ${meetingId}`);
    this.name = "MeetingNotFoundError";
    this.meetingId = meetingId;
  }
}

/**
 * Error thrown when meeting summary generation fails.
 */
export class SummaryGenerationError extends Error {
  readonly code: SummaryGenerationErrorCode;
  readonly meetingSessionId: string;

  constructor(
    message: string,
    code: SummaryGenerationErrorCode,
    meetingSessionId: string
  ) {
    super(message);
    this.name = "SummaryGenerationError";
    this.code = code;
    this.meetingSessionId = meetingSessionId;
  }
}
