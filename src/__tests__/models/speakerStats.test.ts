import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma";
import {
  saveSpeakerStats,
  getSpeakerStats,
  disconnect,
} from "../../models/speakerStats";
import type { SpeakerStats } from "../../types/speaker-stats";
import {
  SpeakerAnalyticsError,
  SessionNotFoundError,
} from "../../types/errors";

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
  await prisma.speakerStatsRecord.deleteMany();
});

afterAll(async () => {
  await prisma.speakerStatsRecord.deleteMany();
  await prisma.$disconnect();
  await disconnect();
});

const sampleStats: SpeakerStats[] = [
  {
    speakerId: "speaker-1",
    talkTime: 120000,
    percentageOfMeeting: 40,
    turnCount: 15,
    averageTurnDuration: 8000,
    interruptionCount: 3,
  },
  {
    speakerId: "speaker-2",
    talkTime: 90000,
    percentageOfMeeting: 30,
    turnCount: 12,
    averageTurnDuration: 7500,
    interruptionCount: 1,
  },
];

describe("speakerStats", () => {
  describe("saveSpeakerStats", () => {
    it("successfully stores stats for a valid sessionId", async () => {
      await saveSpeakerStats("session-1", sampleStats);

      const result = await getSpeakerStats("session-1");

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe("session-1");
      expect(result!.stats).toHaveLength(2);
      expect(result!.stats[0]).toEqual(sampleStats[0]);
      expect(result!.stats[1]).toEqual(sampleStats[1]);
    });

    it("updates stats when saving for an existing sessionId", async () => {
      await saveSpeakerStats("session-update", sampleStats);

      const updatedStats: SpeakerStats[] = [
        {
          speakerId: "speaker-1",
          talkTime: 200000,
          percentageOfMeeting: 60,
          turnCount: 20,
          averageTurnDuration: 10000,
          interruptionCount: 5,
        },
      ];

      await saveSpeakerStats("session-update", updatedStats);

      const result = await getSpeakerStats("session-update");
      expect(result).not.toBeNull();
      expect(result!.stats).toHaveLength(1);
      expect(result!.stats[0]!.talkTime).toBe(200000);
    });

    it("stores empty stats array", async () => {
      await saveSpeakerStats("session-empty", []);

      const result = await getSpeakerStats("session-empty");
      expect(result).not.toBeNull();
      expect(result!.stats).toEqual([]);
    });
  });

  describe("getSpeakerStats", () => {
    it("returns null when sessionId does not exist", async () => {
      const result = await getSpeakerStats("non-existent-session");
      expect(result).toBeNull();
    });

    it("returns correct SessionSpeakerStats structure", async () => {
      await saveSpeakerStats("session-structure", sampleStats);

      const result = await getSpeakerStats("session-structure");
      expect(result).toEqual({
        sessionId: "session-structure",
        stats: sampleStats,
      });
    });
  });

  describe("SpeakerAnalyticsError", () => {
    it("preserves message, code, and optional sessionId", () => {
      const error = new SpeakerAnalyticsError(
        "Calculation failed",
        "CALC_ERROR",
        "session-err"
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Calculation failed");
      expect(error.code).toBe("CALC_ERROR");
      expect(error.sessionId).toBe("session-err");
      expect(error.name).toBe("SpeakerAnalyticsError");
    });

    it("works without optional sessionId", () => {
      const error = new SpeakerAnalyticsError("Generic error", "GENERIC");

      expect(error.message).toBe("Generic error");
      expect(error.code).toBe("GENERIC");
      expect(error.sessionId).toBeUndefined();
    });
  });

  describe("SessionNotFoundError", () => {
    it("creates error with sessionId in message", () => {
      const error = new SessionNotFoundError("session-404");

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Session not found: session-404");
      expect(error.sessionId).toBe("session-404");
      expect(error.name).toBe("SessionNotFoundError");
    });
  });
});
