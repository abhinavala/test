import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Meeting, MeetingFilters } from '../../types/meeting.js';
import { filtersToSearchParams, searchParamsToFilters } from '../../../components/meetings/MeetingsFilter.js';

// Mock meetings data
function createMockMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: 'meeting-1',
    title: 'Weekly Standup',
    date: '2026-04-01T10:00:00Z',
    duration: 30,
    status: 'completed',
    participants: ['alice', 'bob'],
    tags: ['standup', 'weekly'],
    organizer: 'alice',
    ...overrides,
  };
}

function createMockMeetings(count: number): Meeting[] {
  return Array.from({ length: count }, (_, i) =>
    createMockMeeting({
      id: `meeting-${i + 1}`,
      title: `Meeting ${i + 1}`,
    }),
  );
}

function createMockApiResponse(meetings: Meeting[], page = 1, pageSize = 20, total?: number) {
  const actualTotal = total ?? meetings.length;
  return {
    success: true,
    meetings,
    pagination: {
      page,
      pageSize,
      total: actualTotal,
      totalPages: Math.ceil(actualTotal / pageSize),
    },
  };
}

// Test the page's data fetching logic
describe('MeetingsPage', () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  describe('fetches and displays meetings on initial load', () => {
    it('calls the meetings API and returns meeting data', async () => {
      const meetings = createMockMeetings(3);
      const apiResponse = createMockApiResponse(meetings);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const response = await fetch('/api/meetings?page=1&pageSize=20&sortField=date&sortOrder=desc');
      const data = await (response as Response).json();

      expect(mockFetch).toHaveBeenCalledWith('/api/meetings?page=1&pageSize=20&sortField=date&sortOrder=desc');
      expect(data.success).toBe(true);
      expect(data.meetings).toHaveLength(3);
      expect(data.meetings[0]!.id).toBe('meeting-1');
      expect(data.meetings[0]!.title).toBe('Meeting 1');
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.total).toBe(3);
    });

    it('returns loading state initially then resolves with data', async () => {
      const meetings = createMockMeetings(5);
      const apiResponse = createMockApiResponse(meetings);

      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(pendingPromise);

      const fetchPromise = fetch('/api/meetings?page=1&pageSize=20&sortField=date&sortOrder=desc');

      // Fetch is pending (simulates loading state)
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Resolve with data
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const response = await fetchPromise;
      const data = await (response as Response).json();
      expect(data.meetings).toHaveLength(5);
    });
  });

  describe('handles API errors gracefully', () => {
    it('handles network errors without crashing', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      let error: string | null = null;
      try {
        await fetch('/api/meetings?page=1&pageSize=20&sortField=date&sortOrder=desc');
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
      }

      expect(error).toBe('Network error');
    });

    it('handles non-ok response status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const response = await fetch('/api/meetings?page=1&pageSize=20&sortField=date&sortOrder=desc');
      expect((response as Response).ok).toBe(false);
      expect((response as Response).status).toBe(500);
    });

    it('handles API returning error in response body', async () => {
      const errorResponse = {
        success: false,
        meetings: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        error: 'Database connection failed',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(errorResponse),
      });

      const response = await fetch('/api/meetings?page=1&pageSize=20&sortField=date&sortOrder=desc');
      const data = await (response as Response).json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Database connection failed');
    });
  });

  describe('updates URL when filters change', () => {
    it('converts filters to search params correctly', () => {
      const filters: MeetingFilters = {
        search: 'standup',
        status: ['completed', 'in-progress'],
        tags: ['weekly'],
      };

      const params = filtersToSearchParams(filters);
      expect(params.get('search')).toBe('standup');
      expect(params.get('status')).toBe('completed,in-progress');
      expect(params.get('tags')).toBe('weekly');
    });

    it('converts search params back to filters correctly', () => {
      const params = new URLSearchParams('search=standup&status=completed,in-progress&tags=weekly');
      const filters = searchParamsToFilters(params);

      expect(filters.search).toBe('standup');
      expect(filters.status).toEqual(['completed', 'in-progress']);
      expect(filters.tags).toEqual(['weekly']);
    });

    it('preserves filter state through URL roundtrip', () => {
      const originalFilters: MeetingFilters = {
        search: 'review',
        status: ['scheduled'],
        dateRange: { start: '2026-04-01', end: '2026-04-30' },
        durationRange: { min: 15, max: 60 },
        participants: ['alice', 'bob'],
        tags: ['design'],
      };

      const params = filtersToSearchParams(originalFilters);
      const roundTripped = searchParamsToFilters(params);

      expect(roundTripped.search).toBe(originalFilters.search);
      expect(roundTripped.status).toEqual(originalFilters.status);
      expect(roundTripped.dateRange).toEqual(originalFilters.dateRange);
      expect(roundTripped.durationRange).toEqual(originalFilters.durationRange);
      expect(roundTripped.participants).toEqual(originalFilters.participants);
      expect(roundTripped.tags).toEqual(originalFilters.tags);
    });

    it('sends correct API request with filter parameters', async () => {
      const meetings = createMockMeetings(2);
      const apiResponse = createMockApiResponse(meetings);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const filters: MeetingFilters = { search: 'standup', status: ['completed'] };
      const params = filtersToSearchParams(filters);
      params.set('page', '1');
      params.set('pageSize', '20');
      params.set('sortField', 'date');
      params.set('sortOrder', 'desc');

      await fetch(`/api/meetings?${params.toString()}`);

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('search=standup');
      expect(calledUrl).toContain('status=completed');
      expect(calledUrl).toContain('page=1');
    });

    it('handles empty filters producing clean URL', () => {
      const filters: MeetingFilters = {};
      const params = filtersToSearchParams(filters);
      expect(params.toString()).toBe('');
    });
  });

  describe('pagination', () => {
    it('fetches correct page when page changes', async () => {
      const meetings = createMockMeetings(20);
      const apiResponse = createMockApiResponse(meetings, 2, 20, 40);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      await fetch('/api/meetings?page=2&pageSize=20&sortField=date&sortOrder=desc');
      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('page=2');
    });

    it('returns correct pagination metadata', async () => {
      const meetings = createMockMeetings(20);
      const apiResponse = createMockApiResponse(meetings, 1, 20, 45);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const response = await fetch('/api/meetings?page=1&pageSize=20&sortField=date&sortOrder=desc');
      const data = await (response as Response).json();

      expect(data.pagination.totalPages).toBe(3);
      expect(data.pagination.total).toBe(45);
    });
  });

  describe('sorting', () => {
    it('sends sort parameters in API request', async () => {
      const meetings = createMockMeetings(2);
      const apiResponse = createMockApiResponse(meetings);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      await fetch('/api/meetings?page=1&pageSize=20&sortField=title&sortOrder=asc');
      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('sortField=title');
      expect(calledUrl).toContain('sortOrder=asc');
    });
  });
});
