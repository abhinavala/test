import type { NextStepPriority } from "./meeting-summary.js";

/** An action item sourced from a meeting session's next steps. */
export interface AggregatedActionItem {
  id: string;
  description: string;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: NextStepPriority;
  dueDate: Date | null;
  meetingSessionId: string;
  meetingGeneratedAt: Date;
  isOverdue: boolean;
  relevanceScore: number;
}

/** Aggregation strategy for grouping action items. */
export type AggregationStrategy = "by-participant" | "by-meeting" | "by-project";

/** Configuration for an aggregation query. */
export interface AggregationConfig {
  lookbackDays: number;
  maxItemsPerGroup: number;
  strategy: AggregationStrategy;
  participantIds?: string[];
  meetingTags?: string[];
}

/** Default aggregation configuration values. */
export const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
  lookbackDays: 30,
  maxItemsPerGroup: 50,
  strategy: "by-participant",
};

/** Result of an aggregation grouped by a key (participant ID, meeting ID, etc.). */
export interface AggregationResult {
  groups: Record<string, AggregatedActionItem[]>;
  totalItems: number;
  lookbackDays: number;
  strategy: AggregationStrategy;
  generatedAt: string;
}

/** Participant filter criteria for the aggregation query. */
export interface ParticipantFilter {
  participantId: string;
  roles: Array<"assignee" | "creator" | "mentioned">;
}

/** Filter criteria for querying action items. */
export interface ActionItemFilter {
  participantIds?: string[];
  meetingSessionIds?: string[];
  priorities?: string[];
  overdueOnly?: boolean;
  lookbackDays?: number;
  maxItems?: number;
}

/** Priority weights used in relevance scoring. */
export const PRIORITY_WEIGHTS: Record<string, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
