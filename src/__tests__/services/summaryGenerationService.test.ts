import { describe, it, expect, beforeEach, vi } from "vitest";
import { SummaryGenerationError } from "../../types/errors.js";
import { NextStepPriority } from "../../types/meeting-summary.js";

// Mock the Prisma client
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();
const mockDisconnect = vi.fn();

vi.mock("@prisma/adapter-better-sqlite3", () => ({
  PrismaBetterSqlite3: class {},
}));

vi.mock("../../../generated/prisma", () => ({
  PrismaClient: class {
    meetingSessionSummary = {
      findUnique: mockFindUnique,
      create: mockCreate,
      deleteMany: mockDeleteMany,
    };
    $disconnect = mockDisconnect;
  },
}));

// Mock the AI summary service
const mockExtractSummaryComponents = vi.fn();
vi.mock("../../services/aiSummaryService.js", () => ({
  extractSummaryComponents: (...args: unknown[]) =>
    mockExtractSummaryComponents(...args),
}));

// Mock the locking utility
const mockAcquireLock = vi.fn().mockReturnValue(true);
const mockReleaseLock = vi.fn();
const mockIsLocked = vi.fn().mockReturnValue(false);
vi.mock("../../utils/summaryLocking.js", () => ({
  acquireLock: (...args: unknown[]) => mockAcquireLock(...args),
  releaseLock: (...args: unknown[]) => mockReleaseLock(...args),
  isLocked: (...args: unknown[]) => mockIsLocked(...args),
}));

const { generateSummary, getSummary, summaryGenerationService } = await import(
  "../../services/summaryGenerationService.js"
);

function makeSummaryRecord(meetingSessionId: string) {
  return {
    id: "summary-1",
    meetingSessionId,
    generatedAt: new Date("2026-04-03T10:00:00Z"),
    generatedBy: "ai-summary-service",
    createdAt: new Date("2026-04-03T10:00:00Z"),
    updatedAt: new Date("2026-04-03T10:00:00Z"),
    keyDecisions: [
      {
        id: "kd-1",
        summaryId: "summary-1",
        description: "Use TypeScript for all new services",
        participants: JSON.stringify(["alice", "bob"]),
        madeAt: new Date("2026-04-03T09:30:00Z"),
        context: "Discussed during architecture review",
      },
    ],
    openQuestions: [
      {
        id: "oq-1",
        summaryId: "summary-1",
        question: "What is the deployment timeline?",
        ownerId: "user-1",
        raisedBy: "charlie",
        context: null,
      },
    ],
    nextSteps: [
      {
        id: "ns-1",
        summaryId: "summary-1",
        description: "Draft migration plan",
        assigneeId: "user-2",
        assigneeName: "Alice",
        priority: NextStepPriority.HIGH,
        dueDate: new Date("2026-04-10T00:00:00Z"),
      },
    ],
  };
}

function makeTranscriptSegments(count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    id: `seg-${i}`,
    sessionId: "session-1",
    speakerId: `speaker-${i % 3}`,
    startTime: i * 10000,
    endTime: (i + 1) * 10000,
    text: `Meeting transcript segment ${i} with enough content to process.`,
  }));
}

function makeActionItems() {
  return [
    {
      id: "action-1",
      description: "Follow up on budget proposal",
      assigneeName: "Alice",
      status: "open" as const,
    },
  ];
}

function makeExtractionResult() {
  return {
    keyDecisions: [
      {
        id: "kd-new",
        description: "Adopt new testing framework",
        participants: ["alice"],
        madeAt: "2026-04-03T10:30:00Z",
        context: "Sprint planning",
      },
    ],
    openQuestions: [
      {
        id: "oq-new",
        question: "When is the deadline?",
        raisedBy: "bob",
      },
    ],
    nextSteps: [
      {
        id: "ns-new",
        description: "Create migration plan",
        assigneeName: "Alice",
        priority: NextStepPriority.MEDIUM,
      },
    ],
    confidence: 0.75,
    processingTime: 1200,
  };
}

describe("summaryGenerationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcquireLock.mockReturnValue(true);
  });

  describe("generateSummary", () => {
    it("successfully creates and stores summary for valid meeting session with sufficient data", async () => {
      const sessionId = "session-valid";
      mockFindUnique.mockResolvedValue(null); // no existing summary

      const extractionResult = makeExtractionResult();
      mockExtractSummaryComponents.mockResolvedValue(extractionResult);

      const createdRecord = makeSummaryRecord(sessionId);
      mockCreate.mockResolvedValue(createdRecord);

      const result = await generateSummary(sessionId, {
        transcriptSegments: makeTranscriptSegments(),
        actionItems: makeActionItems(),
      });

      expect(result.summary.id).toBe("summary-1");
      expect(result.summary.meetingSessionId).toBe(sessionId);
      expect(result.wasRegenerated).toBe(false);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);

      expect(mockAcquireLock).toHaveBeenCalledWith(sessionId);
      expect(mockReleaseLock).toHaveBeenCalledWith(sessionId);
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    it("throws SummaryGenerationError with SESSION_NOT_FOUND-equivalent when AI service reports insufficient data", async () => {
      const sessionId = "session-empty";
      mockFindUnique.mockResolvedValue(null);
      mockExtractSummaryComponents.mockRejectedValue(
        new SummaryGenerationError(
          "insufficient content for summary extraction",
          "INSUFFICIENT_DATA",
          sessionId,
        ),
      );

      const opts = {
        transcriptSegments: makeTranscriptSegments(),
        actionItems: makeActionItems(),
      };
      await expect(generateSummary(sessionId, opts)).rejects.toThrow(
        SummaryGenerationError,
      );
      await expect(generateSummary(sessionId, opts)).rejects.toMatchObject({
        code: "INSUFFICIENT_DATA",
        meetingSessionId: sessionId,
      });
    });

    it("throws SummaryGenerationError when lock cannot be acquired", async () => {
      const sessionId = "session-locked";
      mockFindUnique.mockResolvedValue(null);
      mockAcquireLock.mockReturnValue(false);

      const opts = {
        transcriptSegments: makeTranscriptSegments(),
        actionItems: makeActionItems(),
      };
      await expect(generateSummary(sessionId, opts)).rejects.toThrow(
        SummaryGenerationError,
      );
      await expect(generateSummary(sessionId, opts)).rejects.toMatchObject({
        code: "INVALID_SESSION_STATE",
        meetingSessionId: sessionId,
      });
    });

    it("releases lock even when generation fails", async () => {
      const sessionId = "session-fail";
      mockFindUnique.mockResolvedValue(null);
      mockExtractSummaryComponents.mockRejectedValue(
        new SummaryGenerationError(
          "AI service failure",
          "AI_SERVICE_FAILURE",
          sessionId,
        ),
      );

      const opts = {
        transcriptSegments: makeTranscriptSegments(),
        actionItems: makeActionItems(),
      };
      await expect(generateSummary(sessionId, opts)).rejects.toThrow();
      expect(mockReleaseLock).toHaveBeenCalledWith(sessionId);
    });

    it("regenerates summary when forceRegenerate is true", async () => {
      const sessionId = "session-regen";
      // Even with existing summary, should regenerate
      mockFindUnique.mockResolvedValue(null);

      const extractionResult = makeExtractionResult();
      mockExtractSummaryComponents.mockResolvedValue(extractionResult);

      const createdRecord = makeSummaryRecord(sessionId);
      mockCreate.mockResolvedValue(createdRecord);

      const result = await generateSummary(sessionId, {
        forceRegenerate: true,
        transcriptSegments: makeTranscriptSegments(),
        actionItems: makeActionItems(),
      });

      expect(result.wasRegenerated).toBe(true);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { meetingSessionId: sessionId },
      });
    });

    it("handles AI service failure gracefully", async () => {
      const sessionId = "session-ai-fail";
      mockFindUnique.mockResolvedValue(null);
      mockExtractSummaryComponents.mockRejectedValue(
        new SummaryGenerationError(
          "AI service failure after 4 attempts",
          "AI_SERVICE_FAILURE",
          sessionId,
        ),
      );

      const opts = {
        transcriptSegments: makeTranscriptSegments(),
        actionItems: makeActionItems(),
      };
      await expect(generateSummary(sessionId, opts)).rejects.toThrow(
        SummaryGenerationError,
      );
      await expect(generateSummary(sessionId, opts)).rejects.toMatchObject({
        code: "AI_SERVICE_FAILURE",
      });
    });
  });

  describe("getSummary", () => {
    it("returns existing summary without regeneration when summary already exists", async () => {
      const sessionId = "session-existing";
      const existingRecord = makeSummaryRecord(sessionId);
      mockFindUnique.mockResolvedValue(existingRecord);

      const summary = await getSummary(sessionId);

      expect(summary).not.toBeNull();
      expect(summary!.id).toBe("summary-1");
      expect(summary!.meetingSessionId).toBe(sessionId);
      expect(summary!.generatedAt).toEqual(
        new Date("2026-04-03T10:00:00Z"),
      );

      // AI service should not have been called
      expect(mockExtractSummaryComponents).not.toHaveBeenCalled();
    });

    it("returns null when no summary exists", async () => {
      mockFindUnique.mockResolvedValue(null);

      const summary = await getSummary("session-nonexistent");

      expect(summary).toBeNull();
    });

    it("correctly maps database record to domain model", async () => {
      const sessionId = "session-map";
      const record = makeSummaryRecord(sessionId);
      mockFindUnique.mockResolvedValue(record);

      const summary = await getSummary(sessionId);

      expect(summary!.keyDecisions).toHaveLength(1);
      expect(summary!.keyDecisions[0]!.description).toBe(
        "Use TypeScript for all new services",
      );
      expect(summary!.keyDecisions[0]!.participants).toEqual([
        "alice",
        "bob",
      ]);

      expect(summary!.openQuestions).toHaveLength(1);
      expect(summary!.openQuestions[0]!.question).toBe(
        "What is the deployment timeline?",
      );

      expect(summary!.nextSteps).toHaveLength(1);
      expect(summary!.nextSteps[0]!.priority).toBe(NextStepPriority.HIGH);
    });
  });

  describe("generateSummary with existing summary", () => {
    it("returns existing summary without calling AI service when not forcing regeneration", async () => {
      const sessionId = "session-cached";
      const existingRecord = makeSummaryRecord(sessionId);
      mockFindUnique.mockResolvedValue(existingRecord);

      const result = await generateSummary(sessionId);

      expect(result.summary.id).toBe("summary-1");
      expect(result.wasRegenerated).toBe(false);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);

      // Should not acquire lock or call AI
      expect(mockAcquireLock).not.toHaveBeenCalled();
      expect(mockExtractSummaryComponents).not.toHaveBeenCalled();
    });
  });

  describe("summaryGenerationService object", () => {
    it("exports all expected methods", () => {
      expect(typeof summaryGenerationService.generateSummary).toBe(
        "function",
      );
      expect(typeof summaryGenerationService.getSummary).toBe("function");
      expect(typeof summaryGenerationService.getGenerationProgress).toBe(
        "function",
      );
      expect(typeof summaryGenerationService.disconnect).toBe("function");
    });
  });
});
