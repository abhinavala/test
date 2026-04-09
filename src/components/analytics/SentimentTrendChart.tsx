import { FC } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChartProps } from '../../types/charts.js';
import type { SentimentDataPoint } from '../../types/analytics.js';

interface SentimentTrendChartProps extends ChartProps {
  data: SentimentDataPoint[];
}

const SENTIMENT_COLORS = {
  positive: '#22C55E',
  neutral: '#BA7517',
  negative: '#EF4444',
};

export const SentimentTrendChart: FC<SentimentTrendChartProps> = ({
  data,
  width,
  height = 300,
}) => {
  return (
    <div
      className="analytics-chart sentiment-trend-chart"
      role="img"
      aria-label="Sentiment trend chart showing positive, neutral, and negative sentiment over time"
    >
      <h3 className="chart-title">Sentiment Trends</h3>
      <ResponsiveContainer width={width || '100%'} height={height}>
        <LineChart data={data} aria-label="Sentiment trend line chart">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #2A2A2E)" />
          <XAxis
            dataKey="date"
            stroke="var(--color-text-secondary, #9B9BA4)"
            tick={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <YAxis
            domain={[0, 100]}
            stroke="var(--color-text-secondary, #9B9BA4)"
            tick={{ fontFamily: 'monospace', fontSize: 12 }}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface, #141416)',
              border: '1px solid var(--color-border, #2A2A2E)',
              fontFamily: 'monospace',
            }}
            formatter={(value: number) => [`${value}%`]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="positive"
            stroke={SENTIMENT_COLORS.positive}
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Positive"
          />
          <Line
            type="monotone"
            dataKey="neutral"
            stroke={SENTIMENT_COLORS.neutral}
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Neutral"
          />
          <Line
            type="monotone"
            dataKey="negative"
            stroke={SENTIMENT_COLORS.negative}
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Negative"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SentimentTrendChart;
