import { FC } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ChartProps } from '../../types/charts.js';
import type { SpeakingTimeEntry } from '../../types/analytics.js';

interface SpeakingTimeChartProps extends ChartProps {
  data: SpeakingTimeEntry[];
}

export const SpeakingTimeChart: FC<SpeakingTimeChartProps> = ({
  data,
  width,
  height = 300,
  color = '#BA7517',
}) => {
  return (
    <div
      className="analytics-chart speaking-time-chart"
      role="img"
      aria-label="Speaking time distribution chart showing time spent by each participant"
    >
      <h3 className="chart-title">Speaking Time Distribution</h3>
      <ResponsiveContainer width={width || '100%'} height={height}>
        <BarChart data={data} aria-label="Speaking time bar chart">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #2A2A2E)" />
          <XAxis
            dataKey="participant"
            stroke="var(--color-text-secondary, #9B9BA4)"
            tick={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <YAxis
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
            formatter={(value: number) => [`${value}%`, 'Speaking Time']}
          />
          <Bar
            dataKey="percentage"
            fill={color}
            radius={[4, 4, 0, 0]}
            name="Speaking Time"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpeakingTimeChart;
