/**
 * Meeting data types and filter interfaces for the meetings list feature.
 *
 * Defines the core Meeting model, filter parameters, sorting options,
 * and participant structures. Compatible with existing engagement scoring
 * and speaker analytics types.
 */

import type { PaginationParams, SortDirection } from "./common.js";

/** Status of a meeting. */
export type MeetingStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

/** A participant in a meeting. */
export interface MeetingParticipant {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

/** Core meeting data structure. */
export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: MeetingParticipant[];
  status: MeetingStatus;
  description?: string;
  organizerId?: string;
  tags?: string[];
  sessionId?: string;
}

/** Fields that a meeting list can be sorted by. */
export type MeetingSortField = "date" | "title" | "duration" | "status";

/** Sorting configuration for meeting lists. */
export interface MeetingSortParams {
  field: MeetingSortField;
  direction: SortDirection;
}

/** Date range filter for meetings. */
export interface DateRange {
  from?: string;
  to?: string;
}

/** Duration range filter in minutes. */
export interface DurationRange {
  min?: number;
  max?: number;
}

/** Filter parameters for querying meetings. */
export interface MeetingFilters {
  search?: string;
  status?: MeetingStatus[];
  dateRange?: DateRange;
  participants?: string[];
  duration?: DurationRange;
  tags?: string[];
  organizerId?: string;
}

/** Combined query parameters for fetching a meetings list. */
export interface MeetingListParams {
  filters?: MeetingFilters;
  sort?: MeetingSortParams;
  pagination?: PaginationParams;
}
