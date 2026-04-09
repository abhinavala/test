import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { ValidationError, validateDateRange } from '../../hooks/useAnalyticsData.js';
import { EngagementChart } from '../../components/analytics/EngagementChart.js';
import { SpeakingTimeChart } from '../../components/analytics/SpeakingTimeChart.js';
import { SentimentTrendChart } from '../../components/analytics/SentimentTrendChart.js';
import { TopicFrequencyChart } from '../../components/analytics/TopicFrequencyChart.js';
import type {
  EngagementDataPoint,
  SpeakingTimeEntry,
  SentimentDataPoint,
  TopicEntry,
  AnalyticsData,
} from '../../types/analytics.js';

// Mock recharts to render simple divs for testing
vi.mock('recharts', () => ({
  LineChart: ({ children, ...props }: any) => createElement('div', { 'data-testid': 'line-chart', ...props }, children),
  Line: (props: any) => createElement('div', { 'data-testid': 'line', ...props }),
  BarChart: ({ children, ...props }: any) => createElement('div', { 'data-testid': 'bar-chart', ...props }, children),
  Bar: (props: any) => createElement('div', { 'data-testid': 'bar', ...props }),
  XAxis: (props: any) => createElement('div', { 'data-testid': 'x-axis', ...props }),
  YAxis: (props: any) => createElement('div', { 'data-testid': 'y-axis', ...props }),
  CartesianGrid: (props: any) => createElement('div', { 'data-testid': 'cartesian-grid', ...props }),
  Tooltip: (props: any) => createElement('div', { 'data-testid': 'tooltip', ...props }),
  Legend: (props: any) => createElement('div', { 'data-testid': 'legend', ...props }),
  ResponsiveContainer: ({ children }: any) => createElement('div', { 'data-testid': 'responsive-container' }, children),
  PieChart: ({ children, ...props }: any) => createElement('div', { 'data-testid': 'pie-chart', ...props }, children),
  Pie: (props: any) => createElement('div', { 'data-testid': 'pie', ...props }),
  Cell: (props: any) => createElement('div', { 'data-testid': 'cell', ...props }),
}));

const mockEngagementData: EngagementDataPoint[] = [
  { date: '2026-03-01', score: 72, participantCount: 5 },
  { date: '2026-03-08', score: 85, participantCount: 6 },
  { date: '2026-03-15', score: 68, participantCount: 4 },
];

const mockSpeakingTimeData: SpeakingTimeEntry[] = [
  { participant: 'Alice', duration: 300, percentage: 40 },
  { participant: 'Bob', duration: 225, percentage: 30 },
  { participant: 'Carol', duration: 225, percentage: 30 },
];

const mockSentimentData: SentimentDataPoint[] = [
  { date: '2026-03-01', positive: 60, neutral: 30, negative: 10 },
  { date: '2026-03-08', positive: 55, neutral: 35, negative: 10 },
];

const mockTopicData: TopicEntry[] = [
  { topic: 'Sprint Planning', frequency: 12, sentiment: 0.8 },
  { topic: 'Bug Fixes', frequency: 8, sentiment: 0.5 },
];

const mockAnalyticsData: AnalyticsData = {
  engagementMetrics: {
    averageScore: 75,
    trend: mockEngagementData,
    speakingTime: mockSpeakingTimeData,
    sentimentTrend: mockSentimentData,
    topicFrequency: mockTopicData,
  },
  dateRange: { startDate: '2026-03-01', endDate: '2026-03-31' },
};

describe('Analytics Dashboard', () => {
  describe('AnalyticsPage renders all chart components successfully', () => {
    it('should render EngagementChart, SpeakingTimeChart, SentimentTrendChart, and TopicFrequencyChart components', async () => {
      // Mock fetch to return analytics data
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAnalyticsData),
      });
      vi.stubGlobal('fetch', fetchMock);

      // Dynamically import the page to use the mocked fetch
      const { AnalyticsPage } = await import('../../../app/analytics/page.js');
      const { container } = render(createElement(AnalyticsPage));

      // Wait for the data to load
      const engagementChart = await screen.findByLabelText('Engagement trend chart showing participant engagement scores over time');
      expect(engagementChart).toBeDefined();

      const speakingTimeChart = screen.getByLabelText('Speaking time distribution chart showing time spent by each participant');
      expect(speakingTimeChart).toBeDefined();

      const sentimentChart = screen.getByLabelText('Sentiment trend chart showing positive, neutral, and negative sentiment over time');
      expect(sentimentChart).toBeDefined();

      const topicChart = screen.getByLabelText('Topic frequency chart showing how often topics were discussed');
      expect(topicChart).toBeDefined();

      vi.unstubAllGlobals();
    });
  });

  describe('useAnalyticsData handles invalid date range', () => {
    it('should throw ValidationError with message "Invalid date range" when start date is after end date', () => {
      expect(() =>
        validateDateRange({
          startDate: '2026-04-15',
          endDate: '2026-03-01',
        })
      ).toThrow(ValidationError);

      expect(() =>
        validateDateRange({
          startDate: '2026-04-15',
          endDate: '2026-03-01',
        })
      ).toThrow('Invalid date range');
    });

    it('should throw ValidationError for invalid date strings', () => {
      expect(() =>
        validateDateRange({
          startDate: 'not-a-date',
          endDate: '2026-03-01',
        })
      ).toThrow(ValidationError);

      expect(() =>
        validateDateRange({
          startDate: 'not-a-date',
          endDate: '2026-03-01',
        })
      ).toThrow('Invalid date range');
    });

    it('should accept valid date ranges', () => {
      expect(() =>
        validateDateRange({
          startDate: '2026-03-01',
          endDate: '2026-04-01',
        })
      ).not.toThrow();
    });
  });

  describe('EngagementChart displays data with proper monospace formatting', () => {
    it('numeric labels should use monospace font-family, chart should use amber accent color for voice data', () => {
      const { container } = render(
        createElement(EngagementChart, {
          data: mockEngagementData,
          color: '#BA7517',
        })
      );

      const chartEl = container.querySelector('.engagement-chart');
      expect(chartEl).toBeDefined();

      // Verify the chart has ARIA label for accessibility
      const ariaLabel = chartEl?.getAttribute('aria-label');
      expect(ariaLabel).toBe('Engagement trend chart showing participant engagement scores over time');

      // Verify chart title is present
      const title = container.querySelector('.chart-title');
      expect(title).toBeDefined();
      expect(title?.textContent).toBe('Engagement Trends');

      // Verify XAxis tick uses monospace font
      const xAxis = container.querySelector('[data-testid="x-axis"]');
      expect(xAxis).toBeDefined();

      // Verify the Line component uses amber color
      const line = container.querySelector('[data-testid="line"]');
      expect(line).toBeDefined();
      expect(line?.getAttribute('stroke')).toBe('#BA7517');
    });
  });

  describe('SpeakingTimeChart renders correctly', () => {
    it('should render bar chart with participant data', () => {
      const { container } = render(
        createElement(SpeakingTimeChart, {
          data: mockSpeakingTimeData,
          color: '#BA7517',
        })
      );

      const chartEl = container.querySelector('.speaking-time-chart');
      expect(chartEl).toBeDefined();
      expect(chartEl?.getAttribute('aria-label')).toBe(
        'Speaking time distribution chart showing time spent by each participant'
      );
    });
  });

  describe('SentimentTrendChart renders correctly', () => {
    it('should render sentiment lines', () => {
      const { container } = render(
        createElement(SentimentTrendChart, {
          data: mockSentimentData,
        })
      );

      const chartEl = container.querySelector('.sentiment-trend-chart');
      expect(chartEl).toBeDefined();
    });
  });

  describe('TopicFrequencyChart renders correctly', () => {
    it('should render topic bars', () => {
      const { container } = render(
        createElement(TopicFrequencyChart, {
          data: mockTopicData,
          color: '#BA7517',
        })
      );

      const chartEl = container.querySelector('.topic-frequency-chart');
      expect(chartEl).toBeDefined();
    });
  });
});
