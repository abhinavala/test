/**
 * Plain text export formatter for meeting notes.
 *
 * Converts structured meeting data into clean, readable plain text
 * using spacing, indentation, and ASCII text decoration for visual
 * hierarchy. No markup syntax is used — output is suitable for email,
 * plain text editors, or systems that don't support markup.
 */

import { BaseFormatter } from "./baseFormatter.js";
import type { MeetingData, ActionItem, TranscriptSegment, ExportFormat } from "./baseFormatter.js";
import { sanitizeContent } from "../utils/exportUtils.js";

/**
 * Format an ISO-8601 date string into a human-readable form.
 * Returns the original string if parsing fails.
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format an ISO-8601 timestamp into a short time string (HH:MM:SS).
 * Returns the original string if parsing fails.
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Create a text underline of dashes matching the length of the given text.
 */
function underline(text: string): string {
  return "-".repeat(text.length);
}

/**
 * Concrete plain text formatter that extends BaseFormatter.
 */
export class PlainTextFormatter extends BaseFormatter {
  readonly formatType: ExportFormat = "plaintext";

  protected formatContent(meetingData: MeetingData): string {
    const sections: string[] = [];

    sections.push(this.formatTitle(meetingData));
    sections.push(this.formatMetadata(meetingData));

    if (meetingData.summary) {
      sections.push(this.formatSummary(meetingData.summary));
    }

    if (meetingData.actionItems.length > 0) {
      sections.push(this.formatActionItems(meetingData.actionItems));
    }

    if (meetingData.transcript.length > 0) {
      sections.push(this.formatTranscript(meetingData.transcript));
    }

    return sections.join("\n\n");
  }

  private formatTitle(meetingData: MeetingData): string {
    const title = sanitizeContent(meetingData.metadata.title);
    return `${title}\n${"=".repeat(title.length)}`;
  }

  private formatMetadata(meetingData: MeetingData): string {
    const { metadata } = meetingData;
    const lines: string[] = [];

    lines.push(`Date: ${formatDate(metadata.date)}`);

    if (metadata.duration !== undefined) {
      lines.push(`Duration: ${metadata.duration} minutes`);
    }

    if (metadata.organizer) {
      lines.push(`Organizer: ${sanitizeContent(metadata.organizer)}`);
    }

    if (metadata.participants && metadata.participants.length > 0) {
      const names = metadata.participants.map((p) => sanitizeContent(p));
      lines.push(`Participants: ${names.join(", ")}`);
    }

    return lines.join("\n");
  }

  private formatSummary(summary: string): string {
    const header = "Summary";
    return `${header}\n${underline(header)}\n\n${sanitizeContent(summary)}`;
  }

  formatActionItems(actionItems: ActionItem[]): string {
    const header = "Action Items";
    const lines: string[] = [`${header}\n${underline(header)}`, ""];

    for (let i = 0; i < actionItems.length; i++) {
      const item = actionItems[i];
      const num = i + 1;
      lines.push(`${num}. ${sanitizeContent(item.description)}`);

      if (item.assigneeName) {
        lines.push(`   Assignee: ${sanitizeContent(item.assigneeName)}`);
      }
      if (item.dueDate) {
        lines.push(`   Due: ${formatDate(item.dueDate)}`);
      }
      if (item.priority) {
        lines.push(`   Priority: ${item.priority}`);
      }
      lines.push(`   Status: ${item.status}`);
    }

    return lines.join("\n");
  }

  private formatTranscript(transcript: TranscriptSegment[]): string {
    const header = "Transcript";
    const lines: string[] = [`${header}\n${underline(header)}`, ""];

    for (const segment of transcript) {
      const time = formatTime(segment.timestamp);
      const speaker = sanitizeContent(segment.speakerName);
      const text = sanitizeContent(segment.text);
      lines.push(`[${time}] ${speaker}: ${text}`);
    }

    return lines.join("\n");
  }
}
