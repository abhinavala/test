import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma";
import {
  createEngagementScore,
  getEngagementScoresBySession,
  getEngagementScore,
  getEngagementScoreByParticipant,
  disconnect,
} from "../../models/participantEngagementScore";
import {
  EngagementScoreError,
  type EngagementMetrics,
  type EngagementCalculationInput,
} from "../../types/engagement";

import path from "path";

function resolveDatabaseUrl(): string {
  const raw = process.env.SQLITE_URL || "file:./prisma/dev.db";
  if (raw.startsWith("file:./") || raw.startsWith("file:../")) {
    const relativePath = raw.replace("file:", "");
    return "file:" + path.resolve(process.cwd(), relativePath);
  }
  return raw;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter }) as InstanceType<typeof PrismaClient>;

beforeEach(async () => {
  await prisma.participantEngagementScore.deleteMany();
});

afterAll(async () => {
  await prisma.participantEngagementScore.deleteMany();
  await prisma.$disconnect();
  await disconnect();
});

const sampleScoreData = {
  sessionId: "session-1",
  participantId: "participant-1",
  score: 0.85,
  talkTimeRatio: 0.35,
  questionCount: 5,
  responseRate: 0.9,
  sentimentScore: 0.72,
};

describe("participantEngagementScore", () => {
  describe("createEngagementScore", () => {
    it("successfully creates a new engagement score record with all required fields", async () => {
      const result = await createEngagementScore(sampleScoreData);

      expect(result.id).toBeDefined();
      expect(result.id).toEqual(expect.any(String));
      expect(result.sessionId).toBe("session-1");
      expect(result.participantId).toBe("participant-1");
      expect(result.score).toBe(0.85);
      expect(result.talkTimeRatio).toBe(0.35);
      expect(result.questionCount).toBe(5);
      expect(result.responseRate).toBe(0.9);
      expect(result.sentimentScore).toBe(0.72);
      expect(result.calculatedAt).toBeInstanceOf(Date);
    });

    it("throws error when creating duplicate score for same session and participant", async () => {
      await createEngagementScore(sampleScoreData);

      await expect(createEngagementScore(sampleScoreData)).rejects.toThrow();
    });

    it("allows scores for different participants in the same session", async () => {
      await createEngagementScore(sampleScoreData);

      const secondScore = await createEngagementScore({
        ...sampleScoreData,
        participantId: "participant-2",
        score: 0.65,
      });

      expect(secondScore.participantId).toBe("participant-2");
      expect(secondScore.score).toBe(0.65);
    });

    it("allows scores for the same participant in different sessions", async () => {
      await createEngagementScore(sampleScoreData);

      const secondScore = await createEngagementScore({
        ...sampleScoreData,
        sessionId: "session-2",
      });

      expect(secondScore.sessionId).toBe("session-2");
    });
  });

  describe("getEngagementScoresBySession", () => {
    it("returns empty array when no scores exist for sessionId", async () => {
      const result = await getEngagementScoresBySession("non-existent-session");

      expect(result).toEqual([]);
    });

    it("returns all scores for a session", async () => {
      await createEngagementScore(sampleScoreData);
      await createEngagementScore({
        ...sampleScoreData,
        participantId: "participant-2",
        score: 0.65,
      });

      const results = await getEngagementScoresBySession("session-1");

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.participantId).sort()).toEqual([
        "participant-1",
        "participant-2",
      ]);
    });

    it("does not return scores from other sessions", async () => {
      await createEngagementScore(sampleScoreData);
      await createEngagementScore({
        ...sampleScoreData,
        sessionId: "session-2",
        participantId: "participant-2",
      });

      const results = await getEngagementScoresBySession("session-1");

      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("session-1");
    });
  });

  describe("getEngagementScore", () => {
    it("returns null when no score exists for session and participant", async () => {
      const result = await getEngagementScore("no-session", "no-participant");
      expect(result).toBeNull();
    });

    it("returns the correct score for a specific participant", async () => {
      await createEngagementScore(sampleScoreData);

      const result = await getEngagementScore("session-1", "participant-1");

      expect(result).not.toBeNull();
      expect(result!.score).toBe(0.85);
      expect(result!.participantId).toBe("participant-1");
    });
  });

  describe("getEngagementScoreByParticipant", () => {
    it("returns empty array when no scores exist for participantId", async () => {
      const result = await getEngagementScoreByParticipant("non-existent");
      expect(result).toEqual([]);
    });

    it("returns all scores for a participant across sessions", async () => {
      await createEngagementScore(sampleScoreData);
      await createEngagementScore({
        ...sampleScoreData,
        sessionId: "session-2",
      });

      const results = await getEngagementScoreByParticipant("participant-1");

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.sessionId).sort()).toEqual([
        "session-1",
        "session-2",
      ]);
    });

    it("does not return scores from other participants", async () => {
      await createEngagementScore(sampleScoreData);
      await createEngagementScore({
        ...sampleScoreData,
        participantId: "participant-2",
        sessionId: "session-2",
      });

      const results = await getEngagementScoreByParticipant("participant-1");

      expect(results).toHaveLength(1);
      expect(results[0]!.participantId).toBe("participant-1");
    });
  });

  describe("EngagementMetrics and EngagementCalculationInput types", () => {
    it("EngagementMetrics can be constructed with correct shape", () => {
      const metrics: EngagementMetrics = {
        talkTimeRatio: 0.35,
        questionCount: 5,
        responseRate: 0.9,
        sentimentScore: 0.72,
      };

      expect(metrics.talkTimeRatio).toBe(0.35);
      expect(metrics.questionCount).toBe(5);
      expect(metrics.responseRate).toBe(0.9);
      expect(metrics.sentimentScore).toBe(0.72);
    });

    it("EngagementCalculationInput can be constructed with correct shape", () => {
      const input: EngagementCalculationInput = {
        sessionId: "session-1",
        participantId: "participant-1",
        metrics: {
          talkTimeRatio: 0.35,
          questionCount: 5,
          responseRate: 0.9,
          sentimentScore: 0.72,
        },
      };

      expect(input.sessionId).toBe("session-1");
      expect(input.participantId).toBe("participant-1");
      expect(input.metrics.talkTimeRatio).toBe(0.35);
    });
  });

  describe("EngagementScoreError", () => {
    it("preserves message, code, sessionId, and participantId", () => {
      const error = new EngagementScoreError(
        "Calculation failed",
        "CALCULATION_FAILED",
        "session-err",
        "participant-err"
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Calculation failed");
      expect(error.code).toBe("CALCULATION_FAILED");
      expect(error.sessionId).toBe("session-err");
      expect(error.participantId).toBe("participant-err");
      expect(error.name).toBe("EngagementScoreError");
    });

    it("works without optional sessionId and participantId", () => {
      const error = new EngagementScoreError(
        "Generic error",
        "INSUFFICIENT_DATA"
      );

      expect(error.message).toBe("Generic error");
      expect(error.code).toBe("INSUFFICIENT_DATA");
      expect(error.sessionId).toBeUndefined();
      expect(error.participantId).toBeUndefined();
    });
  });
});
