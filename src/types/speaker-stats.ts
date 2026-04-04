/**
 * Statistics for a single speaker within a meeting session.
 */
export interface SpeakerStats {
  speakerId: string;
  /** Total talk time in milliseconds */
  talkTime: number;
  /** Percentage of total meeting time (0-100) */
  percentageOfMeeting: number;
  /** Number of speaking turns */
  turnCount: number;
  /** Average duration of each speaking turn in milliseconds */
  averageTurnDuration: number;
  /** Number of times this speaker was interrupted */
  interruptionCount: number;
}

/**
 * Aggregated speaker statistics for an entire session.
 * Maps a sessionId to an array of per-speaker stats.
 */
export interface SessionSpeakerStats {
  sessionId: string;
  stats: SpeakerStats[];
}
