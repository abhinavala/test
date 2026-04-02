import { describe, it, expect, beforeEach } from "vitest";
import { MarkdownFormatter } from "../../formatters/markdownFormatter.js";
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

describe("MarkdownFormatter", () => {
  let formatter: MarkdownFormatter;

  beforeEach(() => {
    formatter = new MarkdownFormatter();
  });

  it("has formatType set to markdown", () => {
    expect(formatter.formatType).toBe("markdown");
  });

  describe("format generates complete markdown document with all sections", () => {
    it("returns string with markdown headers, formatted action items, and transcript with speaker attribution", () => {
      const result = formatter.format("session-1", fullMeeting);

      // Title header
      expect(result.content).toContain("# Sprint Planning");

      // Metadata
      expect(result.content).toContain("**Date:**");
      expect(result.content).toContain("**Duration:** 60 minutes");
      expect(result.content).toContain("**Organizer:** Alice");
      expect(result.content).toContain("**Participants:** Alice, Bob, Charlie");

      // Summary section
      expect(result.content).toContain("## Summary");
      expect(result.content).toContain("Discussed sprint goals and assigned tasks for Q2.");

      // Action items section
      expect(result.content).toContain("## Action Items");
      expect(result.content).toContain("Update the API documentation");
      expect(result.content).toContain("**Assignee:** Bob");

      // Transcript section
      expect(result.content).toContain("## Transcript");
      expect(result.content).toContain("Alice:**");
      expect(result.content).toContain("Let us start the sprint planning meeting.");
      expect(result.content).toContain("Bob:**");

      // FormatResult structure
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.exportId).toBe(formatter.exportId);
      expect(result.metadata.sessionId).toBe("session-1");
      expect(result.metadata.format).toBe("markdown");
    });
  });

  describe("format properly escapes markdown special characters", () => {
    it("escapes characters like *, #, [], () with backslashes", () => {
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

      // Title should have escaped special chars
      expect(result.content).toContain("\\*with\\*");
      expect(result.content).toContain("\\[special\\]");
      expect(result.content).toContain("\\(chars\\)");
      expect(result.content).toContain("\\#1");

      // Summary should escape special chars
      expect(result.content).toContain("\\`code\\`");
      expect(result.content).toContain("\\~strikethrough\\~");

      // Action items should escape
      expect(result.content).toContain("\\*\\*critical\\*\\*");

      // Transcript should escape
      expect(result.content).toContain("\\[config\\]");
      expect(result.content).toContain("\\(path/to/file\\)");
    });
  });

  describe("formatActionItems creates properly structured bullet points", () => {
    it("formats each action item as a bullet point with description, assignee, and due date", () => {
      const result = formatter.formatActionItems(fullMeeting.actionItems!.map((item) => ({
        id: item.id || "generated-id",
        description: item.description || "",
        status: (item.status as "open" | "in-progress" | "completed") || "open",
        assigneeName: item.assigneeName,
        assigneeId: item.assigneeId,
        dueDate: item.dueDate,
        priority: item.priority as "low" | "medium" | "high" | undefined,
      })));

      // Open item has unchecked checkbox
      expect(result).toContain("- [ ] Update the API documentation");
      expect(result).toContain("**Assignee:** Bob");
      expect(result).toContain("**Priority:** high");

      // Completed item has checked checkbox
      expect(result).toContain("- [x] Deploy to staging");
      expect(result).toContain("**Assignee:** Charlie");
      expect(result).toContain("**Priority:** medium");
    });

    it("handles action items without optional fields", () => {
      const result = formatter.formatActionItems([
        {
          id: "a1",
          description: "Simple task",
          status: "open",
        },
      ]);

      expect(result).toContain("- [ ] Simple task");
      expect(result).not.toContain("**Assignee:**");
      expect(result).not.toContain("**Due:**");
      expect(result).not.toContain("**Priority:**");
    });
  });

  describe("edge cases", () => {
    it("handles empty meeting data (null)", () => {
      const result = formatter.format("session-empty", null);

      expect(result.content).toContain("# Untitled Meeting");
      expect(result.content).toContain("**Date:**");
      // Should not have summary, action items, or transcript sections
      expect(result.content).not.toContain("## Summary");
      expect(result.content).not.toContain("## Action Items");
      expect(result.content).not.toContain("## Transcript");
    });

    it("handles meeting with empty sections", () => {
      const result = formatter.format("session-minimal", {
        title: "Minimal Meeting",
        date: "2026-04-01T10:00:00Z",
        summary: "",
        actionItems: [],
        transcript: [],
      });

      expect(result.content).toContain("# Minimal Meeting");
      expect(result.content).not.toContain("## Summary");
      expect(result.content).not.toContain("## Action Items");
      expect(result.content).not.toContain("## Transcript");
    });

    it("handles meeting with only summary", () => {
      const result = formatter.format("session-summary", {
        title: "Summary Only",
        summary: "Just a summary",
      });

      expect(result.content).toContain("## Summary");
      expect(result.content).toContain("Just a summary");
      expect(result.content).not.toContain("## Action Items");
      expect(result.content).not.toContain("## Transcript");
    });

    it("produces consistent content hash for identical input", () => {
      const r1 = formatter.format("s1", fullMeeting);
      const r2 = new MarkdownFormatter().format("s1", fullMeeting);
      expect(r1.contentHash).toBe(r2.contentHash);
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

      expect(result.content).toContain("## Transcript");
      expect(result.content).toContain("Alice:**");
      expect(result.content).toContain("Hello everyone.");
      expect(result.content).toContain("Bob:**");
      expect(result.content).toContain("Hi Alice.");
    });
  });

  describe("heading hierarchy", () => {
    it("uses # for title and ## for sections", () => {
      const result = formatter.format("session-headings", fullMeeting);
      const lines = result.content.split("\n");

      const h1Lines = lines.filter((l) => /^# [^#]/.test(l));
      const h2Lines = lines.filter((l) => /^## /.test(l));

      expect(h1Lines).toHaveLength(1);
      expect(h2Lines.length).toBeGreaterThanOrEqual(2); // Summary, Action Items, Transcript
    });
  });
});
