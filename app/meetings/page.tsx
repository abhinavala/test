/**
 * Meetings list page.
 *
 * Displays all user meetings with search, filtering, and pagination.
 * Integrates MeetingsTable, MeetingsFilters, SearchInput, and Pagination
 * components with the useMeetingsList hook for data management.
 */

import type { MeetingsFilters, MeetingsListData } from "../../src/types/meetingsList.js";

export interface MeetingsPageProps {
  baseUrl?: string;
}

export interface MeetingsPageState {
  data: MeetingsListData;
  filters: MeetingsFilters;
  isLoading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
}

/** Compute the total number of pages from data. */
export function computeTotalPages(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** Build the page title with optional filter count. */
export function buildPageTitle(activeFilterCount: number): string {
  if (activeFilterCount > 0) {
    return `Meetings (${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} active)`;
  }
  return "Meetings";
}

/** Determine if the page should show the empty state. */
export function shouldShowEmptyState(
  data: MeetingsListData,
  isLoading: boolean,
): boolean {
  return !isLoading && data.meetings.length === 0;
}

/** Determine if the page should show the loading overlay. */
export function shouldShowLoading(isLoading: boolean): boolean {
  return isLoading;
}

/** Determine if pagination should be visible. */
export function shouldShowPagination(
  data: MeetingsListData,
  isLoading: boolean,
): boolean {
  return !isLoading && data.total > 0;
}

/** Build the page heading CSS classes. */
export function getPageClasses(): string {
  return "meetings-page";
}

export default function MeetingsPage(): MeetingsPageProps {
  return {};
}
