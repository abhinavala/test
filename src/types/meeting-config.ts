export interface MeetingEndConfig {
  autoGenerateSummary: boolean;
  minMeetingDuration: number;
  summaryRetryAttempts: number;
  summaryRetryDelay: number;
}

export interface MeetingSession {
  sessionId: string;
  startTime: number;
  endTime: number;
}

export const DEFAULT_MEETING_END_CONFIG: MeetingEndConfig = {
  autoGenerateSummary: true,
  minMeetingDuration: 60_000,
  summaryRetryAttempts: 3,
  summaryRetryDelay: 2_000,
};
