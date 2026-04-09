/**
 * MeetingsFilter component controller — combines search input and multiple
 * filter dropdowns into a cohesive filtering interface for the meetings list.
 *
 * Uses the same controller pattern as SearchInput and FilterDropdown so it
 * remains framework-agnostic. Manages filter state, debouncing, URL-param
 * sync, date-range validation, and a "clear all" action.
 */

import type { MeetingFilters, MeetingStatus, DateRange, DurationRange } from "../../src/types/meeting.js";
import type { SearchInputProps } from "../ui/SearchInput.js";
import type { FilterDropdownProps, FilterOption } from "../ui/FilterDropdown.js";
import { createSearchInputController } from "../ui/SearchInput.js";
import { createFilterDropdownController } from "../ui/FilterDropdown.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MeetingsFilterProps {
  initialFilters?: MeetingFilters;
  onFiltersChange: (filters: MeetingFilters) => void;
  loading?: boolean;
}

export interface MeetingsFilterState {
  filters: MeetingFilters;
  dateRangeError: string | null;
  activeFilterCount: number;
}

// ---------------------------------------------------------------------------
// Filter option constants
// ---------------------------------------------------------------------------

export const STATUS_OPTIONS: FilterOption<MeetingStatus>[] = [
  { label: "Scheduled", value: "scheduled" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

export const DURATION_OPTIONS: FilterOption<string>[] = [
  { label: "Under 15 min", value: "0-15" },
  { label: "15–30 min", value: "15-30" },
  { label: "30–60 min", value: "30-60" },
  { label: "Over 60 min", value: "60-" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDurationOption(value: string): DurationRange {
  const [minStr, maxStr] = value.split("-");
  const min = minStr ? Number(minStr) : undefined;
  const max = maxStr ? Number(maxStr) : undefined;
  return { min, max };
}

function durationRangeToOption(range: DurationRange | undefined): string[] {
  if (!range) return [];
  const tag = `${range.min ?? ""}-${range.max ?? ""}`;
  if (DURATION_OPTIONS.some((o) => o.value === tag)) return [tag];
  return [];
}

function isEmptyFilters(filters: MeetingFilters): boolean {
  return (
    !filters.search &&
    !filters.dateRange?.from &&
    !filters.dateRange?.to &&
    (!filters.status || filters.status.length === 0) &&
    (!filters.participants || filters.participants.length === 0) &&
    !filters.duration?.min &&
    !filters.duration?.max
  );
}

function countActiveFilters(filters: MeetingFilters): number {
  let count = 0;
  if (filters.search) count++;
  if (filters.dateRange?.from || filters.dateRange?.to) count++;
  if (filters.status && filters.status.length > 0) count++;
  if (filters.participants && filters.participants.length > 0) count++;
  if (filters.duration?.min !== undefined || filters.duration?.max !== undefined) count++;
  return count;
}

function validateDateRange(range: DateRange | undefined): string | null {
  if (!range?.from || !range?.to) return null;
  if (range.from > range.to) {
    return "End date must be after start date";
  }
  return null;
}

// ---------------------------------------------------------------------------
// URL parameter helpers
// ---------------------------------------------------------------------------

export function filtersToSearchParams(filters: MeetingFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.dateRange?.from) params.set("dateFrom", filters.dateRange.from);
  if (filters.dateRange?.to) params.set("dateTo", filters.dateRange.to);
  if (filters.status && filters.status.length > 0) {
    params.set("status", filters.status.join(","));
  }
  if (filters.participants && filters.participants.length > 0) {
    params.set("participants", filters.participants.join(","));
  }
  if (filters.duration?.min !== undefined) params.set("durationMin", String(filters.duration.min));
  if (filters.duration?.max !== undefined) params.set("durationMax", String(filters.duration.max));

  return params;
}

export function searchParamsToFilters(params: URLSearchParams): MeetingFilters {
  const filters: MeetingFilters = {};

  const search = params.get("search");
  if (search) filters.search = search;

  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (dateFrom || dateTo) {
    filters.dateRange = { from: dateFrom ?? undefined, to: dateTo ?? undefined };
  }

  const status = params.get("status");
  if (status) {
    filters.status = status.split(",") as MeetingStatus[];
  }

  const participants = params.get("participants");
  if (participants) {
    filters.participants = participants.split(",");
  }

  const durationMin = params.get("durationMin");
  const durationMax = params.get("durationMax");
  if (durationMin !== null || durationMax !== null) {
    filters.duration = {
      min: durationMin !== null ? Number(durationMin) : undefined,
      max: durationMax !== null ? Number(durationMax) : undefined,
    };
  }

  return filters;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export function createMeetingsFilterController(props: MeetingsFilterProps) {
  let filters: MeetingFilters = { ...(props.initialFilters ?? {}) };
  let dateRangeError: string | null = validateDateRange(filters.dateRange);

  // --- Search sub-controller (300ms debounce) ---
  const searchController = createSearchInputController((value: string) => {
    filters = { ...filters, search: value || undefined };
    emitChange();
  });

  function getState(): MeetingsFilterState {
    return {
      filters: { ...filters },
      dateRangeError,
      activeFilterCount: countActiveFilters(filters),
    };
  }

  function emitChange(): void {
    props.onFiltersChange({ ...filters });
  }

  // --- Search ---
  function handleSearchChange(value: string): void {
    searchController.handleChange(value);
  }

  function getSearchProps(): SearchInputProps {
    return {
      value: filters.search ?? "",
      onChange: handleSearchChange,
      placeholder: "Search meetings...",
    };
  }

  // --- Status filter ---
  function handleStatusChange(selected: MeetingStatus[]): void {
    filters = { ...filters, status: selected.length > 0 ? selected : undefined };
    emitChange();
  }

  function getStatusDropdownProps(): FilterDropdownProps<MeetingStatus> {
    return {
      options: STATUS_OPTIONS,
      selected: filters.status ?? [],
      onChange: handleStatusChange,
      placeholder: "Status",
      multiSelect: true,
    };
  }

  // --- Date range ---
  function handleDateFromChange(value: string): void {
    const dateRange: DateRange = { ...filters.dateRange, from: value || undefined };
    const error = validateDateRange(dateRange);
    dateRangeError = error;
    if (!error) {
      filters = { ...filters, dateRange: dateRange.from || dateRange.to ? dateRange : undefined };
      emitChange();
    }
  }

  function handleDateToChange(value: string): void {
    const dateRange: DateRange = { ...filters.dateRange, to: value || undefined };
    const error = validateDateRange(dateRange);
    dateRangeError = error;
    if (!error) {
      filters = { ...filters, dateRange: dateRange.from || dateRange.to ? dateRange : undefined };
      emitChange();
    }
  }

  function getDateRangeValues(): { from: string; to: string } {
    return {
      from: filters.dateRange?.from ?? "",
      to: filters.dateRange?.to ?? "",
    };
  }

  // --- Duration filter ---
  function handleDurationChange(selected: string[]): void {
    if (selected.length === 0) {
      filters = { ...filters, duration: undefined };
    } else {
      filters = { ...filters, duration: parseDurationOption(selected[0]) };
    }
    emitChange();
  }

  function getDurationDropdownProps(): FilterDropdownProps<string> {
    return {
      options: DURATION_OPTIONS,
      selected: durationRangeToOption(filters.duration),
      onChange: handleDurationChange,
      placeholder: "Duration",
      multiSelect: false,
    };
  }

  // --- Participants filter ---
  function handleParticipantsChange(selected: string[]): void {
    filters = { ...filters, participants: selected.length > 0 ? selected : undefined };
    emitChange();
  }

  function getParticipantsDropdownProps(
    participantOptions: FilterOption<string>[],
  ): FilterDropdownProps<string> {
    return {
      options: participantOptions,
      selected: filters.participants ?? [],
      onChange: handleParticipantsChange,
      placeholder: "Participants",
      multiSelect: true,
    };
  }

  // --- Clear all ---
  function clearAllFilters(): void {
    filters = {};
    dateRangeError = null;
    searchController.handleClear();
    props.onFiltersChange({});
  }

  function hasActiveFilters(): boolean {
    return !isEmptyFilters(filters);
  }

  // --- Cleanup ---
  function destroy(): void {
    searchController.destroy();
  }

  return {
    getState,
    handleSearchChange,
    getSearchProps,
    handleStatusChange,
    getStatusDropdownProps,
    handleDateFromChange,
    handleDateToChange,
    getDateRangeValues,
    handleDurationChange,
    getDurationDropdownProps,
    handleParticipantsChange,
    getParticipantsDropdownProps,
    clearAllFilters,
    hasActiveFilters,
    destroy,
  };
}

// ---------------------------------------------------------------------------
// Attribute helpers (for rendering)
// ---------------------------------------------------------------------------

export function getMeetingsFilterAttributes(
  state: MeetingsFilterState,
  loading?: boolean,
): {
  role: string;
  "aria-label": string;
  className: string;
  "aria-busy": boolean;
} {
  return {
    role: "search",
    "aria-label": "Filter meetings",
    className: [
      "meetings-filter",
      loading ? "meetings-filter--loading" : "",
    ].filter(Boolean).join(" "),
    "aria-busy": loading ?? false,
  };
}

export function getClearButtonAttributes(hasActive: boolean): {
  role: string;
  "aria-label": string;
  disabled: boolean;
  className: string;
} {
  return {
    role: "button",
    "aria-label": "Clear all filters",
    disabled: !hasActive,
    className: [
      "meetings-filter__clear-btn",
      hasActive ? "meetings-filter__clear-btn--active" : "",
    ].filter(Boolean).join(" "),
  };
}

export function getActiveFilterBadgeAttributes(count: number): {
  "aria-label": string;
  className: string;
  visible: boolean;
} {
  return {
    "aria-label": `${count} active filter${count !== 1 ? "s" : ""}`,
    className: "meetings-filter__badge",
    visible: count > 0,
  };
}

export function getDateRangeErrorAttributes(error: string | null): {
  role: string;
  "aria-live": string;
  className: string;
  visible: boolean;
  message: string;
} {
  return {
    role: "alert",
    "aria-live": "polite",
    className: "meetings-filter__date-error",
    visible: error !== null,
    message: error ?? "",
  };
}

// ---------------------------------------------------------------------------
// useFilterState — standalone filter state manager
// ---------------------------------------------------------------------------

export interface UseFilterStateOptions {
  initialFilters?: MeetingFilters;
  onFiltersChange?: (filters: MeetingFilters) => void;
}

export interface UseFilterStateReturn {
  filters: MeetingFilters;
  setSearch: (value: string) => void;
  setStatus: (status: MeetingStatus[]) => void;
  setDateRange: (range: DateRange | undefined) => void;
  setDuration: (range: DurationRange | undefined) => void;
  setParticipants: (participants: string[]) => void;
  clearAll: () => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  dateRangeError: string | null;
}

export function useFilterState(options: UseFilterStateOptions = {}): UseFilterStateReturn {
  let filters: MeetingFilters = { ...(options.initialFilters ?? {}) };
  let dateRangeError: string | null = validateDateRange(filters.dateRange);

  function notify(): void {
    options.onFiltersChange?.({ ...filters });
  }

  function setSearch(value: string): void {
    filters = { ...filters, search: value || undefined };
    notify();
  }

  function setStatus(status: MeetingStatus[]): void {
    filters = { ...filters, status: status.length > 0 ? status : undefined };
    notify();
  }

  function setDateRange(range: DateRange | undefined): void {
    const error = validateDateRange(range);
    dateRangeError = error;
    if (!error) {
      filters = { ...filters, dateRange: range };
      notify();
    }
  }

  function setDuration(range: DurationRange | undefined): void {
    filters = { ...filters, duration: range };
    notify();
  }

  function setParticipants(participants: string[]): void {
    filters = { ...filters, participants: participants.length > 0 ? participants : undefined };
    notify();
  }

  function clearAll(): void {
    filters = {};
    dateRangeError = null;
    notify();
  }

  return {
    get filters() { return { ...filters }; },
    setSearch,
    setStatus,
    setDateRange,
    setDuration,
    setParticipants,
    clearAll,
    get hasActiveFilters() { return !isEmptyFilters(filters); },
    get activeFilterCount() { return countActiveFilters(filters); },
    get dateRangeError() { return dateRangeError; },
  };
}

export default createMeetingsFilterController;
