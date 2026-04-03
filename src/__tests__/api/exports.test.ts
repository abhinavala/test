import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { ExportRecord } from "../../types/export.js";
import { ExportFormat } from "../../types/export.js";

// Mock the exportService
vi.mock("../../services/exportService.js", () => {
  const ExportServiceError = class ExportServiceError extends Error {
    readonly code: string;
    readonly context: Record<string, unknown>;
    constructor(
      message: string,
      code: string,
      context: Record<string, unknown> = {}
    ) {
      super(message);
      this.name = "ExportServiceError";
      this.code = code;
      this.context = context;
    }
  };

  return {
    exportService: {
      generateExport: vi.fn(),
      getHistory: vi.fn(),
      getById: vi.fn(),
    },
    ExportServiceError,
  };
});

import { exportService, ExportServiceError } from "../../services/exportService.js";
import exportRoutes from "../../api/routes/exports.js";

const mockedGenerateExport = vi.mocked(exportService.generateExport);
const mockedGetHistory = vi.mocked(exportService.getHistory);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/exports", exportRoutes);
  // Global error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(500).json({
        success: false,
        error: "Internal server error",
        timestamp: new Date().toISOString(),
      });
    }
  );
  return app;
}

const sampleMeetingData = {
  metadata: {
    meetingId: "meeting-1",
    title: "Test Meeting",
    date: "2026-01-01T10:00:00.000Z",
    duration: 60,
    participants: ["Alice", "Bob"],
    organizer: "Alice",
  },
  summary: "A test meeting summary.",
  actionItems: [
    {
      id: "ai-1",
      description: "Follow up on test results",
      assigneeName: "Bob",
      status: "open",
      priority: "high",
    },
  ],
  transcript: [
    {
      speakerName: "Alice",
      timestamp: "2026-01-01T10:00:00.000Z",
      text: "Let's discuss the test results.",
    },
  ],
};

const sampleRecord: ExportRecord = {
  id: "record-1",
  sessionId: "session-1",
  format: ExportFormat.MARKDOWN,
  content: "# Meeting Notes\n\nFormatted content",
  contentHash: "abc123hash",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("Export API Routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe("POST /api/exports", () => {
    it("returns 201 with ExportRecord for valid request", async () => {
      mockedGenerateExport.mockResolvedValue(sampleRecord);

      const res = await request(app)
        .post("/api/exports")
        .send({
          sessionId: "session-1",
          format: "markdown",
          meetingData: sampleMeetingData,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: "record-1",
        sessionId: "session-1",
        content: "# Meeting Notes\n\nFormatted content",
      });
      expect(res.body.timestamp).toBeDefined();
      expect(mockedGenerateExport).toHaveBeenCalledWith({
        sessionId: "session-1",
        format: "markdown",
        meetingData: sampleMeetingData,
      });
    });

    it("returns 400 when sessionId is missing", async () => {
      const res = await request(app)
        .post("/api/exports")
        .send({
          format: "markdown",
          meetingData: sampleMeetingData,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/sessionId/);
    });

    it("returns 400 when format is missing", async () => {
      const res = await request(app)
        .post("/api/exports")
        .send({
          sessionId: "session-1",
          meetingData: sampleMeetingData,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/format/);
    });

    it("returns 400 when meetingData is missing", async () => {
      const res = await request(app)
        .post("/api/exports")
        .send({
          sessionId: "session-1",
          format: "markdown",
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/meetingData/);
    });

    it("returns 400 when request body is empty", async () => {
      const res = await request(app)
        .post("/api/exports")
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it("returns 400 when ExportService throws UNSUPPORTED_FORMAT", async () => {
      mockedGenerateExport.mockRejectedValue(
        new ExportServiceError(
          "Unsupported export format: pdf",
          "UNSUPPORTED_FORMAT",
          { format: "pdf" }
        )
      );

      const res = await request(app)
        .post("/api/exports")
        .send({
          sessionId: "session-1",
          format: "pdf",
          meetingData: sampleMeetingData,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Unsupported/);
    });

    it("returns 500 when ExportService throws DATABASE_ERROR", async () => {
      mockedGenerateExport.mockRejectedValue(
        new ExportServiceError(
          "Failed to save export to database",
          "DATABASE_ERROR",
          { cause: "DB write failed" }
        )
      );

      const res = await request(app)
        .post("/api/exports")
        .send({
          sessionId: "session-1",
          format: "markdown",
          meetingData: sampleMeetingData,
        })
        .expect(500);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/database/i);
    });
  });

  describe("GET /api/exports/:sessionId/:format", () => {
    it("returns 200 with export record when found", async () => {
      mockedGetHistory.mockResolvedValue([sampleRecord]);

      const res = await request(app)
        .get("/api/exports/session-1/MARKDOWN")
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: "record-1",
        sessionId: "session-1",
      });
    });

    it("returns 404 when export does not exist", async () => {
      mockedGetHistory.mockResolvedValue([]);

      const res = await request(app)
        .get("/api/exports/session-1/markdown")
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });

    it("returns 404 when session exists but format does not match", async () => {
      mockedGetHistory.mockResolvedValue([sampleRecord]); // MARKDOWN only

      const res = await request(app)
        .get("/api/exports/session-1/pdf")
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/not found/i);
    });

    it("returns 400 when ExportService throws INVALID_SESSION", async () => {
      mockedGetHistory.mockRejectedValue(
        new ExportServiceError(
          "Invalid or missing sessionId",
          "INVALID_SESSION",
          { sessionId: "" }
        )
      );

      const res = await request(app)
        .get("/api/exports/ /markdown")
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /api/exports/:sessionId", () => {
    it("returns 200 with export history", async () => {
      mockedGetHistory.mockResolvedValue([sampleRecord]);

      const res = await request(app)
        .get("/api/exports/session-1")
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it("returns 200 with empty array when no exports exist", async () => {
      mockedGetHistory.mockResolvedValue([]);

      const res = await request(app)
        .get("/api/exports/session-1")
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it("returns 400 for invalid session via ExportService", async () => {
      mockedGetHistory.mockRejectedValue(
        new ExportServiceError(
          "Invalid or missing sessionId",
          "INVALID_SESSION",
          { sessionId: "" }
        )
      );

      const res = await request(app)
        .get("/api/exports/%20")
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it("returns 500 when ExportService throws DATABASE_ERROR", async () => {
      mockedGetHistory.mockRejectedValue(
        new ExportServiceError(
          "Failed to retrieve export history",
          "DATABASE_ERROR",
          { cause: "DB error" }
        )
      );

      const res = await request(app)
        .get("/api/exports/session-1")
        .expect(500);

      expect(res.body.success).toBe(false);
    });
  });
});
