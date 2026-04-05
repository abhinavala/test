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

export interface SessionEngagementSummary {
  sessionId: string;
  averageScore: number;
  participantScores: ParticipantEngagementScore[];
  calculatedAt: Date;
}
