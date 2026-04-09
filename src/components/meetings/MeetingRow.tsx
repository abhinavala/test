/**
 * MeetingRow component for displaying a single meeting in the table.
 *
 * Shows meeting title, status, date/time, duration, participant count,
 * and quick action buttons. Numeric data uses monospace font.
 */

import type { Meeting, MeetingStatus } from "../../types/meetingsList.js";

export interface MeetingRowProps {
  meeting: Meeting;
  onView?: (meetingId: string) => void;
  onExport?: (meetingId: string) => void;
  onDelete?: (meetingId: string) => void;
}

/** Map meeting status to a display label. */
export function getStatusLabel(status: MeetingStatus): string {
  const labels: Record<MeetingStatus, string> = {
    "scheduled": "Scheduled",
    "in-progress": "In Progress",
    "completed": "Completed",
    "cancelled": "Cancelled",
  };
  return labels[status];
}

/** Map meeting status to a CSS class for styling. */
export function getStatusClass(status: MeetingStatus): string {
  const classes: Record<MeetingStatus, string> = {
    "scheduled": "status--scheduled",
    "in-progress": "status--in-progress",
    "completed": "status--completed",
    "cancelled": "status--cancelled",
  };
  return classes[status];
}

/** Format duration in milliseconds to a human-readable string. */
export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined || durationMs === null) {
    return "—";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Format an ISO date string to a localized display format. */
export function formatMeetingDate(isoDate: string): string {
  const date = new Date(isoDate);

  if (isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format an ISO date string to a time display. */
export function formatMeetingTime(isoDate: string): string {
  const date = new Date(isoDate);

  if (isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Build the list of quick actions available for a meeting. */
export function getAvailableActions(
  meeting: Meeting,
): Array<{ action: string; label: string; enabled: boolean }> {
  return [
    { action: "view", label: "View Details", enabled: true },
    {
      action: "export",
      label: "Export",
      enabled: meeting.status === "completed",
    },
    {
      action: "delete",
      label: "Delete",
      enabled: meeting.status !== "in-progress",
    },
  ];
}

export default MeetingRowProps;
