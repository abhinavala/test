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
