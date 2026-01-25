import React, { useState, useEffect } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Download, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { format } from 'date-fns';

interface MetricsData {
  timestamp: string;
  coverage: {
    line: number;
    branch: number;
    function: number;
  };
  performance: {
    score: number;
    responseTime: number;
    throughput: number;
  };
  quality: {
    maintainability: number;
    reliability: number;
    security: number;
  };
  tokens: {
    total: number;
    cost: number;
  };
}

interface QualityMetricsProps {
  sessionId?: string;
  timeRange?: '1h' | '24h' | '7d';
  autoRefresh?: boolean;
}

const API_BASE_URL = 'http://localhost:3001/api/visualization';

export const QualityMetrics: React.FC<QualityMetricsProps> = ({
  sessionId,
  timeRange = '24h',
  autoRefresh = false,
}) => {
  const [metrics, setMetrics] = useState<MetricsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'radar' | 'trends' | 'tokens'>('radar');

  useEffect(() => {
    fetchMetrics();
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [sessionId, timeRange, autoRefresh]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/metrics`, {
        params: { timeRange, session_id: sessionId },
      });

      if (response.data.success) {
        setMetrics(response.data.data.history || []);
        setError(null);
      } else {
        setError(response.data.error || 'Failed to fetch metrics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportData = (format: 'json' | 'csv' | 'png') => {
    if (format === 'json') {
      const dataStr = JSON.stringify(metrics, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `metrics-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'csv') {
      const csv = convertToCSV(metrics);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `metrics-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
    // PNG export would require html2canvas or similar library
  };

  const convertToCSV = (data: MetricsData[]): string => {
    if (data.length === 0) return '';
    const headers = ['timestamp', 'coverage_line', 'coverage_branch', 'coverage_function',
                     'performance_score', 'quality_maintainability', 'tokens_total', 'tokens_cost'];
    const rows = data.map(m => [
      m.timestamp,
      m.coverage.line,
      m.coverage.branch,
      m.coverage.function,
      m.performance.score,
      m.quality.maintainability,
      m.tokens.total,
      m.tokens.cost,
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  };

  const getRadarData = () => {
    if (metrics.length === 0) return [];
    const latest = metrics[metrics.length - 1];
    return [
      { dimension: 'Line Coverage', value: latest.coverage.line * 100 },
      { dimension: 'Branch Coverage', value: latest.coverage.branch * 100 },
      { dimension: 'Function Coverage', value: latest.coverage.function * 100 },
      { dimension: 'Performance', value: latest.performance.score * 100 },
      { dimension: 'Maintainability', value: latest.quality.maintainability * 100 },
      { dimension: 'Reliability', value: latest.quality.reliability * 100 },
      { dimension: 'Security', value: latest.quality.security * 100 },
    ];
  };

  const getTrendData = () => {
    return metrics.map(m => ({
      time: format(new Date(m.timestamp), 'HH:mm'),
      coverage: (m.coverage.line + m.coverage.branch + m.coverage.function) / 3 * 100,
      performance: m.performance.score * 100,
      quality: (m.quality.maintainability + m.quality.reliability + m.quality.security) / 3 * 100,
    }));
  };

  const getTokenData = () => {
    return metrics.map(m => ({
      time: format(new Date(m.timestamp), 'HH:mm'),
      tokens: m.tokens.total,
      cost: m.tokens.cost,
    }));
  };

  const getLatestMetric = () => {
    if (metrics.length === 0) return null;
    return metrics[metrics.length - 1];
  };

  const calculateTrend = (key: string) => {
    if (metrics.length < 2) return 0;
    const latest = metrics[metrics.length - 1];
    const previous = metrics[metrics.length - 2];

    let latestVal = 0, prevVal = 0;

    if (key === 'coverage') {
      latestVal = (latest.coverage.line + latest.coverage.branch + latest.coverage.function) / 3;
      prevVal = (previous.coverage.line + previous.coverage.branch + previous.coverage.function) / 3;
    } else if (key === 'performance') {
      latestVal = latest.performance.score;
      prevVal = previous.performance.score;
    } else if (key === 'quality') {
      latestVal = (latest.quality.maintainability + latest.quality.reliability + latest.quality.security) / 3;
      prevVal = (previous.quality.maintainability + previous.quality.reliability + previous.quality.security) / 3;
    }

    return ((latestVal - prevVal) / prevVal) * 100;
  };

  if (loading && metrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-600">
        <AlertCircle className="w-12 h-12 mb-4" />
        <p className="text-lg font-semibold">Error Loading Metrics</p>
        <p className="text-sm text-gray-600 mt-2">{error}</p>
        <button
          onClick={fetchMetrics}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const latestMetric = getLatestMetric();

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Quality Metrics</h3>
          {latestMetric && (
            <p className="text-xs text-gray-500 mt-1">
              Last updated: {format(new Date(latestMetric.timestamp), 'MMM dd, HH:mm:ss')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportData('json')}
            className="p-2 hover:bg-gray-100 rounded"
            title="Export as JSON"
          >
            <Download className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex border-b">
        {['radar', 'trends', 'tokens'].map((view) => (
          <button
            key={view}
            onClick={() => setSelectedView(view as any)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              selectedView === view
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {selectedView === 'radar' && (
          <div className="h-full">
            <ResponsiveContainer width="100%" height="80%">
              <RadarChart data={getRadarData()}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dimension" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar
                  name="Quality Metrics"
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
              </RadarChart>
            </ResponsiveContainer>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mt-4">
              <MetricCard
                label="Coverage"
                value={latestMetric ? ((latestMetric.coverage.line + latestMetric.coverage.branch + latestMetric.coverage.function) / 3 * 100).toFixed(1) : '0'}
                trend={calculateTrend('coverage')}
                unit="%"
              />
              <MetricCard
                label="Performance"
                value={latestMetric ? (latestMetric.performance.score * 100).toFixed(1) : '0'}
                trend={calculateTrend('performance')}
                unit="%"
              />
              <MetricCard
                label="Quality"
                value={latestMetric ? ((latestMetric.quality.maintainability + latestMetric.quality.reliability + latestMetric.quality.security) / 3 * 100).toFixed(1) : '0'}
                trend={calculateTrend('quality')}
                unit="%"
              />
            </div>
          </div>
        )}

        {selectedView === 'trends' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={getTrendData()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={[0, 100]} />
              <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
              <Legend />
              <Line type="monotone" dataKey="coverage" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="performance" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="quality" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {selectedView === 'tokens' && (
          <div className="h-full">
            <ResponsiveContainer width="100%" height="70%">
              <AreaChart data={getTokenData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="tokens"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                  name="Total Tokens"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="cost"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.6}
                  name="Cost (USD)"
                />
              </AreaChart>
            </ResponsiveContainer>

            {latestMetric && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600">Total Tokens</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {latestMetric.tokens.total.toLocaleString()}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600">Total Cost</p>
                  <p className="text-2xl font-bold text-green-600">
                    ${latestMetric.tokens.cost.toFixed(4)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: string;
  trend: number;
  unit: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, trend, unit }) => {
  const isPositive = trend >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;
  const trendColor = isPositive ? 'text-green-600' : 'text-red-600';

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <p className="text-sm text-gray-600">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        <span className="text-sm text-gray-500">{unit}</span>
      </div>
      {trend !== 0 && (
        <div className={`flex items-center gap-1 mt-1 ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
          <span className="text-xs font-semibold">{Math.abs(trend).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
};
