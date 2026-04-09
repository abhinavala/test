import { FC, useState, useEffect, useCallback } from 'react';
import { DashboardStats } from '../../src/components/dashboard/DashboardStats.js';
import { RecentMeetingsList } from '../../src/components/dashboard/RecentMeetingsList.js';
import { QuickActions } from '../../src/components/dashboard/QuickActions.js';
import { fetchDashboardData } from '../../src/hooks/useDashboardData.js';
import type { DashboardData } from '../../src/hooks/useDashboardData.js';
import '../../styles/pages/dashboard.css';

const AUTO_REFRESH_INTERVAL_MS = 30_000;

const DashboardPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const dashboardData = await fetchDashboardData('');
      setData(dashboardData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const intervalId = setInterval(() => {
      void loadData();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [loadData]);

  const handleMeetingClick = (meetingId: string) => {
    window.location.href = `/meetings/${meetingId}`;
  };

  const handleActionClick = (href: string) => {
    window.location.href = href;
  };

  if (error) {
    return (
      <div className="dashboard dashboard--error" role="alert">
        <h1 className="dashboard__title">Dashboard</h1>
        <div className="dashboard__error">
          <p className="dashboard__error-message">{error}</p>
          <button className="dashboard__retry-button" onClick={() => void loadData()} type="button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard" role="main">
      <header className="dashboard__header">
        <h1 className="dashboard__title">Dashboard</h1>
      </header>

      <section className="dashboard__stats-section">
        <DashboardStats
          stats={data?.stats ?? { totalMeetings: 0, totalHours: 0, averageDuration: 0, activeParticipants: 0, actionItemCount: 0 }}
          loading={loading}
        />
      </section>

      <section className="dashboard__content">
        <div className="dashboard__meetings-section">
          <RecentMeetingsList
            meetings={data?.recentMeetings ?? []}
            loading={loading}
            onMeetingClick={handleMeetingClick}
          />
        </div>

        <aside className="dashboard__actions-section">
          <QuickActions onActionClick={handleActionClick} />
        </aside>
      </section>
    </div>
  );
};

export default DashboardPage;
