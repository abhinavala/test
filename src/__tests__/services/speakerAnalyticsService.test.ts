import { describe, it, expect } from "vitest";
import {
  calculateSpeakerStats,
  TranscriptSegment,
} from "../../services/speakerAnalyticsService.js";
import { SpeakerAnalyticsError } from "../../types/errors.js";

function makeSegment(
  overrides: Partial<TranscriptSegment> & {
    speakerId: string;
    startTime: number;
    endTime: number;
  }
): TranscriptSegment {
  return {
    id: overrides.id ?? `seg-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: overrides.sessionId ?? "session-1",
    speakerId: overrides.speakerId,
    startTime: overrides.startTime,
    endTime: overrides.endTime,
    text: overrides.text ?? "hello",
  };
}

describe("speakerAnalyticsService", () => {
  describe("calculateSpeakerStats", () => {
    it("returns an empty array for no segments", async () => {
      const result = await calculateSpeakerStats([]);
      expect(result).toEqual([]);
    });

    it("returns correct talk time and turn count for multiple speakers", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 3000 }),
        makeSegment({ speakerId: "bob", startTime: 3000, endTime: 5000 }),
        makeSegment({ speakerId: "alice", startTime: 5000, endTime: 8000 }),
        makeSegment({ speakerId: "bob", startTime: 8000, endTime: 9000 }),
      ];

      const result = await calculateSpeakerStats(segments);

      const alice = result.find((s) => s.speakerId === "alice")!;
      expect(alice.talkTime).toBe(6000); // 3000 + 3000
      expect(alice.turnCount).toBe(2);
      expect(alice.averageTurnDuration).toBe(3000);

      const bob = result.find((s) => s.speakerId === "bob")!;
      expect(bob.talkTime).toBe(3000); // 2000 + 1000
      expect(bob.turnCount).toBe(2);
      expect(bob.averageTurnDuration).toBe(1500);
    });

    it("calculates correct percentage of meeting time", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 6000 }),
        makeSegment({ speakerId: "bob", startTime: 6000, endTime: 10000 }),
      ];

      const result = await calculateSpeakerStats(segments);

      const alice = result.find((s) => s.speakerId === "alice")!;
      expect(alice.percentageOfMeeting).toBe(60);

      const bob = result.find((s) => s.speakerId === "bob")!;
      expect(bob.percentageOfMeeting).toBe(40);
    });

    it("handles a single speaker meeting", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
        makeSegment({ speakerId: "alice", startTime: 5000, endTime: 10000 }),
      ];

      const result = await calculateSpeakerStats(segments);

      expect(result).toHaveLength(1);
      expect(result[0].speakerId).toBe("alice");
      expect(result[0].talkTime).toBe(10000);
      expect(result[0].percentageOfMeeting).toBe(100);
      expect(result[0].turnCount).toBe(2);
      expect(result[0].interruptionCount).toBe(0);
    });

    it("handles zero-duration segments", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 1000, endTime: 1000 }),
        makeSegment({ speakerId: "bob", startTime: 1000, endTime: 2000 }),
      ];

      const result = await calculateSpeakerStats(segments);

      const alice = result.find((s) => s.speakerId === "alice")!;
      expect(alice.talkTime).toBe(0);
      expect(alice.turnCount).toBe(1);
      expect(alice.averageTurnDuration).toBe(0);
    });
  });

  describe("calculateInterruptions", () => {
    it("correctly identifies overlapping segments within threshold", async () => {
      // Bob starts 600ms before Alice ends => overlap of 600ms > 500ms threshold
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
        makeSegment({ speakerId: "bob", startTime: 4400, endTime: 7000 }),
        makeSegment({ speakerId: "alice", startTime: 7000, endTime: 10000 }),
      ];

      const result = await calculateSpeakerStats(segments);

      const alice = result.find((s) => s.speakerId === "alice")!;
      expect(alice.interruptionCount).toBe(1); // alice was interrupted by bob

      const bob = result.find((s) => s.speakerId === "bob")!;
      expect(bob.interruptionCount).toBe(0);
    });

    it("does not count overlap below threshold as interruption", async () => {
      // Bob starts 400ms before Alice ends => overlap of 400ms < 500ms threshold
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
        makeSegment({ speakerId: "bob", startTime: 4600, endTime: 7000 }),
      ];

      const result = await calculateSpeakerStats(segments);

      const alice = result.find((s) => s.speakerId === "alice")!;
      expect(alice.interruptionCount).toBe(0);
    });

    it("does not count overlap exactly at threshold as interruption", async () => {
      // Overlap of exactly 500ms should NOT count (must exceed threshold)
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
        makeSegment({ speakerId: "bob", startTime: 4500, endTime: 7000 }),
      ];

      const result = await calculateSpeakerStats(segments);

      const alice = result.find((s) => s.speakerId === "alice")!;
      expect(alice.interruptionCount).toBe(0);
    });

    it("uses custom interruption threshold from config", async () => {
      // Overlap of 300ms; default threshold (500ms) wouldn't flag it, but 200ms threshold would
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
        makeSegment({ speakerId: "bob", startTime: 4700, endTime: 7000 }),
      ];

      const result = await calculateSpeakerStats(segments, {
        interruptionThresholdMs: 200,
      });

      const alice = result.find((s) => s.speakerId === "alice")!;
      expect(alice.interruptionCount).toBe(1);
    });

    it("does not count same-speaker consecutive segments as interruptions", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
        makeSegment({ speakerId: "alice", startTime: 4000, endTime: 8000 }),
      ];

      const result = await calculateSpeakerStats(segments);

      expect(result[0].interruptionCount).toBe(0);
    });

    it("counts multiple interruptions correctly", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
        makeSegment({ speakerId: "bob", startTime: 4000, endTime: 8000 }), // interrupts alice (1000ms overlap)
        makeSegment({ speakerId: "alice", startTime: 7000, endTime: 12000 }), // interrupts bob (1000ms overlap)
        makeSegment({ speakerId: "bob", startTime: 11000, endTime: 15000 }), // interrupts alice (1000ms overlap)
      ];

      const result = await calculateSpeakerStats(segments);

      const alice = result.find((s) => s.speakerId === "alice")!;
      expect(alice.interruptionCount).toBe(2); // interrupted twice by bob

      const bob = result.find((s) => s.speakerId === "bob")!;
      expect(bob.interruptionCount).toBe(1); // interrupted once by alice
    });
  });

  describe("input validation", () => {
    it("throws SpeakerAnalyticsError for segment with missing id", async () => {
      const segments = [
        { id: "", sessionId: "s1", speakerId: "alice", startTime: 0, endTime: 1000, text: "hi" },
      ];

      await expect(calculateSpeakerStats(segments)).rejects.toThrow(SpeakerAnalyticsError);
      await expect(calculateSpeakerStats(segments)).rejects.toMatchObject({
        code: "INVALID_SEGMENTS",
      });
    });

    it("throws SpeakerAnalyticsError for segment with missing speakerId", async () => {
      const segments = [
        { id: "seg-1", sessionId: "s1", speakerId: "", startTime: 0, endTime: 1000, text: "hi" },
      ];

      await expect(calculateSpeakerStats(segments)).rejects.toThrow(SpeakerAnalyticsError);
      await expect(calculateSpeakerStats(segments)).rejects.toMatchObject({
        code: "INVALID_SEGMENTS",
      });
    });

    it("throws SpeakerAnalyticsError for segment with endTime before startTime", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 5000, endTime: 3000 }),
      ];

      await expect(calculateSpeakerStats(segments)).rejects.toThrow(SpeakerAnalyticsError);
      await expect(calculateSpeakerStats(segments)).rejects.toMatchObject({
        code: "INVALID_SEGMENTS",
      });
    });

    it("throws SpeakerAnalyticsError for segment with NaN startTime", async () => {
      const segments = [
        { id: "seg-1", sessionId: "s1", speakerId: "alice", startTime: NaN, endTime: 1000, text: "hi" },
      ];

      await expect(calculateSpeakerStats(segments)).rejects.toThrow(SpeakerAnalyticsError);
      await expect(calculateSpeakerStats(segments)).rejects.toMatchObject({
        code: "INVALID_SEGMENTS",
      });
    });
  });
});
