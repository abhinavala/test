import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MeetingEndEvent } from "../../types/events.js";
import type { TranscriptSegment } from "../../types/transcript.js";
import type { ParticipantEngagementScore } from "../../types/engagement.js";
import type { MeetingEndHandlerConfig } from "../../services/meetingEndHandler.js";

vi.mock("../../models/speakerStats.js", () => ({
  saveSpeakerStats: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../models/participantEngagementScore.js", () => ({
  bulkSaveEngagementScores: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/engagementScoringService.js", () => ({
  calculateSessionEngagement: vi.fn(
    (
      sessionId: string,
      inputs: {
        participantId: string;
        segments: TranscriptSegment[];
        sentimentScore: number;
      }[]
    ): ParticipantEngagementScore[] =>
      inputs.map((input) => ({
        id: `score-${input.participantId}`,
        sessionId,
        participantId: input.participantId,
        score: 75,
        talkTimeRatio: 0.5,
        questionCount: 2,
        responseRate: 0.8,
        sentimentScore: input.sentimentScore,
        calculatedAt: new Date("2026-01-01T00:00:00Z"),
      }))
  ),
}));

import { bulkSaveEngagementScores } from "../../models/participantEngagementScore.js";
import { calculateSessionEngagement } from "../../services/engagementScoringService.js";
import {
  handleMeetingEnd,
  processEngagementScoring,
  extractEngagementInputData,
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

describe("meetingEndEngagementIntegration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processEngagementScoring", () => {
    it("calculates scores for meeting with valid transcript data", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({
          speakerId: "alice",
          startTime: 0,
          endTime: 5000,
          text: "Hello everyone, how are you?",
        }),
        makeSegment({
          speakerId: "bob",
          startTime: 5000,
          endTime: 10000,
          text: "I am doing well, thanks for asking.",
        }),
      ];
      const getTranscriptSegments = vi.fn().mockResolvedValue(segments);

      const result = await processEngagementScoring(
        "session-1",
        getTranscriptSegments
      );

      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe("session-1");
      expect(result!.participantScores).toHaveLength(2);
      expect(result!.averageScore).toBe(75);
      expect(result!.calculatedAt).toBeInstanceOf(Date);

      expect(result!.participantScores).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ participantId: "alice", score: 75 }),
          expect.objectContaining({ participantId: "bob", score: 75 }),
        ])
      );

      expect(calculateSessionEngagement).toHaveBeenCalledWith(
        "session-1",
        expect.arrayContaining([
          expect.objectContaining({ participantId: "alice" }),
          expect.objectContaining({ participantId: "bob" }),
        ])
      );

      expect(bulkSaveEngagementScores).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ participantId: "alice" }),
          expect.objectContaining({ participantId: "bob" }),
        ])
      );
    });

    it("handles meetings with no transcript data gracefully", async () => {
      const getTranscriptSegments = vi.fn().mockResolvedValue([]);

      const result = await processEngagementScoring(
        "empty-session",
        getTranscriptSegments
      );

      expect(result).toBeNull();
      expect(calculateSessionEngagement).not.toHaveBeenCalled();
      expect(bulkSaveEngagementScores).not.toHaveBeenCalled();
    });

    it("passes sentiment scores to engagement calculation", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
      ];
      const getTranscriptSegments = vi.fn().mockResolvedValue(segments);
      const sentimentScores = new Map([["alice", 0.8]]);
      const getSentimentScores = vi.fn().mockResolvedValue(sentimentScores);

      const result = await processEngagementScoring(
        "session-1",
        getTranscriptSegments,
        getSentimentScores
      );

      expect(result).not.toBeNull();
      expect(getSentimentScores).toHaveBeenCalledWith("session-1");
      expect(calculateSessionEngagement).toHaveBeenCalledWith(
        "session-1",
        expect.arrayContaining([
          expect.objectContaining({
            participantId: "alice",
            sentimentScore: 0.8,
          }),
        ])
      );
    });

    it("uses default sentiment of 0 when no sentiment provider is given", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
      ];
      const getTranscriptSegments = vi.fn().mockResolvedValue(segments);

      await processEngagementScoring("session-1", getTranscriptSegments);

      expect(calculateSessionEngagement).toHaveBeenCalledWith(
        "session-1",
        expect.arrayContaining([
          expect.objectContaining({
            participantId: "alice",
            sentimentScore: 0,
          }),
        ])
      );
    });
  });

  describe("extractEngagementInputData", () => {
    it("reuses Speaker Analytics data extraction patterns", () => {
      const segments: TranscriptSegment[] = [
        makeSegment({
          speakerId: "alice",
          startTime: 0,
          endTime: 3000,
          text: "First point",
        }),
        makeSegment({
          speakerId: "bob",
          startTime: 3000,
          endTime: 6000,
          text: "Second point",
        }),
        makeSegment({
          speakerId: "alice",
          startTime: 6000,
          endTime: 9000,
          text: "Follow up",
        }),
      ];

      const sentimentScores = new Map([
        ["alice", 0.5],
        ["bob", -0.2],
      ]);

      const result = extractEngagementInputData(segments, sentimentScores);

      expect(result).toHaveLength(2);

      const aliceInput = result.find((r) => r.participantId === "alice");
      const bobInput = result.find((r) => r.participantId === "bob");

      expect(aliceInput).toBeDefined();
      expect(aliceInput!.segments).toHaveLength(2);
      expect(aliceInput!.sentimentScore).toBe(0.5);

      expect(bobInput).toBeDefined();
      expect(bobInput!.segments).toHaveLength(1);
      expect(bobInput!.sentimentScore).toBe(-0.2);
    });

    it("returns empty array for no segments", () => {
      const result = extractEngagementInputData([]);
      expect(result).toEqual([]);
    });

    it("defaults sentiment to 0 when not provided", () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 3000 }),
      ];

      const result = extractEngagementInputData(segments);

      expect(result).toHaveLength(1);
      expect(result[0].sentimentScore).toBe(0);
    });
  });

  describe("handleMeetingEnd with engagement scoring", () => {
    it("triggers engagement scoring during meeting end", async () => {
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
        engagementScoringEnabled: true,
        getTranscriptSegments,
        logger,
      };

      await handleMeetingEnd(event, config);

      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scoring calculated and persisted successfully",
        expect.objectContaining({
          sessionId: "session-1",
          participantCount: 2,
          averageScore: 75,
        })
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("continues workflow when engagement scoring fails", async () => {
      const logger = makeLogger();
      const getTranscriptSegments = vi
        .fn()
        .mockResolvedValueOnce([
          makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
        ])
        .mockRejectedValueOnce(new Error("Scoring service unavailable"));
      const event: MeetingEndEvent = {
        sessionId: "session-err",
        endTime: 10000,
      };
      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: true,
        engagementScoringEnabled: true,
        getTranscriptSegments,
        logger,
      };

      await expect(handleMeetingEnd(event, config)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        "Engagement scoring calculation failed",
        expect.objectContaining({
          sessionId: "session-err",
          error: "Scoring service unavailable",
        })
      );
    });

    it("logs skip message when no transcript data for engagement scoring", async () => {
      const logger = makeLogger();
      const getTranscriptSegments = vi.fn().mockResolvedValue([]);
      const event: MeetingEndEvent = {
        sessionId: "session-empty",
        endTime: 10000,
      };
      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: true,
        engagementScoringEnabled: true,
        getTranscriptSegments,
        logger,
      };

      await handleMeetingEnd(event, config);

      expect(logger.info).toHaveBeenCalledWith(
        "Engagement scoring skipped: no transcript data available",
        expect.objectContaining({ sessionId: "session-empty" })
      );
    });

    it("does not break existing speaker analytics functionality", async () => {
      const segments: TranscriptSegment[] = [
        makeSegment({ speakerId: "alice", startTime: 0, endTime: 5000 }),
      ];
      const logger = makeLogger();
      const getTranscriptSegments = vi.fn().mockResolvedValue(segments);
      const event: MeetingEndEvent = {
        sessionId: "session-1",
        endTime: 10000,
      };
      const config: MeetingEndHandlerConfig = {
        analyticsEnabled: true,
        engagementScoringEnabled: false,
        getTranscriptSegments,
        logger,
      };

      await handleMeetingEnd(event, config);

      expect(logger.info).toHaveBeenCalledWith(
        "Speaker analytics calculated and persisted successfully",
        expect.objectContaining({ sessionId: "session-1" })
      );
      expect(calculateSessionEngagement).not.toHaveBeenCalled();
    });
  });
});
