/**
 * Hook for managing the meetings list with search, filtering, and pagination.
 *
 * Provides debounced search, filter management, sorting, and paginated
 * data fetching for the meetings list page.
 */

import type {
  Meeting,
  MeetingsListData,
  MeetingsFilters,
  MeetingStatus,
  SortOrder,
} from "../types/meetingsList.js";

const DEFAULT_PAGE_SIZE = 20;
const DEBOUNCE_DELAY_MS = 300;

export interface UseMeetingsListOptions {
  pageSize?: number;
  initialFilters?: MeetingsFilters;
}

export interface UseMeetingsListResult {
  data: MeetingsListData;
  filters: MeetingsFilters;
  isLoading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (statuses: MeetingStatus[]) => void;
  setDateRange: (start?: string, end?: string) => void;
  setSortBy: (field: string, order: SortOrder) => void;
  setPage: (page: number) => void;
  refresh: () => Promise<void>;
}

/** Build query string from filters and pagination params. */
export function buildQueryParams(
  filters: MeetingsFilters,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams();

  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  if (filters.searchQuery) {
    params.set("search", filters.searchQuery);
  }

  if (filters.status && filters.status.length > 0) {
    params.set("status", filters.status.join(","));
  }

  if (filters.dateRange?.start) {
    params.set("dateStart", filters.dateRange.start);
  }

  if (filters.dateRange?.end) {
    params.set("dateEnd", filters.dateRange.end);
  }

  if (filters.sortBy) {
    params.set("sortBy", filters.sortBy);
  }

  if (filters.sortOrder) {
    params.set("sortOrder", filters.sortOrder);
  }

  return params.toString();
}

/** Create a debounced version of a function. */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): { call: (...args: Parameters<T>) => void; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return {
    call: (...args: Parameters<T>) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        fn(...args);
        timeoutId = null;
      }, delayMs);
    },
    cancel: () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}

/** Parse a meetings list API response into MeetingsListData. */
export function parseMeetingsResponse(responseData: unknown): MeetingsListData {
  const data = responseData as Record<string, unknown>;

  const meetings = Array.isArray(data["meetings"])
    ? (data["meetings"] as Meeting[])
    : [];

  return {
    meetings,
    total: typeof data["total"] === "number" ? data["total"] : 0,
    page: typeof data["page"] === "number" ? data["page"] : 1,
    hasMore: typeof data["hasMore"] === "boolean" ? data["hasMore"] : false,
  };
}

/** Create initial empty state for the meetings list. */
export function createInitialData(): MeetingsListData {
  return {
    meetings: [],
    total: 0,
    page: 1,
    hasMore: false,
  };
}

/** Create the default filters. */
export function createDefaultFilters(
  overrides?: MeetingsFilters,
): MeetingsFilters {
  return {
    searchQuery: "",
    status: undefined,
    dateRange: undefined,
    sortBy: "startTime",
    sortOrder: "desc",
    ...overrides,
  };
}

/**
 * Fetch meetings list from the API.
 *
 * Uses the api client's base URL and appends query parameters
 * built from the current filters and pagination state.
 */
export async function fetchMeetings(
  baseUrl: string,
  filters: MeetingsFilters,
  page: number,
  pageSize: number,
): Promise<MeetingsListData> {
  const queryString = buildQueryParams(filters, page, pageSize);
  const url = `${baseUrl}/api/meetings?${queryString}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch meetings: ${response.status} ${response.statusText}`);
  }

  const responseData: unknown = await response.json();
  return parseMeetingsResponse(responseData);
}

/**
 * Create a meetings list manager for use in the meetings page.
 *
 * Manages filter state, pagination, debounced search, and data fetching.
 */
export function createMeetingsListManager(options: UseMeetingsListOptions = {}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  let filters = createDefaultFilters(options.initialFilters);
  let currentPage = 1;
  let data = createInitialData();
  let isLoading = false;
  let error: string | null = null;
  let onChange: (() => void) | null = null;

  const debouncedFetch = debounce(async () => {
    await loadData();
  }, DEBOUNCE_DELAY_MS);

  async function loadData(fetchUrl = "/api"): Promise<void> {
    isLoading = true;
    error = null;
    onChange?.();

    try {
      data = await fetchMeetings(fetchUrl, filters, currentPage, pageSize);
      isLoading = false;
    } catch (err) {
      error = err instanceof Error ? err.message : "An unknown error occurred";
      isLoading = false;
    }

    onChange?.();
  }

  function setSearchQuery(query: string): void {
    filters = { ...filters, searchQuery: query };
    currentPage = 1;
    debouncedFetch.call();
  }

  function setStatusFilter(statuses: MeetingStatus[]): void {
    filters = { ...filters, status: statuses.length > 0 ? statuses : undefined };
    currentPage = 1;
    onChange?.();
  }

  function setDateRange(start?: string, end?: string): void {
    filters = {
      ...filters,
      dateRange: start || end ? { start, end } : undefined,
    };
    currentPage = 1;
    onChange?.();
  }

  function setSortBy(field: string, order: SortOrder): void {
    filters = { ...filters, sortBy: field, sortOrder: order };
    onChange?.();
  }

  function setPage(page: number): void {
    currentPage = page;
    onChange?.();
  }

  function getState() {
    return {
      data,
      filters,
      isLoading,
      error,
      page: currentPage,
      pageSize,
    };
  }

  return {
    getState,
    setSearchQuery,
    setStatusFilter,
    setDateRange,
    setSortBy,
    setPage,
    loadData,
    setOnChange: (cb: () => void) => {
      onChange = cb;
    },
    destroy: () => {
      debouncedFetch.cancel();
      onChange = null;
    },
  };
}

/**
 * Create a meetings list hook result from a manager instance.
 *
 * Provides the standard hook-like interface for managing meetings list state
 * with search, filtering, sorting, and pagination.
 */
export function useMeetingsList(
  options: UseMeetingsListOptions = {},
): UseMeetingsListResult {
  const manager = createMeetingsListManager(options);
  const state = manager.getState();

  return {
    data: state.data,
    filters: state.filters,
    isLoading: state.isLoading,
    error: state.error,
    page: state.page,
    pageSize: state.pageSize,
    setSearchQuery: manager.setSearchQuery,
    setStatusFilter: manager.setStatusFilter,
    setDateRange: manager.setDateRange,
    setSortBy: manager.setSortBy,
    setPage: manager.setPage,
    refresh: async () => {
      await manager.loadData();
    },
  };
}

export { DEFAULT_PAGE_SIZE, DEBOUNCE_DELAY_MS };
