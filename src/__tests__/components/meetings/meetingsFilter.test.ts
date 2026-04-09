import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMeetingsFilterController,
  useFilterState,
  filtersToSearchParams,
  searchParamsToFilters,
  getMeetingsFilterAttributes,
  getClearButtonAttributes,
  getActiveFilterBadgeAttributes,
  getDateRangeErrorAttributes,
  STATUS_OPTIONS,
  DURATION_OPTIONS,
} from "../../../../components/meetings/MeetingsFilter.tsx";
import type { MeetingsFilterProps } from "../../../../components/meetings/MeetingsFilter.tsx";
import type { MeetingFilters } from "../../types/meeting.js";

function makeProps(overrides?: Partial<MeetingsFilterProps>): MeetingsFilterProps {
  return {
    onFiltersChange: vi.fn(),
    ...overrides,
  };
}

describe("createMeetingsFilterController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Search ---

  it("calls onFiltersChange when search input changes (after debounce)", () => {
    const props = makeProps();
    const ctrl = createMeetingsFilterController(props);

    ctrl.handleSearchChange("standup");
    // Should not fire immediately (debounced)
    expect(props.onFiltersChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(props.onFiltersChange).toHaveBeenCalledTimes(1);
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: "standup" }),
    );

    ctrl.destroy();
  });

  it("debounces rapid search input changes", () => {
    const props = makeProps();
    const ctrl = createMeetingsFilterController(props);

    ctrl.handleSearchChange("s");
    vi.advanceTimersByTime(100);
    ctrl.handleSearchChange("st");
    vi.advanceTimersByTime(100);
    ctrl.handleSearchChange("sta");
    vi.advanceTimersByTime(300);

    expect(props.onFiltersChange).toHaveBeenCalledTimes(1);
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: "sta" }),
    );

    ctrl.destroy();
  });

  // --- Status filter ---

  it("calls onFiltersChange when status filter changes", () => {
    const props = makeProps();
    const ctrl = createMeetingsFilterController(props);

    ctrl.handleStatusChange(["completed", "scheduled"]);
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: ["completed", "scheduled"] }),
    );

    ctrl.destroy();
  });

  it("provides correct status dropdown props", () => {
    const props = makeProps({ initialFilters: { status: ["completed"] } });
    const ctrl = createMeetingsFilterController(props);
    const dropdownProps = ctrl.getStatusDropdownProps();

    expect(dropdownProps.options).toEqual(STATUS_OPTIONS);
    expect(dropdownProps.selected).toEqual(["completed"]);
    expect(dropdownProps.multiSelect).toBe(true);
    expect(dropdownProps.placeholder).toBe("Status");

    ctrl.destroy();
  });

  // --- Date range ---

  it("calls onFiltersChange when date range changes", () => {
    const props = makeProps();
    const ctrl = createMeetingsFilterController(props);

    ctrl.handleDateFromChange("2026-01-01");
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dateRange: { from: "2026-01-01", to: undefined },
      }),
    );

    ctrl.handleDateToChange("2026-01-31");
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dateRange: { from: "2026-01-01", to: "2026-01-31" },
      }),
    );

    ctrl.destroy();
  });

  it("shows error for invalid date ranges and prevents onFiltersChange", () => {
    const props = makeProps();
    const ctrl = createMeetingsFilterController(props);

    ctrl.handleDateFromChange("2026-03-15");
    expect(props.onFiltersChange).toHaveBeenCalledTimes(1);

    // Set end date before start date
    ctrl.handleDateToChange("2026-03-01");
    // Should NOT have fired again — invalid range
    expect(props.onFiltersChange).toHaveBeenCalledTimes(1);

    const state = ctrl.getState();
    expect(state.dateRangeError).toBe("End date must be after start date");

    ctrl.destroy();
  });

  it("clears date range error when range becomes valid", () => {
    const props = makeProps();
    const ctrl = createMeetingsFilterController(props);

    ctrl.handleDateFromChange("2026-03-15");
    ctrl.handleDateToChange("2026-03-01"); // invalid
    expect(ctrl.getState().dateRangeError).not.toBeNull();

    ctrl.handleDateToChange("2026-03-20"); // valid
    expect(ctrl.getState().dateRangeError).toBeNull();

    ctrl.destroy();
  });

  // --- Duration filter ---

  it("calls onFiltersChange when duration filter changes", () => {
    const props = makeProps();
    const ctrl = createMeetingsFilterController(props);

    ctrl.handleDurationChange(["30-60"]);
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ duration: { min: 30, max: 60 } }),
    );

    ctrl.destroy();
  });

  it("clears duration when empty selection", () => {
    const props = makeProps({ initialFilters: { duration: { min: 30, max: 60 } } });
    const ctrl = createMeetingsFilterController(props);

    ctrl.handleDurationChange([]);
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ duration: undefined }),
    );

    ctrl.destroy();
  });

  // --- Participants filter ---

  it("calls onFiltersChange when participants filter changes", () => {
    const props = makeProps();
    const ctrl = createMeetingsFilterController(props);

    ctrl.handleParticipantsChange(["alice", "bob"]);
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ participants: ["alice", "bob"] }),
    );

    ctrl.destroy();
  });

  // --- Clear all ---

  it("clears all filters and resets state", () => {
    const props = makeProps({
      initialFilters: {
        search: "meeting",
        status: ["completed"],
        dateRange: { from: "2026-01-01", to: "2026-01-31" },
        participants: ["alice"],
        duration: { min: 30, max: 60 },
      },
    });
    const ctrl = createMeetingsFilterController(props);

    ctrl.clearAllFilters();

    expect(props.onFiltersChange).toHaveBeenCalledWith({});

    const state = ctrl.getState();
    expect(state.filters).toEqual({});
    expect(state.dateRangeError).toBeNull();
    expect(state.activeFilterCount).toBe(0);

    ctrl.destroy();
  });

  // --- Active filter count ---

  it("counts active filters correctly", () => {
    const props = makeProps({
      initialFilters: {
        search: "test",
        status: ["completed"],
        duration: { min: 15, max: 30 },
      },
    });
    const ctrl = createMeetingsFilterController(props);
    const state = ctrl.getState();

    expect(state.activeFilterCount).toBe(3);

    ctrl.destroy();
  });

  it("returns 0 active filters for empty state", () => {
    const ctrl = createMeetingsFilterController(makeProps());
    expect(ctrl.getState().activeFilterCount).toBe(0);
    ctrl.destroy();
  });

  // --- hasActiveFilters ---

  it("hasActiveFilters returns true when filters are set", () => {
    const ctrl = createMeetingsFilterController(
      makeProps({ initialFilters: { search: "test" } }),
    );
    expect(ctrl.hasActiveFilters()).toBe(true);
    ctrl.destroy();
  });

  it("hasActiveFilters returns false for empty filters", () => {
    const ctrl = createMeetingsFilterController(makeProps());
    expect(ctrl.hasActiveFilters()).toBe(false);
    ctrl.destroy();
  });

  // --- Initial filters ---

  it("initializes with provided filters", () => {
    const initial: MeetingFilters = {
      search: "sprint",
      status: ["scheduled"],
    };
    const ctrl = createMeetingsFilterController(makeProps({ initialFilters: initial }));
    const state = ctrl.getState();

    expect(state.filters.search).toBe("sprint");
    expect(state.filters.status).toEqual(["scheduled"]);

    ctrl.destroy();
  });
});

// ---------------------------------------------------------------------------
// URL param helpers
// ---------------------------------------------------------------------------

describe("filtersToSearchParams", () => {
  it("serializes all filter fields", () => {
    const filters: MeetingFilters = {
      search: "demo",
      dateRange: { from: "2026-01-01", to: "2026-01-31" },
      status: ["completed", "scheduled"],
      participants: ["alice", "bob"],
      duration: { min: 15, max: 60 },
    };
    const params = filtersToSearchParams(filters);

    expect(params.get("search")).toBe("demo");
    expect(params.get("dateFrom")).toBe("2026-01-01");
    expect(params.get("dateTo")).toBe("2026-01-31");
    expect(params.get("status")).toBe("completed,scheduled");
    expect(params.get("participants")).toBe("alice,bob");
    expect(params.get("durationMin")).toBe("15");
    expect(params.get("durationMax")).toBe("60");
  });

  it("omits empty filter fields", () => {
    const params = filtersToSearchParams({});
    expect([...params.entries()]).toHaveLength(0);
  });
});

describe("searchParamsToFilters", () => {
  it("deserializes all filter fields", () => {
    const params = new URLSearchParams(
      "search=demo&dateFrom=2026-01-01&dateTo=2026-01-31&status=completed,scheduled&participants=alice,bob&durationMin=15&durationMax=60",
    );
    const filters = searchParamsToFilters(params);

    expect(filters.search).toBe("demo");
    expect(filters.dateRange).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    expect(filters.status).toEqual(["completed", "scheduled"]);
    expect(filters.participants).toEqual(["alice", "bob"]);
    expect(filters.duration).toEqual({ min: 15, max: 60 });
  });

  it("returns empty object for empty params", () => {
    const filters = searchParamsToFilters(new URLSearchParams());
    expect(filters).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

describe("getMeetingsFilterAttributes", () => {
  it("returns correct attributes", () => {
    const attrs = getMeetingsFilterAttributes(
      { filters: {}, dateRangeError: null, activeFilterCount: 0 },
      false,
    );
    expect(attrs.role).toBe("search");
    expect(attrs["aria-label"]).toBe("Filter meetings");
    expect(attrs.className).toBe("meetings-filter");
    expect(attrs["aria-busy"]).toBe(false);
  });

  it("adds loading class when loading", () => {
    const attrs = getMeetingsFilterAttributes(
      { filters: {}, dateRangeError: null, activeFilterCount: 0 },
      true,
    );
    expect(attrs.className).toContain("meetings-filter--loading");
    expect(attrs["aria-busy"]).toBe(true);
  });
});

describe("getClearButtonAttributes", () => {
  it("is disabled when no active filters", () => {
    const attrs = getClearButtonAttributes(false);
    expect(attrs.disabled).toBe(true);
    expect(attrs.className).not.toContain("--active");
  });

  it("is enabled when filters are active", () => {
    const attrs = getClearButtonAttributes(true);
    expect(attrs.disabled).toBe(false);
    expect(attrs.className).toContain("--active");
  });
});

describe("getActiveFilterBadgeAttributes", () => {
  it("is hidden when count is 0", () => {
    const attrs = getActiveFilterBadgeAttributes(0);
    expect(attrs.visible).toBe(false);
  });

  it("is visible with correct label for multiple filters", () => {
    const attrs = getActiveFilterBadgeAttributes(3);
    expect(attrs.visible).toBe(true);
    expect(attrs["aria-label"]).toBe("3 active filters");
  });

  it("uses singular label for 1 filter", () => {
    const attrs = getActiveFilterBadgeAttributes(1);
    expect(attrs["aria-label"]).toBe("1 active filter");
  });
});

describe("getDateRangeErrorAttributes", () => {
  it("is hidden when no error", () => {
    const attrs = getDateRangeErrorAttributes(null);
    expect(attrs.visible).toBe(false);
    expect(attrs.message).toBe("");
  });

  it("is visible with message when error exists", () => {
    const attrs = getDateRangeErrorAttributes("End date must be after start date");
    expect(attrs.visible).toBe(true);
    expect(attrs.message).toBe("End date must be after start date");
    expect(attrs.role).toBe("alert");
  });
});

// ---------------------------------------------------------------------------
// useFilterState
// ---------------------------------------------------------------------------

describe("useFilterState", () => {
  it("initializes with provided filters", () => {
    const state = useFilterState({ initialFilters: { search: "hello" } });
    expect(state.filters.search).toBe("hello");
    expect(state.hasActiveFilters).toBe(true);
    expect(state.activeFilterCount).toBe(1);
  });

  it("setSearch updates filters and notifies", () => {
    const onChange = vi.fn();
    const state = useFilterState({ onFiltersChange: onChange });

    state.setSearch("standup");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: "standup" }));
  });

  it("setStatus updates filters and notifies", () => {
    const onChange = vi.fn();
    const state = useFilterState({ onFiltersChange: onChange });

    state.setStatus(["completed", "scheduled"]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: ["completed", "scheduled"] }),
    );
  });

  it("setDateRange validates and rejects invalid ranges", () => {
    const onChange = vi.fn();
    const state = useFilterState({ onFiltersChange: onChange });

    state.setDateRange({ from: "2026-03-15", to: "2026-03-01" });
    expect(onChange).not.toHaveBeenCalled();
    expect(state.dateRangeError).toBe("End date must be after start date");
  });

  it("setDateRange accepts valid ranges", () => {
    const onChange = vi.fn();
    const state = useFilterState({ onFiltersChange: onChange });

    state.setDateRange({ from: "2026-01-01", to: "2026-01-31" });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ dateRange: { from: "2026-01-01", to: "2026-01-31" } }),
    );
    expect(state.dateRangeError).toBeNull();
  });

  it("setDuration updates filters", () => {
    const onChange = vi.fn();
    const state = useFilterState({ onFiltersChange: onChange });

    state.setDuration({ min: 30, max: 60 });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ duration: { min: 30, max: 60 } }),
    );
  });

  it("setParticipants updates filters", () => {
    const onChange = vi.fn();
    const state = useFilterState({ onFiltersChange: onChange });

    state.setParticipants(["alice"]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ participants: ["alice"] }),
    );
  });

  it("clearAll resets all filters", () => {
    const onChange = vi.fn();
    const state = useFilterState({
      initialFilters: { search: "test", status: ["completed"] },
      onFiltersChange: onChange,
    });

    state.clearAll();
    expect(onChange).toHaveBeenCalledWith({});
    expect(state.hasActiveFilters).toBe(false);
    expect(state.activeFilterCount).toBe(0);
  });
});
