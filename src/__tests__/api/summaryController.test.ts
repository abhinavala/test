import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { MeetingSessionSummary } from "../../types/meeting-summary.js";
import type { SummaryGenerationResult } from "../../types/summary-generation.js";
import { SummaryGenerationError } from "../../types/errors.js";
import { NextStepPriority } from "../../types/meeting-summary.js";

// Mock the service module before importing the controller
vi.mock("../../services/summaryGenerationService.js", () => ({
  generateSummary: vi.fn(),
  getSummary: vi.fn(),
  getGenerationProgress: vi.fn(),
}));

// Import after mocking
const {
  generateSummary,
  getSummary,
  getGenerationProgress,
} = await import("../../services/summaryGenerationService.js");

const {
  generateSummaryHandler,
  getSummaryHandler,
  getProgressHandler,
  listSummariesHandler,
} = await import("../../controllers/summaryController.js");

const {
  validateSessionId,
  validateGenerateBody,
  requireAuth,
} = await import("../../middleware/summaryValidation.js");

const mockGenerateSummary = vi.mocked(generateSummary);
const mockGetSummary = vi.mocked(getSummary);
const mockGetGenerationProgress = vi.mocked(getGenerationProgress);

function createMockRequest(overrides: Partial<Request> & { query?: Record<string, string> } = {}): Request {
  return {
    params: {},
    body: {},
    headers: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & {
  _status: number;
  _json: unknown;
} {
  const res = {
    _status: 0,
    _json: undefined as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
    headers: {},
  } as unknown as Response & { _status: number; _json: unknown };
  return res;
}

function makeSummary(
  sessionId: string,
  overrides: Partial<MeetingSessionSummary> = {},
): MeetingSessionSummary {
  return {
    id: "sum-1",
    meetingSessionId: sessionId,
    keyDecisions: [],
    openQuestions: [],
    nextSteps: [],
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    generatedBy: "ai-summary-service",
    ...overrides,
  };
}

describe("summaryController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateSummaryHandler", () => {
    it("returns 201 with valid summary when given valid session ID", async () => {
      const sessionId = "session-abc";
      const summary = makeSummary(sessionId, {
        keyDecisions: [
          {
            id: "kd-1",
            description: "Use microservices",
            participants: ["Alice"],
          },
        ],
        nextSteps: [
          {
            id: "ns-1",
            description: "Set up CI",
            priority: NextStepPriority.HIGH,
          },
        ],
      });
      const result: SummaryGenerationResult = {
        summary,
        wasRegenerated: false,
        processingTime: 150,
      };
      mockGenerateSummary.mockResolvedValue(result);

      const req = createMockRequest({
        params: { sessionId },
        body: { includeTranscript: true },
      });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(201);
      const body = res._json as { success: boolean; summary: MeetingSessionSummary };
      expect(body.success).toBe(true);
      expect(body.summary.id).toBe("sum-1");
      expect(body.summary.meetingSessionId).toBe(sessionId);
    });

    it("returns 404 when meeting session does not exist", async () => {
      mockGenerateSummary.mockRejectedValue(
        new SummaryGenerationError(
          "Meeting session not found",
          "SESSION_NOT_FOUND",
          "nonexistent",
        ),
      );

      const req = createMockRequest({ params: { sessionId: "nonexistent" } });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(404);
      const body = res._json as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain("Meeting session not found");
    });

    it("returns 202 when async mode is requested", async () => {
      const sessionId = "session-async";
      mockGenerateSummary.mockResolvedValue({
        summary: makeSummary(sessionId),
        wasRegenerated: false,
        processingTime: 5,
      });

      const req = createMockRequest({
        params: { sessionId },
        body: { async: true },
      });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(202);
      const body = res._json as { success: boolean; message: string };
      expect(body.success).toBe(true);
      expect(body.message).toContain("started");
    });

    it("returns 409 when generation is already in progress", async () => {
      mockGenerateSummary.mockRejectedValue(
        new SummaryGenerationError(
          "Summary generation already in progress for this session",
          "INVALID_SESSION_STATE",
          "session-locked",
        ),
      );

      const req = createMockRequest({ params: { sessionId: "session-locked" } });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(409);
    });

    it("returns 422 when insufficient data", async () => {
      mockGenerateSummary.mockRejectedValue(
        new SummaryGenerationError(
          "No transcript or action item data available",
          "INSUFFICIENT_DATA",
          "session-empty",
        ),
      );

      const req = createMockRequest({ params: { sessionId: "session-empty" } });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(422);
    });

    it("returns 500 on unexpected error", async () => {
      mockGenerateSummary.mockRejectedValue(new Error("Unexpected"));

      const req = createMockRequest({ params: { sessionId: "session-x" } });
      const res = createMockResponse();

      await generateSummaryHandler(req, res);

      expect(res._status).toBe(500);
      const body = res._json as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe("Internal server error");
    });
  });

  describe("getSummaryHandler", () => {
    it("returns 200 with summary when it exists", async () => {
      const summary = makeSummary("session-get");
      mockGetSummary.mockResolvedValue(summary);

      const req = createMockRequest({ params: { sessionId: "session-get" } });
      const res = createMockResponse();

      await getSummaryHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as { success: boolean; summary: MeetingSessionSummary };
      expect(body.success).toBe(true);
      expect(body.summary.meetingSessionId).toBe("session-get");
    });

    it("returns 404 when summary does not exist", async () => {
      mockGetSummary.mockResolvedValue(null);

      const req = createMockRequest({ params: { sessionId: "session-missing" } });
      const res = createMockResponse();

      await getSummaryHandler(req, res);

      expect(res._status).toBe(404);
      const body = res._json as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain("not found");
    });

    it("returns 401 when request lacks valid authentication token", async () => {
      const req = createMockRequest({
        params: { sessionId: "session-auth" },
        headers: {},
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(res._status).toBe(401);
      const body = res._json as { success: boolean; error: string };
      expect(body.error).toContain("Unauthorized");
      expect(next).not.toHaveBeenCalled();
      // Verify no summary data leaks in the response
      expect(body).not.toHaveProperty("summary");
    });
  });

  describe("getProgressHandler", () => {
    it("returns 200 with progress when task exists", async () => {
      mockGetGenerationProgress.mockReturnValue({
        meetingSessionId: "session-prog",
        status: "processing",
        progress: 50,
        startedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const req = createMockRequest({ params: { sessionId: "session-prog" } });
      const res = createMockResponse();

      await getProgressHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as { success: boolean; progress: { status: string } };
      expect(body.success).toBe(true);
      expect(body.progress.status).toBe("processing");
    });

    it("returns 404 when no generation task exists", async () => {
      mockGetGenerationProgress.mockReturnValue(null);

      const req = createMockRequest({ params: { sessionId: "session-none" } });
      const res = createMockResponse();

      await getProgressHandler(req, res);

      expect(res._status).toBe(404);
    });
  });

  describe("listSummariesHandler", () => {
    it("returns 200 with empty list when no filter provided", async () => {
      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await listSummariesHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as { success: boolean; summaries: unknown[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
      expect(body.success).toBe(true);
      expect(body.summaries).toEqual([]);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(20);
    });

    it("returns summary when filtered by meetingSessionId", async () => {
      const summary = makeSummary("session-list");
      mockGetSummary.mockResolvedValue(summary);

      const req = createMockRequest({
        query: { meetingSessionId: "session-list" },
      });
      const res = createMockResponse();

      await listSummariesHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as { success: boolean; summaries: MeetingSessionSummary[]; pagination: { total: number } };
      expect(body.success).toBe(true);
      expect(body.summaries).toHaveLength(1);
      expect(body.summaries[0]!.meetingSessionId).toBe("session-list");
      expect(body.pagination.total).toBe(1);
    });

    it("returns empty list when filtered session has no summary", async () => {
      mockGetSummary.mockResolvedValue(null);

      const req = createMockRequest({
        query: { meetingSessionId: "session-none" },
      });
      const res = createMockResponse();

      await listSummariesHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as { success: boolean; summaries: unknown[]; pagination: { total: number } };
      expect(body.summaries).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it("respects page and pageSize query params", async () => {
      const req = createMockRequest({
        query: { page: "2", pageSize: "10" },
      });
      const res = createMockResponse();

      await listSummariesHandler(req, res);

      expect(res._status).toBe(200);
      const body = res._json as { pagination: { page: number; pageSize: number } };
      expect(body.pagination.page).toBe(2);
      expect(body.pagination.pageSize).toBe(10);
    });
  });

  describe("validateSessionId middleware", () => {
    it("calls next for valid session ID", () => {
      const req = createMockRequest({ params: { sessionId: "valid-session-123" } });
      const res = createMockResponse();
      const next = vi.fn();

      validateSessionId(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("returns 400 for empty session ID", () => {
      const req = createMockRequest({ params: { sessionId: "" } });
      const res = createMockResponse();
      const next = vi.fn();

      validateSessionId(req, res, next);

      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 400 for session ID with invalid characters", () => {
      const req = createMockRequest({ params: { sessionId: "invalid session!" } });
      const res = createMockResponse();
      const next = vi.fn();

      validateSessionId(req, res, next);

      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("validateGenerateBody middleware", () => {
    it("calls next for valid body", () => {
      const req = createMockRequest({
        body: { includeTranscript: true, includeActionItems: false },
      });
      const res = createMockResponse();
      const next = vi.fn();

      validateGenerateBody(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("returns 400 for invalid includeTranscript type", () => {
      const req = createMockRequest({
        body: { includeTranscript: "yes" },
      });
      const res = createMockResponse();
      const next = vi.fn();

      validateGenerateBody(req, res, next);

      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("requireAuth middleware", () => {
    it("calls next with valid Bearer token", () => {
      const req = createMockRequest({
        headers: { authorization: "Bearer valid-token-123" },
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("returns 401 with missing authorization header", () => {
      const req = createMockRequest({ headers: {} });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(res._status).toBe(401);
      const body = res._json as { error: string };
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 401 with invalid authorization format", () => {
      const req = createMockRequest({
        headers: { authorization: "Basic abc123" },
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(res._status).toBe(401);
    });

    it("returns 401 with empty Bearer token", () => {
      const req = createMockRequest({
        headers: { authorization: "Bearer " },
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(res._status).toBe(401);
    });
  });
});
