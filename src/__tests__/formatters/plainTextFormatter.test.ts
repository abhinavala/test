import { describe, it, expect, beforeEach } from "vitest";
import { PlainTextFormatter } from "../../formatters/plainTextFormatter.js";
import type { RawMeetingData } from "../../utils/exportUtils.js";

const fullMeeting: RawMeetingData = {
  meetingId: "meeting-123",
  title: "Sprint Planning",
  date: "2026-04-01T10:00:00Z",
  duration: 60,
  participants: ["Alice", "Bob", "Charlie"],
  organizer: "Alice",
  summary: "Discussed sprint goals and assigned tasks for Q2.",
  actionItems: [
    {
      id: "action-1",
      description: "Update the API documentation",
      assigneeName: "Bob",
      assigneeId: "user-bob",
      dueDate: "2026-04-10T00:00:00Z",
      status: "open",
      priority: "high",
    },
    {
      id: "action-2",
      description: "Deploy to staging",
      assigneeName: "Charlie",
      status: "completed",
      priority: "medium",
    },
  ],
  transcript: [
    {
      speakerName: "Alice",
      speakerId: "user-alice",
      timestamp: "2026-04-01T10:00:00Z",
      text: "Let us start the sprint planning meeting.",
      confidence: 0.95,
    },
    {
      speakerName: "Bob",
      timestamp: "2026-04-01T10:01:30Z",
      text: "I will handle the API docs update.",
      confidence: 0.88,
    },
  ],
};

describe("PlainTextFormatter", () => {
  let formatter: PlainTextFormatter;

  beforeEach(() => {
    formatter = new PlainTextFormatter();
  });

  it("has formatType set to plaintext", () => {
    expect(formatter.formatType).toBe("plaintext");
  });

  describe("format generates complete plain text document with all sections and proper spacing", () => {
    it("returns string with clear section headers, formatted action items as numbered list, and transcript with speaker names", () => {
      const result = formatter.format("session-1", fullMeeting);

      // Title with underline
      expect(result.content).toContain("Sprint Planning");
      expect(result.content).toContain("===============");

      // Metadata
      expect(result.content).toContain("Date:");
      expect(result.content).toContain("Duration: 60 minutes");
      expect(result.content).toContain("Organizer: Alice");
      expect(result.content).toContain("Participants: Alice, Bob, Charlie");

      // Summary section with dash underline
      expect(result.content).toContain("Summary\n-------");
      expect(result.content).toContain("Discussed sprint goals and assigned tasks for Q2.");

      // Action items section with numbered list
      expect(result.content).toContain("Action Items\n------------");
      expect(result.content).toContain("1. Update the API documentation");
      expect(result.content).toContain("   Assignee: Bob");
      expect(result.content).toContain("2. Deploy to staging");

      // Transcript section with speaker attribution
      expect(result.content).toContain("Transcript\n----------");
      expect(result.content).toContain("Alice: Let us start the sprint planning meeting.");
      expect(result.content).toContain("Bob: I will handle the API docs update.");

      // FormatResult structure
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.exportId).toBe(formatter.exportId);
      expect(result.metadata.sessionId).toBe("session-1");
      expect(result.metadata.format).toBe("plaintext");
    });
  });

  describe("format preserves special characters without escaping or modification", () => {
    it("characters like *, #, [], () appear unchanged in output, no backslashes or encoding applied", () => {
      const meetingWithSpecialChars: RawMeetingData = {
        title: "Meeting *with* [special] (chars) #1",
        summary: "Discussion about `code` and ~strikethrough~ items > 5",
        actionItems: [
          {
            id: "a1",
            description: "Fix bug in **critical** path",
            assigneeName: "User_One",
            status: "open",
          },
        ],
        transcript: [
          {
            speakerName: "Speaker #1",
            timestamp: "2026-04-01T10:00:00Z",
            text: "We need to update [config] file (path/to/file)",
          },
        ],
      };

      const result = formatter.format("session-2", meetingWithSpecialChars);

      // Special characters are preserved as-is, no backslash escaping
      expect(result.content).toContain("Meeting *with* [special] (chars) #1");
      expect(result.content).toContain("`code`");
      expect(result.content).toContain("~strikethrough~");
      expect(result.content).toContain("> 5");
      expect(result.content).toContain("**critical**");
      expect(result.content).toContain("[config]");
      expect(result.content).toContain("(path/to/file)");
      expect(result.content).toContain("Speaker #1:");

      // No backslash escaping anywhere
      expect(result.content).not.toContain("\\*");
      expect(result.content).not.toContain("\\[");
      expect(result.content).not.toContain("\\(");
      expect(result.content).not.toContain("\\#");
      expect(result.content).not.toContain("\\`");
      expect(result.content).not.toContain("\\~");
    });
  });

  describe("formatActionItems creates consistently indented numbered list with assignee details", () => {
    it("each action item has number, description, and assignee on separate indented lines with consistent spacing", () => {
      const result = formatter.formatActionItems(
        fullMeeting.actionItems!.map((item) => ({
          id: item.id || "generated-id",
          description: item.description || "",
          status: (item.status as "open" | "in-progress" | "completed") || "open",
          assigneeName: item.assigneeName,
          assigneeId: item.assigneeId,
          dueDate: item.dueDate,
          priority: item.priority as "low" | "medium" | "high" | undefined,
        }))
      );

      // Numbered items
      expect(result).toContain("1. Update the API documentation");
      expect(result).toContain("   Assignee: Bob");
      expect(result).toContain("   Priority: high");
      expect(result).toContain("   Status: open");

      expect(result).toContain("2. Deploy to staging");
      expect(result).toContain("   Assignee: Charlie");
      expect(result).toContain("   Priority: medium");
      expect(result).toContain("   Status: completed");
    });

    it("handles action items without optional fields", () => {
      const result = formatter.formatActionItems([
        {
          id: "a1",
          description: "Simple task",
          status: "open",
        },
      ]);

      expect(result).toContain("1. Simple task");
      expect(result).toContain("   Status: open");
      expect(result).not.toContain("Assignee:");
      expect(result).not.toContain("Due:");
      expect(result).not.toContain("Priority:");
    });
  });

  describe("edge cases", () => {
    it("handles empty meeting data (null)", () => {
      const result = formatter.format("session-empty", null);

      expect(result.content).toContain("Untitled Meeting");
      expect(result.content).toContain("Date:");
      // Should not have summary, action items, or transcript sections
      expect(result.content).not.toContain("Summary\n-------");
      expect(result.content).not.toContain("Action Items");
      expect(result.content).not.toContain("Transcript");
    });

    it("handles meeting with empty sections", () => {
      const result = formatter.format("session-minimal", {
        title: "Minimal Meeting",
        date: "2026-04-01T10:00:00Z",
        summary: "",
        actionItems: [],
        transcript: [],
      });

      expect(result.content).toContain("Minimal Meeting");
      expect(result.content).not.toContain("Summary\n-------");
      expect(result.content).not.toContain("Action Items");
      expect(result.content).not.toContain("Transcript");
    });

    it("handles meeting with only summary", () => {
      const result = formatter.format("session-summary", {
        title: "Summary Only",
        summary: "Just a summary",
      });

      expect(result.content).toContain("Summary\n-------");
      expect(result.content).toContain("Just a summary");
      expect(result.content).not.toContain("Action Items");
      expect(result.content).not.toContain("Transcript");
    });

    it("produces consistent content hash for identical input", () => {
      const r1 = formatter.format("s1", fullMeeting);
      const r2 = new PlainTextFormatter().format("s1", fullMeeting);
      expect(r1.contentHash).toBe(r2.contentHash);
    });
  });

  describe("section header formatting", () => {
    it("uses = underline for title and - underline for sections", () => {
      const result = formatter.format("session-headings", fullMeeting);

      // Title uses = underline
      expect(result.content).toContain("Sprint Planning\n===============");

      // Sections use - underline
      expect(result.content).toContain("Summary\n-------");
      expect(result.content).toContain("Action Items\n------------");
      expect(result.content).toContain("Transcript\n----------");
    });
  });

  describe("transcript formatting", () => {
    it("includes speaker name and timestamp for each segment", () => {
      const result = formatter.format("session-transcript", {
        transcript: [
          {
            speakerName: "Alice",
            timestamp: "2026-04-01T10:00:00Z",
            text: "Hello everyone.",
          },
          {
            speakerName: "Bob",
            timestamp: "2026-04-01T10:01:00Z",
            text: "Hi Alice.",
          },
        ],
      });

      expect(result.content).toContain("Transcript\n----------");
      expect(result.content).toContain("Alice: Hello everyone.");
      expect(result.content).toContain("Bob: Hi Alice.");
      // Timestamps are in brackets
      expect(result.content).toMatch(/\[\d{2}:\d{2}:\d{2}\] Alice:/);
      expect(result.content).toMatch(/\[\d{2}:\d{2}:\d{2}\] Bob:/);
    });
  });
});
