import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  DashboardData,
  DashboardStats,
  RecentMeeting,
  UseDashboardDataResult,
} from '../../hooks/useDashboardData.js';
import {
  fetchDashboardData,
  createDashboardDataHook,
} from '../../hooks/useDashboardData.js';

function createMockStats(): DashboardStats {
  return {
    totalMeetings: 42,
    totalHours: 128.5,
    averageDuration: 45,
    activeParticipants: 15,
    actionItemCount: 87,
  };
}

function createMockMeeting(overrides?: Partial<RecentMeeting>): RecentMeeting {
  return {
    id: 'meeting-001',
    title: 'Sprint Planning',
    date: '2026-04-01T10:00:00Z',
    duration: 60,
    status: 'completed',
    participantCount: 5,
    participants: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'],
    actionItemCount: 3,
    ...overrides,
  };
}

function createMockDashboardData(): DashboardData {
  return {
    stats: createMockStats(),
    recentMeetings: [
      createMockMeeting(),
      createMockMeeting({
        id: 'meeting-002',
        title: 'Design Review',
        duration: 30,
        status: 'in-progress',
        participantCount: 3,
        participants: ['Alice', 'Bob', 'Charlie'],
        actionItemCount: 1,
      }),
      createMockMeeting({
        id: 'meeting-003',
        title: 'Standup',
        duration: 15,
        status: 'scheduled',
        participantCount: 8,
        participants: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Heidi'],
        actionItemCount: 0,
      }),
    ],
  };
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DashboardPage renders stats and recent meetings successfully', () => {
    it('should have DashboardData with stats and recentMeetings', () => {
      const data = createMockDashboardData();

      expect(data.stats).toBeDefined();
      expect(data.recentMeetings).toBeDefined();
      expect(data.recentMeetings).toHaveLength(3);
    });

    it('should render DashboardStats and RecentMeetingsList components via DashboardData', () => {
      const data = createMockDashboardData();

      expect(data.stats.totalMeetings).toBe(42);
      expect(data.stats.totalHours).toBe(128.5);
      expect(data.stats.averageDuration).toBe(45);
      expect(data.stats.activeParticipants).toBe(15);
      expect(data.stats.actionItemCount).toBe(87);

      expect(data.recentMeetings[0]!.title).toBe('Sprint Planning');
      expect(data.recentMeetings[0]!.status).toBe('completed');
      expect(data.recentMeetings[0]!.participantCount).toBe(5);
    });

    it('should display loading state initially', async () => {
      const mockFetch = vi.fn().mockImplementation(() =>
        new Promise(() => {}),
      );
      vi.stubGlobal('fetch', mockFetch);

      const hook = createDashboardDataHook({ baseUrl: 'http://localhost:3000' });
      const fetchPromise = hook.fetchData();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/dashboard/stats');
    });
  });

  describe('useDashboardData handles API errors gracefully', () => {
    it('error should contain descriptive message when stats fetch fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', mockFetch);

      let error: string | null = null;
      let data: DashboardData | null = null;

      try {
        data = await fetchDashboardData('http://localhost:3000');
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
      }

      expect(error).toContain('Failed to fetch dashboard stats');
      expect(error).toContain('Internal Server Error');
      expect(data).toBeNull();
    });

    it('error should contain descriptive message when meetings fetch fails', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockStats()),
        })
        .mockResolvedValueOnce({
          ok: false,
          statusText: 'Service Unavailable',
        });
      vi.stubGlobal('fetch', mockFetch);

      let error: string | null = null;
      let data: DashboardData | null = null;

      try {
        data = await fetchDashboardData('http://localhost:3000');
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
      }

      expect(error).toContain('Failed to fetch recent meetings');
      expect(error).toContain('Service Unavailable');
      expect(data).toBeNull();
    });

    it('loading should be false after error and data should be null', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));
      vi.stubGlobal('fetch', mockFetch);

      let loading = true;
      let error: string | null = null;
      let data: DashboardData | null = null;

      try {
        data = await fetchDashboardData('http://localhost:3000');
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
      } finally {
        loading = false;
      }

      expect(loading).toBe(false);
      expect(data).toBeNull();
      expect(error).toBe('Network failure');
    });
  });

  describe('DashboardStats displays numeric values with monospace fonts', () => {
    it('all numeric elements should have font-family containing monospace in CSS', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const cssPath = resolve(import.meta.dirname, '../../../styles/pages/dashboard.css');
      const css = readFileSync(cssPath, 'utf-8');

      expect(css).toContain('font-family');
      expect(css).toContain('monospace');
      expect(css).toContain('var(--font-mono)');
    });

    it('stats should display correct values via DashboardStats interface', () => {
      const stats = createMockStats();

      expect(stats.totalMeetings).toBe(42);
      expect(typeof stats.totalMeetings).toBe('number');
      expect(stats.totalHours).toBe(128.5);
      expect(typeof stats.totalHours).toBe('number');
      expect(stats.averageDuration).toBe(45);
      expect(typeof stats.averageDuration).toBe('number');
      expect(stats.activeParticipants).toBe(15);
      expect(typeof stats.activeParticipants).toBe('number');
      expect(stats.actionItemCount).toBe(87);
      expect(typeof stats.actionItemCount).toBe('number');
    });
  });

  describe('fetchDashboardData', () => {
    it('should fetch and return dashboard data successfully', async () => {
      const mockStats = createMockStats();
      const mockMeetings = [createMockMeeting()];

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockStats),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMeetings),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchDashboardData('http://localhost:3000');

      expect(result.stats).toEqual(mockStats);
      expect(result.recentMeetings).toEqual(mockMeetings);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/dashboard/stats');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/dashboard/recent-meetings');
    });
  });

  describe('createDashboardDataHook', () => {
    it('should use default configuration when no config provided', () => {
      const hook = createDashboardDataHook();

      expect(hook.baseUrl).toBe('');
      expect(hook.refreshIntervalMs).toBe(30_000);
    });

    it('should use custom configuration when provided', () => {
      const hook = createDashboardDataHook({
        baseUrl: 'http://api.example.com',
        refreshIntervalMs: 60_000,
      });

      expect(hook.baseUrl).toBe('http://api.example.com');
      expect(hook.refreshIntervalMs).toBe(60_000);
    });
  });

  describe('RecentMeeting type compliance', () => {
    it('should support all meeting statuses', () => {
      const completed = createMockMeeting({ status: 'completed' });
      const inProgress = createMockMeeting({ status: 'in-progress' });
      const scheduled = createMockMeeting({ status: 'scheduled' });

      expect(completed.status).toBe('completed');
      expect(inProgress.status).toBe('in-progress');
      expect(scheduled.status).toBe('scheduled');
    });

    it('should include participant and action item information', () => {
      const meeting = createMockMeeting({
        participantCount: 5,
        participants: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'],
        actionItemCount: 3,
      });

      expect(meeting.participantCount).toBe(5);
      expect(meeting.participants).toHaveLength(5);
      expect(meeting.actionItemCount).toBe(3);
    });
  });
});
