/**
 * Markdown export formatter for meeting notes.
 *
 * Converts structured meeting data into well-formatted markdown with
 * proper heading hierarchy, bullet points for action items, and
 * speaker-attributed transcript sections.
 */

import { BaseFormatter } from "./baseFormatter.js";
import type { MeetingData, ActionItem, TranscriptSegment, ExportFormat } from "./baseFormatter.js";
import { sanitizeContent } from "../utils/exportUtils.js";

/**
 * Escape markdown special characters in text content.
 * Preserves intentional markdown structure while preventing
 * user-supplied content from breaking the document format.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\*#\[\]()_~`>+\-!|{}])/g, "\\$1");
}

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
 * Concrete markdown formatter that extends BaseFormatter.
 */
export class MarkdownFormatter extends BaseFormatter {
  readonly formatType: ExportFormat = "markdown";

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
    return `# ${escapeMarkdown(sanitizeContent(meetingData.metadata.title))}`;
  }

  private formatMetadata(meetingData: MeetingData): string {
    const { metadata } = meetingData;
    const lines: string[] = [];

    lines.push(`**Date:** ${formatDate(metadata.date)}`);

    if (metadata.duration !== undefined) {
      lines.push(`**Duration:** ${metadata.duration} minutes`);
    }

    if (metadata.organizer) {
      lines.push(`**Organizer:** ${escapeMarkdown(sanitizeContent(metadata.organizer))}`);
    }

    if (metadata.participants && metadata.participants.length > 0) {
      const escaped = metadata.participants.map((p) => escapeMarkdown(sanitizeContent(p)));
      lines.push(`**Participants:** ${escaped.join(", ")}`);
    }

    return lines.join("\n");
  }

  private formatSummary(summary: string): string {
    return `## Summary\n\n${escapeMarkdown(sanitizeContent(summary))}`;
  }

  formatActionItems(actionItems: ActionItem[]): string {
    const lines: string[] = ["## Action Items", ""];

    for (const item of actionItems) {
      const status = item.status === "completed" ? "x" : " ";
      let line = `- [${status}] ${escapeMarkdown(sanitizeContent(item.description))}`;

      const details: string[] = [];
      if (item.assigneeName) {
        details.push(`**Assignee:** ${escapeMarkdown(sanitizeContent(item.assigneeName))}`);
      }
      if (item.dueDate) {
        details.push(`**Due:** ${formatDate(item.dueDate)}`);
      }
      if (item.priority) {
        details.push(`**Priority:** ${item.priority}`);
      }

      if (details.length > 0) {
        line += ` (${details.join(" | ")})`;
      }

      lines.push(line);
    }

    return lines.join("\n");
  }

  private formatTranscript(transcript: TranscriptSegment[]): string {
    const lines: string[] = ["## Transcript", ""];

    for (const segment of transcript) {
      const time = formatTime(segment.timestamp);
      const speaker = escapeMarkdown(sanitizeContent(segment.speakerName));
      const text = escapeMarkdown(sanitizeContent(segment.text));
      lines.push(`**[${time}] ${speaker}:** ${text}`);
    }

    return lines.join("\n\n");
  }
}
