import type {
  Meeting,
  MeetingFilters,
  MeetingSortOptions,
  PaginationParams,
  PaginatedResponse,
} from "../types/meeting.js";
import { MeetingFilterValidationError, MeetingNotFoundError } from "../types/errors.js";

/**
 * Validate filter parameters, throwing MeetingFilterValidationError for invalid inputs.
 */
export function validateFilters(filters: MeetingFilters): void {
  if (filters.dateRange) {
    const { start, end } = filters.dateRange;
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new MeetingFilterValidationError("Invalid date range: dates must be valid ISO date strings");
    }

    if (startDate > endDate) {
      throw new MeetingFilterValidationError("Invalid date range: start date must be before end date");
    }
  }

  if (filters.duration) {
    const { min, max } = filters.duration;
    if (min !== undefined && min < 0) {
      throw new MeetingFilterValidationError("Invalid duration filter: min must be non-negative");
    }
    if (max !== undefined && max < 0) {
      throw new MeetingFilterValidationError("Invalid duration filter: max must be non-negative");
    }
    if (min !== undefined && max !== undefined && min > max) {
      throw new MeetingFilterValidationError("Invalid duration filter: min must be less than or equal to max");
    }
  }

  if (filters.status) {
    const validStatuses = ["completed", "in-progress", "scheduled"] as const;
    for (const status of filters.status) {
      if (!validStatuses.includes(status)) {
        throw new MeetingFilterValidationError(`Invalid status filter: '${status}' is not a valid meeting status`);
      }
    }
  }
}

/**
 * Apply filters to a list of meetings, returning only those that match all criteria.
 */
function applyFilters(meetings: Meeting[], filters: MeetingFilters): Meeting[] {
  let result = meetings;

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    result = result.filter(
      (m) =>
        m.title.toLowerCase().includes(searchLower) ||
        (m.transcript && m.transcript.toLowerCase().includes(searchLower)) ||
        (m.summary && m.summary.toLowerCase().includes(searchLower))
    );
  }

  if (filters.dateRange) {
    const startDate = new Date(filters.dateRange.start);
    const endDate = new Date(filters.dateRange.end);
    result = result.filter((m) => {
      const meetingDate = new Date(m.date);
      return meetingDate >= startDate && meetingDate <= endDate;
    });
  }

  if (filters.status && filters.status.length > 0) {
    result = result.filter((m) => filters.status!.includes(m.status));
  }

  if (filters.participants && filters.participants.length > 0) {
    result = result.filter((m) =>
      filters.participants!.some((p) => m.participants.includes(p))
    );
  }

  if (filters.duration) {
    const { min, max } = filters.duration;
    result = result.filter((m) => {
      if (min !== undefined && m.duration < min) return false;
      if (max !== undefined && m.duration > max) return false;
      return true;
    });
  }

  return result;
}

/**
 * Sort meetings by the specified field and direction.
 */
function applySorting(meetings: Meeting[], sort: MeetingSortOptions): Meeting[] {
  const sorted = [...meetings];
  const direction = sort.direction === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sort.field) {
      case "date":
        return direction * (new Date(a.date).getTime() - new Date(b.date).getTime());
      case "title":
        return direction * a.title.localeCompare(b.title);
      case "duration":
        return direction * (a.duration - b.duration);
      case "participants":
        return direction * (a.participants.length - b.participants.length);
      default:
        return 0;
    }
  });

  return sorted;
}

/**
 * Apply pagination to a list of meetings.
 */
function applyPagination<T>(items: T[], pagination: PaginationParams): { data: T[]; total: number } {
  const total = items.length;
  const start = (pagination.page - 1) * pagination.limit;
  const data = items.slice(start, start + pagination.limit);
  return { data, total };
}

/**
 * Build a PaginatedResponse from data and pagination params.
 */
function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  pagination: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}

// In-memory meetings store for the service layer.
// In a production system this would be backed by a database.
let meetingsStore: Meeting[] = [];

/**
 * Set the meetings data store (useful for testing and initialization).
 */
export function setMeetingsStore(meetings: Meeting[]): void {
  meetingsStore = [...meetings];
}

/**
 * Get the current meetings data store.
 */
export function getMeetingsStore(): Meeting[] {
  return [...meetingsStore];
}

/**
 * Retrieve a single meeting by ID.
 * Throws MeetingNotFoundError if the meeting does not exist.
 */
export async function getMeetingById(id: string): Promise<Meeting> {
  const meeting = meetingsStore.find((m) => m.id === id);
  if (!meeting) {
    throw new MeetingNotFoundError(id);
  }
  return meeting;
}

/**
 * Retrieve meetings with filtering, sorting, and pagination.
 */
export async function getMeetings(
  filters: MeetingFilters = {},
  sort: MeetingSortOptions = { field: "date", direction: "desc" },
  pagination: PaginationParams = { page: 1, limit: 20 }
): Promise<PaginatedResponse<Meeting>> {
  validateFilters(filters);

  let results = applyFilters(meetingsStore, filters);
  results = applySorting(results, sort);

  const { data, total } = applyPagination(results, pagination);
  return buildPaginatedResponse(data, total, pagination);
}

/**
 * Search meetings by text query across title and transcript fields.
 * Convenience wrapper around getMeetings with a search filter.
 */
export async function searchMeetings(
  query: string,
  pagination: PaginationParams = { page: 1, limit: 20 }
): Promise<PaginatedResponse<Meeting>> {
  return getMeetings(
    { search: query },
    { field: "date", direction: "desc" },
    pagination
  );
}

export const meetingsService = {
  getMeetings,
  getMeetingById,
  searchMeetings,
  validateFilters,
  setMeetingsStore,
  getMeetingsStore,
};
