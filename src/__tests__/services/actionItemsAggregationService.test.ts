import { describe, it, expect, beforeEach, vi } from "vitest";
import { subDays } from "date-fns";

// Mock Prisma - use vi.hoisted to ensure variables are available during mock hoisting
const { mockFindMany, mockFindUnique, mockDisconnect } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockDisconnect: vi.fn(),
}));

vi.mock("@prisma/adapter-better-sqlite3", () => ({
  PrismaBetterSqlite3: class {},
}));

vi.mock("../../../generated/prisma", () => ({
  PrismaClient: class {
    meetingSessionSummary = {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
    };
    $disconnect = mockDisconnect;
  },
}));

import {
  aggregateActionItems,
  getParticipantActionItems,
  getSessionActionItems,
  calculateRelevanceScore,
  aggregateByParticipant,
  aggregateByMeeting,
} from "../../services/actionItemsAggregationService.js";
import type { AggregatedActionItem } from "../../types/actionItems.js";

function makeNextStep(overrides: Record<string, unknown> = {}) {
  return {
    id: `step-${Math.random().toString(36).slice(2, 8)}`,
    summaryId: "summary-1",
    description: "Test action item",
    assigneeId: "user-alice",
    assigneeName: "Alice",
    priority: "HIGH",
    dueDate: null,
    ...overrides,
  };
}

function makeSummary(
  meetingSessionId: string,
  nextSteps: ReturnType<typeof makeNextStep>[] = [],
  generatedAt: Date = new Date(),
) {
  return {
    id: `summary-${meetingSessionId}`,
    meetingSessionId,
    generatedAt,
    generatedBy: "ai-summary-service",
    createdAt: generatedAt,
    updatedAt: generatedAt,
    nextSteps,
  };
}

describe("actionItemsAggregationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateRelevanceScore", () => {
    it("returns higher score for higher priority", () => {
      const now = new Date();
      const generated = now;

      const urgentScore = calculateRelevanceScore("URGENT", null, generated, now);
      const lowScore = calculateRelevanceScore("LOW", null, generated, now);

      expect(urgentScore).toBeGreaterThan(lowScore);
    });

    it("gives overdue boost when item is past due", () => {
      const now = new Date();
      const pastDue = subDays(now, 5);
      const futureDue = new Date(now.getTime() + 86400000);

      const overdueScore = calculateRelevanceScore("MEDIUM", pastDue, now, now);
      const onTimeScore = calculateRelevanceScore("MEDIUM", futureDue, now, now);

      expect(overdueScore).toBeGreaterThan(onTimeScore);
    });

    it("gives higher score to more recent items", () => {
      const now = new Date();
      const recent = subDays(now, 1);
      const old = subDays(now, 25);

      const recentScore = calculateRelevanceScore("MEDIUM", null, recent, now);
      const oldScore = calculateRelevanceScore("MEDIUM", null, old, now);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it("handles null due date without error", () => {
      const now = new Date();
      const score = calculateRelevanceScore("MEDIUM", null, now, now);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe("aggregateByParticipant", () => {
    it("groups items by assigneeId", () => {
      const items: AggregatedActionItem[] = [
        {
          id: "1", description: "Task 1", assigneeId: "alice", assigneeName: "Alice",
          priority: "HIGH" as AggregatedActionItem["priority"], dueDate: null,
          meetingSessionId: "session-1", meetingGeneratedAt: new Date(),
          isOverdue: false, relevanceScore: 5,
        },
        {
          id: "2", description: "Task 2", assigneeId: "bob", assigneeName: "Bob",
          priority: "MEDIUM" as AggregatedActionItem["priority"], dueDate: null,
          meetingSessionId: "session-1", meetingGeneratedAt: new Date(),
          isOverdue: false, relevanceScore: 3,
        },
        {
          id: "3", description: "Task 3", assigneeId: "alice", assigneeName: "Alice",
          priority: "LOW" as AggregatedActionItem["priority"], dueDate: null,
          meetingSessionId: "session-2", meetingGeneratedAt: new Date(),
          isOverdue: false, relevanceScore: 1,
        },
      ];

      const result = aggregateByParticipant(items, 50);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result["alice"]).toHaveLength(2);
      expect(result["bob"]).toHaveLength(1);
    });

    it("groups unassigned items under 'unassigned'", () => {
      const items: AggregatedActionItem[] = [
        {
          id: "1", description: "Unassigned task", assigneeId: null, assigneeName: null,
          priority: "MEDIUM" as AggregatedActionItem["priority"], dueDate: null,
          meetingSessionId: "session-1", meetingGeneratedAt: new Date(),
          isOverdue: false, relevanceScore: 3,
        },
      ];

      const result = aggregateByParticipant(items, 50);

      expect(result["unassigned"]).toHaveLength(1);
    });

    it("limits items per group to maxPerGroup", () => {
      const items: AggregatedActionItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `item-${i}`, description: `Task ${i}`, assigneeId: "alice", assigneeName: "Alice",
        priority: "MEDIUM" as AggregatedActionItem["priority"], dueDate: null,
        meetingSessionId: "session-1", meetingGeneratedAt: new Date(),
        isOverdue: false, relevanceScore: 10 - i,
      }));

      const result = aggregateByParticipant(items, 3);

      expect(result["alice"]).toHaveLength(3);
      // Should keep highest relevance scores
      expect(result["alice"]![0]!.relevanceScore).toBe(10);
    });

    it("sorts items by relevance score descending", () => {
      const items: AggregatedActionItem[] = [
        {
          id: "1", description: "Low relevance", assigneeId: "alice", assigneeName: "Alice",
          priority: "LOW" as AggregatedActionItem["priority"], dueDate: null,
          meetingSessionId: "s1", meetingGeneratedAt: new Date(),
          isOverdue: false, relevanceScore: 1,
        },
        {
          id: "2", description: "High relevance", assigneeId: "alice", assigneeName: "Alice",
          priority: "URGENT" as AggregatedActionItem["priority"], dueDate: null,
          meetingSessionId: "s2", meetingGeneratedAt: new Date(),
          isOverdue: false, relevanceScore: 5,
        },
      ];

      const result = aggregateByParticipant(items, 50);

      expect(result["alice"]![0]!.id).toBe("2");
      expect(result["alice"]![1]!.id).toBe("1");
    });
  });

  describe("aggregateByMeeting", () => {
    it("groups items by meetingSessionId", () => {
      const items: AggregatedActionItem[] = [
        {
          id: "1", description: "Task 1", assigneeId: "alice", assigneeName: "Alice",
          priority: "HIGH" as AggregatedActionItem["priority"], dueDate: null,
          meetingSessionId: "meeting-a", meetingGeneratedAt: new Date(),
          isOverdue: false, relevanceScore: 5,
        },
        {
          id: "2", description: "Task 2", assigneeId: "bob", assigneeName: "Bob",
          priority: "MEDIUM" as AggregatedActionItem["priority"], dueDate: null,
          meetingSessionId: "meeting-b", meetingGeneratedAt: new Date(),
          isOverdue: false, relevanceScore: 3,
        },
      ];

      const result = aggregateByMeeting(items, 50);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result["meeting-a"]).toHaveLength(1);
      expect(result["meeting-b"]).toHaveLength(1);
    });
  });

  describe("aggregateActionItems", () => {
    it("returns empty result when no summaries exist", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await aggregateActionItems();

      expect(result.totalItems).toBe(0);
      expect(Object.keys(result.groups)).toHaveLength(0);
      expect(result.strategy).toBe("by-participant");
    });

    it("aggregates action items from multiple sessions", async () => {
      mockFindMany.mockResolvedValue([
        makeSummary("session-1", [
          makeNextStep({ assigneeId: "user-alice", priority: "HIGH" }),
          makeNextStep({ assigneeId: "user-bob", priority: "MEDIUM" }),
        ]),
        makeSummary("session-2", [
          makeNextStep({ assigneeId: "user-alice", priority: "URGENT" }),
        ]),
      ]);

      const result = await aggregateActionItems({ strategy: "by-participant" });

      expect(result.totalItems).toBe(3);
      expect(result.groups["user-alice"]).toHaveLength(2);
      expect(result.groups["user-bob"]).toHaveLength(1);
    });

    it("respects lookbackDays configuration", async () => {
      mockFindMany.mockResolvedValue([]);

      await aggregateActionItems({ lookbackDays: 7 });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { generatedAt: { gte: expect.any(Date) } },
        }),
      );

      const callArgs = mockFindMany.mock.calls[0]![0] as {
        where: { generatedAt: { gte: Date } };
      };
      const cutoff = callArgs.where.generatedAt.gte;
      const daysDiff = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(7, 0);
    });

    it("filters by participantIds when provided", async () => {
      mockFindMany.mockResolvedValue([
        makeSummary("session-1", [
          makeNextStep({ assigneeId: "user-alice" }),
          makeNextStep({ assigneeId: "user-bob" }),
          makeNextStep({ assigneeId: "user-charlie" }),
        ]),
      ]);

      const result = await aggregateActionItems({
        participantIds: ["user-alice"],
        strategy: "by-participant",
      });

      expect(result.totalItems).toBe(1);
      expect(result.groups["user-alice"]).toHaveLength(1);
      expect(result.groups["user-bob"]).toBeUndefined();
    });

    it("uses by-meeting strategy correctly", async () => {
      mockFindMany.mockResolvedValue([
        makeSummary("session-1", [
          makeNextStep({ assigneeId: "user-alice" }),
        ]),
        makeSummary("session-2", [
          makeNextStep({ assigneeId: "user-bob" }),
        ]),
      ]);

      const result = await aggregateActionItems({ strategy: "by-meeting" });

      expect(result.strategy).toBe("by-meeting");
      expect(result.groups["session-1"]).toHaveLength(1);
      expect(result.groups["session-2"]).toHaveLength(1);
    });

    it("marks overdue items correctly", async () => {
      const pastDate = subDays(new Date(), 5);
      mockFindMany.mockResolvedValue([
        makeSummary("session-1", [
          makeNextStep({ assigneeId: "user-alice", dueDate: pastDate }),
        ]),
      ]);

      const result = await aggregateActionItems();

      const item = result.groups["user-alice"]![0]!;
      expect(item.isOverdue).toBe(true);
    });

    it("limits items per group with maxItemsPerGroup", async () => {
      const manySteps = Array.from({ length: 100 }, (_, i) =>
        makeNextStep({ id: `step-${i}`, assigneeId: "user-alice", priority: "MEDIUM" }),
      );
      mockFindMany.mockResolvedValue([makeSummary("session-1", manySteps)]);

      const result = await aggregateActionItems({ maxItemsPerGroup: 10 });

      expect(result.groups["user-alice"]).toHaveLength(10);
    });

    it("includes generatedAt timestamp in result", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await aggregateActionItems();

      expect(result.generatedAt).toBeDefined();
      expect(() => new Date(result.generatedAt)).not.toThrow();
    });
  });

  describe("getParticipantActionItems", () => {
    it("returns empty array when no items match participant", async () => {
      mockFindMany.mockResolvedValue([]);

      const items = await getParticipantActionItems("user-unknown");

      expect(items).toEqual([]);
    });

    it("returns sorted items for a participant", async () => {
      mockFindMany.mockResolvedValue([
        makeSummary("session-1", [
          makeNextStep({ assigneeId: "user-alice", priority: "LOW" }),
          makeNextStep({ assigneeId: "user-alice", priority: "URGENT" }),
        ]),
      ]);

      const items = await getParticipantActionItems("user-alice");

      expect(items).toHaveLength(2);
      // URGENT should come first (higher relevance score)
      expect(items[0]!.priority).toBe("URGENT");
    });

    it("limits results to maxItems", async () => {
      const manySteps = Array.from({ length: 100 }, () =>
        makeNextStep({ assigneeId: "user-alice" }),
      );
      mockFindMany.mockResolvedValue([makeSummary("session-1", manySteps)]);

      const items = await getParticipantActionItems("user-alice", 30, 5);

      expect(items).toHaveLength(5);
    });
  });

  describe("getSessionActionItems", () => {
    it("returns empty result when session not found", async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getSessionActionItems("nonexistent-session");

      expect(result.totalItems).toBe(0);
      expect(Object.keys(result.groups)).toHaveLength(0);
    });

    it("returns empty result when session has no participants", async () => {
      mockFindUnique.mockResolvedValue(
        makeSummary("session-1", [
          makeNextStep({ assigneeId: null, assigneeName: null }),
        ]),
      );

      const result = await getSessionActionItems("session-1");

      expect(result.totalItems).toBe(0);
    });

    it("aggregates items for all session participants", async () => {
      mockFindUnique.mockResolvedValue(
        makeSummary("session-1", [
          makeNextStep({ assigneeId: "user-alice" }),
          makeNextStep({ assigneeId: "user-bob" }),
        ]),
      );

      mockFindMany.mockResolvedValue([
        makeSummary("session-old", [
          makeNextStep({ assigneeId: "user-alice", description: "Old task for Alice" }),
          makeNextStep({ assigneeId: "user-bob", description: "Old task for Bob" }),
          makeNextStep({ assigneeId: "user-charlie", description: "Task for non-participant" }),
        ]),
      ]);

      const result = await getSessionActionItems("session-1");

      // Should only include items for alice and bob (session participants)
      expect(result.strategy).toBe("by-participant");
      // Charlie's items should be filtered out
      const allItems = Object.values(result.groups).flat();
      const charlieItems = allItems.filter((i) => i.assigneeId === "user-charlie");
      expect(charlieItems).toHaveLength(0);
    });
  });
});
