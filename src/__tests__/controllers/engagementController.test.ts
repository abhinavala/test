import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const { mockedGetBySession, mockedGetByParticipant } = vi.hoisted(() => ({
  mockedGetBySession: vi.fn(),
  mockedGetByParticipant: vi.fn(),
}));

vi.mock("../../models/participantEngagementScore.js", () => ({
  getEngagementScoresBySession: mockedGetBySession,
  getEngagementScoreByParticipant: mockedGetByParticipant,
}));

import { getEngagementScores } from "../../controllers/engagementController.js";

function createMockReq(
  params: Record<string, string> = {},
  query: Record<string, string> = {},
): Request {
  return { params, query } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const mockScores = [
  {
    id: "score-1",
    sessionId: "session-1",
    participantId: "participant-1",
    score: 85,
    talkTimeRatio: 0.4,
    questionCount: 5,
    responseRate: 0.8,
    sentimentScore: 0.6,
    calculatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "score-2",
    sessionId: "session-1",
    participantId: "participant-2",
    score: 65,
    talkTimeRatio: 0.3,
    questionCount: 2,
    responseRate: 0.6,
    sentimentScore: 0.2,
    calculatedAt: new Date("2026-01-01T00:00:00Z"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("engagementController", () => {
  describe("getEngagementScores", () => {
    it("returns 200 with all participant scores when sessionId exists", async () => {
      mockedGetBySession.mockResolvedValue(mockScores);

      const req = createMockReq({ sessionId: "session-1" });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(mockedGetBySession).toHaveBeenCalledWith("session-1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        scores: mockScores,
        summary: {
          averageScore: 75,
          highestScore: 85,
          lowestScore: 65,
          participantCount: 2,
        },
      });
    });

    it("returns 404 when no engagement scores exist for sessionId", async () => {
      mockedGetBySession.mockResolvedValue([]);

      const req = createMockReq({ sessionId: "empty-session" });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Engagement scores not found for session: empty-session",
      });
    });

    it("returns 400 when sessionId parameter is invalid format", async () => {
      const req = createMockReq({ sessionId: "invalid session!@#" });
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
      const req = createMockReq({ sessionId: "" });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid sessionId format",
      });
    });

    it("returns 400 when sessionId param is missing", async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("filters by participantId when query parameter is provided", async () => {
      mockedGetByParticipant.mockResolvedValue(mockScores[0]!);

      const req = createMockReq(
        { sessionId: "session-1" },
        { participantId: "participant-1" },
      );
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(mockedGetByParticipant).toHaveBeenCalledWith("session-1", "participant-1");
      expect(mockedGetBySession).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        scores: [mockScores[0]],
        summary: {
          averageScore: 85,
          highestScore: 85,
          lowestScore: 85,
          participantCount: 1,
        },
      });
    });

    it("returns 404 when participantId has no scores", async () => {
      mockedGetByParticipant.mockResolvedValue(null);

      const req = createMockReq(
        { sessionId: "session-1" },
        { participantId: "unknown-participant" },
      );
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Engagement scores not found for session: session-1",
      });
    });

    it("returns 500 for unexpected errors", async () => {
      mockedGetBySession.mockRejectedValue(new Error("Database connection failed"));

      const req = createMockReq({ sessionId: "session-err" });
      const res = createMockRes();

      await getEngagementScores(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      });
    });
  });
});
