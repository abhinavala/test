import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MeetingSession } from "../../types/meeting-config.js";
import type { SummaryJobResult } from "../../jobs/summaryGenerationJob.js";

const mockTriggerSummaryGeneration = vi.fn<
  (...args: unknown[]) => Promise<SummaryJobResult>
>();

vi.mock("../../jobs/summaryGenerationJob.js", () => ({
  triggerSummaryGeneration: (...args: unknown[]) =>
    mockTriggerSummaryGeneration(...args),
}));

const { handleMeetingEnd } = await import(
  "../../handlers/meetingEndHandler.js"
);

function makeMeetingSession(
  overrides: Partial<MeetingSession> = {},
): MeetingSession {
  return {
    sessionId: "session-1",
    startTime: Date.now() - 300_000, // 5 minutes ago
    endTime: Date.now(),
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
    mockTriggerSummaryGeneration.mockResolvedValue({
      success: true,
      meetingSessionId: "session-1",
      attempt: 1,
    });
  });

  describe("handleMeetingEnd", () => {
    it("successfully triggers summary generation for meetings longer than minimum duration", async () => {
      const session = makeMeetingSession();
      const logger = makeLogger();

      await handleMeetingEnd(session, {}, logger);

      expect(mockTriggerSummaryGeneration).toHaveBeenCalledWith(
        session.sessionId,
        {
          summaryRetryAttempts: 3,
          summaryRetryDelay: 2_000,
        },
        logger,
      );

      expect(logger.info).toHaveBeenCalledWith(
        "Triggering summary generation for meeting session",
        expect.objectContaining({ sessionId: session.sessionId }),
      );
    });

    it("completes successfully even when summary generation fails", async () => {
      mockTriggerSummaryGeneration.mockRejectedValue(
        new Error("AI service unavailable"),
      );

      const session = makeMeetingSession();
      const logger = makeLogger();

      // handleMeetingEnd should not throw
      await expect(
        handleMeetingEnd(session, {}, logger),
      ).resolves.toBeUndefined();

      // The fire-and-forget void call means the rejection is unhandled
      // by the handler itself, but the handler still completes.
      expect(logger.info).toHaveBeenCalledWith(
        "Meeting end handler started",
        expect.objectContaining({ sessionId: session.sessionId }),
      );
    });

    it("skips summary creation when meeting duration is below threshold", async () => {
      const now = Date.now();
      const session = makeMeetingSession({
        startTime: now - 30_000, // 30 seconds — below default 60s threshold
        endTime: now,
      });
      const logger = makeLogger();

      await handleMeetingEnd(session, {}, logger);

      expect(mockTriggerSummaryGeneration).not.toHaveBeenCalled();

      expect(logger.info).toHaveBeenCalledWith(
        "Meeting duration below minimum threshold, skipping summary generation",
        expect.objectContaining({
          sessionId: session.sessionId,
          duration: expect.any(Number) as number,
          minMeetingDuration: 60_000,
        }),
      );
    });

    it("skips summary generation when autoGenerateSummary is disabled", async () => {
      const session = makeMeetingSession();
      const logger = makeLogger();

      await handleMeetingEnd(
        session,
        { autoGenerateSummary: false },
        logger,
      );

      expect(mockTriggerSummaryGeneration).not.toHaveBeenCalled();

      expect(logger.info).toHaveBeenCalledWith(
        "Automatic summary generation is disabled, skipping",
        expect.objectContaining({ sessionId: session.sessionId }),
      );
    });

    it("uses custom config values when provided", async () => {
      const session = makeMeetingSession();
      const logger = makeLogger();

      await handleMeetingEnd(
        session,
        {
          summaryRetryAttempts: 5,
          summaryRetryDelay: 5_000,
          minMeetingDuration: 10_000,
        },
        logger,
      );

      expect(mockTriggerSummaryGeneration).toHaveBeenCalledWith(
        session.sessionId,
        {
          summaryRetryAttempts: 5,
          summaryRetryDelay: 5_000,
        },
        logger,
      );
    });

    it("uses default config when no config is provided", async () => {
      const session = makeMeetingSession();
      const logger = makeLogger();

      await handleMeetingEnd(session, undefined, logger);

      expect(mockTriggerSummaryGeneration).toHaveBeenCalledWith(
        session.sessionId,
        {
          summaryRetryAttempts: 3,
          summaryRetryDelay: 2_000,
        },
        logger,
      );
    });

    it("respects custom minMeetingDuration threshold", async () => {
      const now = Date.now();
      const session = makeMeetingSession({
        startTime: now - 120_000, // 2 minutes
        endTime: now,
      });
      const logger = makeLogger();

      // Set threshold to 5 minutes — session is only 2 minutes
      await handleMeetingEnd(
        session,
        { minMeetingDuration: 300_000 },
        logger,
      );

      expect(mockTriggerSummaryGeneration).not.toHaveBeenCalled();
    });

    it("triggers generation for meeting at exactly the minimum duration", async () => {
      const now = Date.now();
      const session = makeMeetingSession({
        startTime: now - 60_000, // exactly 60 seconds
        endTime: now,
      });
      const logger = makeLogger();

      await handleMeetingEnd(session, {}, logger);

      expect(mockTriggerSummaryGeneration).toHaveBeenCalledWith(
        session.sessionId,
        expect.any(Object) as Record<string, unknown>,
        logger,
      );
    });
  });
});
