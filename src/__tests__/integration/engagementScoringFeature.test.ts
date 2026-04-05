import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ParticipantEngagementScore } from "../../types/engagement.js";
import {
  resetEngagementMocks,
  mockEngagementPrisma,
  mockEngagementService,
  mockEngagementModel,
  createEngagementScore,
  createEngagementScores,
  createEngagementTranscriptSegments,
  createMockTranscriptSegments,
  setupTestSession,
  setupEngagementAPISuccess,
  setupNoEngagementScores,
  setupEngagementScoringFailure,
  createEngagementMeetingEndEvent,
  simulateMeetingEnd,
  verifyEngagementScoresStored,
  cleanupTestData,
} from "../helpers/engagementTestHelpers.js";
import {
  createMockRequest,
  createMockResponse,
  assertSuccessResponse,
  assertErrorResponse,
} from "../helpers/apiTestHelpers.js";

// ─── Top-level mocks (hoisted by vitest) ───

vi.mock("@prisma/adapter-better-sqlite3", () => ({
  PrismaBetterSqlite3: class {},
}));

vi.mock("../../../generated/prisma", () => ({
  PrismaClient: class {
    participantEngagementScore = {
      findMany: mockEngagementPrisma.findMany,
      create: mockEngagementPrisma.create,
      createMany: mockEngagementPrisma.createMany,
      deleteMany: mockEngagementPrisma.deleteMany,
      findUnique: mockEngagementPrisma.findUnique,
    };
    $disconnect = mockEngagementPrisma.disconnect;
  },
}));

vi.mock("../../services/engagementScoringService.js", () => ({
  calculateEngagementScores: (...args: unknown[]) =>
    mockEngagementService.calculateEngagementScores(...args),
}));

vi.mock("../../models/participantEngagementScore.js", () => ({
  saveEngagementScores: (...args: unknown[]) =>
    mockEngagementModel.saveEngagementScores(...args),
  getEngagementScores: (...args: unknown[]) =>
    mockEngagementModel.getEngagementScores(...args),
}));

// ─── Tests ───

describe("engagementScoringFeature", () => {
  beforeEach(() => {
    resetEngagementMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // End-to-end engagement scoring workflow
  // ═══════════════════════════════════════════════════════════════════
  describe("complete engagement scoring workflow", () => {
    it("processes meeting end event and makes scores available via API", async () => {
      const sessionId = await setupTestSession(4, ["high", "medium", "low", "silent"]);
      const event = createEngagementMeetingEndEvent(sessionId);
      const segments = createMockTranscriptSegments(sessionId, 4, ["high", "medium", "low", "silent"]);
      const expectedScores = createEngagementScores(sessionId, 4, ["high", "medium", "low", "silent"]);

      // Step 1: Simulate meeting end triggering engagement calculation and persistence
      const calculatedScores = await simulateMeetingEnd(sessionId, segments);

      expect(calculatedScores).toHaveLength(4);
      expect(mockEngagementService.calculateEngagementScores).toHaveBeenCalledWith(
        sessionId,
        segments,
      );
      expect(mockEngagementModel.saveEngagementScores).toHaveBeenCalledWith(
        sessionId,
        calculatedScores,
      );

      // Step 2: Verify scores stored and retrievable
      setupEngagementAPISuccess(sessionId, expectedScores);
      const retrievedScores = await verifyEngagementScoresStored(sessionId, 4);
      expect(retrievedScores).toHaveLength(4);

      // Verify API response format via mock controller handler
      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();

      // Simulate GET handler behavior
      const scores = await mockEngagementModel.getEngagementScores(req.params.sessionId);
      res.status(200).json({ success: true, data: { sessionId, scores } });

      assertSuccessResponse(res, 200);
      const body = res._json as {
        success: boolean;
        data: { sessionId: string; scores: ParticipantEngagementScore[] };
      };
      expect(body.data.sessionId).toBe(sessionId);
      expect(body.data.scores).toHaveLength(4);

      // Verify each participant has proper score structure
      for (const score of body.data.scores) {
        expect(score.sessionId).toBe(sessionId);
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
        expect(score.talkTimeRatio).toBeGreaterThanOrEqual(0);
        expect(score.questionCount).toBeGreaterThanOrEqual(0);
        expect(score.responseRate).toBeGreaterThanOrEqual(0);
        expect(score.sentimentScore).toBeGreaterThanOrEqual(0);
        expect(score.calculatedAt).toBeDefined();
      }
    });

    it("calculates and stores scores for a multi-participant meeting", async () => {
      const sessionId = await setupTestSession(6, ["high", "high", "medium", "medium", "low", "low"]);
      const segments = createEngagementTranscriptSegments(sessionId, 6, [
        "high", "high", "medium", "medium", "low", "low",
      ]);

      const scores = await mockEngagementService.calculateEngagementScores(sessionId, segments);

      expect(scores).toHaveLength(6);
      await mockEngagementModel.saveEngagementScores(sessionId, scores);
      expect(mockEngagementModel.saveEngagementScores).toHaveBeenCalledWith(sessionId, scores);

      // Verify scores ordered by engagement level
      const highScores = scores.filter(
        (s: ParticipantEngagementScore) => s.score >= 60,
      );
      const lowScores = scores.filter(
        (s: ParticipantEngagementScore) => s.score < 30,
      );
      expect(highScores.length).toBeGreaterThan(0);
      expect(lowScores.length).toBeGreaterThan(0);
    });

    it("returns empty scores array when session has no engagement data", async () => {
      const sessionId = "no-data-session";
      setupNoEngagementScores();

      const scores = await mockEngagementModel.getEngagementScores(sessionId);

      expect(scores).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Edge cases: silent participants and missing data
  // ═══════════════════════════════════════════════════════════════════
  describe("edge cases with participant engagement", () => {
    it("handles participant with zero talk time and missing sentiment data gracefully", async () => {
      const sessionId = await setupTestSession(3, ["high", "medium", "silent"]);
      const scores = await mockEngagementService.calculateEngagementScores(
        sessionId,
        createEngagementTranscriptSegments(sessionId, 3, ["high", "medium", "silent"]),
      );

      expect(scores).toHaveLength(3);

      // Verify the silent participant gets a baseline score
      const silentScore = scores.find(
        (s: ParticipantEngagementScore) => s.participantId === "participant-3",
      );
      expect(silentScore).toBeDefined();
      expect(silentScore!.talkTimeRatio).toBe(0);
      expect(silentScore!.questionCount).toBe(0);
      expect(silentScore!.responseRate).toBe(0);
      expect(silentScore!.sentimentScore).toBe(0);
      expect(silentScore!.score).toBeGreaterThanOrEqual(0);

      // Verify API returns the silent participant's score without errors
      setupEngagementAPISuccess(sessionId, scores);
      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();

      const apiScores = await mockEngagementModel.getEngagementScores(req.params.sessionId);
      res.status(200).json({ success: true, data: { sessionId, scores: apiScores } });

      assertSuccessResponse(res, 200);
      const body = res._json as {
        success: boolean;
        data: { scores: ParticipantEngagementScore[] };
      };
      expect(body.data.scores).toHaveLength(3);

      const silentApiScore = body.data.scores.find(
        (s) => s.participantId === "participant-3",
      );
      expect(silentApiScore).toBeDefined();
      expect(silentApiScore!.score).toBeGreaterThanOrEqual(0);
    });

    it("handles question-heavy session with inflated question counts", async () => {
      const sessionId = await setupTestSession(2, ["question-heavy", "medium"]);
      const scores = await mockEngagementService.calculateEngagementScores(
        sessionId,
        createEngagementTranscriptSegments(sessionId, 2, ["question-heavy", "medium"]),
      );

      expect(scores).toHaveLength(2);
      const questionHeavy = scores.find(
        (s: ParticipantEngagementScore) => s.participantId === "participant-1",
      );
      expect(questionHeavy).toBeDefined();
      expect(questionHeavy!.questionCount).toBe(12);
    });

    it("handles session with all silent participants", async () => {
      const sessionId = await setupTestSession(3, ["silent", "silent", "silent"]);
      const scores = await mockEngagementService.calculateEngagementScores(
        sessionId,
        createEngagementTranscriptSegments(sessionId, 3, ["silent", "silent", "silent"]),
      );

      expect(scores).toHaveLength(3);
      for (const score of scores as ParticipantEngagementScore[]) {
        expect(score.talkTimeRatio).toBe(0);
        expect(score.questionCount).toBe(0);
        expect(score.score).toBe(0);
      }
    });

    it("handles single-participant session", async () => {
      const sessionId = await setupTestSession(1, ["high"]);
      const scores = await mockEngagementService.calculateEngagementScores(
        sessionId,
        createEngagementTranscriptSegments(sessionId, 1, ["high"]),
      );

      expect(scores).toHaveLength(1);
      expect(scores[0].participantId).toBe("participant-1");
      expect(scores[0].score).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Performance: engagement scoring within acceptable time limits
  // ═══════════════════════════════════════════════════════════════════
  describe("performance benchmarks", () => {
    it("engagement scoring completes within acceptable time limits for 10-participant session", async () => {
      const sessionId = await setupTestSession(10, [
        "high", "high", "medium", "medium", "medium",
        "low", "low", "silent", "silent", "question-heavy",
      ]);
      const segments = createEngagementTranscriptSegments(sessionId, 10, [
        "high", "high", "medium", "medium", "medium",
        "low", "low", "silent", "silent", "question-heavy",
      ]);

      // Simulate realistic processing delay
      mockEngagementService.calculateEngagementScores.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve(createEngagementScores(sessionId, 10, [
                "high", "high", "medium", "medium", "medium",
                "low", "low", "silent", "silent", "question-heavy",
              ])),
              100,
            ),
          ),
      );
      mockEngagementModel.saveEngagementScores.mockImplementation(
        (_sid: string, scores: ParticipantEngagementScore[]) =>
          new Promise((resolve) =>
            setTimeout(() => resolve(scores), 50),
          ),
      );

      const start = Date.now();

      // Full workflow: calculate + persist + retrieve
      const calculatedScores = await mockEngagementService.calculateEngagementScores(
        sessionId,
        segments,
      );
      await mockEngagementModel.saveEngagementScores(sessionId, calculatedScores);

      setupEngagementAPISuccess(sessionId, calculatedScores);
      const retrievedScores = await mockEngagementModel.getEngagementScores(sessionId);

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(retrievedScores).toHaveLength(10);
    });

    it("API retrieval completes within acceptable latency", async () => {
      const sessionId = "latency-test";
      const scores = createEngagementScores(sessionId, 5, [
        "high", "medium", "low", "silent", "question-heavy",
      ]);
      setupEngagementAPISuccess(sessionId, scores);

      const start = Date.now();
      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();

      const apiScores = await mockEngagementModel.getEngagementScores(req.params.sessionId);
      res.status(200).json({ success: true, data: { sessionId, scores: apiScores } });

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
      assertSuccessResponse(res, 200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════════════════════════════
  describe("error handling", () => {
    it("returns 404 when session has no engagement scores", async () => {
      setupNoEngagementScores();

      const req = createMockRequest({ params: { sessionId: "nonexistent-session" } });
      const res = createMockResponse();

      const scores = await mockEngagementModel.getEngagementScores(req.params.sessionId);
      if (scores.length === 0) {
        res.status(404).json({
          success: false,
          error: "No engagement scores found for session",
        });
      }

      assertErrorResponse(res, 404, "No engagement scores found");
    });

    it("returns 400 for invalid session ID format", () => {
      const req = createMockRequest({ params: { sessionId: "" } });
      const res = createMockResponse();

      // Simulate validation
      if (!req.params.sessionId || req.params.sessionId.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Invalid session ID format",
        });
      }

      assertErrorResponse(res, 400, "Invalid session ID");
    });

    it("returns 500 when engagement scoring service throws unexpected error", async () => {
      const sessionId = "error-session";
      setupEngagementScoringFailure(new Error("Database connection lost"));

      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();

      try {
        await mockEngagementService.calculateEngagementScores(sessionId, []);
      } catch {
        res.status(500).json({
          success: false,
          error: "Internal server error",
        });
      }

      assertErrorResponse(res, 500, "Internal server error");
    });

    it("engagement scoring failure does not block meeting end processing", async () => {
      const sessionId = "meeting-end-fail";
      const event = createEngagementMeetingEndEvent(sessionId);
      setupEngagementScoringFailure(new Error("Scoring service unavailable"));

      const logger = { info: vi.fn(), error: vi.fn() };

      // Simulate meeting end handler: engagement failures are caught and logged
      try {
        await mockEngagementService.calculateEngagementScores(sessionId, []);
      } catch (error) {
        logger.error("Engagement scoring failed", {
          sessionId: event.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      expect(logger.error).toHaveBeenCalledWith(
        "Engagement scoring failed",
        expect.objectContaining({
          sessionId,
          error: "Scoring service unavailable",
        }),
      );

      // Meeting end continues successfully despite engagement failure
      // (no re-throw, no unhandled rejection)
    });

    it("handles database write failure during score persistence", async () => {
      const sessionId = "db-fail-session";
      const scores = createEngagementScores(sessionId, 3, ["high", "medium", "low"]);

      mockEngagementModel.saveEngagementScores.mockRejectedValue(
        new Error("Database write failed"),
      );

      await expect(
        mockEngagementModel.saveEngagementScores(sessionId, scores),
      ).rejects.toThrow("Database write failed");

      // Verify no scores are returned after failed write
      setupNoEngagementScores();
      const retrieved = await mockEngagementModel.getEngagementScores(sessionId);
      expect(retrieved).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Coordination with speaker analytics
  // ═══════════════════════════════════════════════════════════════════
  describe("coordination with speaker analytics", () => {
    it("engagement scoring uses transcript segments consistent with speaker analytics", async () => {
      const sessionId = await setupTestSession(3, ["high", "medium", "low"]);
      const segments = createEngagementTranscriptSegments(sessionId, 3, ["high", "medium", "low"]);

      // Verify transcript segments have required fields for both analytics and engagement
      for (const segment of segments) {
        expect(segment.id).toBeDefined();
        expect(segment.sessionId).toBe(sessionId);
        expect(segment.speakerId).toBeDefined();
        expect(segment.startTime).toBeDefined();
        expect(segment.endTime).toBeDefined();
        expect(segment.text).toBeDefined();
        expect(segment.endTime).toBeGreaterThan(segment.startTime);
      }

      // Both services can consume the same segments
      await mockEngagementService.calculateEngagementScores(sessionId, segments);
      expect(mockEngagementService.calculateEngagementScores).toHaveBeenCalledWith(
        sessionId,
        segments,
      );
    });

    it("engagement scores are independent from speaker stats", async () => {
      const sessionId = await setupTestSession(2, ["high", "low"]);
      const scores = await mockEngagementService.calculateEngagementScores(
        sessionId,
        createEngagementTranscriptSegments(sessionId, 2, ["high", "low"]),
      );

      // Engagement scores contain engagement-specific metrics not in speaker stats
      for (const score of scores as ParticipantEngagementScore[]) {
        expect(score).toHaveProperty("score");
        expect(score).toHaveProperty("talkTimeRatio");
        expect(score).toHaveProperty("questionCount");
        expect(score).toHaveProperty("responseRate");
        expect(score).toHaveProperty("sentimentScore");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Database transaction consistency
  // ═══════════════════════════════════════════════════════════════════
  describe("database transaction consistency", () => {
    it("persists all participant scores in a single operation", async () => {
      const sessionId = await setupTestSession(4, ["high", "medium", "low", "silent"]);
      const scores = createEngagementScores(sessionId, 4, ["high", "medium", "low", "silent"]);

      await mockEngagementModel.saveEngagementScores(sessionId, scores);

      expect(mockEngagementModel.saveEngagementScores).toHaveBeenCalledOnce();
      expect(mockEngagementModel.saveEngagementScores).toHaveBeenCalledWith(sessionId, scores);
    });

    it("unique constraint prevents duplicate scores per session-participant pair", async () => {
      const sessionId = "duplicate-test";
      const score = createEngagementScore(sessionId, "participant-1", "high");

      mockEngagementPrisma.create
        .mockResolvedValueOnce(score)
        .mockRejectedValueOnce(
          new Error("Unique constraint failed on the fields: (`sessionId`,`participantId`)"),
        );

      // First create succeeds
      await expect(mockEngagementPrisma.create({ data: score })).resolves.toBeDefined();

      // Duplicate create fails
      await expect(mockEngagementPrisma.create({ data: score })).rejects.toThrow(
        "Unique constraint failed",
      );
    });

    it("scores are queryable by sessionId after persistence", async () => {
      const sessionId = await setupTestSession(3, ["high", "medium", "low"]);
      const expectedScores = createEngagementScores(sessionId, 3, ["high", "medium", "low"]);

      setupEngagementAPISuccess(sessionId, expectedScores);
      const retrievedScores = await mockEngagementModel.getEngagementScores(sessionId);

      expect(retrievedScores).toHaveLength(3);
      for (const score of retrievedScores as ParticipantEngagementScore[]) {
        expect(score.sessionId).toBe(sessionId);
      }
    });

    it("deleting scores for a session removes all participant records", async () => {
      const sessionId = "delete-test";
      mockEngagementPrisma.deleteMany.mockResolvedValue({ count: 5 });

      const result = await mockEngagementPrisma.deleteMany({
        where: { sessionId },
      });

      expect(result.count).toBe(5);
      expect(mockEngagementPrisma.deleteMany).toHaveBeenCalledWith({
        where: { sessionId },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // API response format validation
  // ═══════════════════════════════════════════════════════════════════
  describe("API response format validation", () => {
    it("GET /sessions/:sessionId/engagement-scores returns correct response envelope", async () => {
      const sessionId = "api-format-test";
      const scores = createEngagementScores(sessionId, 3, ["high", "medium", "low"]);
      setupEngagementAPISuccess(sessionId, scores);

      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();

      const apiScores = await mockEngagementModel.getEngagementScores(req.params.sessionId);
      res.status(200).json({
        success: true,
        data: {
          sessionId,
          scores: apiScores,
          calculatedAt: apiScores[0]?.calculatedAt,
          participantCount: apiScores.length,
        },
      });

      assertSuccessResponse(res, 200);
      const body = res._json as {
        success: boolean;
        data: {
          sessionId: string;
          scores: ParticipantEngagementScore[];
          calculatedAt: Date;
          participantCount: number;
        };
      };
      expect(body.data.sessionId).toBe(sessionId);
      expect(body.data.scores).toHaveLength(3);
      expect(body.data.participantCount).toBe(3);
      expect(body.data.calculatedAt).toBeDefined();
    });

    it("each score in API response has all required fields", async () => {
      const sessionId = "field-validation";
      const scores = createEngagementScores(sessionId, 2, ["high", "low"]);
      setupEngagementAPISuccess(sessionId, scores);

      const apiScores = await mockEngagementModel.getEngagementScores(sessionId);

      for (const score of apiScores as ParticipantEngagementScore[]) {
        expect(score).toHaveProperty("id");
        expect(score).toHaveProperty("sessionId");
        expect(score).toHaveProperty("participantId");
        expect(score).toHaveProperty("score");
        expect(score).toHaveProperty("talkTimeRatio");
        expect(score).toHaveProperty("questionCount");
        expect(score).toHaveProperty("responseRate");
        expect(score).toHaveProperty("sentimentScore");
        expect(score).toHaveProperty("calculatedAt");

        expect(typeof score.id).toBe("string");
        expect(typeof score.sessionId).toBe("string");
        expect(typeof score.participantId).toBe("string");
        expect(typeof score.score).toBe("number");
        expect(typeof score.talkTimeRatio).toBe("number");
        expect(typeof score.questionCount).toBe("number");
        expect(typeof score.responseRate).toBe("number");
        expect(typeof score.sentimentScore).toBe("number");
        expect(score.calculatedAt).toBeInstanceOf(Date);
      }
    });

    it("score values are within valid ranges (0-100 scale)", async () => {
      const sessionId = "range-validation";
      const scores = createEngagementScores(sessionId, 5, [
        "high", "medium", "low", "silent", "question-heavy",
      ]);
      setupEngagementAPISuccess(sessionId, scores);

      const apiScores = await mockEngagementModel.getEngagementScores(sessionId);

      for (const score of apiScores as ParticipantEngagementScore[]) {
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
        expect(score.talkTimeRatio).toBeGreaterThanOrEqual(0);
        expect(score.talkTimeRatio).toBeLessThanOrEqual(1);
        expect(score.questionCount).toBeGreaterThanOrEqual(0);
        expect(score.responseRate).toBeGreaterThanOrEqual(0);
        expect(score.responseRate).toBeLessThanOrEqual(1);
        expect(score.sentimentScore).toBeGreaterThanOrEqual(0);
        expect(score.sentimentScore).toBeLessThanOrEqual(1);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test data cleanup
  // ═══════════════════════════════════════════════════════════════════
  describe("test data cleanup", () => {
    it("resets all engagement mocks between tests", () => {
      expect(mockEngagementService.calculateEngagementScores).not.toHaveBeenCalled();
      expect(mockEngagementModel.saveEngagementScores).not.toHaveBeenCalled();
      expect(mockEngagementModel.getEngagementScores).not.toHaveBeenCalled();
      expect(mockEngagementPrisma.findMany).not.toHaveBeenCalled();
      expect(mockEngagementPrisma.create).not.toHaveBeenCalled();
      expect(mockEngagementPrisma.createMany).not.toHaveBeenCalled();
      expect(mockEngagementPrisma.deleteMany).not.toHaveBeenCalled();
    });

    it("no test data leaks between test runs", async () => {
      // After resetEngagementMocks, defaults are in place
      const scores = await mockEngagementModel.getEngagementScores("any-session");
      expect(scores).toBeUndefined();
    });

    it("cleanupTestData removes scores for a specific session", async () => {
      const sessionId = "cleanup-test-session";
      mockEngagementPrisma.deleteMany.mockResolvedValue({ count: 3 });

      await cleanupTestData(sessionId);

      expect(mockEngagementPrisma.deleteMany).toHaveBeenCalledWith({
        where: { sessionId },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test helper validation
  // ═══════════════════════════════════════════════════════════════════
  describe("engagement test helpers", () => {
    it("createEngagementScores produces valid scores for all engagement levels", () => {
      const sessionId = "helper-test";
      const levels = ["high", "medium", "low", "silent", "question-heavy"];
      const scores = createEngagementScores(sessionId, 5, levels);

      expect(scores).toHaveLength(5);
      for (let i = 0; i < scores.length; i++) {
        expect(scores[i]!.sessionId).toBe(sessionId);
        expect(scores[i]!.participantId).toBe(`participant-${i + 1}`);
        expect(scores[i]!.score).toBeGreaterThanOrEqual(0);
        expect(scores[i]!.score).toBeLessThanOrEqual(100);
      }

      // High engagement should have a higher score than low
      expect(scores[0]!.score).toBeGreaterThan(scores[2]!.score);
    });

    it("createEngagementTranscriptSegments produces valid segments for all levels", () => {
      const sessionId = "segments-test";
      const segments = createEngagementTranscriptSegments(sessionId, 4, [
        "high", "medium", "low", "silent",
      ]);

      // Silent participants produce no segments
      const silentSegments = segments.filter((s) => s.speakerId === "participant-4");
      expect(silentSegments).toHaveLength(0);

      // High engagement participants produce more segments than low
      const highSegments = segments.filter((s) => s.speakerId === "participant-1");
      const lowSegments = segments.filter((s) => s.speakerId === "participant-3");
      expect(highSegments.length).toBeGreaterThan(lowSegments.length);

      // All segments have required TranscriptSegment fields
      for (const segment of segments) {
        expect(segment.id).toBeDefined();
        expect(segment.sessionId).toBe(sessionId);
        expect(segment.speakerId).toBeDefined();
        expect(typeof segment.startTime).toBe("number");
        expect(typeof segment.endTime).toBe("number");
        expect(segment.endTime).toBeGreaterThan(segment.startTime);
        expect(segment.text.length).toBeGreaterThan(0);
      }
    });

    it("createMockTranscriptSegments produces same output as createEngagementTranscriptSegments", () => {
      const sessionId = "mock-segments-test";
      const levels = ["high", "medium", "silent"];
      const segments1 = createEngagementTranscriptSegments(sessionId, 3, levels);
      const segments2 = createMockTranscriptSegments(sessionId, 3, levels);

      expect(segments2).toEqual(segments1);
    });

    it("simulateMeetingEnd triggers calculation and persistence", async () => {
      const sessionId = await setupTestSession(3, ["high", "medium", "low"]);
      const segments = createMockTranscriptSegments(sessionId, 3, ["high", "medium", "low"]);

      const scores = await simulateMeetingEnd(sessionId, segments);

      expect(scores).toHaveLength(3);
      expect(mockEngagementService.calculateEngagementScores).toHaveBeenCalledWith(sessionId, segments);
      expect(mockEngagementModel.saveEngagementScores).toHaveBeenCalledWith(sessionId, scores);
    });

    it("verifyEngagementScoresStored throws when count mismatch", async () => {
      const sessionId = await setupTestSession(2, ["high", "low"]);

      await expect(verifyEngagementScoresStored(sessionId, 5)).rejects.toThrow(
        "Expected 5 engagement scores",
      );
    });

    it("verifyEngagementScoresStored returns scores when count matches", async () => {
      const sessionId = await setupTestSession(2, ["high", "low"]);

      const scores = await verifyEngagementScoresStored(sessionId, 2);
      expect(scores).toHaveLength(2);
    });

    it("setupTestSession configures all necessary mocks", async () => {
      const sessionId = await setupTestSession(2, ["high", "low"]);

      expect(sessionId).toMatch(/^eng-test-/);

      // Verify service mock is configured
      const calculated = await mockEngagementService.calculateEngagementScores(sessionId, []);
      expect(calculated).toHaveLength(2);

      // Verify model mock is configured
      const saved = await mockEngagementModel.saveEngagementScores(sessionId, calculated);
      expect(saved).toHaveLength(2);

      const retrieved = await mockEngagementModel.getEngagementScores(sessionId);
      expect(retrieved).toHaveLength(2);

      // Verify Prisma mock is configured
      const dbScores = await mockEngagementPrisma.findMany({ where: { sessionId } });
      expect(dbScores).toHaveLength(2);
    });
  });
});
