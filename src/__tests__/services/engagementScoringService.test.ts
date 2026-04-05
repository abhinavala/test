import { describe, it, expect } from "vitest";
import {
  calculateEngagementScore,
  calculateSessionEngagement,
  EngagementCalculationError,
} from "../../services/engagementScoringService.js";
import type {
  EngagementCalculationInput,
  SessionEngagementInput,
} from "../../services/engagementScoringService.js";
import type { TranscriptSegment } from "../../types/transcript.js";

function makeSegment(
  overrides: Partial<TranscriptSegment> & { speakerId: string }
): TranscriptSegment {
  return {
    id: `seg-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "session-1",
    startTime: 0,
    endTime: 1000,
    text: "Hello world.",
    ...overrides,
  };
}

describe("engagementScoringService", () => {
  describe("calculateEngagementScore", () => {
    it("returns score between 80-90 for highly engaged participant with balanced metrics", async () => {
      // Create a session with 3 participants where participant-1 is highly engaged:
      // - Balanced talk time (~1/3 of session)
      // - Asks multiple questions
      // - Responds after every other speaker turn
      // - Strong positive sentiment
      // participant-1 responds after every other speaker (high response rate),
      // asks many questions, has balanced talk time, and very positive sentiment
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "participant-2", startTime: 0, endTime: 2000, text: "Let's begin." }),
        makeSegment({ speakerId: "participant-1", startTime: 2000, endTime: 5000, text: "Sure! What should we cover first? Any priorities?" }),
        makeSegment({ speakerId: "participant-3", startTime: 5000, endTime: 7000, text: "I think the roadmap." }),
        makeSegment({ speakerId: "participant-1", startTime: 7000, endTime: 10000, text: "Great idea. Should we start with Q3? What about deadlines?" }),
        makeSegment({ speakerId: "participant-2", startTime: 10000, endTime: 12000, text: "Deadlines are tight." }),
        makeSegment({ speakerId: "participant-1", startTime: 12000, endTime: 15000, text: "Understood. Can we reprioritize? How about cutting scope?" }),
        makeSegment({ speakerId: "participant-3", startTime: 15000, endTime: 17000, text: "That could work." }),
        makeSegment({ speakerId: "participant-1", startTime: 17000, endTime: 20000, text: "Perfect. Any objections? Should we finalize now?" }),
      ];

      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        participantId: "participant-1",
        segments,
        sessionDuration: 20000,
        sentimentScore: 0.9, // very positive sentiment
      };

      const result = await calculateEngagementScore(input);

      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.score).toBeLessThanOrEqual(90);
      expect(result.sessionId).toBe("session-1");
      expect(result.participantId).toBe("participant-1");
      expect(result.talkTimeRatio).toBeGreaterThan(0);
      expect(result.questionCount).toBeGreaterThanOrEqual(2);
      expect(result.responseRate).toBeGreaterThan(0);
      expect(result.sentimentScore).toBe(0.9);
      expect(result.calculatedAt).toBeInstanceOf(Date);
    });

    it("throws EngagementCalculationError when sessionDuration is zero", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "participant-1", text: "Hello?" }),
      ];

      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        participantId: "participant-1",
        segments,
        sessionDuration: 0,
      };

      await expect(calculateEngagementScore(input)).rejects.toThrow(
        EngagementCalculationError
      );

      try {
        await calculateEngagementScore(input);
      } catch (error) {
        expect(error).toBeInstanceOf(EngagementCalculationError);
        const calcError = error as EngagementCalculationError;
        expect(calcError.code).toBe("INVALID_SESSION_DURATION");
        expect(calcError.sessionId).toBe("session-1");
      }
    });

    it("throws EngagementCalculationError when sessionDuration is negative", async () => {
      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        participantId: "participant-1",
        segments: [],
        sessionDuration: -1000,
      };

      await expect(calculateEngagementScore(input)).rejects.toThrow(
        EngagementCalculationError
      );
    });

    it("returns score of 0 for talk time when participant does not speak", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "participant-2", startTime: 0, endTime: 5000, text: "I did all the talking." }),
      ];

      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        participantId: "participant-1",
        segments,
        sessionDuration: 5000,
      };

      const result = await calculateEngagementScore(input);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.talkTimeRatio).toBe(0);
      expect(result.questionCount).toBe(0);
    });

    it("handles sessions with no questions gracefully", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "participant-1", startTime: 0, endTime: 3000, text: "I have a statement." }),
        makeSegment({ speakerId: "participant-2", startTime: 3000, endTime: 6000, text: "Me too, no questions here." }),
      ];

      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        participantId: "participant-1",
        segments,
        sessionDuration: 6000,
      };

      const result = await calculateEngagementScore(input);

      expect(result.questionCount).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("uses default neutral sentiment when sentimentScore is not provided", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "participant-1", startTime: 0, endTime: 5000, text: "Hello." }),
      ];

      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        participantId: "participant-1",
        segments,
        sessionDuration: 5000,
      };

      const result = await calculateEngagementScore(input);

      expect(result.sentimentScore).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("always returns scores between 0 and 100 inclusive", async () => {
      // Test with extreme positive sentiment
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "p1", startTime: 0, endTime: 5000, text: "What? Why? How? Really? Sure?" }),
      ];

      const result = await calculateEngagementScore({
        sessionId: "s1",
        participantId: "p1",
        segments,
        sessionDuration: 5000,
        sentimentScore: 1.0,
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("throws when sessionId is empty", async () => {
      await expect(
        calculateEngagementScore({
          sessionId: "",
          participantId: "p1",
          segments: [],
          sessionDuration: 1000,
        })
      ).rejects.toThrow(EngagementCalculationError);
    });

    it("throws when participantId is empty", async () => {
      await expect(
        calculateEngagementScore({
          sessionId: "s1",
          participantId: "",
          segments: [],
          sessionDuration: 1000,
        })
      ).rejects.toThrow(EngagementCalculationError);
    });

    it("accepts custom weights", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "p1", startTime: 0, endTime: 5000, text: "Statement only." }),
      ];

      const result = await calculateEngagementScore({
        sessionId: "s1",
        participantId: "p1",
        segments,
        sessionDuration: 5000,
        weights: {
          talkTimeRatio: 1.0,
          questionCount: 0,
          responseRate: 0,
          sentimentScore: 0,
        },
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("throws when custom weights do not sum to 1", async () => {
      await expect(
        calculateEngagementScore({
          sessionId: "s1",
          participantId: "p1",
          segments: [],
          sessionDuration: 1000,
          weights: {
            talkTimeRatio: 0.5,
            questionCount: 0.5,
            responseRate: 0.5,
            sentimentScore: 0.5,
          },
        })
      ).rejects.toThrow(EngagementCalculationError);
    });

    it("produces deterministic results for same inputs", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ id: "s1", speakerId: "p1", startTime: 0, endTime: 3000, text: "Any questions?" }),
        makeSegment({ id: "s2", speakerId: "p2", startTime: 3000, endTime: 5000, text: "Yes, what time?" }),
        makeSegment({ id: "s3", speakerId: "p1", startTime: 5000, endTime: 7000, text: "Three o'clock." }),
      ];

      const input: EngagementCalculationInput = {
        sessionId: "session-det",
        participantId: "p1",
        segments,
        sessionDuration: 7000,
        sentimentScore: 0.5,
      };

      const result1 = await calculateEngagementScore(input);
      const result2 = await calculateEngagementScore(input);

      expect(result1.score).toBe(result2.score);
      expect(result1.talkTimeRatio).toBe(result2.talkTimeRatio);
      expect(result1.questionCount).toBe(result2.questionCount);
      expect(result1.responseRate).toBe(result2.responseRate);
    });
  });

  describe("calculateSessionEngagement", () => {
    it("processes multiple participants and returns correct average score", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "p1", startTime: 0, endTime: 3000, text: "What do you think?" }),
        makeSegment({ speakerId: "p2", startTime: 3000, endTime: 6000, text: "I think it's great." }),
        makeSegment({ speakerId: "p1", startTime: 6000, endTime: 9000, text: "Should we continue?" }),
        makeSegment({ speakerId: "p3", startTime: 9000, endTime: 12000, text: "Let's do it." }),
        makeSegment({ speakerId: "p2", startTime: 12000, endTime: 15000, text: "Agreed, any blockers?" }),
      ];

      const sentimentScores = new Map<string, number>([
        ["p1", 0.5],
        ["p2", 0.3],
        ["p3", 0.1],
      ]);

      const input: SessionEngagementInput = {
        sessionId: "session-multi",
        segments,
        sessionDuration: 15000,
        sentimentScores,
      };

      const result = await calculateSessionEngagement(input);

      expect(result.sessionId).toBe("session-multi");
      expect(result.participantScores).toHaveLength(3);
      expect(result.calculatedAt).toBeInstanceOf(Date);

      // Verify average matches manual calculation
      const manualAverage =
        result.participantScores.reduce((sum, s) => sum + s.score, 0) /
        result.participantScores.length;
      expect(result.averageScore).toBeCloseTo(manualAverage, 1);

      // All scores should be 0-100
      for (const score of result.participantScores) {
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
      }

      // Each participant should be represented
      const participantIds = result.participantScores.map((s) => s.participantId);
      expect(participantIds).toContain("p1");
      expect(participantIds).toContain("p2");
      expect(participantIds).toContain("p3");
    });

    it("returns empty summary for session with no segments", async () => {
      const result = await calculateSessionEngagement({
        sessionId: "session-empty",
        segments: [],
        sessionDuration: 5000,
      });

      expect(result.sessionId).toBe("session-empty");
      expect(result.averageScore).toBe(0);
      expect(result.participantScores).toHaveLength(0);
    });

    it("throws EngagementCalculationError when sessionDuration is zero", async () => {
      await expect(
        calculateSessionEngagement({
          sessionId: "session-1",
          segments: [makeSegment({ speakerId: "p1" })],
          sessionDuration: 0,
        })
      ).rejects.toThrow(EngagementCalculationError);
    });

    it("throws EngagementCalculationError when sessionId is invalid", async () => {
      await expect(
        calculateSessionEngagement({
          sessionId: "",
          segments: [],
          sessionDuration: 5000,
        })
      ).rejects.toThrow(EngagementCalculationError);
    });

    it("uses default sentiment of 0 when sentimentScores map is not provided", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "p1", startTime: 0, endTime: 5000, text: "Hello." }),
      ];

      const result = await calculateSessionEngagement({
        sessionId: "session-no-sentiment",
        segments,
        sessionDuration: 5000,
      });

      expect(result.participantScores).toHaveLength(1);
      expect(result.participantScores[0].sentimentScore).toBe(0);
    });
  });
});
