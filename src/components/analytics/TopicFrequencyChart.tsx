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
import type { TopicEntry } from '../../types/analytics.js';

interface TopicFrequencyChartProps extends ChartProps {
  data: TopicEntry[];
}

export const TopicFrequencyChart: FC<TopicFrequencyChartProps> = ({
  data,
  width,
  height = 300,
  color = '#BA7517',
}) => {
  return (
    <div
      className="analytics-chart topic-frequency-chart"
      role="img"
      aria-label="Topic frequency chart showing how often topics were discussed"
    >
      <h3 className="chart-title">Topic Frequency</h3>
      <ResponsiveContainer width={width || '100%'} height={height}>
        <BarChart
          data={data}
          layout="vertical"
          aria-label="Topic frequency bar chart"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #2A2A2E)" />
          <XAxis
            type="number"
            stroke="var(--color-text-secondary, #9B9BA4)"
            tick={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="topic"
            width={120}
            stroke="var(--color-text-secondary, #9B9BA4)"
            tick={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface, #141416)',
              border: '1px solid var(--color-border, #2A2A2E)',
              fontFamily: 'monospace',
            }}
            formatter={(value: number) => [value, 'Mentions']}
          />
          <Bar
            dataKey="frequency"
            fill={color}
            radius={[0, 4, 4, 0]}
            name="Frequency"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TopicFrequencyChart;
