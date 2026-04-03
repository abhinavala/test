import type { Request, Response } from "express";
import { getSpeakerStats } from "../models/speakerStats.js";
import { SessionNotFoundError } from "../types/errors.js";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isValidSessionId(sessionId: string): boolean {
  return sessionId.length > 0 && sessionId.length <= 256 && SESSION_ID_PATTERN.test(sessionId);
}

export async function getSpeakerStatsHandler(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;

  if (!sessionId || !isValidSessionId(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId format" });
    return;
  }

  try {
    const result = await getSpeakerStats(sessionId);

    if (!result) {
      res.status(404).json({ error: `Speaker stats not found for session: ${sessionId}` });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      res.status(404).json({ error: `Session not found: ${sessionId}` });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
}
