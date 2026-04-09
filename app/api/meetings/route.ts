import type {
  Meeting,
  MeetingFilters,
  MeetingSortOptions,
  MeetingStatus,
  MeetingSortField,
} from "../../../src/types/meeting.js";
import type {
  PaginatedResponse,
  PaginationParams,
  SearchParams,
} from "../../../src/types/common.js";
import {
  MeetingFilterValidationError,
} from "../../../src/types/errors.js";

interface RouteRequest {
  query: SearchParams;
}

interface RouteResponse {
  status(code: number): RouteResponse;
  json(data: unknown): RouteResponse;
}

const VALID_SORT_FIELDS: MeetingSortField[] = ["date", "title", "duration", "status"];
const VALID_STATUSES: MeetingStatus[] = ["scheduled", "in_progress", "completed", "cancelled"];
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parseSearchParams(query: SearchParams): {
  filters: MeetingFilters;
  sort: MeetingSortOptions;
  pagination: PaginationParams;
} {
  const filters: MeetingFilters = {};
  const sort: MeetingSortOptions = {
    field: "date",
    direction: "desc",
  };
  const pagination: PaginationParams = {
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
  };

  // Search
  if (query.search && typeof query.search === "string") {
    filters.search = query.search.trim();
  }

  // Status filter
  if (query.status) {
    const statuses = (typeof query.status === "string" ? query.status.split(",") : query.status) as string[];
    for (const s of statuses) {
      if (!VALID_STATUSES.includes(s as MeetingStatus)) {
        throw new MeetingFilterValidationError(
          `Invalid filter: status '${s}' is not valid. Must be one of: ${VALID_STATUSES.join(", ")}`,
          "INVALID_STATUS",
          "status",
        );
      }
    }
    filters.status = statuses as MeetingStatus[];
  }

  // Date range
  if (query.dateFrom || query.dateTo) {
    filters.dateRange = {};
    if (query.dateFrom && typeof query.dateFrom === "string") {
      if (isNaN(Date.parse(query.dateFrom))) {
        throw new MeetingFilterValidationError(
          "Invalid filter: dateFrom is not a valid date",
          "INVALID_DATE_RANGE",
          "dateFrom",
        );
      }
      filters.dateRange.from = query.dateFrom;
    }
    if (query.dateTo && typeof query.dateTo === "string") {
      if (isNaN(Date.parse(query.dateTo))) {
        throw new MeetingFilterValidationError(
          "Invalid filter: dateTo is not a valid date",
          "INVALID_DATE_RANGE",
          "dateTo",
        );
      }
      filters.dateRange.to = query.dateTo;
    }
    if (
      filters.dateRange.from &&
      filters.dateRange.to &&
      new Date(filters.dateRange.from) > new Date(filters.dateRange.to)
    ) {
      throw new MeetingFilterValidationError(
        "Invalid filter: dateFrom must be before dateTo",
        "INVALID_DATE_RANGE",
        "dateRange",
      );
    }
  }

  // Participants
  if (query.participants && typeof query.participants === "string") {
    filters.participants = query.participants.split(",").map((p) => p.trim()).filter(Boolean);
  }

  // Duration range
  if (query.durationMin || query.durationMax) {
    filters.duration = {};
    if (query.durationMin && typeof query.durationMin === "string") {
      const min = Number(query.durationMin);
      if (isNaN(min) || min < 0) {
        throw new MeetingFilterValidationError(
          "Invalid filter: durationMin must be a non-negative number",
          "INVALID_DURATION_RANGE",
          "durationMin",
        );
      }
      filters.duration.min = min;
    }
    if (query.durationMax && typeof query.durationMax === "string") {
      const max = Number(query.durationMax);
      if (isNaN(max) || max < 0) {
        throw new MeetingFilterValidationError(
          "Invalid filter: durationMax must be a non-negative number",
          "INVALID_DURATION_RANGE",
          "durationMax",
        );
      }
      filters.duration.max = max;
    }
    if (
      filters.duration.min !== undefined &&
      filters.duration.max !== undefined &&
      filters.duration.min > filters.duration.max
    ) {
      throw new MeetingFilterValidationError(
        "Invalid filter: durationMin must be less than or equal to durationMax",
        "INVALID_DURATION_RANGE",
        "duration",
      );
    }
  }

  // Sort
  if (query.sortField && typeof query.sortField === "string") {
    if (!VALID_SORT_FIELDS.includes(query.sortField as MeetingSortField)) {
      throw new MeetingFilterValidationError(
        `Invalid filter: sortField '${query.sortField}' is not valid. Must be one of: ${VALID_SORT_FIELDS.join(", ")}`,
        "INVALID_SORT_FIELD",
        "sortField",
      );
    }
    sort.field = query.sortField as MeetingSortField;
  }
  if (query.sortDirection && typeof query.sortDirection === "string") {
    if (query.sortDirection !== "asc" && query.sortDirection !== "desc") {
      throw new MeetingFilterValidationError(
        "Invalid filter: sortDirection must be 'asc' or 'desc'",
        "INVALID_SORT_FIELD",
        "sortDirection",
      );
    }
    sort.direction = query.sortDirection;
  }

  // Pagination
  if (query.page && typeof query.page === "string") {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      throw new MeetingFilterValidationError(
        "Invalid filter: page must be a positive integer",
        "INVALID_PAGE",
        "page",
      );
    }
    pagination.page = page;
  }
  if (query.pageSize && typeof query.pageSize === "string") {
    const pageSize = Number(query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new MeetingFilterValidationError(
        `Invalid filter: pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`,
        "INVALID_PAGE_SIZE",
        "pageSize",
      );
    }
    pagination.pageSize = pageSize;
  }

  return { filters, sort, pagination };
}

function applyFilters(meetings: Meeting[], filters: MeetingFilters): Meeting[] {
  let result = meetings;

  if (filters.search) {
    const term = filters.search.toLowerCase();
    result = result.filter(
      (m) =>
        m.title.toLowerCase().includes(term) ||
        (m.description && m.description.toLowerCase().includes(term)),
    );
  }

  if (filters.status && filters.status.length > 0) {
    result = result.filter((m) => filters.status!.includes(m.status));
  }

  if (filters.dateRange) {
    if (filters.dateRange.from) {
      const from = new Date(filters.dateRange.from);
      result = result.filter((m) => new Date(m.date) >= from);
    }
    if (filters.dateRange.to) {
      const to = new Date(filters.dateRange.to);
      result = result.filter((m) => new Date(m.date) <= to);
    }
  }

  if (filters.participants && filters.participants.length > 0) {
    result = result.filter((m) =>
      filters.participants!.some((pid) =>
        m.participants.some((p) => p.id === pid || p.name === pid),
      ),
    );
  }

  if (filters.duration) {
    if (filters.duration.min !== undefined) {
      result = result.filter((m) => m.duration >= filters.duration!.min!);
    }
    if (filters.duration.max !== undefined) {
      result = result.filter((m) => m.duration <= filters.duration!.max!);
    }
  }

  if (filters.tags && filters.tags.length > 0) {
    result = result.filter(
      (m) => m.tags && filters.tags!.some((t) => m.tags!.includes(t)),
    );
  }

  if (filters.organizerId) {
    result = result.filter((m) => m.organizerId === filters.organizerId);
  }

  return result;
}

function applySorting(meetings: Meeting[], sort: MeetingSortOptions): Meeting[] {
  return [...meetings].sort((a, b) => {
    let comparison = 0;
    switch (sort.field) {
      case "date":
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case "title":
        comparison = a.title.localeCompare(b.title);
        break;
      case "duration":
        comparison = a.duration - b.duration;
        break;
      case "status":
        comparison = a.status.localeCompare(b.status);
        break;
    }
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

function applyPagination(
  meetings: Meeting[],
  pagination: PaginationParams,
): { data: Meeting[]; total: number } {
  const page = pagination.page ?? DEFAULT_PAGE;
  const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
  const start = (page - 1) * pageSize;
  return {
    data: meetings.slice(start, start + pageSize),
    total: meetings.length,
  };
}

// In-memory store — replace with database queries in production
let meetingsStore: Meeting[] = [];

export function setMeetingsStore(meetings: Meeting[]): void {
  meetingsStore = meetings;
}

export function getMeetingsStore(): Meeting[] {
  return meetingsStore;
}

export async function GET(
  req: RouteRequest,
  res: RouteResponse,
): Promise<RouteResponse> {
  try {
    const query = req.query;
    const { filters, sort, pagination } = parseSearchParams(query);

    const filtered = applyFilters(meetingsStore, filters);
    const sorted = applySorting(filtered, sort);
    const { data, total } = applyPagination(sorted, pagination);

    const page = pagination.page ?? DEFAULT_PAGE;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const totalPages = Math.ceil(total / pageSize);

    const response: PaginatedResponse<Meeting> = {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof MeetingFilterValidationError) {
      return res.status(400).json({
        error: error.message,
        code: error.code,
        field: error.field,
      });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
