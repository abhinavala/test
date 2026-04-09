export interface DashboardStats {
  totalMeetings: number;
  totalHours: number;
  averageDuration: number;
  activeParticipants: number;
  actionItemCount: number;
}

export interface RecentMeeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  status: 'completed' | 'in-progress' | 'scheduled';
  participantCount: number;
  participants: string[];
  actionItemCount: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentMeetings: RecentMeeting[];
}

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

export function createDashboardDataHook(config?: { baseUrl?: string; refreshIntervalMs?: number }) {
  const baseUrl = config?.baseUrl ?? '';
  const refreshIntervalMs = config?.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;

  return {
    baseUrl,
    refreshIntervalMs,
    fetchData: () => fetchDashboardData(baseUrl),
  };
}
