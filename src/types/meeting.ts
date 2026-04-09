import type { ActionItem } from "./exportContent.js";

export interface MeetingInsight {
  id: string;
  type: string;
  content: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  status: "completed" | "in-progress" | "scheduled";
  transcript?: string;
  summary?: string;
  actionItems?: ActionItem[];
  insights?: MeetingInsight[];
}

export type MeetingStatus = Meeting["status"];

export interface DateRange {
  start: string;
  end: string;
}

export interface DurationRange {
  min?: number;
  max?: number;
}

export interface MeetingFilters {
  search?: string;
  dateRange?: DateRange;
  status?: MeetingStatus[];
  participants?: string[];
  duration?: DurationRange;
}

export type MeetingSortField = "date" | "title" | "duration" | "participants";
export type SortDirection = "asc" | "desc";

export interface MeetingSortOptions {
  field: MeetingSortField;
  direction: SortDirection;
}

export interface MeetingSortParams {
  sort?: MeetingSortOptions;
}

export interface MeetingListParams {
  filters?: MeetingFilters;
  sort?: MeetingSortOptions;
  pagination?: PaginationParams;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
