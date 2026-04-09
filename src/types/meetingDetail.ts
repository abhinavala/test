import type { MeetingSessionSummary } from "./meeting-summary.js";
import type { TranscriptSegment } from "./transcript.js";
import type { ActionItem } from "./exportContent.js";
import type { SpeakerStats } from "./speaker-stats.js";
import type { ParticipantEngagementScore } from "./engagement.js";

export type MeetingStatus = "scheduled" | "in-progress" | "completed";

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration?: number;
  status: MeetingStatus;
  participants: string[];
  organizer?: string;
}

export interface Transcript {
  segments: TranscriptSegment[];
  totalDuration: number;
}

export interface Summary {
  content: MeetingSessionSummary;
  generatedAt: Date;
}

export interface SentimentDataPoint {
  timestamp: number;
  score: number;
  label: "positive" | "neutral" | "negative";
}

export interface SentimentAnalysis {
  overall: number;
  timeline: SentimentDataPoint[];
}

export interface MeetingDetailData {
  meeting: Meeting;
  transcript?: Transcript;
  summary?: Summary;
  sentiment?: SentimentAnalysis;
  actionItems: ActionItem[];
  speakerStats?: SpeakerStats[];
  engagementScores?: ParticipantEngagementScore[];
}
