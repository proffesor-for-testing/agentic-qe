import React, { useMemo } from 'react';
import {
  RadarChart as RechartsRadar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { format } from 'date-fns';

interface RadarChartProps {
  showComparison?: boolean;
}

export const RadarChart: React.FC<RadarChartProps> = ({ showComparison = false }) => {
  const { metrics } = useWebSocket();

  const chartData = useMemo(() => {
    if (metrics.length === 0) {
      return [];
    }

    const latest = metrics[metrics.length - 1];
    const previous = showComparison && metrics.length > 1
      ? metrics[metrics.length - 2]
      : null;

    return [
      {
        dimension: 'Coverage',
        current: latest.coverage * 100,
        previous: previous ? previous.coverage * 100 : null,
      },
      {
        dimension: 'Performance',
        current: latest.performance * 100,
        previous: previous ? previous.performance * 100 : null,
      },
      {
        dimension: 'Security',
        current: latest.security * 100,
        previous: previous ? previous.security * 100 : null,
      },
      {
        dimension: 'Maintainability',
        current: latest.maintainability * 100,
        previous: previous ? previous.maintainability * 100 : null,
      },
      {
        dimension: 'Reliability',
        current: latest.reliability * 100,
        previous: previous ? previous.reliability * 100 : null,
      },
      {
        dimension: 'Efficiency',
        current: latest.efficiency * 100,
        previous: previous ? previous.efficiency * 100 : null,
      },
    ];
  }, [metrics, showComparison]);

  const latestMetrics = metrics[metrics.length - 1];
  const averageScore = useMemo(() => {
    if (!latestMetrics) return 0;
    return (
      (latestMetrics.coverage +
        latestMetrics.performance +
        latestMetrics.security +
        latestMetrics.maintainability +
        latestMetrics.reliability +
        latestMetrics.efficiency) /
      6
    ) * 100;
  }, [latestMetrics]);

  if (metrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No metrics data available
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-800">Quality Metrics</h3>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-3xl font-bold text-primary-600">
            {averageScore.toFixed(1)}
          </span>
          <span className="text-sm text-gray-500">/ 100</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Last updated: {format(latestMetrics.timestamp, 'HH:mm:ss')}
        </p>
      </div>

      {/* Radar Chart */}
      <div className="flex-1 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadar data={chartData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="dimension" />
            <PolarRadiusAxis angle={90} domain={[0, 100]} />

            <Radar
              name="Current"
              dataKey="current"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.6}
            />

            {showComparison && (
              <Radar
                name="Previous"
                dataKey="previous"
                stroke="#94a3b8"
                fill="#94a3b8"
                fillOpacity={0.3}
              />
            )}

            <Legend />
            <Tooltip
              formatter={(value: number) => `${value.toFixed(1)}%`}
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            />
          </RechartsRadar>
        </ResponsiveContainer>
      </div>

      {/* Metric Details */}
      <div className="p-4 border-t bg-gray-50 space-y-2">
        {chartData.map((item) => {
          const current = item.current;
          const color =
            current >= 80
              ? 'text-green-600'
              : current >= 60
              ? 'text-yellow-600'
              : 'text-red-600';

          return (
            <div key={item.dimension} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{item.dimension}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500"
                    style={{ width: `${current}%` }}
                  />
                </div>
                <span className={`text-sm font-semibold ${color} w-12 text-right`}>
                  {current.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
