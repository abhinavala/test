export interface ParticipantEngagementScore {
  id: string;
  sessionId: string;
  participantId: string;
  score: number;
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
  calculatedAt: Date;
}

/** Result of a single participant's engagement calculation. */
export interface EngagementMetrics {
  talkTimeRatio: number;
  questionCount: number;
  responseRate: number;
  sentimentScore: number;
}

/** Input data for a single participant's engagement calculation. */
export interface ParticipantInput {
  participantId: string;
  /** Total talk time in milliseconds for this participant. */
  talkTimeMs: number;
  /** Number of questions asked by this participant. */
  questionCount: number;
  /** Number of questions directed at this participant. */
  questionsReceived: number;
  /** Number of those questions that were answered. */
  questionsAnswered: number;
  /** Sentiment score from -1 (negative) to 1 (positive). */
  sentimentScore: number;
}

/** Input for calculating engagement scores for a session. */
export interface EngagementCalculationInput {
  sessionId: string;
  participants: ParticipantInput[];
  /** Total session duration in milliseconds. */
  totalDurationMs: number;
}
