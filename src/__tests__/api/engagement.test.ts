import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  getEngagementScores,
  calculateEngagementScores,
} from "../../controllers/engagementController.js";

vi.mock("../../models/participantEngagementScore.js", () => ({
  getEngagementScoresBySession: vi.fn(),
  getEngagementScoreByParticipant: vi.fn(),
  bulkSaveEngagementScores: vi.fn(),
  EngagementCalculationError: class EngagementCalculationError extends Error {
    readonly code: string;
    readonly sessionId?: string;
    constructor(message: string, code: string, sessionId?: string) {
      super(message);
      this.name = "EngagementCalculationError";
      this.code = code;
      this.sessionId = sessionId;
    }
  },
}));

vi.mock("../../services/engagementScoringService.js", () => ({
  calculateSessionEngagement: vi.fn(),
}));

import {
  getEngagementScoresBySession,
  getEngagementScoreByParticipant,
  bulkSaveEngagementScores,
  EngagementCalculationError,
} from "../../models/participantEngagementScore.js";
import { calculateSessionEngagement } from "../../services/engagementScoringService.js";

const mockedGetBySession = vi.mocked(getEngagementScoresBySession);
const mockedGetByParticipant = vi.mocked(getEngagementScoreByParticipant);
const mockedBulkSave = vi.mocked(bulkSaveEngagementScores);
const mockedCalculateSession = vi.mocked(calculateSessionEngagement);

function createMockReq(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
} = {}): Request {
  return {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body ?? {},
    headers: overrides.headers ?? {},
  } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const mockScore = {
  id: "score-1",
  sessionId: "session-1",
  participantId: "participant-1",
  score: 75.5,
  talkTimeRatio: 0.35,
  questionCount: 3,
  responseRate: 0.6,
  sentimentScore: 0.2,
  calculatedAt: new Date("2026-01-01T00:00:00Z"),
};

const mockScore2 = {
  ...mockScore,
  id: "score-2",
  participantId: "participant-2",
  score: 62.0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("engagement API", () => {
  describe("GET /sessions/:sessionId/engagement-scores", () => {
    it("returns engagement scores for valid session", async () => {
      mockedGetBySession.mockResolvedValue([mockScore, mockScore2]);

      const req = createMockReq({ params: { sessionId: "session-1" } });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(mockedGetBySession).toHaveBeenCalledWith("session-1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        sessionId: "session-1",
        scores: [mockScore, mockScore2],
      });
    });

    it("returns 404 for non-existent session", async () => {
      mockedGetBySession.mockResolvedValue([]);

      const req = createMockReq({ params: { sessionId: "invalid-id" } });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Session not found",
      });
    });

    it("returns 400 for invalid sessionId format", async () => {
      const req = createMockReq({ params: { sessionId: "invalid session!@#" } });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid sessionId format",
      });
      expect(mockedGetBySession).not.toHaveBeenCalled();
    });

    it("returns 400 for empty sessionId", async () => {
      const req = createMockReq({ params: { sessionId: "" } });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns score for specific participant via query param", async () => {
      mockedGetByParticipant.mockResolvedValue(mockScore);

      const req = createMockReq({
        params: { sessionId: "session-1" },
        query: { participantId: "participant-1" },
      });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(mockedGetByParticipant).toHaveBeenCalledWith("session-1", "participant-1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        sessionId: "session-1",
        scores: [mockScore],
      });
    });

    it("returns 404 when participant not found", async () => {
      mockedGetByParticipant.mockResolvedValue(null);

      const req = createMockReq({
        params: { sessionId: "session-1" },
        query: { participantId: "unknown" },
      });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Session not found",
      });
    });

    it("returns 500 for unexpected errors", async () => {
      mockedGetBySession.mockRejectedValue(new Error("Database failed"));

      const req = createMockReq({ params: { sessionId: "session-1" } });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      });
    });

    it("returns 400 for EngagementCalculationError", async () => {
      mockedGetBySession.mockRejectedValue(
        new EngagementCalculationError("Bad data", "VALIDATION_ERROR", "session-1")
      );

      const req = createMockReq({ params: { sessionId: "session-1" } });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Bad data",
      });
    });
  });

  describe("POST /sessions/:sessionId/engagement-scores/calculate", () => {
    const validBody = {
      segments: [
        {
          id: "seg-1",
          sessionId: "session-1",
          speakerId: "participant-1",
          startTime: 0,
          endTime: 30000,
          text: "Hello, how are you?",
        },
        {
          id: "seg-2",
          sessionId: "session-1",
          speakerId: "participant-2",
          startTime: 30000,
          endTime: 60000,
          text: "I am fine, thanks.",
        },
      ],
      sessionDuration: 60000,
    };

    const calculatedAt = new Date("2026-01-01T00:00:00Z");

    it("triggers score calculation and returns results", async () => {
      const calculationResult = {
        sessionId: "session-1",
        averageScore: 68.75,
        participantScores: [mockScore, mockScore2],
        calculatedAt,
      };
      mockedCalculateSession.mockResolvedValue(calculationResult);
      mockedBulkSave.mockResolvedValue([mockScore, mockScore2]);

      const req = createMockReq({
        params: { sessionId: "session-1" },
        body: validBody,
      });
      const res = createMockRes();

      await calculateEngagementScores(req, res);

      expect(mockedCalculateSession).toHaveBeenCalledWith({
        sessionId: "session-1",
        segments: validBody.segments,
        sessionDuration: 60000,
        sentimentScores: undefined,
      });
      expect(mockedBulkSave).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        sessionId: "session-1",
        scores: [mockScore, mockScore2],
        summary: {
          averageScore: 68.75,
          participantCount: 2,
          calculatedAt,
        },
      });
    });

    it("returns 400 for invalid sessionId format", async () => {
      const req = createMockReq({
        params: { sessionId: "bad id!" },
        body: validBody,
      });
      const res = createMockRes();

      await calculateEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid sessionId format",
      });
    });

    it("returns 400 when segments is missing", async () => {
      const req = createMockReq({
        params: { sessionId: "session-1" },
        body: { sessionDuration: 60000 },
      });
      const res = createMockRes();

      await calculateEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "segments is required and must be a non-empty array",
      });
    });

    it("returns 400 when segments is empty", async () => {
      const req = createMockReq({
        params: { sessionId: "session-1" },
        body: { segments: [], sessionDuration: 60000 },
      });
      const res = createMockRes();

      await calculateEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "segments is required and must be a non-empty array",
      });
    });

    it("returns 400 when sessionDuration is missing", async () => {
      const req = createMockReq({
        params: { sessionId: "session-1" },
        body: { segments: validBody.segments },
      });
      const res = createMockRes();

      await calculateEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "sessionDuration is required and must be a positive number",
      });
    });

    it("returns 400 when sessionDuration is zero", async () => {
      const req = createMockReq({
        params: { sessionId: "session-1" },
        body: { segments: validBody.segments, sessionDuration: 0 },
      });
      const res = createMockRes();

      await calculateEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("passes sentimentScores as a Map when provided", async () => {
      const calculationResult = {
        sessionId: "session-1",
        averageScore: 70,
        participantScores: [mockScore],
        calculatedAt,
      };
      mockedCalculateSession.mockResolvedValue(calculationResult);
      mockedBulkSave.mockResolvedValue([mockScore]);

      const req = createMockReq({
        params: { sessionId: "session-1" },
        body: {
          ...validBody,
          sentimentScores: { "participant-1": 0.5, "participant-2": -0.3 },
        },
      });
      const res = createMockRes();

      await calculateEngagementScores(req, res);

      const callArg = mockedCalculateSession.mock.calls[0][0];
      expect(callArg.sentimentScores).toBeInstanceOf(Map);
      expect(callArg.sentimentScores!.get("participant-1")).toBe(0.5);
      expect(callArg.sentimentScores!.get("participant-2")).toBe(-0.3);
    });

    it("returns 500 for unexpected errors", async () => {
      mockedCalculateSession.mockRejectedValue(new Error("Unexpected"));

      const req = createMockReq({
        params: { sessionId: "session-1" },
        body: validBody,
      });
      const res = createMockRes();

      await calculateEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      });
    });

    it("returns 400 for EngagementCalculationError during calculation", async () => {
      mockedCalculateSession.mockRejectedValue(
        new EngagementCalculationError("Invalid weights", "VALIDATION_ERROR", "session-1")
      );

      const req = createMockReq({
        params: { sessionId: "session-1" },
        body: validBody,
      });
      const res = createMockRes();

      await calculateEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid weights",
      });
    });
  });
});
