import { describe, it, expect, beforeEach, afterAll } from "vitest";
import path from "path";
import express from "express";
import request from "supertest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma";
import { calculateSpeakerStats } from "../../services/speakerAnalyticsService.js";
import { handleMeetingEnd, processSpeakerAnalytics } from "../../services/meetingEndHandler.js";
import { saveSpeakerStats, getSpeakerStats, disconnect } from "../../models/speakerStats.js";
import speakerAnalyticsRoutes from "../../api/routes/speakerAnalytics.js";
import type { TranscriptSegment } from "../../types/transcript.js";
import type { MeetingEndEvent } from "../../types/events.js";
import type { SpeakerStats } from "../../types/speaker-stats.js";
import {
  makeSegment,
  resetSegmentCounter,
  generateMultiSpeakerTranscript,
  generateTranscriptWithInterruptions,
  generateSingleSpeakerTranscript,
  generateLargeTranscript,
  assertValidSpeakerStats,
} from "../helpers/speakerAnalyticsTestHelpers.js";

// --- Database setup ---

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

async function setupTestDatabase(): Promise<void> {
  await prisma.speakerStatsRecord.deleteMany();
}

// --- Express app for HTTP testing ---

function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api", speakerAnalyticsRoutes);
  return app;
}

const app = createTestApp();

// --- Lifecycle ---

beforeEach(async () => {
  resetSegmentCounter();
  await setupTestDatabase();
});

afterAll(async () => {
  await prisma.speakerStatsRecord.deleteMany();
  await prisma.$disconnect();
  await disconnect();
});

// --- Silent logger for tests ---

const silentLogger = {
  info: (_msg: string, _meta?: Record<string, unknown>) => {},
  error: (_msg: string, _meta?: Record<string, unknown>) => {},
};

// =============================================================================
// Integration Tests
// =============================================================================

describe("speakerAnalytics.integration", () => {
  // ---------------------------------------------------------------------------
  // Complete workflow: meeting end event → analytics calculation → API response
  // ---------------------------------------------------------------------------
  describe("complete workflow from meeting end event to API response", () => {
    it("returns correct speaker stats for a multi-speaker meeting", async () => {
      const sessionId = "workflow-multi-speaker";
      const segments = generateMultiSpeakerTranscript({
        sessionId,
        speakerIds: ["alice", "bob", "carol"],
        turnsPerSpeaker: 3,
        turnDurationMs: 5000,
        gapMs: 200,
      });

      // Simulate meeting end event
      const getTranscriptSegments = async (_sid: string): Promise<TranscriptSegment[]> => segments;

      await handleMeetingEnd(
        { sessionId, endTime: Date.now() },
        {
          analyticsEnabled: true,
          getTranscriptSegments,
          logger: silentLogger,
        }
      );

      // Verify stats were persisted
      const dbResult = await getSpeakerStats(sessionId);
      expect(dbResult).not.toBeNull();
      expect(dbResult!.sessionId).toBe(sessionId);
      expect(dbResult!.stats).toHaveLength(3);

      // Verify stats match expected values
      const aliceStats = dbResult!.stats.find((s) => s.speakerId === "alice")!;
      const bobStats = dbResult!.stats.find((s) => s.speakerId === "bob")!;
      const carolStats = dbResult!.stats.find((s) => s.speakerId === "carol")!;

      expect(aliceStats.turnCount).toBe(3);
      expect(bobStats.turnCount).toBe(3);
      expect(carolStats.turnCount).toBe(3);

      // Each speaker has 3 turns * 5000ms = 15000ms talk time
      expect(aliceStats.talkTime).toBe(15000);
      expect(bobStats.talkTime).toBe(15000);
      expect(carolStats.talkTime).toBe(15000);

      expect(aliceStats.averageTurnDuration).toBe(5000);

      // No interruptions (there are gaps between segments)
      expect(aliceStats.interruptionCount).toBe(0);
      expect(bobStats.interruptionCount).toBe(0);
      expect(carolStats.interruptionCount).toBe(0);

      assertValidSpeakerStats(dbResult!.stats);

      // Verify API returns the same stats
      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.stats).toHaveLength(3);

      // API response should match database result
      expect(res.body).toEqual(dbResult);
    });

    it("handles single-speaker meeting correctly", async () => {
      const sessionId = "workflow-single-speaker";
      const segments = generateSingleSpeakerTranscript({
        sessionId,
        speakerId: "solo",
        turnCount: 5,
        turnDurationMs: 4000,
      });

      const getTranscriptSegments = async (): Promise<TranscriptSegment[]> => segments;

      await handleMeetingEnd(
        { sessionId, endTime: Date.now() },
        {
          analyticsEnabled: true,
          getTranscriptSegments,
          logger: silentLogger,
        }
      );

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);
      expect(res.body.stats).toHaveLength(1);

      const soloStats = res.body.stats[0];
      expect(soloStats.speakerId).toBe("solo");
      expect(soloStats.turnCount).toBe(5);
      expect(soloStats.talkTime).toBe(20000); // 5 * 4000ms
      // Meeting duration includes gaps: (5*4000 + 4*500) = 22000ms, talk = 20000ms
      expect(soloStats.percentageOfMeeting).toBe(90.91);
      expect(soloStats.averageTurnDuration).toBe(4000);
      expect(soloStats.interruptionCount).toBe(0);
    });

    it("handles empty transcript (no segments)", async () => {
      const sessionId = "workflow-empty";
      const getTranscriptSegments = async (): Promise<TranscriptSegment[]> => [];

      await handleMeetingEnd(
        { sessionId, endTime: Date.now() },
        {
          analyticsEnabled: true,
          getTranscriptSegments,
          logger: silentLogger,
        }
      );

      // Empty transcript produces empty stats array, but still persisted
      const dbResult = await getSpeakerStats(sessionId);
      expect(dbResult).not.toBeNull();
      expect(dbResult!.stats).toEqual([]);

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);
      expect(res.body.stats).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Interruption detection
  // ---------------------------------------------------------------------------
  describe("meeting with interruptions", () => {
    it("produces correct interruption counts in final API response", async () => {
      const sessionId = "interruption-test";
      const segments = generateTranscriptWithInterruptions({
        sessionId,
        interruptionCount: 3,
        overlapMs: 800, // exceeds 500ms threshold
      });

      const getTranscriptSegments = async (): Promise<TranscriptSegment[]> => segments;

      await handleMeetingEnd(
        { sessionId, endTime: Date.now() },
        {
          analyticsEnabled: true,
          getTranscriptSegments,
          logger: silentLogger,
        }
      );

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);

      const speakerA = res.body.stats.find((s: SpeakerStats) => s.speakerId === "speaker-A");
      const speakerB = res.body.stats.find((s: SpeakerStats) => s.speakerId === "speaker-B");

      expect(speakerA).toBeDefined();
      expect(speakerB).toBeDefined();

      // Speaker A is interrupted 3 times by speaker B
      expect(speakerA.interruptionCount).toBe(3);
      // Speaker B is not interrupted (they are the interrupter)
      expect(speakerB.interruptionCount).toBe(0);
    });

    it("does not count overlaps below threshold as interruptions", async () => {
      const sessionId = "no-interruption-test";
      // Overlap of 400ms < 500ms threshold
      const segments = generateTranscriptWithInterruptions({
        sessionId,
        interruptionCount: 2,
        overlapMs: 400,
      });

      const getTranscriptSegments = async (): Promise<TranscriptSegment[]> => segments;

      await handleMeetingEnd(
        { sessionId, endTime: Date.now() },
        {
          analyticsEnabled: true,
          getTranscriptSegments,
          logger: silentLogger,
        }
      );

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);

      const speakerA = res.body.stats.find((s: SpeakerStats) => s.speakerId === "speaker-A");
      expect(speakerA.interruptionCount).toBe(0);
    });

    it("handles custom interruption threshold via config", async () => {
      const sessionId = "custom-threshold";
      // 300ms overlap with 200ms threshold → should count as interruption
      const segments = generateTranscriptWithInterruptions({
        sessionId,
        interruptionCount: 2,
        overlapMs: 300,
      });

      const getTranscriptSegments = async (): Promise<TranscriptSegment[]> => segments;

      await handleMeetingEnd(
        { sessionId, endTime: Date.now() },
        {
          analyticsEnabled: true,
          analyticsConfig: { interruptionThresholdMs: 200 },
          getTranscriptSegments,
          logger: silentLogger,
        }
      );

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);

      const speakerA = res.body.stats.find((s: SpeakerStats) => s.speakerId === "speaker-A");
      expect(speakerA.interruptionCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // API endpoint: 404 for missing sessions
  // ---------------------------------------------------------------------------
  describe("API endpoint returns 404 for session with no calculated stats", () => {
    it("returns 404 for non-existent session", async () => {
      const res = await request(app).get("/api/sessions/non-existent-session/speaker-stats");
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it("returns 400 for invalid session ID format", async () => {
      // Use a session ID with spaces that fails the /^[a-zA-Z0-9_-]+$/ validation
      const res = await request(app).get("/api/sessions/has spaces/speaker-stats");
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Data consistency: calculation service output matches API response
  // ---------------------------------------------------------------------------
  describe("data consistency between calculation and API response", () => {
    it("API response matches directly calculated stats", async () => {
      const sessionId = "consistency-check";
      const segments = generateMultiSpeakerTranscript({
        sessionId,
        speakerIds: ["speaker-1", "speaker-2"],
        turnsPerSpeaker: 4,
        turnDurationMs: 3000,
        gapMs: 100,
      });

      // Calculate stats directly
      const calculatedStats = await calculateSpeakerStats(segments);

      // Persist stats via the normal pipeline
      await saveSpeakerStats(sessionId, calculatedStats);

      // Fetch via API
      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);

      // API result should match calculated stats exactly
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.stats).toEqual(calculatedStats);
    });

    it("processSpeakerAnalytics output matches subsequent API response", async () => {
      const sessionId = "process-consistency";
      const segments = generateMultiSpeakerTranscript({
        sessionId,
        speakerIds: ["dev", "pm", "designer"],
        turnsPerSpeaker: 2,
        turnDurationMs: 6000,
      });

      const getTranscriptSegments = async (): Promise<TranscriptSegment[]> => segments;

      const processedStats = await processSpeakerAnalytics(
        sessionId,
        getTranscriptSegments
      );

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);
      expect(res.body.stats).toEqual(processedStats);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------
  describe("error handling across components", () => {
    it("analytics failure does not break meeting end handler", async () => {
      const sessionId = "error-resilience";

      const getTranscriptSegments = async (): Promise<TranscriptSegment[]> => {
        throw new Error("Database connection failed");
      };

      // Should not throw even when transcript retrieval fails
      await expect(
        handleMeetingEnd(
          { sessionId, endTime: Date.now() },
          {
            analyticsEnabled: true,
            getTranscriptSegments,
            logger: silentLogger,
          }
        )
      ).resolves.toBeUndefined();
    });

    it("skips analytics when disabled", async () => {
      const sessionId = "analytics-disabled";

      const getTranscriptSegments = async (): Promise<TranscriptSegment[]> => {
        throw new Error("Should not be called");
      };

      await handleMeetingEnd(
        { sessionId, endTime: Date.now() },
        {
          analyticsEnabled: false,
          getTranscriptSegments,
          logger: silentLogger,
        }
      );

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Database isolation
  // ---------------------------------------------------------------------------
  describe("database isolation between test runs", () => {
    it("stats from one session do not leak to another", async () => {
      const segments1 = generateSingleSpeakerTranscript({
        sessionId: "session-a",
        speakerId: "alice",
        turnCount: 2,
      });
      const segments2 = generateSingleSpeakerTranscript({
        sessionId: "session-b",
        speakerId: "bob",
        turnCount: 3,
      });

      await saveSpeakerStats("session-a", await calculateSpeakerStats(segments1));
      await saveSpeakerStats("session-b", await calculateSpeakerStats(segments2));

      const resA = await request(app).get("/api/sessions/session-a/speaker-stats");
      const resB = await request(app).get("/api/sessions/session-b/speaker-stats");

      expect(resA.body.stats).toHaveLength(1);
      expect(resA.body.stats[0].speakerId).toBe("alice");
      expect(resA.body.stats[0].turnCount).toBe(2);

      expect(resB.body.stats).toHaveLength(1);
      expect(resB.body.stats[0].speakerId).toBe("bob");
      expect(resB.body.stats[0].turnCount).toBe(3);
    });

    it("upsert correctly overwrites previous stats for same session", async () => {
      const sessionId = "upsert-test";

      const segments1 = generateSingleSpeakerTranscript({
        sessionId,
        speakerId: "first",
        turnCount: 2,
      });
      await saveSpeakerStats(sessionId, await calculateSpeakerStats(segments1));

      const segments2 = generateMultiSpeakerTranscript({
        sessionId,
        speakerIds: ["second", "third"],
        turnsPerSpeaker: 3,
      });
      await saveSpeakerStats(sessionId, await calculateSpeakerStats(segments2));

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);
      expect(res.body.stats).toHaveLength(2);
      expect(res.body.stats.map((s: SpeakerStats) => s.speakerId).sort()).toEqual(["second", "third"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Statistical calculation verification
  // ---------------------------------------------------------------------------
  describe("statistical calculations with known expected values", () => {
    it("computes correct percentages for two equal speakers", async () => {
      const sessionId = "equal-speakers";
      // Two speakers, each speaks for exactly the same duration, no gaps between them
      const segments: TranscriptSegment[] = [
        makeSegment({ sessionId, speakerId: "a", startTime: 0, endTime: 10000 }),
        makeSegment({ sessionId, speakerId: "b", startTime: 10000, endTime: 20000 }),
      ];

      await saveSpeakerStats(sessionId, await calculateSpeakerStats(segments));

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);

      const statsA = res.body.stats.find((s: SpeakerStats) => s.speakerId === "a");
      const statsB = res.body.stats.find((s: SpeakerStats) => s.speakerId === "b");

      expect(statsA.talkTime).toBe(10000);
      expect(statsB.talkTime).toBe(10000);
      expect(statsA.percentageOfMeeting).toBe(50);
      expect(statsB.percentageOfMeeting).toBe(50);
      expect(statsA.turnCount).toBe(1);
      expect(statsB.turnCount).toBe(1);
    });

    it("computes correct stats for asymmetric speaking times", async () => {
      const sessionId = "asymmetric-speakers";
      // Speaker A: 30s, Speaker B: 10s. Meeting duration: 40s
      const segments: TranscriptSegment[] = [
        makeSegment({ sessionId, speakerId: "a", startTime: 0, endTime: 30000 }),
        makeSegment({ sessionId, speakerId: "b", startTime: 30000, endTime: 40000 }),
      ];

      await saveSpeakerStats(sessionId, await calculateSpeakerStats(segments));

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      const statsA = res.body.stats.find((s: SpeakerStats) => s.speakerId === "a");
      const statsB = res.body.stats.find((s: SpeakerStats) => s.speakerId === "b");

      expect(statsA.talkTime).toBe(30000);
      expect(statsA.percentageOfMeeting).toBe(75);
      expect(statsB.talkTime).toBe(10000);
      expect(statsB.percentageOfMeeting).toBe(25);
    });
  });

  // ---------------------------------------------------------------------------
  // Performance testing
  // ---------------------------------------------------------------------------
  describe("performance with large segment counts", () => {
    it("processes 1000 segments within acceptable time", async () => {
      const sessionId = "perf-1000";
      const segments = generateLargeTranscript({
        sessionId,
        segmentCount: 1000,
        speakerCount: 10,
      });

      const startTime = performance.now();

      const getTranscriptSegments = async (): Promise<TranscriptSegment[]> => segments;
      await processSpeakerAnalytics(sessionId, getTranscriptSegments);

      const elapsed = performance.now() - startTime;

      // Should complete within 5 seconds (generous limit for CI)
      expect(elapsed).toBeLessThan(5000);

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);
      expect(res.body.stats).toHaveLength(10);
      assertValidSpeakerStats(res.body.stats);
    });
  });

  // ---------------------------------------------------------------------------
  // API response format
  // ---------------------------------------------------------------------------
  describe("API response format and status codes", () => {
    it("returns correct JSON structure for valid session", async () => {
      const sessionId = "format-test";
      const segments = generateMultiSpeakerTranscript({
        sessionId,
        speakerIds: ["x", "y"],
        turnsPerSpeaker: 1,
      });

      await saveSpeakerStats(sessionId, await calculateSpeakerStats(segments));

      const res = await request(app).get(`/api/sessions/${sessionId}/speaker-stats`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/json/);

      // Verify top-level structure
      expect(res.body).toHaveProperty("sessionId", sessionId);
      expect(res.body).toHaveProperty("stats");
      expect(Array.isArray(res.body.stats)).toBe(true);

      // Verify each stat has all required fields
      for (const stat of res.body.stats) {
        expect(stat).toHaveProperty("speakerId");
        expect(stat).toHaveProperty("talkTime");
        expect(stat).toHaveProperty("percentageOfMeeting");
        expect(stat).toHaveProperty("turnCount");
        expect(stat).toHaveProperty("averageTurnDuration");
        expect(stat).toHaveProperty("interruptionCount");
      }
    });

    it("returns 404 with error field for missing session", async () => {
      const res = await request(app).get("/api/sessions/no-such-session/speaker-stats");
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
      expect(typeof res.body.error).toBe("string");
    });

    it("returns 400 with error field for invalid session ID", async () => {
      const res = await request(app).get("/api/sessions/bad%20id%21/speaker-stats");
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });
  });
});
