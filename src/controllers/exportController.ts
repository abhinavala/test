import type { Request, Response, NextFunction } from "express";
import { exportService, ExportServiceError } from "../services/exportService.js";
import type { ExportFormat as FormatterFormat } from "../types/exportContent.js";
import type { RawMeetingData } from "../utils/exportUtils.js";
import type {
  GenerateExportRequestBody,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "../types/api.js";
import type { ExportRecord } from "../types/export.js";

function successResponse<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function errorResponse(error: string, details?: unknown): ApiErrorResponse {
  return {
    success: false,
    error,
    details,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Map ExportServiceError codes to HTTP status codes.
 */
function mapErrorToStatus(err: ExportServiceError): number {
  switch (err.code) {
    case "INVALID_SESSION":
    case "UNSUPPORTED_FORMAT":
    case "VALIDATION_ERROR":
      return 400;
    case "FORMATTER_ERROR":
    case "DATABASE_ERROR":
      return 500;
    default:
      return 500;
  }
}

export const exportController = {
  /**
   * POST /api/exports — Generate a new export.
   */
  async generateExport(
    req: Request<object, unknown, GenerateExportRequestBody>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { sessionId, format, meetingData } = req.body;

      // Validate required fields are present
      if (!sessionId || typeof sessionId !== "string") {
        res.status(400).json(
          errorResponse("sessionId is required and must be a non-empty string")
        );
        return;
      }

      if (!format || typeof format !== "string") {
        res.status(400).json(
          errorResponse("format is required and must be a string")
        );
        return;
      }

      if (!meetingData || typeof meetingData !== "object") {
        res.status(400).json(
          errorResponse("meetingData is required and must be an object")
        );
        return;
      }

      const result = await exportService.generateExport({
        sessionId,
        format: format as FormatterFormat,
        meetingData: meetingData as RawMeetingData,
      });

      res.status(201).json(successResponse(result));
    } catch (err) {
      if (err instanceof ExportServiceError) {
        res.status(mapErrorToStatus(err)).json(
          errorResponse(err.message, err.context)
        );
        return;
      }
      next(err);
    }
  },

  /**
   * GET /api/exports/:sessionId/:format — Retrieve a specific export.
   */
  async getExport(
    req: Request<{ sessionId: string; format: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { sessionId, format } = req.params;

      // Use the service's getHistory and filter by format,
      // since findExport requires a DB ExportFormat enum
      const history = await exportService.getHistory(sessionId);
      const record = history.find(
        (r: ExportRecord) => r.format.toLowerCase() === format.toLowerCase()
      );

      if (!record) {
        res.status(404).json(
          errorResponse(
            `Export not found for session '${sessionId}' with format '${format}'`
          )
        );
        return;
      }

      res.status(200).json(successResponse(record));
    } catch (err) {
      if (err instanceof ExportServiceError) {
        res.status(mapErrorToStatus(err)).json(
          errorResponse(err.message, err.context)
        );
        return;
      }
      next(err);
    }
  },

  /**
   * GET /api/exports/:sessionId — List export history for a session.
   */
  async getExportHistory(
    req: Request<{ sessionId: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { sessionId } = req.params;

      const history = await exportService.getHistory(sessionId);
      res.status(200).json(successResponse(history));
    } catch (err) {
      if (err instanceof ExportServiceError) {
        res.status(mapErrorToStatus(err)).json(
          errorResponse(err.message, err.context)
        );
        return;
      }
      next(err);
    }
  },
};
