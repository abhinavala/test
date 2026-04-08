import path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma";
import { subDays, isBefore } from "date-fns";
import pkg from "lodash";
const { groupBy, orderBy, take } = pkg;
import type {
  AggregatedActionItem,
  AggregationConfig,
  AggregationResult,
  AggregationStrategy,
} from "../types/actionItems.js";
import {
  DEFAULT_AGGREGATION_CONFIG,
  PRIORITY_WEIGHTS,
} from "../types/actionItems.js";

function resolveDatabaseUrl(): string {
  const raw = process.env.SQLITE_URL || "file:./prisma/dev.db";
  if (raw.startsWith("file:./") || raw.startsWith("file:../")) {
    const relativePath = raw.replace("file:", "");
    return "file:" + path.resolve(process.cwd(), relativePath);
  }
  return raw;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter }) as InstanceType<typeof PrismaClient>;

/**
 * Calculate a relevance score for an action item.
 * Factors: priority weight, overdue status, and recency.
 */
function calculateRelevanceScore(
  priority: string,
  dueDate: Date | null,
  generatedAt: Date,
  now: Date,
): number {
  const priorityWeight = PRIORITY_WEIGHTS[priority] ?? 2;

  // Overdue items get a boost
  const overdueBoost = dueDate && isBefore(dueDate, now) ? 2 : 0;

  // Recency: items from more recent meetings score higher (0-1 scale over 30 days)
  const ageMs = now.getTime() - generatedAt.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const recencyScore = Math.max(0, 1 - ageMs / thirtyDaysMs);

  return priorityWeight + overdueBoost + recencyScore;
}

/**
 * Query action items (NextStep records) from the database within a lookback period.
 */
async function queryActionItems(
  lookbackDays: number,
  participantIds?: string[],
): Promise<AggregatedActionItem[]> {
  const cutoffDate = subDays(new Date(), lookbackDays);
  const now = new Date();

  const summaries = await prisma.meetingSessionSummary.findMany({
    where: {
      generatedAt: { gte: cutoffDate },
    },
    include: {
      nextSteps: true,
    },
    orderBy: { generatedAt: "desc" },
  });

  const items: AggregatedActionItem[] = [];

  for (const summary of summaries) {
    for (const step of summary.nextSteps) {
      // If participant filtering is requested, only include matching items
      if (participantIds && participantIds.length > 0) {
        const matchesParticipant =
          (step.assigneeId && participantIds.includes(step.assigneeId));
        if (!matchesParticipant) {
          continue;
        }
      }

      const dueDate = step.dueDate;
      const isOverdue = dueDate ? isBefore(dueDate, now) : false;

      items.push({
        id: step.id,
        description: step.description,
        assigneeId: step.assigneeId,
        assigneeName: step.assigneeName,
        priority: step.priority,
        dueDate,
        meetingSessionId: summary.meetingSessionId,
        meetingGeneratedAt: summary.generatedAt,
        isOverdue,
        relevanceScore: calculateRelevanceScore(
          step.priority,
          dueDate,
          summary.generatedAt,
          now,
        ),
      });
    }
  }

  return items;
}

/**
 * Aggregate action items by participant (assigneeId).
 * Items without an assignee are grouped under "unassigned".
 */
function aggregateByParticipant(
  items: AggregatedActionItem[],
  maxPerGroup: number,
): Record<string, AggregatedActionItem[]> {
  const grouped = groupBy(items, (item) => item.assigneeId ?? "unassigned");
  const result: Record<string, AggregatedActionItem[]> = {};

  for (const [key, group] of Object.entries(grouped)) {
    const sorted = orderBy(group, ["relevanceScore"], ["desc"]);
    result[key] = take(sorted, maxPerGroup);
  }

  return result;
}

/**
 * Aggregate action items by meeting session.
 */
function aggregateByMeeting(
  items: AggregatedActionItem[],
  maxPerGroup: number,
): Record<string, AggregatedActionItem[]> {
  const grouped = groupBy(items, (item) => item.meetingSessionId);
  const result: Record<string, AggregatedActionItem[]> = {};

  for (const [key, group] of Object.entries(grouped)) {
    const sorted = orderBy(group, ["relevanceScore"], ["desc"]);
    result[key] = take(sorted, maxPerGroup);
  }

  return result;
}

/**
 * Aggregate action items by project (currently same as by-meeting since
 * we don't have a project field; serves as a placeholder for future extension).
 */
function aggregateByProject(
  items: AggregatedActionItem[],
  maxPerGroup: number,
): Record<string, AggregatedActionItem[]> {
  return aggregateByMeeting(items, maxPerGroup);
}

const STRATEGY_MAP: Record<
  AggregationStrategy,
  (items: AggregatedActionItem[], max: number) => Record<string, AggregatedActionItem[]>
> = {
  "by-participant": aggregateByParticipant,
  "by-meeting": aggregateByMeeting,
  "by-project": aggregateByProject,
};

/**
 * Main aggregation function: queries action items and groups them per the config.
 */
async function aggregateActionItems(
  config: Partial<AggregationConfig> = {},
): Promise<AggregationResult> {
  const merged: AggregationConfig = { ...DEFAULT_AGGREGATION_CONFIG, ...config };

  const items = await queryActionItems(merged.lookbackDays, merged.participantIds);

  const aggregator = STRATEGY_MAP[merged.strategy];
  const groups = aggregator(items, merged.maxItemsPerGroup);

  let totalItems = 0;
  for (const group of Object.values(groups)) {
    totalItems += group.length;
  }

  return {
    groups,
    totalItems,
    lookbackDays: merged.lookbackDays,
    strategy: merged.strategy,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Retrieve aggregated action items for a specific participant.
 */
async function getParticipantActionItems(
  participantId: string,
  lookbackDays = 30,
  maxItems = 50,
): Promise<AggregatedActionItem[]> {
  const items = await queryActionItems(lookbackDays, [participantId]);
  const sorted = orderBy(items, ["relevanceScore"], ["desc"]);
  return take(sorted, maxItems);
}

/**
 * Retrieve aggregated action items for a specific session's participants.
 */
async function getSessionActionItems(
  sessionId: string,
  lookbackDays = 30,
  maxItemsPerParticipant = 50,
): Promise<AggregationResult> {
  // Find the session summary to discover its participants
  const summary = await prisma.meetingSessionSummary.findUnique({
    where: { meetingSessionId: sessionId },
    include: { nextSteps: true },
  });

  if (!summary) {
    return {
      groups: {},
      totalItems: 0,
      lookbackDays,
      strategy: "by-participant",
      generatedAt: new Date().toISOString(),
    };
  }

  // Collect unique participant IDs from the session's next steps
  const participantIds = [
    ...new Set(
      summary.nextSteps
        .map((s) => s.assigneeId)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (participantIds.length === 0) {
    return {
      groups: {},
      totalItems: 0,
      lookbackDays,
      strategy: "by-participant",
      generatedAt: new Date().toISOString(),
    };
  }

  return aggregateActionItems({
    lookbackDays,
    maxItemsPerGroup: maxItemsPerParticipant,
    strategy: "by-participant",
    participantIds,
  });
}

async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

export const actionItemsAggregationService = {
  aggregateActionItems,
  getParticipantActionItems,
  getSessionActionItems,
  disconnect,
};

// Named exports for direct usage
export {
  aggregateActionItems,
  getParticipantActionItems,
  getSessionActionItems,
  calculateRelevanceScore,
  aggregateByParticipant,
  aggregateByMeeting,
};
