import { describe, it, expect } from "vitest";
import type {
  Meeting,
  MeetingParticipant,
  MeetingStatus,
  MeetingFilters,
  MeetingSortParams,
  MeetingListParams,
  DateRange,
  DurationRange,
} from "../../types/meeting.js";
import type {
  PaginatedResponse,
  PaginationInfo,
  PaginationParams,
  SortDirection,
} from "../../types/common.js";
import {
  MeetingFilterValidationError,
  MeetingNotFoundError,
} from "../../types/errors.js";

describe("Meeting types", () => {
  it("accepts a Meeting object with all required fields", () => {
    const meeting: Meeting = {
      id: "meeting-1",
      title: "Sprint Planning",
      date: "2026-04-08T10:00:00Z",
      duration: 3600,
      participants: [
        { id: "user-1", name: "Alice" },
        { id: "user-2", name: "Bob", email: "bob@example.com", role: "host" },
      ],
      status: "completed",
    };

    expect(meeting.id).toBe("meeting-1");
    expect(meeting.title).toBe("Sprint Planning");
    expect(meeting.date).toBe("2026-04-08T10:00:00Z");
    expect(meeting.duration).toBe(3600);
    expect(meeting.participants).toHaveLength(2);
    expect(meeting.status).toBe("completed");
  });

  it("accepts a Meeting with optional fields", () => {
    const meeting: Meeting = {
      id: "meeting-2",
      title: "Retro",
      date: "2026-04-09T14:00:00Z",
      duration: 1800,
      participants: [{ id: "user-1", name: "Alice" }],
      status: "scheduled",
      description: "End of sprint retro",
      organizerId: "user-1",
      tags: ["sprint", "retro"],
      sessionId: "session-abc",
    };

    expect(meeting.description).toBe("End of sprint retro");
    expect(meeting.organizerId).toBe("user-1");
    expect(meeting.tags).toEqual(["sprint", "retro"]);
    expect(meeting.sessionId).toBe("session-abc");
  });

  it("supports all MeetingStatus values", () => {
    const statuses: MeetingStatus[] = [
      "scheduled",
      "in_progress",
      "completed",
      "cancelled",
    ];

    expect(statuses).toHaveLength(4);
  });
});

describe("MeetingFilters types", () => {
  it("accepts MeetingFilters with only search field", () => {
    const filters: MeetingFilters = {
      search: "planning",
    };

    expect(filters.search).toBe("planning");
    expect(filters.status).toBeUndefined();
    expect(filters.dateRange).toBeUndefined();
    expect(filters.participants).toBeUndefined();
    expect(filters.duration).toBeUndefined();
  });

  it("accepts MeetingFilters with all fields populated", () => {
    const filters: MeetingFilters = {
      search: "sprint",
      status: ["completed", "in_progress"],
      dateRange: { from: "2026-04-01", to: "2026-04-30" },
      participants: ["user-1", "user-2"],
      duration: { min: 30, max: 120 },
      tags: ["sprint"],
      organizerId: "user-1",
    };

    expect(filters.search).toBe("sprint");
    expect(filters.status).toEqual(["completed", "in_progress"]);
    expect(filters.dateRange?.from).toBe("2026-04-01");
    expect(filters.participants).toHaveLength(2);
    expect(filters.duration?.min).toBe(30);
  });

  it("accepts empty MeetingFilters object", () => {
    const filters: MeetingFilters = {};
    expect(filters.search).toBeUndefined();
  });
});

describe("PaginatedResponse generic type", () => {
  it("correctly types data array as Meeting[] with pagination metadata", () => {
    const response: PaginatedResponse<Meeting> = {
      data: [
        {
          id: "meeting-1",
          title: "Standup",
          date: "2026-04-08T09:00:00Z",
          duration: 900,
          participants: [{ id: "user-1", name: "Alice" }],
          status: "completed",
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };

    expect(response.data).toHaveLength(1);
    expect(response.data[0]?.title).toBe("Standup");
    expect(response.pagination.page).toBe(1);
    expect(response.pagination.total).toBe(1);
    expect(response.pagination.hasNextPage).toBe(false);
  });

  it("works with generic non-Meeting types", () => {
    const response: PaginatedResponse<{ id: string; value: number }> = {
      data: [{ id: "a", value: 42 }],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };

    expect(response.data[0]?.value).toBe(42);
  });
});

describe("MeetingListParams combined query", () => {
  it("accepts full query params with filters, sort, and pagination", () => {
    const params: MeetingListParams = {
      filters: { search: "planning" },
      sort: { field: "date", direction: "desc" },
      pagination: { page: 1, pageSize: 20 },
    };

    expect(params.filters?.search).toBe("planning");
    expect(params.sort?.field).toBe("date");
    expect(params.pagination?.page).toBe(1);
  });
});

describe("Meeting error types", () => {
  it("creates MeetingFilterValidationError with correct properties", () => {
    const error = new MeetingFilterValidationError(
      "Invalid date range: from must be before to",
      "INVALID_DATE_RANGE",
      "dateRange"
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MeetingFilterValidationError");
    expect(error.code).toBe("INVALID_DATE_RANGE");
    expect(error.field).toBe("dateRange");
    expect(error.message).toBe("Invalid date range: from must be before to");
  });

  it("creates MeetingNotFoundError with correct properties", () => {
    const error = new MeetingNotFoundError("meeting-999");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MeetingNotFoundError");
    expect(error.meetingId).toBe("meeting-999");
    expect(error.message).toBe("Meeting not found: meeting-999");
  });
});
