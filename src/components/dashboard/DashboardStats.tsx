import { FC } from 'react';
import type { DashboardStats as DashboardStatsData } from '../../hooks/useDashboardData.js';

interface DashboardStatsProps {
  stats: DashboardStatsData;
  loading?: boolean;
}

function formatDuration(hours: number): string {
  return hours.toFixed(1);
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export const DashboardStats: FC<DashboardStatsProps> = ({ stats, loading }) => {
  if (loading) {
    return (
      <div className="dashboard-stats dashboard-stats--loading" role="status" aria-label="Loading statistics">
        <span>Loading statistics...</span>
      </div>
    );
  }

  const statItems = [
    { label: 'Total Meetings', value: formatNumber(stats.totalMeetings), testId: 'stat-total-meetings' },
    { label: 'Total Hours', value: formatDuration(stats.totalHours), testId: 'stat-total-hours' },
    { label: 'Avg Duration', value: `${formatNumber(stats.averageDuration)} min`, testId: 'stat-avg-duration' },
    { label: 'Active Participants', value: formatNumber(stats.activeParticipants), testId: 'stat-active-participants' },
    { label: 'Action Items', value: formatNumber(stats.actionItemCount), testId: 'stat-action-items' },
  ];

  return (
    <div className="dashboard-stats" role="region" aria-label="Meeting statistics">
      {statItems.map((item) => (
        <div key={item.testId} className="dashboard-stats__card" data-testid={item.testId}>
          <span className="dashboard-stats__label">{item.label}</span>
          <span className="dashboard-stats__value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default DashboardStats;
