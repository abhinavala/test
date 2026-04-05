import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TranscriptSegment } from "../../types/transcript.js";
import type { ParticipantEngagementScore } from "../../types/engagement.js";
import {
  handleMeetingEnd,
  processEngagementScoring,
  extractEngagementData,
  calculateEngagementScore,
  calculateTalkTimeRatio,
  calculateQuestionScore,
  calculateResponseScore,
  calculateSentimentScore,
  calculateFinalScore,
  handleEngagementScoringError,
} from "../../services/meetingEndHandler.js";
import type {
  MeetingEndHandlerConfig,
  SessionEngagementSummary,
  EngagementCalculationInput,
} from "../../services/meetingEndHandler.js";

// ─── Mock setup ───

vi.mock("../../models/speakerStats.js", () => ({
  saveSpeakerStats: vi.fn().mockResolvedValue(undefined),
  getSpeakerStats: vi.fn().mockResolvedValue(null),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ───

function createTranscriptSegments(
  sessionId: string,
  count: number = 6,
  speakers: string[] = ["speaker-1", "speaker-2", "speaker-3"]
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (let i = 0; i < count; i++) {
    const speakerId = speakers[i % speakers.length]!;
    segments.push({
      id: `seg-${i}`,
      sessionId,
      speakerId,
      startTime: i * 10000,
      endTime: (i + 1) * 10000 - 500,
      text: i % 3 === 0 ? "What do you think about this?" : "I agree, this looks good.",
    });
  }
  return segments;
}

function createMockGetTranscriptSegments(
  segments: TranscriptSegment[]
): (sessionId: string) => Promise<TranscriptSegment[]> {
  return vi.fn().mockResolvedValue(segments);
}

function createMockSaveEngagementScore(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(
    (score: Omit<ParticipantEngagementScore, "id">) =>
      Promise.resolve({ id: `score-${score.participantId}`, ...score })
  );
}

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

// ─── Tests ───

describe("meetingEndEngagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // processEngagementScoring
  // ═══════════════════════════════════════════════════════════════════
  describe("processEngagementScoring", () => {
    it("successfully calculates scores for all participants when meeting ends", async () => {
      const sessionId = "test-session-1";
      const segments = createTranscriptSegments(sessionId, 9, [
        "speaker-1",
        "speaker-2",
        "speaker-3",
      ]);
      const getSegments = createMockGetTranscriptSegments(segments);
      const saveScore = createMockSaveEngagementScore();
      const logger = createLogger();

      const result: SessionEngagementSummary =
        await processEngagementScoring(sessionId, getSegments, {
          saveEngagementScore: saveScore,
          logger,
        });

      // Should return scores for all 3 participants
      expect(result.sessionId).toBe(sessionId);
      expect(result.scores).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.processedAt).toBeInstanceOf(Date);

      // Each score should have valid fields
      for (const score of result.scores) {
        expect(score.id).toBeDefined();
        expect(score.sessionId).toBe(sessionId);
        expect(score.participantId).toBeDefined();
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
        expect(score.talkTimeRatio).toBeGreaterThanOrEqual(0);
        expect(score.talkTimeRatio).toBeLessThanOrEqual(100);
        expect(score.responseRate).toBeGreaterThanOrEqual(0);
        expect(score.responseRate).toBeLessThanOrEqual(100);
        expect(score.sentimentScore).toBeGreaterThanOrEqual(0);
        expect(score.sentimentScore).toBeLessThanOrEqual(100);
        expect(score.calculatedAt).toBeInstanceOf(Date);
      }

      // Verify save was called for each participant
      expect(saveScore).toHaveBeenCalledTimes(3);

      // Verify logging
      expect(logger.info).toHaveBeenCalledWith(
        "Starting engagement scoring",
        { sessionId }
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scoring completed",
        expect.objectContaining({
          sessionId,
          participantsScored: 3,
          participantsFailed: 0,
        })
      );
    });

    it("handles empty participant list without errors", async () => {
      const sessionId = "empty-session";
      const getSegments = createMockGetTranscriptSegments([]);
      const logger = createLogger();

      const result = await processEngagementScoring(sessionId, getSegments, {
        logger,
      });

      expect(result.sessionId).toBe(sessionId);
      expect(result.scores).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("continues processing when individual participant scoring fails", async () => {
      const sessionId = "partial-fail-session";
      const segments = createTranscriptSegments(sessionId, 6, [
        "speaker-1",
        "speaker-2",
      ]);
      const getSegments = createMockGetTranscriptSegments(segments);
      const logger = createLogger();

      // Save function that fails for the first participant
      const saveScore = vi.fn().mockImplementation(
        (score: Omit<ParticipantEngagementScore, "id">) => {
          if (score.participantId === "speaker-1") {
            return Promise.reject(new Error("Database write failed"));
          }
          return Promise.resolve({ id: `score-${score.participantId}`, ...score });
        }
      );

      const result = await processEngagementScoring(sessionId, getSegments, {
        saveEngagementScore: saveScore,
        logger,
      });

      // One participant should succeed, one should fail
      expect(result.scores).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.participantId).toBe("speaker-1");
      expect(result.errors[0]!.error).toBe("Database write failed");

      // Verify error was logged
      expect(logger.error).toHaveBeenCalledWith(
        "Engagement scoring failed for participant",
        expect.objectContaining({
          sessionId,
          participantId: "speaker-1",
          error: "Database write failed",
        })
      );
    });

    it("works without saveEngagementScore function", async () => {
      const sessionId = "no-save-session";
      const segments = createTranscriptSegments(sessionId, 3, ["speaker-1"]);
      const getSegments = createMockGetTranscriptSegments(segments);
      const logger = createLogger();

      const result = await processEngagementScoring(sessionId, getSegments, {
        logger,
      });

      expect(result.scores).toHaveLength(1);
      expect(result.scores[0]!.id).toBe("");
      expect(result.scores[0]!.participantId).toBe("speaker-1");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // handleEngagementScoringError
  // ═══════════════════════════════════════════════════════════════════
  describe("handleEngagementScoringError", () => {
    it("logs error details when participant scoring fails but continues processing", () => {
      const logger = createLogger();
      const error = new Error("Calculation overflow");

      const result = handleEngagementScoringError(
        error,
        "session-123",
        "participant-456",
        logger
      );

      expect(result).toEqual({
        participantId: "participant-456",
        error: "Calculation overflow",
      });

      expect(logger.error).toHaveBeenCalledWith(
        "Engagement scoring failed for participant",
        {
          sessionId: "session-123",
          participantId: "participant-456",
          error: "Calculation overflow",
        }
      );
    });

    it("handles non-Error objects gracefully", () => {
      const logger = createLogger();

      const result = handleEngagementScoringError(
        "string error",
        "session-1",
        "participant-1",
        logger
      );

      expect(result.error).toBe("string error");
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // extractEngagementData
  // ═══════════════════════════════════════════════════════════════════
  describe("extractEngagementData", () => {
    it("returns empty array when session has no participants", () => {
      const result = extractEngagementData([]);
      expect(result).toEqual([]);
    });

    it("groups segments by participant correctly", () => {
      const segments = createTranscriptSegments("session-1", 6, [
        "speaker-a",
        "speaker-b",
      ]);

      const inputs = extractEngagementData(segments);

      expect(inputs).toHaveLength(2);

      const speakerA = inputs.find((i) => i.participantId === "speaker-a");
      const speakerB = inputs.find((i) => i.participantId === "speaker-b");

      expect(speakerA).toBeDefined();
      expect(speakerB).toBeDefined();
      expect(speakerA!.segments).toHaveLength(3);
      expect(speakerB!.segments).toHaveLength(3);

      // All inputs should reference the full segment list
      for (const input of inputs) {
        expect(input.totalSegments).toHaveLength(6);
      }
    });

    it("handles single participant session", () => {
      const segments = createTranscriptSegments("session-1", 3, ["solo-speaker"]);
      const inputs = extractEngagementData(segments);

      expect(inputs).toHaveLength(1);
      expect(inputs[0]!.participantId).toBe("solo-speaker");
      expect(inputs[0]!.segments).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Score calculation components
  // ═══════════════════════════════════════════════════════════════════
  describe("score calculation components", () => {
    const sessionId = "calc-session";

    it("calculates talk time ratio correctly", () => {
      const allSegments: TranscriptSegment[] = [
        { id: "1", sessionId, speakerId: "a", startTime: 0, endTime: 6000, text: "Hello" },
        { id: "2", sessionId, speakerId: "b", startTime: 6000, endTime: 10000, text: "Hi" },
      ];
      const participantSegments = allSegments.filter((s) => s.speakerId === "a");

      const ratio = calculateTalkTimeRatio(participantSegments, allSegments);
      expect(ratio).toBe(60); // 6000/10000 * 100
    });

    it("returns 0 talk time ratio for empty segments", () => {
      expect(calculateTalkTimeRatio([], [])).toBe(0);
    });

    it("calculates question score with logarithmic scaling", () => {
      const noQuestions: TranscriptSegment[] = [
        { id: "1", sessionId, speakerId: "a", startTime: 0, endTime: 1000, text: "Statement." },
      ];
      const withQuestions: TranscriptSegment[] = [
        { id: "1", sessionId, speakerId: "a", startTime: 0, endTime: 1000, text: "Question?" },
        { id: "2", sessionId, speakerId: "a", startTime: 1000, endTime: 2000, text: "Another question?" },
      ];

      expect(calculateQuestionScore(noQuestions)).toBe(0);
      const score = calculateQuestionScore(withQuestions);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("calculates response score correctly", () => {
      const segments: TranscriptSegment[] = [
        { id: "1", sessionId, speakerId: "b", startTime: 0, endTime: 1000, text: "Hello" },
        { id: "2", sessionId, speakerId: "a", startTime: 1000, endTime: 2000, text: "Hi" },
        { id: "3", sessionId, speakerId: "b", startTime: 2000, endTime: 3000, text: "How are you?" },
        { id: "4", sessionId, speakerId: "a", startTime: 3000, endTime: 4000, text: "Good" },
      ];

      const score = calculateResponseScore("a", segments);
      // speaker-a responds after speaker-b 2 out of 2 opportunities = 100
      expect(score).toBe(100);
    });

    it("returns 0 response score with fewer than 2 segments", () => {
      const segments: TranscriptSegment[] = [
        { id: "1", sessionId, speakerId: "a", startTime: 0, endTime: 1000, text: "Solo" },
      ];
      expect(calculateResponseScore("a", segments)).toBe(0);
    });

    it("calculates sentiment score from text content", () => {
      const positiveSegments: TranscriptSegment[] = [
        { id: "1", sessionId, speakerId: "a", startTime: 0, endTime: 1000, text: "This is great and excellent work!" },
      ];
      const negativeSegments: TranscriptSegment[] = [
        { id: "1", sessionId, speakerId: "a", startTime: 0, endTime: 1000, text: "This is terrible and wrong." },
      ];
      const neutralSegments: TranscriptSegment[] = [
        { id: "1", sessionId, speakerId: "a", startTime: 0, endTime: 1000, text: "The meeting starts now." },
      ];

      const positive = calculateSentimentScore(positiveSegments);
      const negative = calculateSentimentScore(negativeSegments);
      const neutral = calculateSentimentScore(neutralSegments);

      expect(positive).toBeGreaterThan(50);
      expect(negative).toBeLessThan(50);
      expect(neutral).toBe(50);
    });

    it("returns neutral sentiment for empty segments", () => {
      expect(calculateSentimentScore([])).toBe(50);
    });

    it("calculates final score with default weights", () => {
      const components = {
        talkTimeRatio: 80,
        questionCount: 60,
        responseRate: 70,
        sentimentScore: 90,
      };

      const score = calculateFinalScore(components);
      // 80*0.3 + 60*0.25 + 70*0.25 + 90*0.2 = 24 + 15 + 17.5 + 18 = 74.5
      expect(score).toBe(74.5);
    });

    it("calculates final score with custom weights", () => {
      const components = {
        talkTimeRatio: 100,
        questionCount: 0,
        responseRate: 0,
        sentimentScore: 0,
      };

      const score = calculateFinalScore(components, {
        talkTimeRatio: 1,
        questionCount: 0,
        responseRate: 0,
        sentimentScore: 0,
      });
      expect(score).toBe(100);
    });

    it("clamps final score to 0-100 range", () => {
      const high = calculateFinalScore(
        { talkTimeRatio: 100, questionCount: 100, responseRate: 100, sentimentScore: 100 }
      );
      expect(high).toBeLessThanOrEqual(100);

      const low = calculateFinalScore(
        { talkTimeRatio: 0, questionCount: 0, responseRate: 0, sentimentScore: 0 }
      );
      expect(low).toBeGreaterThanOrEqual(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // calculateEngagementScore
  // ═══════════════════════════════════════════════════════════════════
  describe("calculateEngagementScore", () => {
    it("produces a complete score object", () => {
      const sessionId = "score-session";
      const allSegments = createTranscriptSegments(sessionId, 6, ["a", "b"]);
      const input: EngagementCalculationInput = {
        participantId: "a",
        segments: allSegments.filter((s) => s.speakerId === "a"),
        totalSegments: allSegments,
      };

      const result = calculateEngagementScore(input);

      expect(result.sessionId).toBe(sessionId);
      expect(result.participantId).toBe("a");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(typeof result.talkTimeRatio).toBe("number");
      expect(typeof result.questionCount).toBe("number");
      expect(typeof result.responseRate).toBe("number");
      expect(typeof result.sentimentScore).toBe("number");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // handleMeetingEnd integration with engagement scoring
  // ═══════════════════════════════════════════════════════════════════
  describe("handleMeetingEnd with engagement scoring", () => {
    it("triggers engagement scoring when meeting ends with engagementScoringEnabled", async () => {
      const sessionId = "meeting-end-engagement";
      const segments = createTranscriptSegments(sessionId, 6, ["speaker-1", "speaker-2"]);
      const logger = createLogger();
      const saveScore = createMockSaveEngagementScore();

      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: false,
        engagementScoringEnabled: true,
        getTranscriptSegments: createMockGetTranscriptSegments(segments),
        saveEngagementScore: saveScore,
        logger,
      };

      await handleMeetingEnd({ sessionId, endTime: Date.now() }, config);

      // Engagement scoring should have completed
      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scoring completed successfully",
        expect.objectContaining({
          sessionId,
          participantsScored: 2,
        })
      );
      expect(saveScore).toHaveBeenCalledTimes(2);
    });

    it("skips engagement scoring when disabled", async () => {
      const sessionId = "skip-engagement";
      const logger = createLogger();

      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: false,
        engagementScoringEnabled: false,
        getTranscriptSegments: createMockGetTranscriptSegments([]),
        logger,
      };

      await handleMeetingEnd({ sessionId, endTime: Date.now() }, config);

      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scoring disabled, skipping calculation",
        { sessionId }
      );
    });

    it("does not block meeting end when engagement scoring fails", async () => {
      const sessionId = "fail-engagement";
      const logger = createLogger();

      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: false,
        engagementScoringEnabled: true,
        getTranscriptSegments: vi.fn().mockRejectedValue(new Error("DB connection lost")),
        logger,
      };

      // Should not throw
      await expect(
        handleMeetingEnd({ sessionId, endTime: Date.now() }, config)
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        "Engagement scoring failed",
        expect.objectContaining({
          sessionId,
          error: "DB connection lost",
        })
      );
    });

    it("runs both speaker analytics and engagement scoring together", async () => {
      const sessionId = "both-analytics";
      const segments = createTranscriptSegments(sessionId, 6, ["s1", "s2"]);
      const logger = createLogger();
      const saveScore = createMockSaveEngagementScore();

      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: true,
        engagementScoringEnabled: true,
        getTranscriptSegments: createMockGetTranscriptSegments(segments),
        saveEngagementScore: saveScore,
        logger,
      };

      await handleMeetingEnd({ sessionId, endTime: Date.now() }, config);

      // Both should complete
      expect(logger.info).toHaveBeenCalledWith(
        "Speaker analytics calculated and persisted successfully",
        expect.objectContaining({ sessionId })
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scoring completed successfully",
        expect.objectContaining({ sessionId })
      );
    });

    it("engagement scoring failure does not prevent speaker analytics", async () => {
      const sessionId = "analytics-survives";
      const segments = createTranscriptSegments(sessionId, 3, ["s1"]);
      const logger = createLogger();

      // First call (analytics) succeeds, second call (engagement) fails
      const getSegments = vi.fn()
        .mockResolvedValueOnce(segments)
        .mockRejectedValueOnce(new Error("Engagement DB error"));

      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: true,
        engagementScoringEnabled: true,
        getTranscriptSegments: getSegments,
        logger,
      };

      await expect(
        handleMeetingEnd({ sessionId, endTime: Date.now() }, config)
      ).resolves.toBeUndefined();

      // Analytics should have succeeded
      expect(logger.info).toHaveBeenCalledWith(
        "Speaker analytics calculated and persisted successfully",
        expect.objectContaining({ sessionId })
      );
      // Engagement should have failed gracefully
      expect(logger.error).toHaveBeenCalledWith(
        "Engagement scoring failed",
        expect.objectContaining({ sessionId })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Edge cases and data consistency
  // ═══════════════════════════════════════════════════════════════════
  describe("edge cases", () => {
    it("handles session with single participant", async () => {
      const sessionId = "solo-session";
      const segments = createTranscriptSegments(sessionId, 3, ["solo"]);
      const getSegments = createMockGetTranscriptSegments(segments);
      const saveScore = createMockSaveEngagementScore();
      const logger = createLogger();

      const result = await processEngagementScoring(sessionId, getSegments, {
        saveEngagementScore: saveScore,
        logger,
      });

      expect(result.scores).toHaveLength(1);
      expect(result.scores[0]!.participantId).toBe("solo");
      expect(result.scores[0]!.talkTimeRatio).toBe(100);
    });

    it("produces consistent scores across multiple invocations", async () => {
      const sessionId = "consistent-session";
      const segments = createTranscriptSegments(sessionId, 6, ["a", "b"]);

      const result1 = await processEngagementScoring(
        sessionId,
        createMockGetTranscriptSegments(segments),
        { logger: createLogger() }
      );
      const result2 = await processEngagementScoring(
        sessionId,
        createMockGetTranscriptSegments(segments),
        { logger: createLogger() }
      );

      expect(result1.scores.map((s) => s.score)).toEqual(
        result2.scores.map((s) => s.score)
      );
    });

    it("all scores are within 0-100 bounds for diverse inputs", async () => {
      const sessionId = "bounds-session";
      const segments: TranscriptSegment[] = [
        { id: "1", sessionId, speakerId: "a", startTime: 0, endTime: 100000, text: "????? lots of questions?" },
        { id: "2", sessionId, speakerId: "b", startTime: 100000, endTime: 100001, text: "." },
      ];

      const result = await processEngagementScoring(
        sessionId,
        createMockGetTranscriptSegments(segments),
        { logger: createLogger() }
      );

      for (const score of result.scores) {
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
        expect(score.talkTimeRatio).toBeGreaterThanOrEqual(0);
        expect(score.talkTimeRatio).toBeLessThanOrEqual(100);
        expect(score.questionCount).toBeGreaterThanOrEqual(0);
        expect(score.questionCount).toBeLessThanOrEqual(100);
        expect(score.responseRate).toBeGreaterThanOrEqual(0);
        expect(score.responseRate).toBeLessThanOrEqual(100);
        expect(score.sentimentScore).toBeGreaterThanOrEqual(0);
        expect(score.sentimentScore).toBeLessThanOrEqual(100);
      }
    });
  });
});
