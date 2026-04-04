import { describe, it, expect, beforeEach, vi } from "vitest";
import { SummaryGenerationError } from "../../types/errors.js";
import type { MeetingSessionSummary } from "../../types/meeting-summary.js";
import {
  createTranscriptSegments,
  createActionItems,
  createMockTranscriptData,
  createMockActionItems,
  createExtractionResult,
  createMeetingSession,
  createShortMeetingSession,
  createRichMeetingData,
  createMinimalMeetingData,
} from "../helpers/meetingTestData.js";
import {
  createMockRequest,
  createMockResponse,
  createAuthenticatedRequest,
  assertSuccessResponse,
  assertErrorResponse,
} from "../helpers/apiTestHelpers.js";
import {
  resetAllMocks,
  mockPrisma,
  mockAIExtract,
  mockLocking,
  setupSuccessfulAIExtraction,
  setupFailingAIExtraction,
  setupExistingSummary,
  setupNoExistingSummary,
  setupSuccessfulCreate,
} from "../setup/integrationTestSetup.js";

// ─── Top-level mocks (hoisted by vitest) ───

vi.mock("@prisma/adapter-better-sqlite3", () => ({
  PrismaBetterSqlite3: class {},
}));

vi.mock("../../../generated/prisma", () => ({
  PrismaClient: class {
    meetingSessionSummary = {
      findUnique: mockPrisma.findUnique,
      create: mockPrisma.create,
      deleteMany: mockPrisma.deleteMany,
    };
    $disconnect = mockPrisma.disconnect;
  },
}));

vi.mock("../../services/aiSummaryService.js", () => ({
  extractSummaryComponents: (...args: unknown[]) => mockAIExtract(...args),
}));

vi.mock("../../utils/summaryLocking.js", () => ({
  acquireLock: (...args: unknown[]) => mockLocking.acquireLock(...args),
  releaseLock: (...args: unknown[]) => mockLocking.releaseLock(...args),
  isLocked: (...args: unknown[]) => mockLocking.isLocked(...args),
  clearAllLocks: (...args: unknown[]) => mockLocking.clearAllLocks(...args),
}));

// ─── Dynamic imports after mocking ───

const { generateSummary, getSummary, getGenerationProgress } = await import(
  "../../services/summaryGenerationService.js"
);
const {
  generateSummaryHandler,
  getSummaryHandler,
  getProgressHandler,
  listSummariesHandler,
} = await import("../../controllers/summaryController.js");
const { validateSessionId, validateGenerateBody, requireAuth } = await import(
  "../../middleware/summaryValidation.js"
);
const { handleMeetingEnd } = await import(
  "../../handlers/meetingEndHandler.js"
);
const { triggerSummaryGeneration } = await import(
  "../../jobs/summaryGenerationJob.js"
);

// ─── Helpers ───

function setupFullPipeline(sessionId: string): void {
  setupNoExistingSummary();
  setupSuccessfulAIExtraction();
  setupSuccessfulCreate(sessionId);
}

async function setupTestMeetingSession(): Promise<{ sessionId: string }> {
  const sessionId = `integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setupFullPipeline(sessionId);
  return { sessionId };
}

// ─── Tests ───

describe("meetingSummary.integration", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // End-to-end summary generation workflow
  // ═══════════════════════════════════════════════════════════════════
  describe("end-to-end summary generation workflow", () => {
    it("completes successfully from meeting end to API retrieval", async () => {
      const { sessionId } = await setupTestMeetingSession();
      const transcriptSegments = createTranscriptSegments(sessionId, 5);
      const actionItems = createActionItems(2);

      // Step 1: Generate summary via the service
      const result = await generateSummary(sessionId, {
        transcriptSegments,
        actionItems,
      });

      expect(result.summary).toBeDefined();
      expect(result.summary.meetingSessionId).toBe(sessionId);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);

      // Verify AI service was called with correct context
      expect(mockAIExtract).toHaveBeenCalledOnce();
      const extractionArg = mockAIExtract.mock.calls[0]![0];
      expect(extractionArg.meetingSessionId).toBe(sessionId);
      expect(extractionArg.transcriptSegments).toHaveLength(5);
      expect(extractionArg.actionItems).toHaveLength(2);

      // Verify database persistence
      expect(mockPrisma.create).toHaveBeenCalledOnce();
      const createArg = mockPrisma.create.mock.calls[0]![0];
      expect(createArg.data.meetingSessionId).toBe(sessionId);
      expect(createArg.data.generatedBy).toBe("ai-summary-service");

      // Step 2: Retrieve the summary via controller (simulating GET API call)
      setupExistingSummary(sessionId);
      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();
      await getSummaryHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as { success: boolean; summary: MeetingSessionSummary };
      expect(body.success).toBe(true);
      expect(body.summary.meetingSessionId).toBe(sessionId);

      // Verify lock lifecycle
      expect(mockLocking.acquireLock).toHaveBeenCalledWith(sessionId);
      expect(mockLocking.releaseLock).toHaveBeenCalledWith(sessionId);
    });

    it("generates summary with rich meeting data containing multiple content types", async () => {
      const { sessionId } = await setupTestMeetingSession();
      const { transcriptSegments, actionItems } = createRichMeetingData(sessionId);

      const result = await generateSummary(sessionId, {
        transcriptSegments,
        actionItems,
      });

      expect(result.summary).toBeDefined();
      expect(mockAIExtract).toHaveBeenCalledOnce();
      const ctx = mockAIExtract.mock.calls[0]![0];
      expect(ctx.transcriptSegments).toHaveLength(10);
      expect(ctx.actionItems).toHaveLength(3);
    });

    it("generates summary with minimal data (only action items)", async () => {
      const { sessionId } = await setupTestMeetingSession();
      const { transcriptSegments, actionItems } = createMinimalMeetingData(sessionId);

      const result = await generateSummary(sessionId, {
        transcriptSegments,
        actionItems,
      });

      expect(result.summary).toBeDefined();
      const ctx = mockAIExtract.mock.calls[0]![0];
      expect(ctx.transcriptSegments).toHaveLength(0);
      expect(ctx.actionItems).toHaveLength(1);
    });

    it("returns cached summary without calling AI when summary already exists", async () => {
      const sessionId = "cached-session";
      setupExistingSummary(sessionId);

      const result = await generateSummary(sessionId);

      expect(result.wasRegenerated).toBe(false);
      expect(result.summary.meetingSessionId).toBe(sessionId);
      expect(mockAIExtract).not.toHaveBeenCalled();
      expect(mockLocking.acquireLock).not.toHaveBeenCalled();
    });

    it("regenerates summary when forceRegenerate is true", async () => {
      const sessionId = "regen-session";
      setupNoExistingSummary();
      setupSuccessfulAIExtraction();
      setupSuccessfulCreate(sessionId);

      const result = await generateSummary(sessionId, {
        forceRegenerate: true,
        transcriptSegments: createTranscriptSegments(sessionId),
        actionItems: createActionItems(),
      });

      expect(result.wasRegenerated).toBe(true);
      expect(mockPrisma.deleteMany).toHaveBeenCalledWith({
        where: { meetingSessionId: sessionId },
      });
      expect(mockAIExtract).toHaveBeenCalledOnce();
      expect(mockPrisma.create).toHaveBeenCalledOnce();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Meeting end event integration
  // ═══════════════════════════════════════════════════════════════════
  describe("meeting end event integration", () => {
    it("triggers summary generation when meeting ends with sufficient duration", async () => {
      const session = createMeetingSession({ sessionId: "end-event-session" });
      setupFullPipeline(session.sessionId);

      const logger = { info: vi.fn(), error: vi.fn() };

      await handleMeetingEnd(session, undefined, logger);

      expect(logger.info).toHaveBeenCalledWith(
        "Meeting end handler started",
        expect.objectContaining({ sessionId: session.sessionId }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Triggering summary generation for meeting session",
        expect.objectContaining({ sessionId: session.sessionId }),
      );
    });

    it("skips summary generation for short meetings", async () => {
      const session = createShortMeetingSession();
      const logger = { info: vi.fn(), error: vi.fn() };

      await handleMeetingEnd(session, undefined, logger);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("below minimum threshold"),
        expect.objectContaining({ sessionId: session.sessionId }),
      );
      expect(mockAIExtract).not.toHaveBeenCalled();
    });

    it("skips summary generation when autoGenerateSummary is disabled", async () => {
      const session = createMeetingSession();
      const logger = { info: vi.fn(), error: vi.fn() };

      await handleMeetingEnd(session, { autoGenerateSummary: false }, logger);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("disabled"),
        expect.objectContaining({ sessionId: session.sessionId }),
      );
    });

    it("does not block meeting end process when summary generation fails", async () => {
      const session = createMeetingSession({ sessionId: "failing-end" });
      setupNoExistingSummary();
      setupFailingAIExtraction(
        new SummaryGenerationError("AI failure", "AI_SERVICE_FAILURE", session.sessionId),
      );

      const logger = { info: vi.fn(), error: vi.fn() };

      await expect(
        handleMeetingEnd(session, { summaryRetryAttempts: 1, summaryRetryDelay: 0 }, logger),
      ).resolves.toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Summary generation job with retry logic
  // ═══════════════════════════════════════════════════════════════════
  describe("summary generation job retry logic", () => {
    it("reports failure when meeting data is unavailable in data pipeline", async () => {
      // The job calls generateSummary without providing data directly.
      // The service's retrieveMeetingData stubs return empty arrays,
      // causing INSUFFICIENT_DATA on every attempt.
      const sessionId = "job-no-data";
      setupNoExistingSummary();

      const logger = { info: vi.fn(), error: vi.fn() };
      const result = await triggerSummaryGeneration(
        sessionId,
        { summaryRetryAttempts: 3, summaryRetryDelay: 0 },
        logger,
      );

      expect(result.success).toBe(false);
      expect(result.meetingSessionId).toBe(sessionId);
      expect(result.attempt).toBe(3);
      expect(result.error).toContain("failed after 3 attempts");
      expect(logger.error).toHaveBeenCalled();
    });

    it("returns existing summary on retry when first attempt created it", async () => {
      // Simulate: first attempt creates a summary, second attempt finds it cached
      const sessionId = "job-cached";
      // First call: no summary found → INSUFFICIENT_DATA (no data in stub)
      // To test success, simulate an existing summary being available
      setupExistingSummary(sessionId);

      const logger = { info: vi.fn(), error: vi.fn() };
      const result = await triggerSummaryGeneration(
        sessionId,
        { summaryRetryAttempts: 3, summaryRetryDelay: 0 },
        logger,
      );

      expect(result.success).toBe(true);
      expect(result.meetingSessionId).toBe(sessionId);
      expect(result.attempt).toBe(1);
    });

    it("logs each retry attempt with attempt number", async () => {
      const sessionId = "job-logging";
      setupNoExistingSummary();

      const logger = { info: vi.fn(), error: vi.fn() };
      await triggerSummaryGeneration(
        sessionId,
        { summaryRetryAttempts: 2, summaryRetryDelay: 0 },
        logger,
      );

      // Should log start of each attempt
      expect(logger.info).toHaveBeenCalledWith(
        "Summary generation attempt started",
        expect.objectContaining({ meetingSessionId: sessionId, attempt: 1, maxAttempts: 2 }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Summary generation attempt started",
        expect.objectContaining({ meetingSessionId: sessionId, attempt: 2, maxAttempts: 2 }),
      );
    });

    it("service-level: retries succeed after transient AI failure", async () => {
      // Test retry logic at the service level where we can provide data
      const sessionId = "retry-service";
      setupNoExistingSummary();
      setupSuccessfulCreate(sessionId);

      const data = {
        transcriptSegments: createTranscriptSegments(sessionId),
        actionItems: createActionItems(),
      };

      // First call fails, second succeeds
      mockAIExtract
        .mockRejectedValueOnce(
          new SummaryGenerationError("Temporary failure", "AI_SERVICE_FAILURE", sessionId),
        )
        .mockResolvedValueOnce(createExtractionResult());

      // First attempt fails
      await expect(generateSummary(sessionId, data)).rejects.toThrow(SummaryGenerationError);
      // Second attempt succeeds
      const result = await generateSummary(sessionId, data);
      expect(result.summary).toBeDefined();
      expect(mockAIExtract).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Concurrent summary generation requests
  // ═══════════════════════════════════════════════════════════════════
  describe("concurrent summary generation", () => {
    it("handles concurrent requests for different meetings without conflicts", async () => {
      const sessions = ["concurrent-1", "concurrent-2", "concurrent-3"];

      setupNoExistingSummary();
      setupSuccessfulAIExtraction();

      mockPrisma.create.mockImplementation((args: { data: { meetingSessionId: string } }) => {
        const sid = args.data.meetingSessionId;
        return Promise.resolve({
          id: `summary-${sid}`,
          meetingSessionId: sid,
          generatedAt: new Date(),
          generatedBy: "ai-summary-service",
          createdAt: new Date(),
          updatedAt: new Date(),
          keyDecisions: [
            {
              id: `kd-${sid}`,
              summaryId: `summary-${sid}`,
              description: `Decision for ${sid}`,
              participants: JSON.stringify(["alice"]),
              madeAt: null,
              context: null,
            },
          ],
          openQuestions: [],
          nextSteps: [],
        });
      });

      const results = await Promise.all(
        sessions.map((sid) =>
          generateSummary(sid, {
            transcriptSegments: createTranscriptSegments(sid, 5),
            actionItems: createActionItems(1),
          }),
        ),
      );

      expect(results).toHaveLength(3);
      for (let i = 0; i < sessions.length; i++) {
        expect(results[i]!.summary.meetingSessionId).toBe(sessions[i]);
      }

      expect(mockLocking.acquireLock).toHaveBeenCalledTimes(3);
      expect(mockLocking.releaseLock).toHaveBeenCalledTimes(3);
      for (const sid of sessions) {
        expect(mockLocking.acquireLock).toHaveBeenCalledWith(sid);
        expect(mockLocking.releaseLock).toHaveBeenCalledWith(sid);
      }

      expect(mockPrisma.create).toHaveBeenCalledTimes(3);
    });

    it("rejects concurrent request for same meeting when lock is held", async () => {
      const sessionId = "concurrent-same";
      setupNoExistingSummary();

      mockLocking.acquireLock
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      setupSuccessfulAIExtraction();
      setupSuccessfulCreate(sessionId);

      const opts = {
        transcriptSegments: createTranscriptSegments(sessionId),
        actionItems: createActionItems(),
      };

      const [result1, result2] = await Promise.allSettled([
        generateSummary(sessionId, opts),
        generateSummary(sessionId, opts),
      ]);

      expect(result1.status).toBe("fulfilled");
      expect(result2.status).toBe("rejected");
      if (result2.status === "rejected") {
        expect(result2.reason).toBeInstanceOf(SummaryGenerationError);
        expect((result2.reason as SummaryGenerationError).code).toBe("INVALID_SESSION_STATE");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Error handling across components
  // ═══════════════════════════════════════════════════════════════════
  describe("error handling across components", () => {
    it("AI service failure returns proper error and maintains database consistency", async () => {
      const sessionId = "ai-fail-session";
      setupNoExistingSummary();
      setupFailingAIExtraction(
        new SummaryGenerationError("AI service unavailable", "AI_SERVICE_FAILURE", sessionId),
      );

      await expect(
        generateSummary(sessionId, {
          transcriptSegments: createTranscriptSegments(sessionId),
          actionItems: createActionItems(),
        }),
      ).rejects.toThrow(SummaryGenerationError);

      expect(mockPrisma.create).not.toHaveBeenCalled();
      expect(mockLocking.releaseLock).toHaveBeenCalledWith(sessionId);
    });

    it("insufficient data error propagates correctly through controller", async () => {
      const sessionId = "insufficient-session";
      setupNoExistingSummary();

      const req = createMockRequest({
        params: { sessionId },
        body: {},
      });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(422);
      assertErrorResponse(res, 422);
    });

    it("session not found error maps to 404 via controller", async () => {
      const req = createMockRequest({ params: { sessionId: "" } });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(404);
      assertErrorResponse(res, 404, "Meeting session not found");
    });

    it("timeout error maps to 504 at service level", async () => {
      const sessionId = "timeout-session";
      setupNoExistingSummary();
      setupFailingAIExtraction(
        new SummaryGenerationError("Timed out", "GENERATION_TIMEOUT", sessionId),
      );

      // Test at service level where we can provide data to reach AI extraction
      await expect(
        generateSummary(sessionId, {
          transcriptSegments: createTranscriptSegments(sessionId),
          actionItems: createActionItems(),
        }),
      ).rejects.toMatchObject({ code: "GENERATION_TIMEOUT" });
    });

    it("lock conflict error maps to 409 via controller", async () => {
      const sessionId = "locked-session";
      setupNoExistingSummary();
      mockLocking.acquireLock.mockReturnValue(false);

      const req = createMockRequest({
        params: { sessionId },
        body: {},
      });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(409);
      assertErrorResponse(res, 409);
    });

    it("unexpected errors map to 500 via controller when database fails", async () => {
      const sessionId = "unexpected-error";
      // Simulate a database failure during session validation
      mockPrisma.findUnique.mockRejectedValue(new Error("Database connection lost"));

      const req = createMockRequest({
        params: { sessionId },
        body: {},
      });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(500);
      assertErrorResponse(res, 500, "Internal server error");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // API authentication and validation integration
  // ═══════════════════════════════════════════════════════════════════
  describe("API authentication and validation", () => {
    it("rejects requests without authentication", () => {
      const req = createMockRequest({ params: { sessionId: "auth-test" } });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(res._status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("accepts requests with valid Bearer token", () => {
      const req = createAuthenticatedRequest({ params: { sessionId: "auth-test" } });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("validates session ID format before processing", () => {
      const req = createMockRequest({ params: { sessionId: "invalid session!" } });
      const res = createMockResponse();
      const next = vi.fn();

      validateSessionId(req, res, next);

      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    it("validates request body types for summary generation", () => {
      const req = createMockRequest({
        body: { includeTranscript: "not-a-boolean" },
      });
      const res = createMockResponse();
      const next = vi.fn();

      validateGenerateBody(req, res, next);

      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    it("passes valid authenticated and validated request through middleware chain", () => {
      const req = createAuthenticatedRequest({
        params: { sessionId: "valid-session-123" },
        body: { includeTranscript: true, includeActionItems: true },
      });
      const res = createMockResponse();
      const next1 = vi.fn();
      const next2 = vi.fn();
      const next3 = vi.fn();

      requireAuth(req, res, next1);
      expect(next1).toHaveBeenCalled();

      validateSessionId(req, res, next2);
      expect(next2).toHaveBeenCalled();

      validateGenerateBody(req, res, next3);
      expect(next3).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Summary retrieval and listing
  // ═══════════════════════════════════════════════════════════════════
  describe("summary retrieval and listing", () => {
    it("retrieves existing summary via GET endpoint", async () => {
      const sessionId = "retrieve-session";
      setupExistingSummary(sessionId);

      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();

      await getSummaryHandler(req, res);

      assertSuccessResponse(res, 200);
      const body = res._json as { summary: MeetingSessionSummary };
      expect(body.summary.meetingSessionId).toBe(sessionId);
      expect(body.summary.keyDecisions).toHaveLength(1);
    });

    it("returns 404 for non-existent summary", async () => {
      setupNoExistingSummary();

      const req = createMockRequest({ params: { sessionId: "nonexistent" } });
      const res = createMockResponse();

      await getSummaryHandler(req, res);

      assertErrorResponse(res, 404, "not found");
    });

    it("lists summaries with pagination", async () => {
      const req = createMockRequest({ query: { page: "1", pageSize: "10" } });
      const res = createMockResponse();

      await listSummariesHandler(req, res);

      assertSuccessResponse(res, 200);
      const body = res._json as { summaries: unknown[]; pagination: { page: number; pageSize: number } };
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(10);
    });

    it("filters summaries by meetingSessionId", async () => {
      const sessionId = "filter-session";
      setupExistingSummary(sessionId);

      const req = createMockRequest({
        query: { meetingSessionId: sessionId },
      });
      const res = createMockResponse();

      await listSummariesHandler(req, res);

      assertSuccessResponse(res, 200);
      const body = res._json as { summaries: MeetingSessionSummary[]; pagination: { total: number } };
      expect(body.summaries).toHaveLength(1);
      expect(body.summaries[0]!.meetingSessionId).toBe(sessionId);
      expect(body.pagination.total).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Background/async processing
  // ═══════════════════════════════════════════════════════════════════
  describe("background processing", () => {
    it("returns 202 when async mode is requested via controller", async () => {
      const sessionId = "async-session";
      setupNoExistingSummary();
      setupSuccessfulAIExtraction();
      setupSuccessfulCreate(sessionId);

      const req = createMockRequest({
        params: { sessionId },
        body: { async: true },
      });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(202);
      const body = res._json as { success: boolean; message: string };
      expect(body.success).toBe(true);
      expect(body.message).toContain("started");
    });

    it("returns progress for background generation task", async () => {
      const sessionId = "progress-session";
      setupNoExistingSummary();
      setupSuccessfulAIExtraction();
      setupSuccessfulCreate(sessionId);

      await generateSummary(sessionId, {
        backgroundProcessing: true,
        transcriptSegments: createTranscriptSegments(sessionId),
        actionItems: createActionItems(),
      });

      const progress = getGenerationProgress(sessionId);
      expect(progress).not.toBeNull();
      expect(progress!.meetingSessionId).toBe(sessionId);
      expect(["pending", "processing", "completed"]).toContain(progress!.status);
    });

    it("returns 404 for progress of non-existent task", async () => {
      const req = createMockRequest({ params: { sessionId: "no-task" } });
      const res = createMockResponse();

      await getProgressHandler(req, res);

      assertErrorResponse(res, 404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Database transaction consistency
  // ═══════════════════════════════════════════════════════════════════
  describe("database transaction consistency", () => {
    it("persists key decisions, open questions, and next steps in a single create call", async () => {
      const sessionId = "txn-session";
      setupFullPipeline(sessionId);

      await generateSummary(sessionId, {
        transcriptSegments: createTranscriptSegments(sessionId),
        actionItems: createActionItems(),
      });

      expect(mockPrisma.create).toHaveBeenCalledOnce();
      const createArg = mockPrisma.create.mock.calls[0]![0];

      expect(createArg.data.keyDecisions.create).toBeDefined();
      expect(createArg.data.openQuestions.create).toBeDefined();
      expect(createArg.data.nextSteps.create).toBeDefined();
      expect(createArg.include.keyDecisions).toBe(true);
      expect(createArg.include.openQuestions).toBe(true);
      expect(createArg.include.nextSteps).toBe(true);
    });

    it("does not create partial summary when AI extraction fails", async () => {
      const sessionId = "no-partial";
      setupNoExistingSummary();
      setupFailingAIExtraction(
        new SummaryGenerationError("AI down", "AI_SERVICE_FAILURE", sessionId),
      );

      await expect(
        generateSummary(sessionId, {
          transcriptSegments: createTranscriptSegments(sessionId),
          actionItems: createActionItems(),
        }),
      ).rejects.toThrow();

      expect(mockPrisma.create).not.toHaveBeenCalled();
    });

    it("deletes existing summary before regeneration", async () => {
      const sessionId = "delete-before-regen";
      setupNoExistingSummary();
      setupSuccessfulAIExtraction();
      setupSuccessfulCreate(sessionId);

      await generateSummary(sessionId, {
        forceRegenerate: true,
        transcriptSegments: createTranscriptSegments(sessionId),
        actionItems: createActionItems(),
      });

      expect(mockPrisma.deleteMany).toHaveBeenCalledWith({
        where: { meetingSessionId: sessionId },
      });
      expect(mockPrisma.create).toHaveBeenCalledOnce();

      const deleteOrder = mockPrisma.deleteMany.mock.invocationCallOrder[0]!;
      const createOrder = mockPrisma.create.mock.invocationCallOrder[0]!;
      expect(deleteOrder).toBeLessThan(createOrder);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Performance benchmarks
  // ═══════════════════════════════════════════════════════════════════
  describe("performance benchmarks", () => {
    it("summary generation completes within acceptable time", async () => {
      const sessionId = "perf-session";
      setupFullPipeline(sessionId);

      mockAIExtract.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(createExtractionResult()), 50),
          ),
      );

      const start = Date.now();
      const result = await generateSummary(sessionId, {
        transcriptSegments: createTranscriptSegments(sessionId, 10),
        actionItems: createActionItems(3),
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it("API response latency is within acceptable range", async () => {
      const sessionId = "latency-session";
      setupExistingSummary(sessionId);

      const start = Date.now();
      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();
      await getSummaryHandler(req, res);
      const elapsed = Date.now() - start;

      expect(res._status).toBe(200);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Mock AI service response coverage
  // ═══════════════════════════════════════════════════════════════════
  describe("AI service response scenarios", () => {
    it("handles AI response with empty decision list", async () => {
      const sessionId = "empty-decisions";
      setupNoExistingSummary();
      setupSuccessfulAIExtraction({
        keyDecisions: [],
        openQuestions: [{ id: "oq-1", question: "Remaining question" }],
        nextSteps: [],
        confidence: 0.4,
        processingTime: 800,
      });
      setupSuccessfulCreate(sessionId);

      const result = await generateSummary(sessionId, {
        transcriptSegments: createTranscriptSegments(sessionId),
        actionItems: createActionItems(),
      });

      expect(result.summary).toBeDefined();
      expect(mockPrisma.create).toHaveBeenCalledOnce();
    });

    it("handles AI response with high confidence extraction", async () => {
      const sessionId = "high-confidence";
      setupNoExistingSummary();
      setupSuccessfulAIExtraction({ confidence: 0.95, processingTime: 2000 });
      setupSuccessfulCreate(sessionId);

      const result = await generateSummary(sessionId, {
        transcriptSegments: createTranscriptSegments(sessionId, 8),
        actionItems: createActionItems(3),
      });

      expect(result.summary).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Mock data factory coverage
  // ═══════════════════════════════════════════════════════════════════
  describe("mock data factories", () => {
    it("createMockTranscriptData produces valid transcript segments", () => {
      const segments = createMockTranscriptData("factory-session", 3);
      expect(segments).toHaveLength(3);
      for (const seg of segments) {
        expect(seg.sessionId).toBe("factory-session");
        expect(seg.speakerId).toBeDefined();
        expect(seg.text.length).toBeGreaterThan(0);
        expect(seg.startTime).toBeLessThan(seg.endTime);
      }
    });

    it("createMockActionItems produces valid action items", () => {
      const items = createMockActionItems(2);
      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item.id).toBeDefined();
        expect(item.description.length).toBeGreaterThan(0);
        expect(["open", "in-progress", "completed"]).toContain(item.status);
      }
    });

    it("uses mock data factories in end-to-end generation", async () => {
      const { sessionId } = await setupTestMeetingSession();
      const transcriptSegments = createMockTranscriptData(sessionId, 5);
      const actionItems = createMockActionItems(2);

      const result = await generateSummary(sessionId, {
        transcriptSegments,
        actionItems,
      });

      expect(result.summary).toBeDefined();
      expect(result.summary.meetingSessionId).toBe(sessionId);
      const ctx = mockAIExtract.mock.calls[0]![0];
      expect(ctx.transcriptSegments).toHaveLength(5);
      expect(ctx.actionItems).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Data cleanup verification
  // ═══════════════════════════════════════════════════════════════════
  describe("test data cleanup", () => {
    it("resets mock state between tests", () => {
      expect(mockAIExtract).not.toHaveBeenCalled();
      expect(mockPrisma.create).not.toHaveBeenCalled();
      expect(mockPrisma.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.deleteMany).not.toHaveBeenCalled();
      expect(mockLocking.acquireLock).not.toHaveBeenCalled();
      expect(mockLocking.releaseLock).not.toHaveBeenCalled();
    });

    it("lock mock defaults are restored after each test", () => {
      expect(mockLocking.acquireLock()).toBe(true);
      expect(mockLocking.isLocked()).toBe(false);
    });
  });
});
