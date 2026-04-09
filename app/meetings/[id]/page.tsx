import { FC } from "react";
import { MeetingHeader } from "../../../src/components/meeting/MeetingHeader.js";
import { TranscriptViewer } from "../../../src/components/meeting/TranscriptViewer.js";
import { SummarySection } from "../../../src/components/meeting/SummarySection.js";
import { ParticipantAnalytics } from "../../../src/components/meeting/ParticipantAnalytics.js";
import { ActionItemsList } from "../../../src/components/meeting/ActionItemsList.js";
import { ExportControls } from "../../../src/components/meeting/ExportControls.js";
import {
  useMeetingDetail,
  type MeetingDetailData,
} from "../../../src/hooks/useMeetingDetail.js";
import type { MeetingExportData } from "../../../src/lib/export.js";

interface MeetingDetailPageProps {
  params: { id: string };
}

function buildExportData(data: MeetingDetailData): MeetingExportData {
  return {
    title: data.meeting.title,
    date: data.meeting.date,
    duration: data.meeting.duration,
    participants: data.meeting.participants,
    summary: data.summary?.content,
    actionItems: data.actionItems,
    transcript: data.transcript?.segments ?? [],
    speakerStats: data.speakerStats,
  };
}

export default function MeetingDetailPage({
  params,
}: MeetingDetailPageProps): JSX.Element {
  const { data, loading, error } = useMeetingDetail(params.id);

  if (error) {
    return (
      <div className="meeting-detail meeting-detail--error" data-testid="meeting-detail-error">
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="meeting-detail meeting-detail--loading" data-testid="meeting-detail-loading">
        <div className="loading-placeholder">Loading meeting details...</div>
      </div>
    );
  }

  const isCompleted = data.meeting.status === "completed";

  return (
    <div className="meeting-detail" data-testid="meeting-detail">
      <MeetingHeader meeting={data.meeting} />

      {isCompleted && (
        <SummarySection
          summary={data.summary}
          sentiment={data.sentiment}
        />
      )}

      <ActionItemsList actionItems={data.actionItems} />

      {isCompleted && (
        <ParticipantAnalytics
          speakerStats={data.speakerStats}
          engagementScores={data.engagementScores}
        />
      )}

      <TranscriptViewer transcript={data.transcript} />

      {isCompleted && (
        <ExportControls
          meetingId={params.id}
          exportData={buildExportData(data)}
        />
      )}
    </div>
  );
}
