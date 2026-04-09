/**
 * MeetingsTable component for displaying the list of meetings.
 *
 * Renders a table with sortable columns, meeting rows, and handles
 * loading and empty states. Numeric columns use monospace font.
 */

import type { Meeting, MeetingsFilters, SortOrder } from "../../types/meetingsList.js";

export interface MeetingsTableProps {
  meetings: Meeting[];
  filters: MeetingsFilters;
  isLoading: boolean;
  onSort: (field: string, order: SortOrder) => void;
  onView?: (meetingId: string) => void;
  onExport?: (meetingId: string) => void;
  onDelete?: (meetingId: string) => void;
}

/** Column definitions for the meetings table. */
export interface TableColumn {
  key: string;
  label: string;
  sortable: boolean;
  monospace: boolean;
  width?: string;
}

/** Define the columns for the meetings table. */
export const MEETINGS_TABLE_COLUMNS: TableColumn[] = [
  { key: "title", label: "Meeting", sortable: true, monospace: false },
  { key: "status", label: "Status", sortable: true, monospace: false },
  { key: "startTime", label: "Date", sortable: true, monospace: true },
  { key: "duration", label: "Duration", sortable: true, monospace: true, width: "100px" },
  { key: "participantCount", label: "Participants", sortable: true, monospace: true, width: "110px" },
  { key: "actions", label: "Actions", sortable: false, monospace: false, width: "150px" },
];

/** Get the current sort indicator for a column. */
export function getSortIndicator(
  columnKey: string,
  currentSortBy?: string,
  currentSortOrder?: SortOrder,
): "asc" | "desc" | "none" {
  if (columnKey !== currentSortBy) {
    return "none";
  }
  return currentSortOrder ?? "desc";
}

/** Determine the next sort order when clicking a column header. */
export function getNextSortOrder(
  columnKey: string,
  currentSortBy?: string,
  currentSortOrder?: SortOrder,
): SortOrder {
  if (columnKey !== currentSortBy) {
    return "desc";
  }
  return currentSortOrder === "desc" ? "asc" : "desc";
}

/** Get the CSS classes for a table cell based on column config. */
export function getCellClasses(column: TableColumn): string {
  const classes = ["meetings-table__cell"];

  if (column.monospace) {
    classes.push("meetings-table__cell--monospace");
  }

  return classes.join(" ");
}

/** Generate the empty state message based on whether filters are active. */
export function getEmptyStateMessage(hasFilters: boolean): string {
  if (hasFilters) {
    return "No meetings match your current filters. Try adjusting your search criteria.";
  }
  return "No meetings found. Meetings will appear here once they are scheduled.";
}

/** Generate the loading state text. */
export function getLoadingMessage(): string {
  return "Loading meetings...";
}

export default MeetingsTableProps;
