import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  buildQueryParams,
  debounce,
  parseMeetingsResponse,
  createInitialData,
  createDefaultFilters,
  createMeetingsListManager,
  fetchMeetings,
  DEBOUNCE_DELAY_MS,
} from "../../hooks/useMeetingsList.js";

import type {
  MeetingsFilters,
  MeetingsListData,
  Meeting,
} from "../../types/meetingsList.js";

import {
  computeTotalPages,
  buildPageTitle,
  shouldShowEmptyState,
  shouldShowLoading,
  shouldShowPagination,
  getPageClasses,
} from "../../../app/meetings/page.js";

import {
  getStatusLabel,
  getStatusClass,
  formatDuration,
  formatMeetingDate,
  formatMeetingTime,
  getAvailableActions,
} from "../../components/meetings/MeetingRow.js";

import {
  toggleStatusFilter,
  updateDateRange,
  updateSort,
  toggleSortOrder,
  resetFilters,
  hasActiveFilters,
  countActiveFilters,
  MEETING_STATUS_OPTIONS,
  SORT_FIELD_OPTIONS,
} from "../../components/meetings/MeetingsFilters.js";

import {
  getSortIndicator,
  getNextSortOrder,
  getCellClasses,
  getEmptyStateMessage,
  getLoadingMessage,
  MEETINGS_TABLE_COLUMNS,
} from "../../components/meetings/MeetingsTable.js";

import {
  buildSearchInputAttributes,
  shouldShowClearButton,
  handleSearchChange,
  handleClearClick,
} from "../../components/ui/SearchInput.js";

import {
  getPageRange,
  getPageNumbers,
  isPrevDisabled,
  isNextDisabled,
  formatPaginationSummary,
} from "../../components/ui/Pagination.js";

function createMockMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "meeting-1",
    title: "Sprint Planning",
    description: "Weekly sprint planning meeting",
    status: "completed",
    startTime: "2026-04-01T10:00:00Z",
    endTime: "2026-04-01T11:00:00Z",
    duration: 3600000,
    participantCount: 5,
    participants: ["Alice", "Bob", "Charlie", "Diana", "Eve"],
    organizer: "Alice",
    ...overrides,
  };
}

function createMockListData(overrides: Partial<MeetingsListData> = {}): MeetingsListData {
  return {
    meetings: [createMockMeeting()],
    total: 1,
    page: 1,
    hasMore: false,
    ...overrides,
  };
}

// ─── MeetingsPage logic ───────────────────────────────────────────────

describe("MeetingsPage", () => {
  it("renders table and filters correctly — computeTotalPages", () => {
    expect(computeTotalPages(100, 20)).toBe(5);
    expect(computeTotalPages(101, 20)).toBe(6);
    expect(computeTotalPages(0, 20)).toBe(1);
    expect(computeTotalPages(20, 20)).toBe(1);
  });

  it("should show loading state initially", () => {
    expect(shouldShowLoading(true)).toBe(true);
    expect(shouldShowLoading(false)).toBe(false);
  });

  it("should show empty state when no meetings and not loading", () => {
    const emptyData = createMockListData({ meetings: [], total: 0 });
    expect(shouldShowEmptyState(emptyData, false)).toBe(true);
    expect(shouldShowEmptyState(emptyData, true)).toBe(false);
  });

  it("should show pagination when data exists", () => {
    const data = createMockListData({ total: 50 });
    expect(shouldShowPagination(data, false)).toBe(true);
    expect(shouldShowPagination(data, true)).toBe(false);
  });

  it("builds page title with active filters", () => {
    expect(buildPageTitle(0)).toBe("Meetings");
    expect(buildPageTitle(1)).toBe("Meetings (1 filter active)");
    expect(buildPageTitle(3)).toBe("Meetings (3 filters active)");
  });

  it("returns correct page classes", () => {
    expect(getPageClasses()).toBe("meetings-page");
  });
});

// ─── useMeetingsList hook ────────────────────────────────────────────

describe("useMeetingsList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("buildQueryParams", () => {
    it("builds basic pagination params", () => {
      const params = buildQueryParams({}, 1, 20);
      expect(params).toContain("page=1");
      expect(params).toContain("pageSize=20");
    });

    it("includes search query when provided", () => {
      const params = buildQueryParams({ searchQuery: "sprint" }, 1, 20);
      expect(params).toContain("search=sprint");
    });

    it("includes status filter", () => {
      const params = buildQueryParams({ status: ["completed", "scheduled"] }, 1, 20);
      expect(params).toContain("status=completed%2Cscheduled");
    });

    it("includes date range", () => {
      const params = buildQueryParams(
        { dateRange: { start: "2026-01-01", end: "2026-12-31" } },
        1,
        20,
      );
      expect(params).toContain("dateStart=2026-01-01");
      expect(params).toContain("dateEnd=2026-12-31");
    });

    it("includes sort params", () => {
      const params = buildQueryParams({ sortBy: "duration", sortOrder: "asc" }, 1, 20);
      expect(params).toContain("sortBy=duration");
      expect(params).toContain("sortOrder=asc");
    });
  });

  describe("debounce", () => {
    it("should delay API call by 300ms after last keystroke", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, DEBOUNCE_DELAY_MS);

      debounced.call();
      debounced.call();
      debounced.call();

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(DEBOUNCE_DELAY_MS);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("resets timer on each call", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, DEBOUNCE_DELAY_MS);

      debounced.call();
      vi.advanceTimersByTime(200);
      debounced.call();
      vi.advanceTimersByTime(200);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("can be cancelled", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, DEBOUNCE_DELAY_MS);

      debounced.call();
      debounced.cancel();
      vi.advanceTimersByTime(DEBOUNCE_DELAY_MS + 100);

      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("parseMeetingsResponse", () => {
    it("should update data with filtered results", () => {
      const response = {
        meetings: [createMockMeeting()],
        total: 1,
        page: 1,
        hasMore: false,
      };

      const result = parseMeetingsResponse(response);
      expect(result.meetings).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it("handles missing fields gracefully", () => {
      const result = parseMeetingsResponse({});
      expect(result.meetings).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("createInitialData", () => {
    it("returns empty initial state", () => {
      const data = createInitialData();
      expect(data.meetings).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.page).toBe(1);
      expect(data.hasMore).toBe(false);
    });
  });

  describe("createDefaultFilters", () => {
    it("returns default filter state", () => {
      const filters = createDefaultFilters();
      expect(filters.searchQuery).toBe("");
      expect(filters.sortBy).toBe("startTime");
      expect(filters.sortOrder).toBe("desc");
    });

    it("accepts overrides", () => {
      const filters = createDefaultFilters({ sortBy: "duration" });
      expect(filters.sortBy).toBe("duration");
      expect(filters.sortOrder).toBe("desc");
    });
  });

  describe("createMeetingsListManager", () => {
    it("creates manager with default state", () => {
      const manager = createMeetingsListManager();
      const state = manager.getState();

      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.page).toBe(1);
      expect(state.data.meetings).toEqual([]);
      manager.destroy();
    });

    it("sets search query and resets page", () => {
      const manager = createMeetingsListManager();
      const onChange = vi.fn();
      manager.setOnChange(onChange);

      manager.setSearchQuery("planning");

      const state = manager.getState();
      expect(state.filters.searchQuery).toBe("planning");
      expect(state.page).toBe(1);
      manager.destroy();
    });

    it("sets status filter", () => {
      const manager = createMeetingsListManager();
      manager.setStatusFilter(["completed", "scheduled"]);

      const state = manager.getState();
      expect(state.filters.status).toEqual(["completed", "scheduled"]);
      manager.destroy();
    });

    it("sets date range", () => {
      const manager = createMeetingsListManager();
      manager.setDateRange("2026-01-01", "2026-12-31");

      const state = manager.getState();
      expect(state.filters.dateRange).toEqual({
        start: "2026-01-01",
        end: "2026-12-31",
      });
      manager.destroy();
    });

    it("clears date range when no values provided", () => {
      const manager = createMeetingsListManager();
      manager.setDateRange();

      const state = manager.getState();
      expect(state.filters.dateRange).toBeUndefined();
      manager.destroy();
    });

    it("sets sort configuration", () => {
      const manager = createMeetingsListManager();
      manager.setSortBy("duration", "asc");

      const state = manager.getState();
      expect(state.filters.sortBy).toBe("duration");
      expect(state.filters.sortOrder).toBe("asc");
      manager.destroy();
    });

    it("sets page number", () => {
      const manager = createMeetingsListManager();
      manager.setPage(3);

      const state = manager.getState();
      expect(state.page).toBe(3);
      manager.destroy();
    });
  });
});

// ─── MeetingsFilters ─────────────────────────────────────────────────

describe("MeetingsFilters", () => {
  it("onFiltersChange should be called with new filter values", () => {
    const filters: MeetingsFilters = { searchQuery: "", sortBy: "startTime", sortOrder: "desc" };
    const updated = updateSort(filters, "duration", "asc");

    expect(updated.sortBy).toBe("duration");
    expect(updated.sortOrder).toBe("asc");
  });

  it("should trigger useMeetingsList to refetch data via toggleStatusFilter", () => {
    const result = toggleStatusFilter(undefined, "completed");
    expect(result).toEqual(["completed"]);

    const toggled = toggleStatusFilter(["completed"], "completed");
    expect(toggled).toEqual([]);

    const added = toggleStatusFilter(["completed"], "scheduled");
    expect(added).toEqual(["completed", "scheduled"]);
  });

  it("updates date range filters", () => {
    const filters: MeetingsFilters = {};
    const updated = updateDateRange(filters, "start", "2026-03-01");
    expect(updated.dateRange?.start).toBe("2026-03-01");
  });

  it("toggles sort order", () => {
    expect(toggleSortOrder("asc")).toBe("desc");
    expect(toggleSortOrder("desc")).toBe("asc");
    expect(toggleSortOrder(undefined)).toBe("asc");
  });

  it("resets filters to defaults", () => {
    const defaults = resetFilters();
    expect(defaults.searchQuery).toBe("");
    expect(defaults.status).toBeUndefined();
    expect(defaults.dateRange).toBeUndefined();
    expect(defaults.sortBy).toBe("startTime");
    expect(defaults.sortOrder).toBe("desc");
  });

  it("detects active filters", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ status: ["completed"] })).toBe(true);
    expect(hasActiveFilters({ searchQuery: "test" })).toBe(true);
    expect(hasActiveFilters({ dateRange: { start: "2026-01-01" } })).toBe(true);
  });

  it("counts active filters", () => {
    expect(countActiveFilters({})).toBe(0);
    expect(
      countActiveFilters({
        status: ["completed"],
        searchQuery: "test",
        dateRange: { start: "2026-01-01" },
      }),
    ).toBe(3);
  });

  it("provides status options", () => {
    expect(MEETING_STATUS_OPTIONS).toHaveLength(4);
    expect(MEETING_STATUS_OPTIONS[0]!.value).toBe("scheduled");
  });

  it("provides sort field options", () => {
    expect(SORT_FIELD_OPTIONS).toHaveLength(4);
    expect(SORT_FIELD_OPTIONS.map((o) => o.value)).toContain("startTime");
  });
});

// ─── MeetingsTable ───────────────────────────────────────────────────

describe("MeetingsTable", () => {
  it("defines correct columns", () => {
    expect(MEETINGS_TABLE_COLUMNS).toHaveLength(6);
    const keys = MEETINGS_TABLE_COLUMNS.map((c) => c.key);
    expect(keys).toContain("title");
    expect(keys).toContain("status");
    expect(keys).toContain("startTime");
    expect(keys).toContain("duration");
    expect(keys).toContain("participantCount");
    expect(keys).toContain("actions");
  });

  it("gets sort indicator for active column", () => {
    expect(getSortIndicator("startTime", "startTime", "desc")).toBe("desc");
    expect(getSortIndicator("startTime", "startTime", "asc")).toBe("asc");
    expect(getSortIndicator("title", "startTime", "desc")).toBe("none");
  });

  it("gets next sort order", () => {
    expect(getNextSortOrder("startTime", "startTime", "desc")).toBe("asc");
    expect(getNextSortOrder("startTime", "startTime", "asc")).toBe("desc");
    expect(getNextSortOrder("title", "startTime", "desc")).toBe("desc");
  });

  it("gets cell classes with monospace", () => {
    const monoCol = { key: "duration", label: "Duration", sortable: true, monospace: true };
    expect(getCellClasses(monoCol)).toContain("meetings-table__cell--monospace");

    const normalCol = { key: "title", label: "Title", sortable: true, monospace: false };
    expect(getCellClasses(normalCol)).not.toContain("monospace");
  });

  it("returns correct empty state messages", () => {
    expect(getEmptyStateMessage(true)).toContain("No meetings match");
    expect(getEmptyStateMessage(false)).toContain("No meetings found");
  });

  it("returns loading message", () => {
    expect(getLoadingMessage()).toBe("Loading meetings...");
  });
});

// ─── MeetingRow ──────────────────────────────────────────────────────

describe("MeetingRow", () => {
  it("returns correct status labels", () => {
    expect(getStatusLabel("scheduled")).toBe("Scheduled");
    expect(getStatusLabel("in-progress")).toBe("In Progress");
    expect(getStatusLabel("completed")).toBe("Completed");
    expect(getStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("returns correct status CSS classes", () => {
    expect(getStatusClass("completed")).toBe("status--completed");
    expect(getStatusClass("in-progress")).toBe("status--in-progress");
  });

  it("formats duration correctly", () => {
    expect(formatDuration(3600000)).toBe("01:00:00");
    expect(formatDuration(90000)).toBe("01:30");
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(undefined)).toBe("—");
  });

  it("formats meeting date", () => {
    const result = formatMeetingDate("2026-04-01T10:00:00Z");
    expect(result).toContain("Apr");
    expect(result).toContain("2026");
  });

  it("handles invalid date", () => {
    expect(formatMeetingDate("not-a-date")).toBe("Invalid date");
  });

  it("formats meeting time", () => {
    const result = formatMeetingTime("2026-04-01T10:00:00Z");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it("returns available actions for a meeting", () => {
    const meeting = createMockMeeting({ status: "completed" });
    const actions = getAvailableActions(meeting);

    expect(actions).toHaveLength(3);
    expect(actions.find((a) => a.action === "view")?.enabled).toBe(true);
    expect(actions.find((a) => a.action === "export")?.enabled).toBe(true);
    expect(actions.find((a) => a.action === "delete")?.enabled).toBe(true);
  });

  it("disables export for non-completed meetings", () => {
    const meeting = createMockMeeting({ status: "scheduled" });
    const actions = getAvailableActions(meeting);
    expect(actions.find((a) => a.action === "export")?.enabled).toBe(false);
  });

  it("disables delete for in-progress meetings", () => {
    const meeting = createMockMeeting({ status: "in-progress" });
    const actions = getAvailableActions(meeting);
    expect(actions.find((a) => a.action === "delete")?.enabled).toBe(false);
  });
});

// ─── SearchInput ─────────────────────────────────────────────────────

describe("SearchInput", () => {
  it("builds correct input attributes", () => {
    const attrs = buildSearchInputAttributes({
      value: "test",
      onSearch: vi.fn(),
    });

    expect(attrs["type"]).toBe("search");
    expect(attrs["role"]).toBe("searchbox");
    expect(attrs["value"]).toBe("test");
    expect(attrs["className"]).toBe("search-input");
  });

  it("uses custom placeholder", () => {
    const attrs = buildSearchInputAttributes({
      value: "",
      placeholder: "Find meetings...",
      onSearch: vi.fn(),
    });

    expect(attrs["placeholder"]).toBe("Find meetings...");
  });

  it("shows clear button when value is non-empty", () => {
    expect(shouldShowClearButton("test")).toBe(true);
    expect(shouldShowClearButton("")).toBe(false);
  });

  it("handles search change events", () => {
    const onSearch = vi.fn();
    handleSearchChange({ target: { value: "planning" } }, onSearch);
    expect(onSearch).toHaveBeenCalledWith("planning");
  });

  it("handles clear click", () => {
    const onSearch = vi.fn();
    const onClear = vi.fn();
    handleClearClick(onSearch, onClear);
    expect(onSearch).toHaveBeenCalledWith("");
    expect(onClear).toHaveBeenCalled();
  });
});

// ─── Pagination ──────────────────────────────────────────────────────

describe("Pagination", () => {
  it("calculates page range", () => {
    expect(getPageRange(1, 20, 100)).toEqual({ start: 1, end: 20 });
    expect(getPageRange(5, 20, 100)).toEqual({ start: 81, end: 100 });
    expect(getPageRange(3, 20, 50)).toEqual({ start: 41, end: 50 });
  });

  it("generates page numbers for small page count", () => {
    const pages = getPageNumbers(1, 5);
    expect(pages).toEqual([1, 2, 3, 4, 5]);
  });

  it("generates page numbers with ellipsis for large page count", () => {
    const pages = getPageNumbers(5, 20);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(20);
    expect(pages).toContain("ellipsis");
    expect(pages).toContain(5);
  });

  it("checks prev button disabled state", () => {
    expect(isPrevDisabled(1)).toBe(true);
    expect(isPrevDisabled(2)).toBe(false);
    expect(isPrevDisabled(2, true)).toBe(true);
  });

  it("checks next button disabled state", () => {
    expect(isNextDisabled(10, 10)).toBe(true);
    expect(isNextDisabled(5, 10)).toBe(false);
    expect(isNextDisabled(5, 10, true)).toBe(true);
  });

  it("formats pagination summary", () => {
    expect(formatPaginationSummary(1, 20, 100)).toBe("Showing 1–20 of 100");
    expect(formatPaginationSummary(5, 20, 100)).toBe("Showing 81–100 of 100");
    expect(formatPaginationSummary(1, 20, 0)).toBe("No items");
  });
});
