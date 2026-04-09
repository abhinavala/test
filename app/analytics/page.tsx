'use client';

import { FC } from 'react';
import { EngagementChart } from '../../src/components/analytics/EngagementChart.js';
import { SpeakingTimeChart } from '../../src/components/analytics/SpeakingTimeChart.js';
import { SentimentTrendChart } from '../../src/components/analytics/SentimentTrendChart.js';
import { TopicFrequencyChart } from '../../src/components/analytics/TopicFrequencyChart.js';
import { DateRangeFilter } from '../../src/components/analytics/DateRangeFilter.js';
import { useAnalyticsData } from '../../src/hooks/useAnalyticsData.js';
import type { DateRange } from '../../src/types/analytics.js';

const DEFAULT_DATE_RANGE: DateRange = {
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
  endDate: new Date().toISOString().split('T')[0]!,
};

const AMBER_ACCENT = '#BA7517';

export const AnalyticsPage: FC = () => {
  const { data, loading, error, setDateRange } = useAnalyticsData(DEFAULT_DATE_RANGE);

  if (loading) {
    return (
      <div className="analytics-page analytics-page--loading" role="status" aria-label="Loading analytics">
        <p>Loading analytics data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-page analytics-page--error" role="alert">
        <p>Failed to load analytics: {error.message}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="analytics-page analytics-page--empty">
        <p>No analytics data available.</p>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      <header className="analytics-page__header">
        <h1 className="analytics-page__title">Analytics Dashboard</h1>
        <DateRangeFilter dateRange={data.dateRange} onChange={setDateRange} />
      </header>

      <div className="analytics-page__summary">
        <div className="analytics-page__metric">
          <span className="analytics-page__metric-label">Avg Engagement</span>
          <span className="analytics-page__metric-value" style={{ fontFamily: 'monospace' }}>
            {data.engagementMetrics.averageScore.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="analytics-page__charts">
        <section className="analytics-page__chart-section">
          <EngagementChart
            data={data.engagementMetrics.trend}
            color={AMBER_ACCENT}
          />
        </section>

        <section className="analytics-page__chart-section">
          <SpeakingTimeChart
            data={data.engagementMetrics.speakingTime}
            color={AMBER_ACCENT}
          />
        </section>

        <section className="analytics-page__chart-section">
          <SentimentTrendChart
            data={data.engagementMetrics.sentimentTrend}
          />
        </section>

        <section className="analytics-page__chart-section">
          <TopicFrequencyChart
            data={data.engagementMetrics.topicFrequency}
            color={AMBER_ACCENT}
          />
        </section>
      </div>
    </div>
  );
};

export default AnalyticsPage;
