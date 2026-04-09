/**
 * Types for the Meetings list page with search, filtering, and pagination.
 */

/** Status of a meeting session. */
export type MeetingStatus = "scheduled" | "in-progress" | "completed" | "cancelled";

/** Sort order direction. */
export type SortOrder = "asc" | "desc";

/** A date range with optional start and end bounds. */
export interface DateRange {
  start?: string;
  end?: string;
}

/** A meeting record displayed in the meetings list. */
export interface Meeting {
  id: string;
  title: string;
  description?: string;
  status: MeetingStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  participantCount: number;
  participants: string[];
  organizer?: string;
}

/** Paginated response for the meetings list. */
export interface MeetingsListData {
  meetings: Meeting[];
  total: number;
  page: number;
  hasMore: boolean;
}

/** Filter criteria for the meetings list. */
export interface MeetingsFilters {
  status?: MeetingStatus[];
  dateRange?: DateRange;
  searchQuery?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}
