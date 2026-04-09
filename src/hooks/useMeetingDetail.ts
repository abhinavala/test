export type {
  MeetingStatus,
  Meeting,
  Transcript,
  Summary,
  SentimentDataPoint,
  SentimentAnalysis,
  MeetingDetailData,
} from "../types/meetingDetail.js";

import type { MeetingDetailData } from "../types/meetingDetail.js";

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
