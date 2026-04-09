import type { DashboardData, DashboardStats, RecentMeeting } from '../types/dashboard.js';

export type { DashboardData, DashboardStats, RecentMeeting };

export interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

export async function fetchDashboardData(
  baseUrl: string,
): Promise<DashboardData> {
  const statsResponse = await fetch(`${baseUrl}/api/dashboard/stats`);
  if (!statsResponse.ok) {
    throw new Error(`Failed to fetch dashboard stats: ${statsResponse.statusText}`);
  }
  const stats: DashboardStats = await statsResponse.json() as DashboardStats;

  const meetingsResponse = await fetch(`${baseUrl}/api/dashboard/recent-meetings`);
  if (!meetingsResponse.ok) {
    throw new Error(`Failed to fetch recent meetings: ${meetingsResponse.statusText}`);
  }
  const recentMeetings: RecentMeeting[] = await meetingsResponse.json() as RecentMeeting[];

  return { stats, recentMeetings };
}

export function useDashboardData(config?: { baseUrl?: string; refreshIntervalMs?: number }): UseDashboardDataResult {
  const baseUrl = config?.baseUrl ?? '';
  const refreshIntervalMs = config?.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;

  let data: DashboardData | null = null;
  let loading = true;
  let error: string | null = null;

  const refresh = async (): Promise<void> => {
    try {
      loading = true;
      error = null;
      data = await fetchDashboardData(baseUrl);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load dashboard data';
      data = null;
    } finally {
      loading = false;
    }
  };

  return { data, loading, error, refresh };
}

export function createDashboardDataHook(config?: { baseUrl?: string; refreshIntervalMs?: number }) {
  const baseUrl = config?.baseUrl ?? '';
  const refreshIntervalMs = config?.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;

  return {
    baseUrl,
    refreshIntervalMs,
    fetchData: () => fetchDashboardData(baseUrl),
  };
}
