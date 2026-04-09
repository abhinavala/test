/**
 * Common shared types used across the meetings list feature.
 * Provides generic pagination, sorting, and response structures.
 */

/** Sort direction for list queries. */
export type SortDirection = "asc" | "desc";

/** Generic paginated response wrapper. */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

/** Pagination metadata returned with list responses. */
export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Pagination parameters for list requests. */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/** Generic search/query parameters from URL query strings. */
export interface SearchParams {
  [key: string]: string | string[] | undefined;
}
