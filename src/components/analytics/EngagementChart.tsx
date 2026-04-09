import { FC } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ChartProps } from '../../types/charts.js';
import type { EngagementDataPoint } from '../../types/analytics.js';

interface EngagementChartProps extends ChartProps {
  data: EngagementDataPoint[];
}

export const EngagementChart: FC<EngagementChartProps> = ({
  data,
  width,
  height = 300,
  color = '#BA7517',
}) => {
  return (
    <div
      className="analytics-chart engagement-chart"
      role="img"
      aria-label="Engagement trend chart showing participant engagement scores over time"
    >
      <h3 className="chart-title">Engagement Trends</h3>
      <ResponsiveContainer width={width || '100%'} height={height}>
        <LineChart data={data} aria-label="Engagement line chart">
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
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface, #141416)',
              border: '1px solid var(--color-border, #2A2A2E)',
              fontFamily: 'monospace',
            }}
            labelStyle={{ color: 'var(--color-text, #F0F0F2)' }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, r: 4 }}
            activeDot={{ r: 6 }}
            name="Engagement Score"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default EngagementChart;
