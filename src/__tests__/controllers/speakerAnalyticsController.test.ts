import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { getSpeakerStatsHandler } from "../../controllers/speakerAnalyticsController.js";

vi.mock("../../models/speakerStats.js", () => ({
  getSpeakerStats: vi.fn(),
}));

import { getSpeakerStats } from "../../models/speakerStats.js";
import { SessionNotFoundError } from "../../types/errors.js";

const mockedGetSpeakerStats = vi.mocked(getSpeakerStats);

function createMockReq(params: Record<string, string> = {}): Request {
  return { params } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("speakerAnalyticsController", () => {
  describe("getSpeakerStatsHandler", () => {
    it("returns 200 with SessionSpeakerStats when stats exist", async () => {
      const mockStats = {
        sessionId: "session-1",
        stats: [
          {
            speakerId: "speaker-1",
            talkTime: 120000,
            percentageOfMeeting: 40,
            turnCount: 15,
            averageTurnDuration: 8000,
            interruptionCount: 3,
          },
        ],
      };
      mockedGetSpeakerStats.mockResolvedValue(mockStats);

      const req = createMockReq({ sessionId: "session-1" });
      const res = createMockRes();

      await getSpeakerStatsHandler(req, res);

      expect(mockedGetSpeakerStats).toHaveBeenCalledWith("session-1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockStats);
    });

    it("returns 404 when sessionId has no stats", async () => {
      mockedGetSpeakerStats.mockResolvedValue(null);

      const req = createMockReq({ sessionId: "no-stats-session" });
      const res = createMockRes();

      await getSpeakerStatsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Speaker stats not found for session: no-stats-session",
      });
    });

    it("returns 400 for invalid sessionId format", async () => {
      const req = createMockReq({ sessionId: "invalid session id!@#" });
      const res = createMockRes();

      await getSpeakerStatsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid sessionId format",
      });
      expect(mockedGetSpeakerStats).not.toHaveBeenCalled();
    });

    it("returns 400 for empty sessionId", async () => {
      const req = createMockReq({ sessionId: "" });
      const res = createMockRes();

      await getSpeakerStatsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid sessionId format",
      });
    });

    it("returns 400 when sessionId param is missing", async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await getSpeakerStatsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 404 when SessionNotFoundError is thrown", async () => {
      mockedGetSpeakerStats.mockRejectedValue(
        new SessionNotFoundError("session-404")
      );

      const req = createMockReq({ sessionId: "session-404" });
      const res = createMockRes();

      await getSpeakerStatsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Session not found: session-404",
      });
    });

    it("returns 500 for unexpected errors", async () => {
      mockedGetSpeakerStats.mockRejectedValue(new Error("Database connection failed"));

      const req = createMockReq({ sessionId: "session-err" });
      const res = createMockRes();

      await getSpeakerStatsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Internal server error",
      });
    });
  });
});
