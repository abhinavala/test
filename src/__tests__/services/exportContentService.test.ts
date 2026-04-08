import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  aggregateExportContent,
  aggregateFromRawData,
  onExportGenerated,
  clearExportHooks,
  clearCache,
} from "../../services/exportContentService.js";
import type {
  DataSourceProviders,
  ExportHistoryHook,
} from "../../services/exportContentService.js";
import type {
  MeetingMetadata,
  ActionItem,
  TranscriptSegment,
} from "../../types/exportContent.js";
import { aggregateTranscriptBySpeaker } from "../../utils/contentAggregator.js";

// --- Fixtures ---

function makeMetadata(overrides: Partial<MeetingMetadata> = {}): MeetingMetadata {
  return {
    meetingId: "session-1",
    title: "Sprint Planning",
    date: "2026-01-15T10:00:00.000Z",
    duration: 60,
    participants: ["Alice", "Bob"],
    ...overrides,
  };
}

function makeActionItems(): ActionItem[] {
  return [
    {
      id: "ai-1",
      description: "Update the API docs",
      assigneeName: "Alice",
      status: "open",
      priority: "high",
    },
    {
      id: "ai-2",
      description: "Fix login bug",
      assigneeName: "Bob",
      status: "in-progress",
      priority: "medium",
    },
  ];
}

function makeTranscript(): TranscriptSegment[] {
  return [
    {
      speakerName: "Bob",
      speakerId: "spk-2",
      timestamp: "2026-01-15T10:05:00.000Z",
      text: "I found a login bug yesterday.",
      confidence: 0.95,
    },
    {
      speakerName: "Alice",
      speakerId: "spk-1",
      timestamp: "2026-01-15T10:01:00.000Z",
      text: "Let's start with the API updates.",
      confidence: 0.98,
    },
    {
      speakerName: "Alice",
      speakerId: "spk-1",
      timestamp: "2026-01-15T10:10:00.000Z",
      text: "I'll take the docs task.",
      confidence: 0.92,
    },
  ];
}

function makeProviders(
  overrides: Partial<DataSourceProviders> = {},
): DataSourceProviders {
  return {
    fetchMetadata: async () => makeMetadata(),
    fetchSummary: async () => "Team discussed API updates and a login bug.",
    fetchActionItems: async () => makeActionItems(),
    fetchTranscript: async () => makeTranscript(),
    ...overrides,
  };
}

// --- Tests ---

describe("exportContentService", () => {
  beforeEach(() => {
    clearCache();
    clearExportHooks();
  });

  afterEach(() => {
    clearCache();
    clearExportHooks();
  });

  describe("aggregateExportContent", () => {
    it("returns complete ExportContent for valid session with all data available", async () => {
      const result = await aggregateExportContent("session-1", {
        providers: makeProviders(),
        useCache: false,
      });

      expect(result.content.sessionId).toBe("session-1");
      expect(result.content.metadata.title).toBe("Sprint Planning");
      expect(result.content.metadata.date).toBe("2026-01-15T10:00:00.000Z");
      expect(result.content.summary).toBe(
        "Team discussed API updates and a login bug.",
      );
      expect(result.content.actionItems).toHaveLength(2);
      expect(result.content.transcript).toHaveLength(3);
      expect(result.content.format).toBe("markdown");
      expect(result.content.generatedAt).toBeTruthy();

      expect(result.componentsLoaded.metadata).toBe(true);
      expect(result.componentsLoaded.summary).toBe(true);
      expect(result.componentsLoaded.actionItems).toBe(true);
      expect(result.componentsLoaded.transcript).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.aggregationTimeMs).toBeLessThan(5000);
    });

    it("handles missing summary gracefully while preserving other data", async () => {
      const providers = makeProviders({
        fetchSummary: async () => null,
      });

      const result = await aggregateExportContent("session-1", {
        providers,
        useCache: false,
      });

      expect(result.content.summary).toBeUndefined();
      expect(result.content.actionItems).toHaveLength(2);
      expect(result.content.transcript).toHaveLength(3);
      expect(result.componentsLoaded.summary).toBe(false);
      expect(result.componentsLoaded.actionItems).toBe(true);
      expect(result.componentsLoaded.transcript).toBe(true);
    });

    it("handles summary provider throwing an error", async () => {
      const providers = makeProviders({
        fetchSummary: async () => {
          throw new Error("AI service unavailable");
        },
      });

      const result = await aggregateExportContent("session-1", {
        providers,
        useCache: false,
      });

      expect(result.content.summary).toBeUndefined();
      expect(result.componentsLoaded.summary).toBe(false);
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Failed to fetch summary"),
      );
      // Other components still loaded
      expect(result.componentsLoaded.metadata).toBe(true);
      expect(result.componentsLoaded.actionItems).toBe(true);
    });

    it("returns default metadata when metadata provider fails", async () => {
      const providers = makeProviders({
        fetchMetadata: async () => {
          throw new Error("Session not found");
        },
      });

      const result = await aggregateExportContent("session-1", {
        providers,
        useCache: false,
      });

      expect(result.content.metadata.meetingId).toBe("session-1");
      expect(result.content.metadata.title).toBe("Untitled Meeting");
      expect(result.componentsLoaded.metadata).toBe(false);
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Failed to fetch metadata"),
      );
    });

    it("returns empty arrays when action items and transcript fail", async () => {
      const providers = makeProviders({
        fetchActionItems: async () => {
          throw new Error("DB connection lost");
        },
        fetchTranscript: async () => {
          throw new Error("Transcription service down");
        },
      });

      const result = await aggregateExportContent("session-1", {
        providers,
        useCache: false,
      });

      expect(result.content.actionItems).toEqual([]);
      expect(result.content.transcript).toEqual([]);
      expect(result.componentsLoaded.actionItems).toBe(false);
      expect(result.componentsLoaded.transcript).toBe(false);
      expect(result.warnings).toHaveLength(2);
    });

    it("works with no providers (all defaults)", async () => {
      const result = await aggregateExportContent("session-1", {
        useCache: false,
      });

      expect(result.content.sessionId).toBe("session-1");
      expect(result.content.metadata.title).toBe("Untitled Meeting");
      expect(result.content.summary).toBeUndefined();
      expect(result.content.actionItems).toEqual([]);
      expect(result.content.transcript).toEqual([]);
    });

    it("uses cache on second call", async () => {
      const fetchMetadata = vi.fn(async () => makeMetadata());
      const providers = makeProviders({ fetchMetadata });

      await aggregateExportContent("session-1", { providers, useCache: true });
      await aggregateExportContent("session-1", { providers, useCache: true });

      expect(fetchMetadata).toHaveBeenCalledTimes(1);
    });

    it("bypasses cache when useCache is false", async () => {
      const fetchMetadata = vi.fn(async () => makeMetadata());
      const providers = makeProviders({ fetchMetadata });

      await aggregateExportContent("session-1", { providers, useCache: true });
      await aggregateExportContent("session-1", { providers, useCache: false });

      expect(fetchMetadata).toHaveBeenCalledTimes(2);
    });

    it("respects format option", async () => {
      const result = await aggregateExportContent("session-1", {
        providers: makeProviders(),
        format: "plaintext",
        useCache: false,
      });

      expect(result.content.format).toBe("plaintext");
    });

    it("deduplicates action items by id", async () => {
      const duplicateItems: ActionItem[] = [
        { id: "ai-1", description: "Task A", status: "open" },
        { id: "ai-1", description: "Task A (duplicate)", status: "open" },
        { id: "ai-2", description: "Task B", status: "open" },
      ];
      const providers = makeProviders({
        fetchActionItems: async () => duplicateItems,
      });

      const result = await aggregateExportContent("session-1", {
        providers,
        useCache: false,
      });

      expect(result.content.actionItems).toHaveLength(2);
      expect(result.content.actionItems[0].description).toBe("Task A");
    });
  });

  describe("aggregateFromRawData", () => {
    it("assembles ExportContent from raw meeting data", () => {
      const raw = {
        meetingId: "session-1",
        title: "Retro",
        date: "2026-01-20T14:00:00.000Z",
        summary: "Good sprint overall.",
        actionItems: [
          { id: "a1", description: "Follow up", status: "open" },
        ],
        transcript: [
          {
            speakerName: "Carol",
            timestamp: "2026-01-20T14:01:00.000Z",
            text: "Things went well.",
          },
        ],
      };

      const content = aggregateFromRawData("session-1", raw, "plaintext");

      expect(content.sessionId).toBe("session-1");
      expect(content.metadata.title).toBe("Retro");
      expect(content.summary).toBe("Good sprint overall.");
      expect(content.actionItems).toHaveLength(1);
      expect(content.transcript).toHaveLength(1);
      expect(content.format).toBe("plaintext");
    });

    it("handles null raw data", () => {
      const content = aggregateFromRawData("session-1", null as any);

      expect(content.metadata.title).toBe("Untitled Meeting");
      expect(content.actionItems).toEqual([]);
      expect(content.transcript).toEqual([]);
    });
  });

  describe("aggregateTranscriptBySpeaker", () => {
    it("groups segments by speaker with chronological ordering", () => {
      const segments = makeTranscript();
      const result = aggregateTranscriptBySpeaker(segments);

      // Should be sorted by timestamp
      expect(result[0].speakerName).toBe("Alice");
      expect(result[0].timestamp).toBe("2026-01-15T10:01:00.000Z");
      expect(result[1].speakerName).toBe("Bob");
      expect(result[1].timestamp).toBe("2026-01-15T10:05:00.000Z");
      expect(result[2].speakerName).toBe("Alice");
      expect(result[2].timestamp).toBe("2026-01-15T10:10:00.000Z");

      // All segments with same speakerId should have consistent speakerName
      const aliceSegments = result.filter((s) => s.speakerId === "spk-1");
      const aliceNames = new Set(aliceSegments.map((s) => s.speakerName));
      expect(aliceNames.size).toBe(1);
    });

    it("returns empty array for empty input", () => {
      expect(aggregateTranscriptBySpeaker([])).toEqual([]);
    });

    it("handles segments without speakerId", () => {
      const segments: TranscriptSegment[] = [
        {
          speakerName: "  Unknown  ",
          timestamp: "2026-01-15T10:00:00.000Z",
          text: "Hello",
        },
      ];
      const result = aggregateTranscriptBySpeaker(segments);
      expect(result[0].speakerName).toBe("Unknown");
    });
  });

  describe("export history hooks", () => {
    it("calls registered hooks on aggregation", async () => {
      const hookFn = vi.fn();
      onExportGenerated(hookFn);

      await aggregateExportContent("session-1", {
        providers: makeProviders(),
        useCache: false,
      });

      // Allow async hook to fire
      await new Promise((r) => setTimeout(r, 50));

      expect(hookFn).toHaveBeenCalledTimes(1);
      expect(hookFn).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ sessionId: "session-1" }),
      );
    });

    it("does not propagate hook errors", async () => {
      onExportGenerated(() => {
        throw new Error("Hook failure");
      });

      const result = await aggregateExportContent("session-1", {
        providers: makeProviders(),
        useCache: false,
      });

      // Aggregation should still succeed
      expect(result.content.sessionId).toBe("session-1");
    });
  });
});
