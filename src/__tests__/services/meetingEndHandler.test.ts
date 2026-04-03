import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MeetingEndEvent } from "../../types/events.js";
import type { TranscriptSegment } from "../../types/transcript.js";
import type { MeetingEndHandlerConfig } from "../../services/meetingEndHandler.js";

vi.mock("../../models/speakerStats.js", () => ({
  saveSpeakerStats: vi.fn().mockResolvedValue(undefined),
}));

import { saveSpeakerStats } from "../../models/speakerStats.js";
import {
  handleMeetingEnd,
  processSpeakerAnalytics,
} from "../../services/meetingEndHandler.js";

function makeSegment(
  overrides: Partial<TranscriptSegment> & { speakerId: string }
): TranscriptSegment {
  return {
    id: `seg-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "session-1",
    startTime: 0,
    endTime: 1000,
    text: "hello",
    ...overrides,
  };
}

function makeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

describe("meetingEndHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleMeetingEnd", () => {
    it("successfully processes analytics for session with transcript segments", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
        makeSegment({ speakerId: "bob", startTime: 5000, endTime: 10000 }),
      ];
      const logger = makeLogger();
      const getTranscriptSegments = vi.fn().mockResolvedValue(segments);
      const event: MeetingEndEvent = {
        sessionId: "session-1",
        endTime: 10000,
      };
      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: true,
        getTranscriptSegments,
        logger,
      };

      await handleMeetingEnd(event, config);

      expect(getTranscriptSegments).toHaveBeenCalledWith("session-1");
      expect(saveSpeakerStats).toHaveBeenCalledWith(
        "session-1",
        expect.arrayContaining([
          expect.objectContaining({ speakerId: "alice" }),
          expect.objectContaining({ speakerId: "bob" }),
        ])
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Speaker analytics calculated and persisted successfully",
        expect.objectContaining({ sessionId: "session-1", speakerCount: 2 })
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("continues workflow when analytics calculation fails", async () => {
      const logger = makeLogger();
      const getTranscriptSegments = vi
        .fn()
        .mockRejectedValue(new Error("DB connection lost"));
      const event: MeetingEndEvent = {
        sessionId: "session-err",
        endTime: 10000,
      };
      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: true,
        getTranscriptSegments,
        logger,
      };

      // Should not throw
      await expect(handleMeetingEnd(event, config)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        "Speaker analytics calculation failed",
        expect.objectContaining({
          sessionId: "session-err",
          error: "DB connection lost",
        })
      );
    });

    it("skips analytics when disabled", async () => {
      const logger = makeLogger();
      const getTranscriptSegments = vi.fn();
      const event: MeetingEndEvent = {
        sessionId: "session-1",
        endTime: 10000,
      };
      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: false,
        getTranscriptSegments,
        logger,
      };

      await handleMeetingEnd(event, config);

      expect(getTranscriptSegments).not.toHaveBeenCalled();
      expect(saveSpeakerStats).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Speaker analytics disabled, skipping calculation",
        expect.objectContaining({ sessionId: "session-1" })
      );
    });
  });

  describe("processSpeakerAnalytics", () => {
    it("handles sessions with no transcript segments gracefully", async () => {
      const getTranscriptSegments = vi.fn().mockResolvedValue([]);

      const stats = await processSpeakerAnalytics(
        "empty-session",
        getTranscriptSegments
      );

      expect(stats).toEqual([]);
      expect(saveSpeakerStats).toHaveBeenCalledWith("empty-session", []);
    });

    it("calculates and persists stats for segments", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({
          speakerId: "speaker-a",
          startTime: 0,
          endTime: 3000,
        }),
        makeSegment({
          speakerId: "speaker-b",
          startTime: 3000,
          endTime: 7000,
        }),
      ];
      const getTranscriptSegments = vi.fn().mockResolvedValue(segments);

      const stats = await processSpeakerAnalytics(
        "session-1",
        getTranscriptSegments
      );

      expect(stats).toHaveLength(2);
      expect(stats).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            speakerId: "speaker-a",
            talkTime: 3000,
            turnCount: 1,
          }),
          expect.objectContaining({
            speakerId: "speaker-b",
            talkTime: 4000,
            turnCount: 1,
          }),
        ])
      );
      expect(saveSpeakerStats).toHaveBeenCalledWith("session-1", stats);
    });
  });
});
