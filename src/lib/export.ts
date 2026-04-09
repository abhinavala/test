import type { MeetingSessionSummary } from "../types/meeting-summary.js";
import type { ActionItem } from "../types/exportContent.js";
import type { TranscriptSegment } from "../types/transcript.js";
import type { SpeakerStats } from "../types/speaker-stats.js";

export interface ExportOptions {
  format: "markdown" | "plaintext" | "csv" | "notion" | "jira";
  meetingId: string;
}

export interface MeetingExportData {
  title: string;
  date: string;
  duration?: number;
  participants: string[];
  summary?: MeetingSessionSummary;
  actionItems: ActionItem[];
  transcript: TranscriptSegment[];
  speakerStats?: SpeakerStats[];
}

const SUPPORTED_FORMATS = new Set<string>([
  "markdown",
  "plaintext",
  "csv",
  "notion",
  "jira",
]);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function exportAsMarkdown(data: MeetingExportData): string {
  const lines: string[] = [];

  lines.push(`# ${data.title}`);
  lines.push("");
  lines.push(`**Date:** ${data.date}`);
  if (data.duration) {
    lines.push(`**Duration:** ${data.duration} minutes`);
  }
  if (data.participants.length > 0) {
    lines.push(`**Participants:** ${data.participants.join(", ")}`);
  }
  lines.push("");

  if (data.summary) {
    lines.push("## Summary");
    lines.push("");
    if (data.summary.keyDecisions.length > 0) {
      lines.push("### Key Decisions");
      lines.push("");
      for (const decision of data.summary.keyDecisions) {
        lines.push(`- ${decision.description}`);
        if (decision.participants.length > 0) {
          lines.push(`  - Participants: ${decision.participants.join(", ")}`);
        }
      }
      lines.push("");
    }
    if (data.summary.openQuestions.length > 0) {
      lines.push("### Open Questions");
      lines.push("");
      for (const question of data.summary.openQuestions) {
        lines.push(`- ${question.question}`);
        if (question.raisedBy) {
          lines.push(`  - Raised by: ${question.raisedBy}`);
        }
      }
      lines.push("");
    }
    if (data.summary.nextSteps.length > 0) {
      lines.push("### Next Steps");
      lines.push("");
      for (const step of data.summary.nextSteps) {
        lines.push(
          `- ${step.description} (${step.priority})${step.assigneeName ? ` — ${step.assigneeName}` : ""}`,
        );
      }
      lines.push("");
    }
  }

  if (data.actionItems.length > 0) {
    lines.push("## Action Items");
    lines.push("");
    for (const item of data.actionItems) {
      const checkbox = item.status === "completed" ? "[x]" : "[ ]";
      lines.push(
        `- ${checkbox} ${item.description}${item.assigneeName ? ` (@${item.assigneeName})` : ""}`,
      );
    }
    lines.push("");
  }

  if (data.transcript.length > 0) {
    lines.push("## Transcript");
    lines.push("");
    for (const segment of data.transcript) {
      lines.push(
        `**${segment.speakerId}** [${formatTimestamp(segment.startTime)}]: ${segment.text}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function exportAsPlaintext(data: MeetingExportData): string {
  const lines: string[] = [];

  lines.push(data.title);
  lines.push("=".repeat(data.title.length));
  lines.push("");
  lines.push(`Date: ${data.date}`);
  if (data.duration) {
    lines.push(`Duration: ${data.duration} minutes`);
  }
  if (data.participants.length > 0) {
    lines.push(`Participants: ${data.participants.join(", ")}`);
  }
  lines.push("");

  if (data.summary) {
    lines.push("Summary");
    lines.push("-".repeat(7));
    lines.push("");
    if (data.summary.keyDecisions.length > 0) {
      lines.push("Key Decisions:");
      for (const decision of data.summary.keyDecisions) {
        lines.push(`  * ${decision.description}`);
      }
      lines.push("");
    }
    if (data.summary.openQuestions.length > 0) {
      lines.push("Open Questions:");
      for (const question of data.summary.openQuestions) {
        lines.push(`  * ${question.question}`);
      }
      lines.push("");
    }
    if (data.summary.nextSteps.length > 0) {
      lines.push("Next Steps:");
      for (const step of data.summary.nextSteps) {
        lines.push(`  * ${step.description} [${step.priority}]`);
      }
      lines.push("");
    }
  }

  if (data.actionItems.length > 0) {
    lines.push("Action Items");
    lines.push("-".repeat(12));
    lines.push("");
    for (let i = 0; i < data.actionItems.length; i++) {
      const item = data.actionItems[i]!;
      const status = item.status === "completed" ? "DONE" : "TODO";
      lines.push(`  ${i + 1}. [${status}] ${item.description}`);
      if (item.assigneeName) {
        lines.push(`     Assigned to: ${item.assigneeName}`);
      }
    }
    lines.push("");
  }

  if (data.transcript.length > 0) {
    lines.push("Transcript");
    lines.push("-".repeat(10));
    lines.push("");
    for (const segment of data.transcript) {
      lines.push(
        `[${formatTimestamp(segment.startTime)}] ${segment.speakerId}: ${segment.text}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function exportAsCsv(data: MeetingExportData): string {
  const lines: string[] = [];

  lines.push("Type,Description,Assignee,Status,Priority,Due Date");

  for (const item of data.actionItems) {
    const description = item.description.replace(/"/g, '""');
    lines.push(
      `"Action Item","${description}","${item.assigneeName ?? ""}","${item.status}","${item.priority ?? ""}","${item.dueDate ?? ""}"`,
    );
  }

  if (data.summary) {
    for (const decision of data.summary.keyDecisions) {
      const desc = decision.description.replace(/"/g, '""');
      lines.push(
        `"Decision","${desc}","${decision.participants.join("; ")}","","",""`,
      );
    }
    for (const step of data.summary.nextSteps) {
      const desc = step.description.replace(/"/g, '""');
      lines.push(
        `"Next Step","${desc}","${step.assigneeName ?? ""}","","${step.priority}","${step.dueDate ?? ""}"`,
      );
    }
  }

  return lines.join("\n");
}

function exportAsNotion(data: MeetingExportData): string {
  const blocks: object[] = [];

  blocks.push({
    type: "heading_1",
    content: data.title,
  });

  blocks.push({
    type: "paragraph",
    content: `Date: ${data.date}${data.duration ? ` | Duration: ${data.duration}min` : ""}`,
  });

  if (data.summary) {
    blocks.push({ type: "heading_2", content: "Summary" });
    for (const decision of data.summary.keyDecisions) {
      blocks.push({ type: "bulleted_list_item", content: decision.description });
    }
  }

  if (data.actionItems.length > 0) {
    blocks.push({ type: "heading_2", content: "Action Items" });
    for (const item of data.actionItems) {
      blocks.push({
        type: "to_do",
        checked: item.status === "completed",
        content: `${item.description}${item.assigneeName ? ` — ${item.assigneeName}` : ""}`,
      });
    }
  }

  return JSON.stringify(blocks, null, 2);
}

function exportAsJira(data: MeetingExportData): string {
  const lines: string[] = [];

  lines.push(`h1. ${data.title}`);
  lines.push("");
  lines.push(`*Date:* ${data.date}`);
  if (data.duration) {
    lines.push(`*Duration:* ${data.duration} minutes`);
  }
  lines.push("");

  if (data.summary) {
    lines.push("h2. Summary");
    lines.push("");
    for (const decision of data.summary.keyDecisions) {
      lines.push(`* ${decision.description}`);
    }
    lines.push("");
  }

  if (data.actionItems.length > 0) {
    lines.push("h2. Action Items");
    lines.push("");
    lines.push("||Description||Assignee||Status||Priority||");
    for (const item of data.actionItems) {
      lines.push(
        `|${item.description}|${item.assigneeName ?? "Unassigned"}|${item.status}|${item.priority ?? "medium"}|`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function exportMeeting(
  options: ExportOptions,
  data: MeetingExportData,
): string {
  if (!SUPPORTED_FORMATS.has(options.format)) {
    throw new ValidationError("Invalid export format");
  }

  switch (options.format) {
    case "markdown":
      return exportAsMarkdown(data);
    case "plaintext":
      return exportAsPlaintext(data);
    case "csv":
      return exportAsCsv(data);
    case "notion":
      return exportAsNotion(data);
    case "jira":
      return exportAsJira(data);
  }
}
