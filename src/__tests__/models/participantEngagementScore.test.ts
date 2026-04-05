import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma";
import {
  saveEngagementScore,
  bulkSaveEngagementScores,
  getEngagementScoresBySession,
  getEngagementScore,
  getEngagementScoreByParticipant,
  deleteEngagementScoresBySession,
  disconnect,
  EngagementCalculationError,
} from "../../models/participantEngagementScore";
import type { ParticipantEngagementScore } from "../../types/engagement";

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
const prisma = new PrismaClient({ adapter }) as InstanceType<
  typeof PrismaClient
>;

beforeEach(async () => {
  await prisma.participantEngagementScore.deleteMany();
});

afterAll(async () => {
  await prisma.participantEngagementScore.deleteMany();
  await prisma.$disconnect();
  await disconnect();
});

const sampleInput = {
  sessionId: "session-1",
  participantId: "participant-1",
  score: 75.5,
  talkTimeRatio: 0.35,
  questionCount: 5,
  responseRate: 0.8,
  sentimentScore: 0.6,
};

describe("participantEngagementScore", () => {
  describe("saveEngagementScore", () => {
    it("successfully persists valid engagement score data", async () => {
      const result = await saveEngagementScore(sampleInput);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe("string");
      expect(result.sessionId).toBe("session-1");
      expect(result.participantId).toBe("participant-1");
      expect(result.score).toBe(75.5);
      expect(result.talkTimeRatio).toBe(0.35);
      expect(result.questionCount).toBe(5);
      expect(result.responseRate).toBe(0.8);
      expect(result.sentimentScore).toBe(0.6);
      expect(result.calculatedAt).toBeInstanceOf(Date);
    });

    it("updates existing score for same session-participant pair", async () => {
      await saveEngagementScore(sampleInput);

      const updated = await saveEngagementScore({
        ...sampleInput,
        score: 90.0,
        questionCount: 10,
      });

      expect(updated.score).toBe(90.0);
      expect(updated.questionCount).toBe(10);

      const scores = await getEngagementScoresBySession("session-1");
      expect(scores).toHaveLength(1);
    });

    it("stores scores with boundary values", async () => {
      const result = await saveEngagementScore({
        sessionId: "session-boundary",
        participantId: "participant-boundary",
        score: 0,
        talkTimeRatio: 0,
        questionCount: 0,
        responseRate: 0,
        sentimentScore: 0,
      });

      expect(result.score).toBe(0);
      expect(result.talkTimeRatio).toBe(0);
      expect(result.questionCount).toBe(0);
    });
  });

  describe("getEngagementScoresBySession", () => {
    it("returns empty array for non-existent session", async () => {
      const result =
        await getEngagementScoresBySession("non-existent-session");

      expect(result).toEqual([]);
    });

    it("returns all scores for a session ordered by score descending", async () => {
      await saveEngagementScore({
        ...sampleInput,
        participantId: "p1",
        score: 50,
      });
      await saveEngagementScore({
        ...sampleInput,
        participantId: "p2",
        score: 80,
      });
      await saveEngagementScore({
        ...sampleInput,
        participantId: "p3",
        score: 65,
      });

      const results = await getEngagementScoresBySession("session-1");

      expect(results).toHaveLength(3);
      expect(results[0].score).toBe(80);
      expect(results[1].score).toBe(65);
      expect(results[2].score).toBe(50);
    });

    it("only returns scores for the specified session", async () => {
      await saveEngagementScore(sampleInput);
      await saveEngagementScore({
        ...sampleInput,
        sessionId: "session-2",
        participantId: "participant-2",
      });

      const results = await getEngagementScoresBySession("session-1");
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("session-1");
    });
  });

  describe("getEngagementScore", () => {
    it("returns score by ID", async () => {
      const saved = await saveEngagementScore(sampleInput);
      const result = await getEngagementScore(saved.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(saved.id);
      expect(result!.score).toBe(75.5);
    });

    it("returns null for non-existent ID", async () => {
      const result = await getEngagementScore("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("getEngagementScoreByParticipant", () => {
    it("returns score by session and participant", async () => {
      await saveEngagementScore(sampleInput);

      const result = await getEngagementScoreByParticipant(
        "session-1",
        "participant-1"
      );

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe("session-1");
      expect(result!.participantId).toBe("participant-1");
      expect(result!.score).toBe(75.5);
    });

    it("returns null for non-existent session-participant pair", async () => {
      const result = await getEngagementScoreByParticipant(
        "session-1",
        "non-existent"
      );
      expect(result).toBeNull();
    });
  });

  describe("bulkSaveEngagementScores", () => {
    it("saves multiple scores in a transaction", async () => {
      const inputs = [
        { ...sampleInput, participantId: "p1", score: 70 },
        { ...sampleInput, participantId: "p2", score: 85 },
        { ...sampleInput, participantId: "p3", score: 60 },
      ];

      const results = await bulkSaveEngagementScores(inputs);

      expect(results).toHaveLength(3);
      results.forEach((r) => {
        expect(r.id).toBeDefined();
        expect(r.calculatedAt).toBeInstanceOf(Date);
      });

      const sessionScores = await getEngagementScoresBySession("session-1");
      expect(sessionScores).toHaveLength(3);
    });

    it("handles database constraint violations for duplicate session-participant pairs", async () => {
      const inputs = [
        { ...sampleInput, participantId: "p1", score: 70 },
        { ...sampleInput, participantId: "p1", score: 85 },
      ];

      await expect(bulkSaveEngagementScores(inputs)).rejects.toThrow(
        EngagementCalculationError
      );

      try {
        await bulkSaveEngagementScores(inputs);
      } catch (error) {
        expect(error).toBeInstanceOf(EngagementCalculationError);
        expect((error as EngagementCalculationError).code).toBe(
          "CONSTRAINT_VIOLATION"
        );
      }
    });

    it("handles empty array", async () => {
      const results = await bulkSaveEngagementScores([]);
      expect(results).toEqual([]);
    });
  });

  describe("deleteEngagementScoresBySession", () => {
    it("deletes all scores for a session", async () => {
      await saveEngagementScore({
        ...sampleInput,
        participantId: "p1",
      });
      await saveEngagementScore({
        ...sampleInput,
        participantId: "p2",
      });

      const count = await deleteEngagementScoresBySession("session-1");
      expect(count).toBe(2);

      const remaining = await getEngagementScoresBySession("session-1");
      expect(remaining).toEqual([]);
    });

    it("returns 0 for non-existent session", async () => {
      const count =
        await deleteEngagementScoresBySession("non-existent-session");
      expect(count).toBe(0);
    });
  });

  describe("EngagementCalculationError", () => {
    it("preserves message, code, and optional sessionId", () => {
      const error = new EngagementCalculationError(
        "Constraint violated",
        "CONSTRAINT_VIOLATION",
        "session-err"
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Constraint violated");
      expect(error.code).toBe("CONSTRAINT_VIOLATION");
      expect(error.sessionId).toBe("session-err");
      expect(error.name).toBe("EngagementCalculationError");
    });

    it("works without optional sessionId", () => {
      const error = new EngagementCalculationError(
        "Database error",
        "DATABASE_ERROR"
      );

      expect(error.message).toBe("Database error");
      expect(error.code).toBe("DATABASE_ERROR");
      expect(error.sessionId).toBeUndefined();
    });
  });
});
