/**
 * MeetingsFilters component for filtering the meetings list.
 *
 * Provides controls for filtering by status, date range, and sorting.
 * Calls onFiltersChange when any filter value changes.
 */

import type {
  MeetingsFilters as MeetingsFiltersType,
  MeetingStatus,
  SortOrder,
} from "../../types/meetingsList.js";

export interface MeetingsFiltersProps {
  filters: MeetingsFiltersType;
  onFiltersChange: (filters: MeetingsFiltersType) => void;
  disabled?: boolean;
}

/** All available meeting statuses for the filter dropdown. */
export const MEETING_STATUS_OPTIONS: Array<{
  value: MeetingStatus;
  label: string;
}> = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

/** Available sort field options. */
export const SORT_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "startTime", label: "Date" },
  { value: "duration", label: "Duration" },
  { value: "participantCount", label: "Participants" },
  { value: "title", label: "Title" },
];

/** Apply a status filter toggle. Returns updated status array. */
export function toggleStatusFilter(
  currentStatuses: MeetingStatus[] | undefined,
  status: MeetingStatus,
): MeetingStatus[] {
  const current = currentStatuses ?? [];

  if (current.includes(status)) {
    return current.filter((s) => s !== status);
  }

  return [...current, status];
}

/** Update the date range filter. */
export function updateDateRange(
  filters: MeetingsFiltersType,
  field: "start" | "end",
  value: string,
): MeetingsFiltersType {
  const dateRange = filters.dateRange ?? {};

  return {
    ...filters,
    dateRange: {
      ...dateRange,
      [field]: value || undefined,
    },
  };
}

/** Update the sort configuration. */
export function updateSort(
  filters: MeetingsFiltersType,
  sortBy: string,
  sortOrder: SortOrder,
): MeetingsFiltersType {
  return {
    ...filters,
    sortBy,
    sortOrder,
  };
}

/** Toggle sort order between asc and desc. */
export function toggleSortOrder(currentOrder?: SortOrder): SortOrder {
  return currentOrder === "asc" ? "desc" : "asc";
}

/** Reset all filters to their default values. */
export function resetFilters(): MeetingsFiltersType {
  return {
    searchQuery: "",
    status: undefined,
    dateRange: undefined,
    sortBy: "startTime",
    sortOrder: "desc",
  };
}

/** Check if any non-default filters are active. */
export function hasActiveFilters(filters: MeetingsFiltersType): boolean {
  return (
    (filters.status !== undefined && filters.status.length > 0) ||
    filters.dateRange?.start !== undefined ||
    filters.dateRange?.end !== undefined ||
    (filters.searchQuery !== undefined && filters.searchQuery.length > 0)
  );
}

/** Count the number of active filter categories. */
export function countActiveFilters(filters: MeetingsFiltersType): number {
  let count = 0;

  if (filters.status && filters.status.length > 0) count++;
  if (filters.dateRange?.start || filters.dateRange?.end) count++;
  if (filters.searchQuery && filters.searchQuery.length > 0) count++;

  return count;
}

export default MeetingsFiltersProps;
