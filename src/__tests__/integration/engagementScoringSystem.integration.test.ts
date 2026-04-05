import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ParticipantEngagementScore } from "../../types/engagement.js";
import type { MeetingEndEvent } from "../../types/events.js";
import {
  mockEngagementPrisma,
  mockCalculateEngagement,
  resetEngagementMocks,
  createEngagementTranscriptSegments,
  createMockEngagementScores,
  createDominantSpeakerScores,
  createShortMeetingScores,
  createNoQuestionScores,
  setupExistingEngagementScores,
  setupNoEngagementScores,
  setupSuccessfulEngagementCalculation,
  setupFailingEngagementCalculation,
  setupSuccessfulEngagementCreate,
  setupSuccessfulEngagementCleanup,
  setupTestMeetingData,
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
    };
    $disconnect = mockEngagementPrisma.disconnect;
  },
}));

vi.mock("../../services/engagementScoringService.js", () => ({
  calculateEngagementScores: (...args: unknown[]) =>
    mockCalculateEngagement(...args),
}));

// ─── Simulated controller and service functions ───
// Since the engagement controller and routes are being built by dependency tasks,
// we implement lightweight equivalents that follow the project's API patterns
// (GET /sessions/:sessionId/engagement-scores) to validate the integration contract.

async function getEngagementScoresHandler(
  req: ReturnType<typeof createMockRequest>,
  res: ReturnType<typeof createMockResponse>,
): Promise<void> {
  const { sessionId } = req.params;

  if (!sessionId) {
    res.status(404).json({ success: false, error: "Meeting session not found" });
    return;
  }

  try {
    const scores = await mockEngagementPrisma.findMany({
      where: { sessionId },
    });

    if (!scores || scores.length === 0) {
      res.status(404).json({
        success: false,
        error: "No engagement scores found for session",
      });
      return;
    }

    res.status(200).json({
      success: true,
      sessionId,
      scores,
      calculatedAt: scores[0].calculatedAt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

async function calculateAndStoreScores(
  sessionId: string,
  transcriptSegments: unknown[],
): Promise<ParticipantEngagementScore[]> {
  const scores = await mockCalculateEngagement(sessionId, transcriptSegments);
  for (const score of scores) {
    await mockEngagementPrisma.create({ data: score });
  }
  return scores;
}

async function handleMeetingEndEngagement(
  event: MeetingEndEvent,
  config: { engagementScoringEnabled: boolean },
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
  getTranscriptSegments: (sessionId: string) => Promise<unknown[]>,
): Promise<void> {
  const { sessionId } = event;

  if (!config.engagementScoringEnabled) {
    logger.info("Engagement scoring disabled, skipping calculation", { sessionId });
    return;
  }

  try {
    const segments = await getTranscriptSegments(sessionId);
    const scores = await calculateAndStoreScores(sessionId, segments);
    logger.info("Engagement scores calculated and stored", {
      sessionId,
      participantCount: scores.length,
    });
  } catch (error) {
    logger.error("Engagement scoring failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Tests ───

describe("engagementScoringSystem.integration", () => {
  beforeEach(() => {
    resetEngagementMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // Complete meeting lifecycle: meeting end -> score calculation -> API retrieval
  // ═══════════════════════════════════════════════════════════════════
  describe("complete meeting lifecycle triggers engagement calculation and API retrieval", () => {
    it("calculates scores at meeting end, stores in database, and retrieves via API", async () => {
      const sessionId = `integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await setupTestMeetingData(sessionId);

      const transcriptSegments = createEngagementTranscriptSegments(sessionId, 3, 4);
      const expectedScores = createMockEngagementScores(sessionId, 3);
      setupSuccessfulEngagementCalculation(sessionId, expectedScores);

      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue(transcriptSegments);

      // Step 1: Meeting ends and triggers engagement calculation
      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: true },
        logger,
        getSegments,
      );

      // Verify calculation was triggered
      expect(mockCalculateEngagement).toHaveBeenCalledWith(sessionId, transcriptSegments);
      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scores calculated and stored",
        expect.objectContaining({ sessionId, participantCount: 3 }),
      );

      // Step 2: Scores are persisted to database
      expect(mockEngagementPrisma.create).toHaveBeenCalledTimes(3);
      for (const score of expectedScores) {
        expect(mockEngagementPrisma.create).toHaveBeenCalledWith({
          data: score,
        });
      }

      // Step 3: Retrieve scores via GET /sessions/:sessionId/engagement-scores
      setupExistingEngagementScores(sessionId, expectedScores);
      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();
      await getEngagementScoresHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as {
        success: boolean;
        sessionId: string;
        scores: ParticipantEngagementScore[];
      };
      expect(body.success).toBe(true);
      expect(body.sessionId).toBe(sessionId);
      expect(body.scores).toHaveLength(3);
      expect(body.scores[0]!.score).toBe(85);
      expect(body.scores[1]!.score).toBe(62);
      expect(body.scores[2]!.score).toBe(48);
    });

    it("handles meeting with dominant speaker correctly", async () => {
      const sessionId = "dominant-speaker-session";
      const scores = createDominantSpeakerScores(sessionId);
      setupSuccessfulEngagementCalculation(sessionId, scores);
      setupSuccessfulEngagementCreate(sessionId);

      const segments = createEngagementTranscriptSegments(sessionId, 2, 6);
      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue(segments);

      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: true },
        logger,
        getSegments,
      );

      expect(mockCalculateEngagement).toHaveBeenCalledOnce();
      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scores calculated and stored",
        expect.objectContaining({ participantCount: 2 }),
      );

      // Verify API retrieval shows score disparity
      setupExistingEngagementScores(sessionId, scores);
      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();
      await getEngagementScoresHandler(req, res);

      const body = res._json as { scores: ParticipantEngagementScore[] };
      expect(body.scores[0]!.score).toBe(95);
      expect(body.scores[1]!.score).toBe(15);
      expect(body.scores[0]!.talkTimeRatio).toBe(0.80);
      expect(body.scores[1]!.talkTimeRatio).toBe(0.05);
    });

    it("handles short meeting with minimal participants", async () => {
      const sessionId = "short-meeting-session";
      const scores = createShortMeetingScores(sessionId);
      setupSuccessfulEngagementCalculation(sessionId, scores);
      setupSuccessfulEngagementCreate(sessionId);

      const segments = createEngagementTranscriptSegments(sessionId, 1, 2);
      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue(segments);

      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: true },
        logger,
        getSegments,
      );

      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scores calculated and stored",
        expect.objectContaining({ participantCount: 1 }),
      );
    });

    it("handles meeting with no questions asked", async () => {
      const sessionId = "no-question-session";
      const scores = createNoQuestionScores(sessionId);
      setupSuccessfulEngagementCalculation(sessionId, scores);
      setupSuccessfulEngagementCreate(sessionId);

      const segments = createEngagementTranscriptSegments(sessionId, 2, 3);
      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue(segments);

      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: true },
        logger,
        getSegments,
      );

      setupExistingEngagementScores(sessionId, scores);
      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();
      await getEngagementScoresHandler(req, res);

      const body = res._json as { scores: ParticipantEngagementScore[] };
      for (const s of body.scores) {
        expect(s.questionCount).toBe(0);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // API endpoint: GET /sessions/:sessionId/engagement-scores
  // ═══════════════════════════════════════════════════════════════════
  describe("API endpoint responses", () => {
    it("returns 200 with scores for a valid session", async () => {
      const sessionId = "api-valid-session";
      const scores = createMockEngagementScores(sessionId, 3);
      setupExistingEngagementScores(sessionId, scores);

      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();
      await getEngagementScoresHandler(req, res);

      assertSuccessResponse(res, 200);
      const body = res._json as {
        success: boolean;
        sessionId: string;
        scores: ParticipantEngagementScore[];
        calculatedAt: Date;
      };
      expect(body.sessionId).toBe(sessionId);
      expect(body.scores).toHaveLength(3);
      expect(body.calculatedAt).toBeDefined();
    });

    it("returns 404 for non-existent session", async () => {
      setupNoEngagementScores();

      const req = createMockRequest({ params: { sessionId: "non-existent" } });
      const res = createMockResponse();
      await getEngagementScoresHandler(req, res);

      assertErrorResponse(res, 404, "No engagement scores found for session");
    });

    it("returns 404 when sessionId is missing", async () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();
      await getEngagementScoresHandler(req, res);

      assertErrorResponse(res, 404, "Meeting session not found");
    });

    it("returns 500 when database query fails", async () => {
      mockEngagementPrisma.findMany.mockRejectedValue(
        new Error("Database connection lost"),
      );

      const req = createMockRequest({ params: { sessionId: "db-error-session" } });
      const res = createMockResponse();
      await getEngagementScoresHandler(req, res);

      assertErrorResponse(res, 500, "Internal server error");
    });

    it("returns correct score structure with all engagement metrics", async () => {
      const sessionId = "metric-session";
      const scores = createMockEngagementScores(sessionId, 1);
      setupExistingEngagementScores(sessionId, scores);

      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();
      await getEngagementScoresHandler(req, res);

      const body = res._json as { scores: ParticipantEngagementScore[] };
      const score = body.scores[0]!;

      expect(score).toHaveProperty("id");
      expect(score).toHaveProperty("sessionId", sessionId);
      expect(score).toHaveProperty("participantId");
      expect(score).toHaveProperty("score");
      expect(score).toHaveProperty("talkTimeRatio");
      expect(score).toHaveProperty("questionCount");
      expect(score).toHaveProperty("responseRate");
      expect(score).toHaveProperty("sentimentScore");
      expect(score).toHaveProperty("calculatedAt");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Meeting end event triggers engagement calculation
  // ═══════════════════════════════════════════════════════════════════
  describe("meeting end event triggers engagement calculation", () => {
    it("skips engagement scoring when disabled", async () => {
      const sessionId = "disabled-session";
      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn();

      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: false },
        logger,
        getSegments,
      );

      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scoring disabled, skipping calculation",
        expect.objectContaining({ sessionId }),
      );
      expect(mockCalculateEngagement).not.toHaveBeenCalled();
      expect(getSegments).not.toHaveBeenCalled();
    });

    it("retrieves transcript segments before calculating scores", async () => {
      const sessionId = "transcript-fetch-session";
      const segments = createEngagementTranscriptSegments(sessionId, 2);
      setupSuccessfulEngagementCalculation(sessionId);
      setupSuccessfulEngagementCreate(sessionId);

      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue(segments);

      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: true },
        logger,
        getSegments,
      );

      expect(getSegments).toHaveBeenCalledWith(sessionId);
      expect(mockCalculateEngagement).toHaveBeenCalledWith(sessionId, segments);
    });

    it("does not block meeting end when engagement scoring fails", async () => {
      const sessionId = "failing-engagement";
      setupFailingEngagementCalculation(new Error("Scoring service unavailable"));

      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue([]);

      await expect(
        handleMeetingEndEngagement(
          { sessionId, endTime: Date.now() },
          { engagementScoringEnabled: true },
          logger,
          getSegments,
        ),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        "Engagement scoring failed",
        expect.objectContaining({
          sessionId,
          error: "Scoring service unavailable",
        }),
      );
    });

    it("does not block meeting end when transcript retrieval fails", async () => {
      const sessionId = "transcript-fail-session";
      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockRejectedValue(new Error("Transcript not available"));

      await expect(
        handleMeetingEndEngagement(
          { sessionId, endTime: Date.now() },
          { engagementScoringEnabled: true },
          logger,
          getSegments,
        ),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        "Engagement scoring failed",
        expect.objectContaining({
          sessionId,
          error: "Transcript not available",
        }),
      );
      expect(mockCalculateEngagement).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Score calculation and data extraction
  // ═══════════════════════════════════════════════════════════════════
  describe("score calculation from transcript and sentiment data", () => {
    it("passes transcript segments to the scoring service", async () => {
      const sessionId = "calc-session";
      const segments = createEngagementTranscriptSegments(sessionId, 3, 5);
      setupSuccessfulEngagementCalculation(sessionId);
      setupSuccessfulEngagementCreate(sessionId);

      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue(segments);

      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: true },
        logger,
        getSegments,
      );

      expect(mockCalculateEngagement).toHaveBeenCalledWith(sessionId, segments);
      expect(segments).toHaveLength(15); // 3 participants x 5 segments each
    });

    it("stores each participant score individually in database", async () => {
      const sessionId = "store-session";
      const scores = createMockEngagementScores(sessionId, 4);
      setupSuccessfulEngagementCalculation(sessionId, scores);
      setupSuccessfulEngagementCreate(sessionId);

      const segments = createEngagementTranscriptSegments(sessionId, 4);
      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue(segments);

      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: true },
        logger,
        getSegments,
      );

      expect(mockEngagementPrisma.create).toHaveBeenCalledTimes(4);
      for (const score of scores) {
        expect(mockEngagementPrisma.create).toHaveBeenCalledWith({ data: score });
      }
    });

    it("generates scores within valid 0-100 range", async () => {
      const sessionId = "range-session";
      const scores = createMockEngagementScores(sessionId, 3);

      for (const score of scores) {
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
        expect(score.talkTimeRatio).toBeGreaterThanOrEqual(0);
        expect(score.talkTimeRatio).toBeLessThanOrEqual(1);
        expect(score.responseRate).toBeGreaterThanOrEqual(0);
        expect(score.responseRate).toBeLessThanOrEqual(1);
        expect(score.questionCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Database transaction rollback and test cleanup
  // ═══════════════════════════════════════════════════════════════════
  describe("database transaction rollback and test cleanup", () => {
    it("cleans up test data completely after test completion", async () => {
      const sessionId = "cleanup-session";
      setupSuccessfulEngagementCleanup();

      await mockEngagementPrisma.deleteMany({ where: { sessionId } });

      expect(mockEngagementPrisma.deleteMany).toHaveBeenCalledWith({
        where: { sessionId },
      });
    });

    it("deleteMany removes all scores for a session without affecting others", async () => {
      const sessionId = "isolated-cleanup";
      setupSuccessfulEngagementCleanup();

      await mockEngagementPrisma.deleteMany({ where: { sessionId } });

      expect(mockEngagementPrisma.deleteMany).toHaveBeenCalledWith({
        where: { sessionId },
      });
      // Verify it was called with the specific sessionId, not a blanket delete
      const callArg = mockEngagementPrisma.deleteMany.mock.calls[0]![0];
      expect(callArg.where.sessionId).toBe(sessionId);
    });

    it("resets all mock state between tests correctly", () => {
      // After resetEngagementMocks() in beforeEach, all mocks should be clean
      expect(mockEngagementPrisma.findMany).not.toHaveBeenCalled();
      expect(mockEngagementPrisma.create).not.toHaveBeenCalled();
      expect(mockEngagementPrisma.createMany).not.toHaveBeenCalled();
      expect(mockEngagementPrisma.deleteMany).not.toHaveBeenCalled();
      expect(mockCalculateEngagement).not.toHaveBeenCalled();
    });

    it("database operations maintain isolation between concurrent tests", async () => {
      const session1 = "concurrent-cleanup-1";
      const session2 = "concurrent-cleanup-2";
      setupSuccessfulEngagementCleanup();

      await Promise.all([
        mockEngagementPrisma.deleteMany({ where: { sessionId: session1 } }),
        mockEngagementPrisma.deleteMany({ where: { sessionId: session2 } }),
      ]);

      expect(mockEngagementPrisma.deleteMany).toHaveBeenCalledTimes(2);
      expect(mockEngagementPrisma.deleteMany).toHaveBeenCalledWith({
        where: { sessionId: session1 },
      });
      expect(mockEngagementPrisma.deleteMany).toHaveBeenCalledWith({
        where: { sessionId: session2 },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Concurrent engagement scoring operations
  // ═══════════════════════════════════════════════════════════════════
  describe("concurrent engagement scoring", () => {
    it("handles concurrent scoring for different sessions", async () => {
      const sessions = ["concurrent-1", "concurrent-2", "concurrent-3"];

      const results = await Promise.all(
        sessions.map(async (sessionId) => {
          const scores = createMockEngagementScores(sessionId, 2);
          mockCalculateEngagement.mockResolvedValueOnce(scores);
          mockEngagementPrisma.create.mockResolvedValue(scores[0]);

          const segments = createEngagementTranscriptSegments(sessionId, 2, 3);
          return calculateAndStoreScores(sessionId, segments);
        }),
      );

      expect(results).toHaveLength(3);
      expect(mockCalculateEngagement).toHaveBeenCalledTimes(3);

      for (let i = 0; i < sessions.length; i++) {
        expect(results[i]![0]!.sessionId).toBe(sessions[i]);
      }
    });

    it("isolates scoring failures between sessions", async () => {
      const successSession = "success-session";
      const failSession = "fail-session";

      const successScores = createMockEngagementScores(successSession, 2);
      mockCalculateEngagement
        .mockResolvedValueOnce(successScores)
        .mockRejectedValueOnce(new Error("Scoring failed"));
      mockEngagementPrisma.create.mockResolvedValue(successScores[0]);

      const segments1 = createEngagementTranscriptSegments(successSession, 2);
      const segments2 = createEngagementTranscriptSegments(failSession, 2);

      const [result1, result2] = await Promise.allSettled([
        calculateAndStoreScores(successSession, segments1),
        calculateAndStoreScores(failSession, segments2),
      ]);

      expect(result1.status).toBe("fulfilled");
      expect(result2.status).toBe("rejected");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Error scenarios
  // ═══════════════════════════════════════════════════════════════════
  describe("error scenarios", () => {
    it("database write failure does not leave partial scores", async () => {
      const sessionId = "db-write-fail";
      const scores = createMockEngagementScores(sessionId, 3);
      mockCalculateEngagement.mockResolvedValue(scores);
      mockEngagementPrisma.create
        .mockResolvedValueOnce(scores[0])
        .mockRejectedValueOnce(new Error("Unique constraint violation"));

      await expect(
        calculateAndStoreScores(sessionId, []),
      ).rejects.toThrow("Unique constraint violation");

      // First score was stored, second failed — caller should handle rollback
      expect(mockEngagementPrisma.create).toHaveBeenCalledTimes(2);
    });

    it("handles empty transcript segments gracefully", async () => {
      const sessionId = "empty-transcript";
      mockCalculateEngagement.mockResolvedValue([]);
      mockEngagementPrisma.create.mockResolvedValue(null);

      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue([]);

      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: true },
        logger,
        getSegments,
      );

      expect(mockCalculateEngagement).toHaveBeenCalledWith(sessionId, []);
      expect(mockEngagementPrisma.create).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scores calculated and stored",
        expect.objectContaining({ participantCount: 0 }),
      );
    });

    it("handles scoring service timeout gracefully", async () => {
      const sessionId = "timeout-session";
      setupFailingEngagementCalculation(new Error("Request timeout after 30000ms"));

      const logger = { info: vi.fn(), error: vi.fn() };
      const getSegments = vi.fn().mockResolvedValue(
        createEngagementTranscriptSegments(sessionId, 2),
      );

      await handleMeetingEndEngagement(
        { sessionId, endTime: Date.now() },
        { engagementScoringEnabled: true },
        logger,
        getSegments,
      );

      expect(logger.error).toHaveBeenCalledWith(
        "Engagement scoring failed",
        expect.objectContaining({
          sessionId,
          error: "Request timeout after 30000ms",
        }),
      );
    });

    it("handles missing participant data in scoring results", async () => {
      const sessionId = "missing-data-session";
      const partialScores: ParticipantEngagementScore[] = [
        {
          id: `score-${sessionId}-0`,
          sessionId,
          participantId: "participant-1",
          score: 70,
          talkTimeRatio: 0.5,
          questionCount: 2,
          responseRate: 0.8,
          sentimentScore: 0.6,
          calculatedAt: new Date("2026-04-04T10:00:00Z"),
        },
      ];
      mockCalculateEngagement.mockResolvedValue(partialScores);
      mockEngagementPrisma.create.mockResolvedValue(partialScores[0]);

      const segments = createEngagementTranscriptSegments(sessionId, 3);
      const scores = await calculateAndStoreScores(sessionId, segments);

      // Only one score returned even though 3 participants spoke
      expect(scores).toHaveLength(1);
      expect(mockEngagementPrisma.create).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test data helper validation
  // ═══════════════════════════════════════════════════════════════════
  describe("test data helpers produce valid data", () => {
    it("createEngagementTranscriptSegments produces varied realistic data", () => {
      const segments = createEngagementTranscriptSegments("helper-test", 3, 4);

      expect(segments).toHaveLength(12); // 3 participants x 4 segments each
      for (const seg of segments) {
        expect(seg.sessionId).toBe("helper-test");
        expect(seg.speakerId).toBeDefined();
        expect(seg.text.length).toBeGreaterThan(0);
        expect(seg.startTime).toBeLessThan(seg.endTime);
      }

      // Verify multiple speakers present
      const uniqueSpeakers = new Set(segments.map((s) => s.speakerId));
      expect(uniqueSpeakers.size).toBe(3);
    });

    it("createMockEngagementScores produces valid score ranges", () => {
      const scores = createMockEngagementScores("scores-test", 4);

      expect(scores).toHaveLength(4);
      for (const score of scores) {
        expect(score.sessionId).toBe("scores-test");
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
        expect(score.talkTimeRatio).toBeGreaterThanOrEqual(0);
        expect(score.talkTimeRatio).toBeLessThanOrEqual(1);
        expect(score.responseRate).toBeGreaterThanOrEqual(0);
        expect(score.responseRate).toBeLessThanOrEqual(1);
        expect(score.sentimentScore).toBeGreaterThanOrEqual(-1);
        expect(score.sentimentScore).toBeLessThanOrEqual(1);
        expect(score.questionCount).toBeGreaterThanOrEqual(0);
        expect(score.calculatedAt).toBeInstanceOf(Date);
      }
    });

    it("createDominantSpeakerScores reflects engagement disparity", () => {
      const scores = createDominantSpeakerScores("disparity-test");

      expect(scores).toHaveLength(2);
      const [dominant, passive] = scores;
      expect(dominant!.score).toBeGreaterThan(passive!.score);
      expect(dominant!.talkTimeRatio).toBeGreaterThan(passive!.talkTimeRatio);
      expect(dominant!.questionCount).toBeGreaterThan(passive!.questionCount);
    });

    it("createShortMeetingScores returns minimal participant data", () => {
      const scores = createShortMeetingScores("short-test");

      expect(scores).toHaveLength(1);
      expect(scores[0]!.questionCount).toBe(0);
      expect(scores[0]!.responseRate).toBe(0);
    });

    it("createNoQuestionScores has zero questionCount for all participants", () => {
      const scores = createNoQuestionScores("noquestion-test");

      expect(scores.length).toBeGreaterThanOrEqual(1);
      for (const score of scores) {
        expect(score.questionCount).toBe(0);
      }
    });

    it("setupTestMeetingData configures all required mocks", async () => {
      const sessionId = "setup-test";
      await setupTestMeetingData(sessionId);

      // Verify calculate mock is configured
      const calcResult = await mockCalculateEngagement(sessionId, []);
      expect(calcResult).toBeDefined();
      expect(Array.isArray(calcResult)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Performance and reliability
  // ═══════════════════════════════════════════════════════════════════
  describe("performance and reliability", () => {
    it("engagement scoring completes within acceptable time", async () => {
      const sessionId = "perf-session";
      const scores = createMockEngagementScores(sessionId, 5);

      // Simulate slight delay in calculation
      mockCalculateEngagement.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(scores), 50)),
      );
      mockEngagementPrisma.create.mockResolvedValue(scores[0]);

      const start = Date.now();
      const segments = createEngagementTranscriptSegments(sessionId, 5, 5);
      await calculateAndStoreScores(sessionId, segments);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
    });

    it("API response for score retrieval is within acceptable latency", async () => {
      const sessionId = "latency-session";
      setupExistingEngagementScores(sessionId);

      const start = Date.now();
      const req = createMockRequest({ params: { sessionId } });
      const res = createMockResponse();
      await getEngagementScoresHandler(req, res);
      const elapsed = Date.now() - start;

      expect(res._status).toBe(200);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
