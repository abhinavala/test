import type { Request, Response } from "express";
import { actionItemsAggregationService } from "../services/actionItemsAggregationService.js";
import type { ActionItemFilter, AggregationStrategy } from "../types/actionItems.js";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const VALID_STRATEGIES: AggregationStrategy[] = ["by-participant", "by-meeting", "by-project"];

function isValidSessionId(sessionId: string): boolean {
  return sessionId.length > 0 && sessionId.length <= 256 && SESSION_ID_PATTERN.test(sessionId);
}

/**
 * GET /sessions/:sessionId/action-items
 * Retrieves aggregated action items relevant to the session's participants.
 */
export async function getSessionActionItemsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { sessionId } = req.params;

  if (!sessionId || !isValidSessionId(sessionId)) {
    res.status(400).json({ success: false, error: "Invalid sessionId format" });
    return;
  }

  const lookbackDays = Math.min(365, Math.max(1, parseInt(req.query.lookbackDays as string, 10) || 30));
  const maxItems = Math.min(200, Math.max(1, parseInt(req.query.maxItems as string, 10) || 50));

  try {
    const result = await actionItemsAggregationService.getSessionActionItems(
      sessionId,
      lookbackDays,
      maxItems,
    );

    res.status(200).json({ success: true, ...result });
  } catch {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /api/action-items
 * Retrieves aggregated action items with configurable strategy and filters.
 */
export async function getAggregatedActionItemsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const lookbackDays = Math.min(365, Math.max(1, parseInt(req.query.lookbackDays as string, 10) || 30));
  const maxItems = Math.min(200, Math.max(1, parseInt(req.query.maxItems as string, 10) || 50));
  const strategy = (req.query.strategy as string) || "by-participant";

  if (!VALID_STRATEGIES.includes(strategy as AggregationStrategy)) {
    res.status(400).json({
      success: false,
      error: `Invalid strategy. Must be one of: ${VALID_STRATEGIES.join(", ")}`,
    });
    return;
  }

  const participantIds = req.query.participantIds
    ? (req.query.participantIds as string).split(",").map((id) => id.trim()).filter(Boolean)
    : undefined;

  try {
    const result = await actionItemsAggregationService.aggregateActionItems({
      lookbackDays,
      maxItemsPerGroup: maxItems,
      strategy: strategy as AggregationStrategy,
      participantIds,
    });

    res.status(200).json({ success: true, ...result });
  } catch {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * POST /api/action-items/aggregate
 * Aggregates action items for specified participants with filtering options.
 */
export async function aggregateActionItemsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const filter: ActionItemFilter = {
    participantIds: Array.isArray(body.participantIds) ? body.participantIds as string[] : undefined,
    meetingSessionIds: Array.isArray(body.meetingSessionIds) ? body.meetingSessionIds as string[] : undefined,
    priorities: Array.isArray(body.priorities) ? body.priorities as string[] : undefined,
    overdueOnly: typeof body.overdueOnly === "boolean" ? body.overdueOnly : undefined,
    lookbackDays: typeof body.lookbackDays === "number"
      ? Math.min(365, Math.max(1, body.lookbackDays))
      : undefined,
    maxItems: typeof body.maxItems === "number"
      ? Math.min(200, Math.max(1, body.maxItems))
      : undefined,
  };

  try {
    const result = await actionItemsAggregationService.aggregateActionItemsForParticipants(filter);

    res.status(200).json({ success: true, ...result });
  } catch {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /api/action-items/participant/:participantId
 * Retrieves action items for a specific participant.
 */
export async function getParticipantActionItemsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { participantId } = req.params;

  if (!participantId || participantId.length === 0 || participantId.length > 256) {
    res.status(400).json({ success: false, error: "Invalid participantId" });
    return;
  }

  const lookbackDays = Math.min(365, Math.max(1, parseInt(req.query.lookbackDays as string, 10) || 30));
  const maxItems = Math.min(200, Math.max(1, parseInt(req.query.maxItems as string, 10) || 50));

  try {
    const items = await actionItemsAggregationService.getParticipantActionItems(
      participantId,
      lookbackDays,
      maxItems,
    );

    res.status(200).json({
      success: true,
      participantId,
      items,
      totalItems: items.length,
      lookbackDays,
    });
  } catch {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}
