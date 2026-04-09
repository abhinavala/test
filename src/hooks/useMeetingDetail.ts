import type { MeetingSessionSummary } from "../types/meeting-summary.js";
import type { TranscriptSegment } from "../types/transcript.js";
import type { ActionItem } from "../types/exportContent.js";
import type { SpeakerStats } from "../types/speaker-stats.js";
import type { ParticipantEngagementScore } from "../types/engagement.js";

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

export interface UseMeetingDetailResult {
  data: MeetingDetailData | null;
  loading: boolean;
  error: string | null;
}

export async function fetchMeetingDetail(
  meetingId: string,
): Promise<MeetingDetailData> {
  const response = await fetch(`/api/meetings/${meetingId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Meeting not found");
    }
    throw new Error(`Failed to fetch meeting: ${response.statusText}`);
  }

  const data = (await response.json()) as MeetingDetailData;
  return data;
}

export function useMeetingDetail(meetingId: string): UseMeetingDetailResult {
  let data: MeetingDetailData | null = null;
  let loading = true;
  let error: string | null = null;

  const promise = fetchMeetingDetail(meetingId)
    .then((result) => {
      data = result;
      loading = false;
    })
    .catch((err: Error) => {
      error = err.message;
      loading = false;
    });

  void promise;

  return { data, loading, error };
}

export default useMeetingDetail;
