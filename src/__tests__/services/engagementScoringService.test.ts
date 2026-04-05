import { describe, it, expect } from "vitest";
import {
  calculateEngagementScore,
  calculateParticipantMetrics,
  calculateSessionEngagement,
  EngagementScoringError,
} from "../../services/engagementScoringService.js";
import type {
  ParticipantInput,
  EngagementCalculationInput,
} from "../../services/engagementScoringService.js";

function makeParticipant(
  overrides: Partial<ParticipantInput> & { participantId: string }
): ParticipantInput {
  return {
    talkTimeMs: overrides.talkTimeMs ?? 30000,
    questionCount: overrides.questionCount ?? 3,
    questionsReceived: overrides.questionsReceived ?? 4,
    questionsAnswered: overrides.questionsAnswered ?? 3,
    sentimentScore: overrides.sentimentScore ?? 0.5,
    ...overrides,
  };
}

describe("engagementScoringService", () => {
  describe("calculateEngagementScore", () => {
    it("returns correct score for balanced participant metrics", () => {
      // A participant with moderate talk time (equal share among 3),
      // a few questions, good response rate, positive sentiment
      const participant = makeParticipant({
        participantId: "p1",
        talkTimeMs: 20000, // 1/3 of 60s session
        questionCount: 4,
        questionsReceived: 5,
        questionsAnswered: 4,
        sentimentScore: 0.4,
      });

      const score = calculateEngagementScore(participant, 60000, 3);

      // Score should be in the 60-85 range for balanced metrics
      expect(score).toBeGreaterThanOrEqual(60);
      expect(score).toBeLessThanOrEqual(85);
    });

    it("handles zero talk time without errors", () => {
      const participant = makeParticipant({
        participantId: "p1",
        talkTimeMs: 0,
        questionCount: 0,
        questionsReceived: 0,
        questionsAnswered: 0,
        sentimentScore: 0,
      });

      const score = calculateEngagementScore(participant, 60000, 3);

      // Should not throw and should return a low but valid score
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("returns higher score for highly engaged participant", () => {
      const engaged = makeParticipant({
        participantId: "p1",
        talkTimeMs: 30000, // equal share in 2-person meeting
        questionCount: 8,
        questionsReceived: 5,
        questionsAnswered: 5,
        sentimentScore: 0.8,
      });

      const passive = makeParticipant({
        participantId: "p2",
        talkTimeMs: 5000, // very little talk in 2-person meeting
        questionCount: 0,
        questionsReceived: 3,
        questionsAnswered: 0,
        sentimentScore: -0.2,
      });

      const engagedScore = calculateEngagementScore(engaged, 60000, 2);
      const passiveScore = calculateEngagementScore(passive, 60000, 2);

      expect(engagedScore).toBeGreaterThan(passiveScore);
    });

    it("is deterministic for the same input", () => {
      const participant = makeParticipant({
        participantId: "p1",
        talkTimeMs: 25000,
        questionCount: 5,
        questionsReceived: 3,
        questionsAnswered: 2,
        sentimentScore: 0.3,
      });

      const score1 = calculateEngagementScore(participant, 60000, 4);
      const score2 = calculateEngagementScore(participant, 60000, 4);

      expect(score1).toBe(score2);
    });

    it("handles zero total duration", () => {
      const participant = makeParticipant({
        participantId: "p1",
        talkTimeMs: 0,
      });

      const score = calculateEngagementScore(participant, 0, 2);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("handles NaN sentiment score gracefully", () => {
      const participant = makeParticipant({
        participantId: "p1",
        sentimentScore: NaN,
      });

      const score = calculateEngagementScore(participant, 60000, 3);

      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("clamps score between 0 and 100", () => {
      // Maximally engaged participant
      const maxParticipant = makeParticipant({
        participantId: "p1",
        talkTimeMs: 30000,
        questionCount: 20,
        questionsReceived: 10,
        questionsAnswered: 10,
        sentimentScore: 1.0,
      });

      const score = calculateEngagementScore(maxParticipant, 60000, 2);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("calculateParticipantMetrics", () => {
    it("calculates correct talk time ratio", () => {
      const participant = makeParticipant({
        participantId: "p1",
        talkTimeMs: 15000,
      });

      const metrics = calculateParticipantMetrics(participant, 60000, 4);

      expect(metrics.talkTimeRatio).toBe(0.25);
    });

    it("calculates correct response rate", () => {
      const participant = makeParticipant({
        participantId: "p1",
        questionsReceived: 8,
        questionsAnswered: 6,
      });

      const metrics = calculateParticipantMetrics(participant, 60000, 3);

      expect(metrics.responseRate).toBe(0.75);
    });

    it("returns zero response rate when no questions received", () => {
      const participant = makeParticipant({
        participantId: "p1",
        questionsReceived: 0,
        questionsAnswered: 0,
      });

      const metrics = calculateParticipantMetrics(participant, 60000, 3);

      expect(metrics.responseRate).toBe(0);
    });

    it("returns zero talk time ratio when total duration is zero", () => {
      const participant = makeParticipant({
        participantId: "p1",
        talkTimeMs: 0,
      });

      const metrics = calculateParticipantMetrics(participant, 0, 3);

      expect(metrics.talkTimeRatio).toBe(0);
    });

    it("clamps sentiment score to [-1, 1]", () => {
      const participant = makeParticipant({
        participantId: "p1",
        sentimentScore: 1.5,
      });

      const metrics = calculateParticipantMetrics(participant, 60000, 3);

      expect(metrics.sentimentScore).toBeLessThanOrEqual(1);
    });

    it("preserves question count as-is", () => {
      const participant = makeParticipant({
        participantId: "p1",
        questionCount: 7,
      });

      const metrics = calculateParticipantMetrics(participant, 60000, 2);

      expect(metrics.questionCount).toBe(7);
    });
  });

  describe("calculateSessionEngagement", () => {
    it("processes multiple participants correctly", () => {
      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        totalDurationMs: 60000,
        participants: [
          makeParticipant({ participantId: "p1", talkTimeMs: 20000 }),
          makeParticipant({ participantId: "p2", talkTimeMs: 25000 }),
          makeParticipant({ participantId: "p3", talkTimeMs: 15000 }),
        ],
      };

      const results = calculateSessionEngagement(input);

      expect(results).toHaveLength(3);

      // Talk time ratios should sum to 1.0
      const ratioSum = results.reduce((sum, r) => sum + r.talkTimeRatio, 0);
      expect(ratioSum).toBeCloseTo(1.0, 4);

      // All results should have correct sessionId
      for (const result of results) {
        expect(result.sessionId).toBe("session-1");
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.calculatedAt).toBeInstanceOf(Date);
      }
    });

    it("returns empty array for no participants", () => {
      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        totalDurationMs: 60000,
        participants: [],
      };

      const results = calculateSessionEngagement(input);

      expect(results).toEqual([]);
    });

    it("throws EngagementScoringError for missing sessionId", () => {
      const input: EngagementCalculationInput = {
        sessionId: "",
        totalDurationMs: 60000,
        participants: [makeParticipant({ participantId: "p1" })],
      };

      expect(() => calculateSessionEngagement(input)).toThrow(
        EngagementScoringError
      );
    });

    it("returns ParticipantEngagementScore objects with all required fields", () => {
      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        totalDurationMs: 60000,
        participants: [
          makeParticipant({ participantId: "p1", talkTimeMs: 30000 }),
        ],
      };

      const results = calculateSessionEngagement(input);

      expect(results).toHaveLength(1);
      const result = results[0];

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("sessionId", "session-1");
      expect(result).toHaveProperty("participantId", "p1");
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("talkTimeRatio");
      expect(result).toHaveProperty("questionCount");
      expect(result).toHaveProperty("responseRate");
      expect(result).toHaveProperty("sentimentScore");
      expect(result).toHaveProperty("calculatedAt");
    });

    it("handles single participant session", () => {
      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        totalDurationMs: 60000,
        participants: [
          makeParticipant({
            participantId: "p1",
            talkTimeMs: 60000,
            questionCount: 0,
            questionsReceived: 0,
            questionsAnswered: 0,
            sentimentScore: 0.5,
          }),
        ],
      };

      const results = calculateSessionEngagement(input);

      expect(results).toHaveLength(1);
      expect(results[0].talkTimeRatio).toBe(1);
      expect(results[0].score).toBeGreaterThanOrEqual(0);
    });

    it("handles session with zero duration", () => {
      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        totalDurationMs: 0,
        participants: [
          makeParticipant({ participantId: "p1", talkTimeMs: 0 }),
          makeParticipant({ participantId: "p2", talkTimeMs: 0 }),
        ],
      };

      const results = calculateSessionEngagement(input);

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.talkTimeRatio).toBe(0);
        expect(Number.isFinite(result.score)).toBe(true);
      }
    });
  });
});
