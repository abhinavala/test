import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma";

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
});

describe("engagementScoreSchema", () => {
  describe("table creation and schema fields", () => {
    it("creates a participant engagement score with all required fields", async () => {
      const record = await prisma.participantEngagementScore.create({
        data: {
          sessionId: "session-1",
          participantId: "participant-1",
          score: 85.5,
          talkTimeRatio: 0.35,
          questionCount: 5,
          responseRate: 0.92,
          sentimentScore: 0.78,
        },
      });

      expect(record.id).toBeDefined();
      expect(record.sessionId).toBe("session-1");
      expect(record.participantId).toBe("participant-1");
      expect(record.score).toBe(85.5);
      expect(record.talkTimeRatio).toBe(0.35);
      expect(record.questionCount).toBe(5);
      expect(record.responseRate).toBe(0.92);
      expect(record.sentimentScore).toBe(0.78);
      expect(record.calculatedAt).toBeInstanceOf(Date);
    });

    it("stores all component metrics with correct types", async () => {
      const record = await prisma.participantEngagementScore.create({
        data: {
          sessionId: "session-types",
          participantId: "participant-types",
          score: 0,
          talkTimeRatio: 0.0,
          questionCount: 0,
          responseRate: 0.0,
          sentimentScore: -1.0,
        },
      });

      expect(typeof record.score).toBe("number");
      expect(typeof record.talkTimeRatio).toBe("number");
      expect(typeof record.questionCount).toBe("number");
      expect(typeof record.responseRate).toBe("number");
      expect(typeof record.sentimentScore).toBe("number");
    });

    it("stores score boundary values (0 and 100)", async () => {
      const minScore = await prisma.participantEngagementScore.create({
        data: {
          sessionId: "session-min",
          participantId: "participant-min",
          score: 0,
          talkTimeRatio: 0,
          questionCount: 0,
          responseRate: 0,
          sentimentScore: 0,
        },
      });

      const maxScore = await prisma.participantEngagementScore.create({
        data: {
          sessionId: "session-max",
          participantId: "participant-max",
          score: 100,
          talkTimeRatio: 1.0,
          questionCount: 50,
          responseRate: 1.0,
          sentimentScore: 1.0,
        },
      });

      expect(minScore.score).toBe(0);
      expect(maxScore.score).toBe(100);
    });
  });

  describe("foreign key and required field constraints", () => {
    it("requires sessionId to be provided", async () => {
      await expect(
        prisma.participantEngagementScore.create({
          data: {
            sessionId: undefined as unknown as string,
            participantId: "participant-1",
            score: 50,
            talkTimeRatio: 0.5,
            questionCount: 3,
            responseRate: 0.8,
            sentimentScore: 0.5,
          },
        })
      ).rejects.toThrow();
    });

    it("requires participantId to be provided", async () => {
      await expect(
        prisma.participantEngagementScore.create({
          data: {
            sessionId: "session-1",
            participantId: undefined as unknown as string,
            score: 50,
            talkTimeRatio: 0.5,
            questionCount: 3,
            responseRate: 0.8,
            sentimentScore: 0.5,
          },
        })
      ).rejects.toThrow();
    });

    it("supports querying by sessionId", async () => {
      await prisma.participantEngagementScore.createMany({
        data: [
          {
            sessionId: "session-fk",
            participantId: "participant-1",
            score: 80,
            talkTimeRatio: 0.4,
            questionCount: 3,
            responseRate: 0.9,
            sentimentScore: 0.7,
          },
          {
            sessionId: "session-fk",
            participantId: "participant-2",
            score: 60,
            talkTimeRatio: 0.2,
            questionCount: 1,
            responseRate: 0.6,
            sentimentScore: 0.5,
          },
          {
            sessionId: "session-other",
            participantId: "participant-3",
            score: 70,
            talkTimeRatio: 0.3,
            questionCount: 2,
            responseRate: 0.7,
            sentimentScore: 0.6,
          },
        ],
      });

      const sessionScores = await prisma.participantEngagementScore.findMany({
        where: { sessionId: "session-fk" },
      });

      expect(sessionScores).toHaveLength(2);
      expect(sessionScores.every((s) => s.sessionId === "session-fk")).toBe(true);
    });
  });

  describe("unique constraint on sessionId-participantId", () => {
    it("prevents duplicate session-participant combinations", async () => {
      await prisma.participantEngagementScore.create({
        data: {
          sessionId: "session-dup",
          participantId: "participant-dup",
          score: 80,
          talkTimeRatio: 0.4,
          questionCount: 3,
          responseRate: 0.9,
          sentimentScore: 0.7,
        },
      });

      await expect(
        prisma.participantEngagementScore.create({
          data: {
            sessionId: "session-dup",
            participantId: "participant-dup",
            score: 90,
            talkTimeRatio: 0.5,
            questionCount: 5,
            responseRate: 0.95,
            sentimentScore: 0.8,
          },
        })
      ).rejects.toThrow();
    });

    it("allows same participant in different sessions", async () => {
      await prisma.participantEngagementScore.create({
        data: {
          sessionId: "session-a",
          participantId: "participant-shared",
          score: 80,
          talkTimeRatio: 0.4,
          questionCount: 3,
          responseRate: 0.9,
          sentimentScore: 0.7,
        },
      });

      const second = await prisma.participantEngagementScore.create({
        data: {
          sessionId: "session-b",
          participantId: "participant-shared",
          score: 70,
          talkTimeRatio: 0.3,
          questionCount: 2,
          responseRate: 0.8,
          sentimentScore: 0.6,
        },
      });

      expect(second.id).toBeDefined();
    });

    it("allows different participants in the same session", async () => {
      await prisma.participantEngagementScore.create({
        data: {
          sessionId: "session-same",
          participantId: "participant-x",
          score: 80,
          talkTimeRatio: 0.4,
          questionCount: 3,
          responseRate: 0.9,
          sentimentScore: 0.7,
        },
      });

      const second = await prisma.participantEngagementScore.create({
        data: {
          sessionId: "session-same",
          participantId: "participant-y",
          score: 70,
          talkTimeRatio: 0.3,
          questionCount: 2,
          responseRate: 0.8,
          sentimentScore: 0.6,
        },
      });

      expect(second.id).toBeDefined();
    });
  });
});
