import { describe, it, expect, beforeEach } from "vitest";
import { BaseFormatter } from "../../formatters/baseFormatter.js";
import type { FormatResult } from "../../formatters/baseFormatter.js";
import type { ExportFormat } from "../../types/exportContent.js";
import type { MeetingData, RawMeetingData } from "../../utils/exportUtils.js";
import {
  extractMeetingData,
  generateContentHash,
  normalizeForHashing,
  generateMeetingDataHash,
  extractSpeakers,
  buildExportMetadata,
} from "../../utils/exportUtils.js";

/** Concrete test formatter to exercise the abstract base class. */
class TestFormatter extends BaseFormatter {
  readonly formatType: ExportFormat = "markdown";

  protected formatContent(meetingData: MeetingData): string {
    return `# ${meetingData.metadata.title}\n\n${meetingData.summary}`;
  }
}

// --- Full meeting fixture used across tests ---
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
      status: "in-progress",
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

describe("extractMeetingData", () => {
  it("successfully processes complete meeting object with all fields", () => {
    const result = extractMeetingData(fullMeeting);

    expect(result.metadata.meetingId).toBe("meeting-123");
    expect(result.metadata.title).toBe("Sprint Planning");
    expect(result.metadata.date).toBe("2026-04-01T10:00:00Z");
    expect(result.metadata.duration).toBe(60);
    expect(result.metadata.participants).toEqual(["Alice", "Bob", "Charlie"]);
    expect(result.metadata.organizer).toBe("Alice");
    expect(result.summary).toBe("Discussed sprint goals and assigned tasks for Q2.");

    expect(result.actionItems).toHaveLength(2);
    expect(result.actionItems[0]!.id).toBe("action-1");
    expect(result.actionItems[0]!.description).toBe("Update the API documentation");
    expect(result.actionItems[0]!.assigneeName).toBe("Bob");
    expect(result.actionItems[0]!.assigneeId).toBe("user-bob");
    expect(result.actionItems[0]!.dueDate).toBe("2026-04-10T00:00:00Z");
    expect(result.actionItems[0]!.status).toBe("open");
    expect(result.actionItems[0]!.priority).toBe("high");

    expect(result.actionItems[1]!.status).toBe("in-progress");
    expect(result.actionItems[1]!.priority).toBe("medium");

    expect(result.transcript).toHaveLength(2);
    expect(result.transcript[0]!.speakerName).toBe("Alice");
    expect(result.transcript[0]!.speakerId).toBe("user-alice");
    expect(result.transcript[0]!.timestamp).toBe("2026-04-01T10:00:00Z");
    expect(result.transcript[0]!.confidence).toBe(0.95);
    expect(result.transcript[1]!.speakerName).toBe("Bob");
  });

  it("handles missing or null meeting data gracefully", () => {
    const fromNull = extractMeetingData(null);
    expect(fromNull.metadata.meetingId).toBe("");
    expect(fromNull.metadata.title).toBe("Untitled Meeting");
    expect(fromNull.summary).toBe("");
    expect(fromNull.actionItems).toEqual([]);
    expect(fromNull.transcript).toEqual([]);

    const fromUndefined = extractMeetingData(undefined);
    expect(fromUndefined.metadata.title).toBe("Untitled Meeting");
    expect(fromUndefined.actionItems).toEqual([]);
    expect(fromUndefined.transcript).toEqual([]);
  });

  it("handles empty object with no fields", () => {
    const result = extractMeetingData({});
    expect(result.metadata.meetingId).toBe("");
    expect(result.metadata.title).toBe("Untitled Meeting");
    expect(result.summary).toBe("");
    expect(result.actionItems).toEqual([]);
    expect(result.transcript).toEqual([]);
  });

  it("falls back to id when meetingId is missing", () => {
    const result = extractMeetingData({ id: "fallback-id" });
    expect(result.metadata.meetingId).toBe("fallback-id");
  });

  it("handles action items with invalid status/priority", () => {
    const result = extractMeetingData({
      actionItems: [
        { id: "a1", description: "test", status: "invalid-status", priority: "invalid" },
      ],
    });
    expect(result.actionItems[0]!.status).toBe("open");
    expect(result.actionItems[0]!.priority).toBeUndefined();
  });

  it("handles transcript segment with missing speaker name", () => {
    const result = extractMeetingData({
      transcript: [{ text: "hello" }],
    });
    expect(result.transcript[0]!.speakerName).toBe("Unknown Speaker");
  });

  it("clamps confidence to [0, 1] range", () => {
    const result = extractMeetingData({
      transcript: [
        { speakerName: "A", timestamp: "t", text: "x", confidence: 1.5 },
        { speakerName: "B", timestamp: "t", text: "y", confidence: -0.5 },
      ],
    });
    expect(result.transcript[0]!.confidence).toBe(1);
    expect(result.transcript[1]!.confidence).toBe(0);
  });
});

describe("generateContentHash", () => {
  it("produces consistent hash values for identical content", () => {
    const hash1 = generateContentHash("hello world");
    const hash2 = generateContentHash("hello world");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different content", () => {
    const hash1 = generateContentHash("hello world");
    const hash2 = generateContentHash("hello world!");
    expect(hash1).not.toBe(hash2);
  });

  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = generateContentHash("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles empty string", () => {
    const hash = generateContentHash("");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("normalizeForHashing", () => {
  it("sorts object keys for deterministic output", () => {
    const a = normalizeForHashing({ b: 2, a: 1 });
    const b = normalizeForHashing({ a: 1, b: 2 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("handles nested objects", () => {
    const a = normalizeForHashing({ outer: { z: 1, a: 2 } });
    const b = normalizeForHashing({ outer: { a: 2, z: 1 } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("handles arrays", () => {
    expect(normalizeForHashing([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("handles null and undefined", () => {
    expect(normalizeForHashing(null)).toBeNull();
    expect(normalizeForHashing(undefined)).toBeNull();
  });

  it("handles primitives", () => {
    expect(normalizeForHashing("hello")).toBe("hello");
    expect(normalizeForHashing(42)).toBe(42);
    expect(normalizeForHashing(true)).toBe(true);
  });
});

describe("generateMeetingDataHash", () => {
  it("produces identical hashes for same meeting data", () => {
    const data = extractMeetingData(fullMeeting);
    const hash1 = generateMeetingDataHash(data);
    const hash2 = generateMeetingDataHash(data);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different meeting data", () => {
    const data1 = extractMeetingData(fullMeeting);
    const data2 = extractMeetingData({ ...fullMeeting, title: "Different Title" });
    expect(generateMeetingDataHash(data1)).not.toBe(generateMeetingDataHash(data2));
  });
});

describe("extractSpeakers", () => {
  it("extracts unique speakers in order of appearance", () => {
    const transcript = extractMeetingData(fullMeeting).transcript;
    const speakers = extractSpeakers(transcript);
    expect(speakers).toEqual(["Alice", "Bob"]);
  });

  it("returns empty array for empty transcript", () => {
    expect(extractSpeakers([])).toEqual([]);
  });

  it("deduplicates repeated speakers", () => {
    const speakers = extractSpeakers([
      { speakerName: "Alice", timestamp: "t1", text: "a" },
      { speakerName: "Bob", timestamp: "t2", text: "b" },
      { speakerName: "Alice", timestamp: "t3", text: "c" },
    ]);
    expect(speakers).toEqual(["Alice", "Bob"]);
  });
});

describe("buildExportMetadata", () => {
  it("builds metadata with correct fields", () => {
    const meta = buildExportMetadata("session-1", "markdown");
    expect(meta.sessionId).toBe("session-1");
    expect(meta.format).toBe("markdown");
    expect(meta.version).toBe("1.0.0");
    expect(meta.generatedAt).toBeDefined();
  });

  it("accepts custom version", () => {
    const meta = buildExportMetadata("session-1", "plaintext", "2.0.0");
    expect(meta.version).toBe("2.0.0");
  });
});

describe("BaseFormatter", () => {
  let formatter: TestFormatter;

  beforeEach(() => {
    formatter = new TestFormatter();
  });

  it("has a unique exportId", () => {
    const other = new TestFormatter();
    expect(formatter.exportId).toBeDefined();
    expect(formatter.exportId).not.toBe(other.exportId);
  });

  it("exposes the formatType from subclass", () => {
    expect(formatter.formatType).toBe("markdown");
  });

  describe("format", () => {
    it("formats complete meeting data and returns FormatResult", () => {
      const result = formatter.format("session-1", fullMeeting);

      expect(result.content).toContain("# Sprint Planning");
      expect(result.content).toContain("Discussed sprint goals");
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.exportId).toBe(formatter.exportId);
      expect(result.metadata.sessionId).toBe("session-1");
      expect(result.metadata.format).toBe("markdown");
    });

    it("handles null meeting data without throwing", () => {
      const result = formatter.format("session-2", null);
      expect(result.content).toContain("# Untitled Meeting");
      expect(result.contentHash).toBeDefined();
    });

    it("handles undefined meeting data without throwing", () => {
      const result = formatter.format("session-3", undefined);
      expect(result.content).toContain("# Untitled Meeting");
    });

    it("produces consistent content hash for same input", () => {
      const r1 = formatter.format("s1", fullMeeting);
      const r2 = new TestFormatter().format("s1", fullMeeting);
      expect(r1.contentHash).toBe(r2.contentHash);
    });
  });

  describe("validateExport", () => {
    it("returns valid=true and hash for non-empty content", () => {
      const validation = formatter.validateExport("some content");
      expect(validation.valid).toBe(true);
      expect(validation.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(validation.exportId).toBe(formatter.exportId);
    });

    it("returns valid=false for empty content", () => {
      const validation = formatter.validateExport("");
      expect(validation.valid).toBe(false);
    });

    it("produces consistent hash for same content", () => {
      const v1 = formatter.validateExport("test content");
      const v2 = formatter.validateExport("test content");
      expect(v1.hash).toBe(v2.hash);
    });
  });
});
