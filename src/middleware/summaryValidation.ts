import type { Request, Response, NextFunction } from "express";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isValidSessionId(sessionId: string): boolean {
  return (
    sessionId.length > 0 &&
    sessionId.length <= 256 &&
    SESSION_ID_PATTERN.test(sessionId)
  );
}

/**
 * Validates that the sessionId route parameter is present and well-formed.
 */
export function validateSessionId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { sessionId } = req.params;

  if (!sessionId || !isValidSessionId(sessionId)) {
    res.status(400).json({ success: false, error: "Invalid sessionId format" });
    return;
  }

  next();
}

/**
 * Validates the request body for summary generation.
 */
export function validateGenerateBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const body = req.body as Record<string, unknown> | undefined;

  if (body && typeof body !== "object") {
    res.status(400).json({ success: false, error: "Request body must be a JSON object" });
    return;
  }

  if (body?.includeTranscript !== undefined && typeof body.includeTranscript !== "boolean") {
    res
      .status(400)
      .json({ success: false, error: "includeTranscript must be a boolean" });
    return;
  }

  if (body?.includeActionItems !== undefined && typeof body.includeActionItems !== "boolean") {
    res
      .status(400)
      .json({ success: false, error: "includeActionItems must be a boolean" });
    return;
  }

  if (body?.async !== undefined && typeof body.async !== "boolean") {
    res.status(400).json({ success: false, error: "async must be a boolean" });
    return;
  }

  next();
}

/**
 * Validates that the request carries a valid authorization token.
 * Expects an Authorization header with a Bearer token.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.length <= 7) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  next();
}
