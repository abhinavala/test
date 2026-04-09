import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExportRecord } from "../../types/export.js";
import { ExportFormat } from "../../types/export.js";

// Mock the exportHistory model
vi.mock("../../models/exportHistory.js", () => ({
  findExport: vi.fn(),
  createExport: vi.fn(),
  getExportHistory: vi.fn(),
  getExportById: vi.fn(),
}));

// Mock the formatters using class syntax
vi.mock("../../formatters/markdownFormatter.js", () => ({
  MarkdownFormatter: class {
    format() {
      return {
        content: "# Meeting Notes\n\nFormatted content",
        contentHash: "abc123hash",
        exportId: "export-1",
        metadata: {
          sessionId: "session-1",
          format: "markdown",
          generatedAt: "2026-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
      };
    }
  },
}));

vi.mock("../../formatters/plainTextFormatter.js", () => ({
  PlainTextFormatter: class {
    format() {
      return {
        content: "Meeting Notes\n============\n\nFormatted content",
        contentHash: "def456hash",
        exportId: "export-2",
        metadata: {
          sessionId: "session-1",
          format: "plaintext",
          generatedAt: "2026-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
      };
    }
  },
}));

import { exportService, ExportServiceError } from "../../services/exportService.js";
import {
  findExport,
  createExport,
  getExportHistory,
  getExportById,
} from "../../models/exportHistory.js";

const mockedFindExport = vi.mocked(findExport);
const mockedCreateExport = vi.mocked(createExport);
const mockedGetExportHistory = vi.mocked(getExportHistory);
const mockedGetExportById = vi.mocked(getExportById);

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
      status: "open" as const,
      priority: "high" as const,
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

const cachedRecord: ExportRecord = {
  id: "record-1",
  sessionId: "session-1",
  format: ExportFormat.MARKDOWN,
  content: "# Cached Content",
  contentHash: "cached-hash",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("exportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateExport", () => {
    it("returns cached export when sessionId+format exists in database", async () => {
      mockedFindExport.mockResolvedValue(cachedRecord);

      const result = await exportService.generateExport({
        sessionId: "session-1",
        format: "markdown",
        meetingData: sampleMeetingData,
      });

      expect(result).toEqual(cachedRecord);
      expect(mockedFindExport).toHaveBeenCalledWith(
        "session-1",
        ExportFormat.MARKDOWN
      );
      // Should NOT call createExport when cache hit
      expect(mockedCreateExport).not.toHaveBeenCalled();
    });

    it("throws ExportServiceError when sessionId is invalid or missing", async () => {
      await expect(
        exportService.generateExport({
          sessionId: "",
          format: "markdown",
          meetingData: sampleMeetingData,
        })
      ).rejects.toThrow(ExportServiceError);

      await expect(
        exportService.generateExport({
          sessionId: "",
          format: "markdown",
          meetingData: sampleMeetingData,
        })
      ).rejects.toMatchObject({
        code: "INVALID_SESSION",
        context: { sessionId: "" },
      });

      // Whitespace-only sessionId
      await expect(
        exportService.generateExport({
          sessionId: "   ",
          format: "markdown",
          meetingData: sampleMeetingData,
        })
      ).rejects.toThrow(ExportServiceError);

      // Should not attempt formatting or DB calls
      expect(mockedFindExport).not.toHaveBeenCalled();
      expect(mockedCreateExport).not.toHaveBeenCalled();
    });

    it("successfully creates new export when not cached and saves to database", async () => {
      mockedFindExport.mockResolvedValue(null);

      const newRecord: ExportRecord = {
        id: "record-new",
        sessionId: "session-1",
        format: ExportFormat.MARKDOWN,
        content: "# Meeting Notes\n\nFormatted content",
        contentHash: "abc123hash",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };
      mockedCreateExport.mockResolvedValue(newRecord);

      const result = await exportService.generateExport({
        sessionId: "session-1",
        format: "markdown",
        meetingData: sampleMeetingData,
      });

      expect(result).toEqual(newRecord);
      expect(mockedFindExport).toHaveBeenCalledWith(
        "session-1",
        ExportFormat.MARKDOWN
      );
      expect(mockedCreateExport).toHaveBeenCalledWith({
        sessionId: "session-1",
        format: ExportFormat.MARKDOWN,
        content: "# Meeting Notes\n\nFormatted content",
      });
    });

    it("creates plaintext export when format is plaintext", async () => {
      mockedFindExport.mockResolvedValue(null);

      const newRecord: ExportRecord = {
        id: "record-pt",
        sessionId: "session-1",
        format: ExportFormat.JSON,
        content: "Meeting Notes\n============\n\nFormatted content",
        contentHash: "def456hash",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };
      mockedCreateExport.mockResolvedValue(newRecord);

      const result = await exportService.generateExport({
        sessionId: "session-1",
        format: "plaintext",
        meetingData: sampleMeetingData,
      });

      expect(result).toEqual(newRecord);
      expect(mockedCreateExport).toHaveBeenCalledWith({
        sessionId: "session-1",
        format: ExportFormat.JSON,
        content: "Meeting Notes\n============\n\nFormatted content",
      });
    });

    it("throws UNSUPPORTED_FORMAT for invalid format", async () => {
      await expect(
        exportService.generateExport({
          sessionId: "session-1",
          format: "pdf" as any,
          meetingData: sampleMeetingData,
        })
      ).rejects.toMatchObject({
        code: "UNSUPPORTED_FORMAT",
      });
    });

    it("throws DATABASE_ERROR when findExport fails", async () => {
      mockedFindExport.mockRejectedValue(new Error("DB connection lost"));

      await expect(
        exportService.generateExport({
          sessionId: "session-1",
          format: "markdown",
          meetingData: sampleMeetingData,
        })
      ).rejects.toMatchObject({
        code: "DATABASE_ERROR",
      });
    });

    it("throws DATABASE_ERROR when createExport fails", async () => {
      mockedFindExport.mockResolvedValue(null);
      mockedCreateExport.mockRejectedValue(new Error("DB write failed"));

      await expect(
        exportService.generateExport({
          sessionId: "session-1",
          format: "markdown",
          meetingData: sampleMeetingData,
        })
      ).rejects.toMatchObject({
        code: "DATABASE_ERROR",
      });
    });
  });

  describe("getHistory", () => {
    it("returns export history for a session", async () => {
      mockedGetExportHistory.mockResolvedValue([cachedRecord]);

      const result = await exportService.getHistory("session-1");
      expect(result).toEqual([cachedRecord]);
      expect(mockedGetExportHistory).toHaveBeenCalledWith("session-1");
    });

    it("throws INVALID_SESSION for empty sessionId", async () => {
      await expect(exportService.getHistory("")).rejects.toMatchObject({
        code: "INVALID_SESSION",
      });
    });

    it("throws DATABASE_ERROR on failure", async () => {
      mockedGetExportHistory.mockRejectedValue(new Error("DB error"));

      await expect(
        exportService.getHistory("session-1")
      ).rejects.toMatchObject({
        code: "DATABASE_ERROR",
      });
    });
  });

  describe("getById", () => {
    it("returns export by ID", async () => {
      mockedGetExportById.mockResolvedValue(cachedRecord);

      const result = await exportService.getById("record-1");
      expect(result).toEqual(cachedRecord);
    });

    it("returns null when not found", async () => {
      mockedGetExportById.mockResolvedValue(null);

      const result = await exportService.getById("nonexistent");
      expect(result).toBeNull();
    });

    it("throws VALIDATION_ERROR for empty ID", async () => {
      await expect(exportService.getById("")).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });
  });

  describe("validateRequest", () => {
    it("returns valid for correct inputs", () => {
      const result = exportService.validateRequest({
        sessionId: "session-1",
        format: "markdown",
      });
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it("returns errors for invalid sessionId", () => {
      const result = exportService.validateRequest({
        sessionId: "",
        format: "markdown",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it("returns errors for unsupported format", () => {
      const result = exportService.validateRequest({
        sessionId: "session-1",
        format: "pdf",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it("returns multiple errors for multiple invalid fields", () => {
      const result = exportService.validateRequest({
        sessionId: "",
        format: "pdf",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });
});
