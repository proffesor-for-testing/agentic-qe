/**
 * LearningDashboard - Nightly-Learner Phase 3 Dashboard
 *
 * Real-time visualization of the Nightly-Learner system showing:
 * - Learning overview metrics
 * - Pattern discovery trends
 * - Transfer success rates
 * - Recent insights and alerts
 * - Per-agent learning statistics
 *
 * Integration Points:
 * - REST API: /api/learning/metrics (LearningMetrics.getCurrentMetrics)
 * - REST API: /api/learning/summary (LearningMetrics.getMetricsSummary)
 * - REST API: /api/learning/alerts (AlertManager.getActiveAlerts)
 * - WebSocket: ws://localhost:3000/learning (real-time updates)
 *
 * @module frontend/pages/LearningDashboard
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Zap,
  Database,
  RefreshCw,
  Download,
  XCircle,
  Info,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ========================================
// Type Definitions
// ========================================

/** Alert severity levels */
export type AlertSeverity = 'error' | 'warning' | 'info';

/** Insight types from DreamEngine */
export type InsightType = 'new_pattern' | 'optimization' | 'warning' | 'connection';

/** Learning metrics data structure */
export interface LearningMetricsData {
  // Discovery metrics
  patternsDiscoveredTotal: number;
  patternsDiscoveredToday: number;
  discoveryRate: number; // patterns/hour

  // Quality metrics
  patternAccuracy: number; // 0-1
  insightActionability: number; // 0-1
  falsePositiveRate: number; // 0-1

  // Transfer metrics
  transferSuccessRate: number; // 0-1
  adoptionRate: number; // % of transferred patterns used
  negativeTransferCount: number;

  // Impact metrics
  taskTimeReduction: number; // % improvement
  coverageImprovement: number; // % improvement
  bugDetectionImprovement: number; // % improvement

  // System health
  sleepCycleCompletionRate: number;
  avgCycleDuration: number;
  errorRate: number;

  // Timestamps
  calculatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
}

/** Alert from AlertManager */
export interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  createdAt: Date;
  acknowledged: boolean;
}

/** Insight from DreamEngine */
export interface Insight {
  id: string;
  type: InsightType;
  description: string;
  noveltyScore: number; // 0-1
  actionable: boolean;
  patterns: string[];
  createdAt: Date;
  appliedAt?: Date;
}

/** Per-agent learning statistics */
export interface AgentLearningStats {
  agentId: string;
  agentType: string;
  patternsLearned: number;
  experiencesCaptured: number;
  successRate: number;
  avgTaskTime: number;
  transfersReceived: number;
  transfersShared: number;
  lastActive: Date;
}

/** Time series data point for charts */
export interface TimeSeriesPoint {
  timestamp: string;
  discoveryRate: number;
  transferSuccess: number;
  errorRate: number;
}

// ========================================
// Mock Data Generator (for demonstration)
// ========================================

const generateMockData = (): {
  metrics: LearningMetricsData;
  alerts: Alert[];
  insights: Insight[];
  agentStats: AgentLearningStats[];
  timeSeries: TimeSeriesPoint[];
} => {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const metrics: LearningMetricsData = {
    patternsDiscoveredTotal: 847,
    patternsDiscoveredToday: 23,
    discoveryRate: 0.96, // patterns/hour
    patternAccuracy: 0.87,
    insightActionability: 0.72,
    falsePositiveRate: 0.08,
    transferSuccessRate: 0.83,
    adoptionRate: 0.68,
    negativeTransferCount: 4,
    taskTimeReduction: 34.5, // %
    coverageImprovement: 12.3, // %
    bugDetectionImprovement: 28.7, // %
    sleepCycleCompletionRate: 0.94,
    avgCycleDuration: 2847, // ms
    errorRate: 0.06,
    calculatedAt: now,
    periodStart: dayAgo,
    periodEnd: now,
  };

  const alerts: Alert[] = [
    {
      id: 'alert-1',
      severity: 'warning',
      message: 'Transfer success rate below threshold',
      metric: 'transferSuccessRate',
      currentValue: 0.83,
      threshold: 0.85,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      acknowledged: false,
    },
    {
      id: 'alert-2',
      severity: 'info',
      message: 'Discovery rate trending upward',
      metric: 'discoveryRate',
      currentValue: 0.96,
      threshold: 0.90,
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      acknowledged: false,
    },
  ];

  const insights: Insight[] = [
    {
      id: 'insight-1',
      type: 'new_pattern',
      description: 'Discovered optimal test ordering for async operations',
      noveltyScore: 0.89,
      actionable: true,
      patterns: ['async-test-ordering', 'promise-chain-optimization'],
      createdAt: new Date(now.getTime() - 45 * 60 * 1000),
    },
    {
      id: 'insight-2',
      type: 'optimization',
      description: 'Memoization reduces duplicate API calls by 67%',
      noveltyScore: 0.76,
      actionable: true,
      patterns: ['api-call-memoization'],
      createdAt: new Date(now.getTime() - 90 * 60 * 1000),
      appliedAt: new Date(now.getTime() - 60 * 60 * 1000),
    },
    {
      id: 'insight-3',
      type: 'connection',
      description: 'Coverage analyzer patterns correlate with performance optimizer patterns',
      noveltyScore: 0.82,
      actionable: false,
      patterns: ['coverage-analysis', 'perf-optimization'],
      createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    },
    {
      id: 'insight-4',
      type: 'warning',
      description: 'Low confidence pattern detected: retry-logic-timeout',
      noveltyScore: 0.34,
      actionable: false,
      patterns: ['retry-logic-timeout'],
      createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
    },
  ];

  const agentStats: AgentLearningStats[] = [
    {
      agentId: 'test-gen-01',
      agentType: 'qe-test-generator',
      patternsLearned: 142,
      experiencesCaptured: 2847,
      successRate: 0.91,
      avgTaskTime: 1850,
      transfersReceived: 23,
      transfersShared: 45,
      lastActive: new Date(now.getTime() - 15 * 60 * 1000),
    },
    {
      agentId: 'coverage-01',
      agentType: 'qe-coverage-analyzer',
      patternsLearned: 89,
      experiencesCaptured: 1923,
      successRate: 0.88,
      avgTaskTime: 2150,
      transfersReceived: 18,
      transfersShared: 31,
      lastActive: new Date(now.getTime() - 30 * 60 * 1000),
    },
    {
      agentId: 'perf-01',
      agentType: 'qe-performance-tester',
      patternsLearned: 67,
      experiencesCaptured: 1456,
      successRate: 0.85,
      avgTaskTime: 3200,
      transfersReceived: 12,
      transfersShared: 19,
      lastActive: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    },
    {
      agentId: 'flaky-01',
      agentType: 'qe-flaky-detector',
      patternsLearned: 54,
      experiencesCaptured: 982,
      successRate: 0.82,
      avgTaskTime: 1650,
      transfersReceived: 8,
      transfersShared: 14,
      lastActive: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    },
  ];

  // Generate 24 hours of time series data
  const timeSeries: TimeSeriesPoint[] = [];
  for (let i = 0; i < 24; i++) {
    const time = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
    timeSeries.push({
      timestamp: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      discoveryRate: 0.7 + Math.random() * 0.5,
      transferSuccess: 0.75 + Math.random() * 0.2,
      errorRate: 0.02 + Math.random() * 0.08,
    });
  }

  return { metrics, alerts, insights, agentStats, timeSeries };
};

// ========================================
// Dashboard Component
// ========================================

export const LearningDashboard: React.FC = () => {
  // State
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Mock data (replace with API calls)
  const { metrics, alerts, insights, agentStats, timeSeries } = useMemo(
    () => generateMockData(),
    [lastRefresh]
  );

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // Manual refresh
  const handleRefresh = () => {
    setLastRefresh(new Date());
  };

  // Alert acknowledgement
  const handleAcknowledgeAlert = (alertId: string) => {
    // TODO: Call API to acknowledge alert
    console.log(`Acknowledging alert: ${alertId}`);
  };

  // Export data
  const handleExport = () => {
    const data = { metrics, alerts, insights, agentStats, timeSeries };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learning-metrics-${new Date().toISOString()}.json`;
    a.click();
  };

  // Prepare radar chart data
  const radarData = [
    { metric: 'Accuracy', value: metrics.patternAccuracy * 100 },
    { metric: 'Actionability', value: metrics.insightActionability * 100 },
    { metric: 'Transfer', value: metrics.transferSuccessRate * 100 },
    { metric: 'Adoption', value: metrics.adoptionRate * 100 },
    { metric: 'Reliability', value: (1 - metrics.errorRate) * 100 },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="w-8 h-8 text-purple-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Nightly-Learner Dashboard
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Phase 3: Real-time Learning Metrics & Insights
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">
                  Last refresh: {lastRefresh.toLocaleTimeString()}
                </span>
              </div>

              <button
                onClick={handleRefresh}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh now"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              <button
                onClick={handleExport}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Export data"
              >
                <Download className="w-5 h-5" />
              </button>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="text-gray-700">Auto-refresh</span>
              </label>

              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={!autoRefresh}
              >
                <option value={10}>10s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
                <option value={300}>5m</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Overview Section */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Learning Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Experiences"
              value={metrics.patternsDiscoveredTotal.toLocaleString()}
              icon={<Database className="w-5 h-5" />}
              trend={23}
              trendLabel="today"
              color="blue"
            />
            <MetricCard
              title="Patterns Discovered"
              value={metrics.patternsDiscoveredToday.toString()}
              icon={<Target className="w-5 h-5" />}
              subtitle={`${metrics.discoveryRate.toFixed(2)} patterns/hour`}
              color="green"
            />
            <MetricCard
              title="Success Rate"
              value={`${(metrics.patternAccuracy * 100).toFixed(1)}%`}
              icon={<CheckCircle className="w-5 h-5" />}
              trend={(metrics.patternAccuracy - 0.85) * 100}
              color="purple"
            />
            <MetricCard
              title="Last Cycle Time"
              value={`${(metrics.avgCycleDuration / 1000).toFixed(1)}s`}
              icon={<Clock className="w-5 h-5" />}
              subtitle={`${(metrics.sleepCycleCompletionRate * 100).toFixed(0)}% completion`}
              color="orange"
            />
          </div>
        </section>

        {/* Charts Section */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Metrics Charts</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Discovery Rate Over Time */}
            <ChartCard title="Discovery Rate Over Time">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="timestamp"
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="discoveryRate"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Discovery Rate"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Transfer Success Rate */}
            <ChartCard title="Transfer Success vs Error Rate">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="timestamp"
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="transferSuccess"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Transfer Success"
                  />
                  <Line
                    type="monotone"
                    dataKey="errorRate"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="Error Rate"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Agent Performance Comparison */}
            <ChartCard title="Agent Performance Comparison">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={agentStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="agentType"
                    stroke="#6b7280"
                    style={{ fontSize: '11px' }}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="patternsLearned" fill="#8b5cf6" name="Patterns Learned" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Quality Radar */}
            <ChartCard title="Overall Quality Metrics">
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="metric" stroke="#6b7280" style={{ fontSize: '12px' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#6b7280" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                  <Radar
                    name="Quality Score"
                    dataKey="value"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.6}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </section>

        {/* Insights & Alerts Section */}
        <section className="mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Insights */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Insights</h2>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  {insights.map((insight) => (
                    <InsightRow key={insight.id} insight={insight} />
                  ))}
                </div>
              </div>
            </div>

            {/* Active Alerts */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Active Alerts
                {alerts.filter((a) => !a.acknowledged).length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                    {alerts.filter((a) => !a.acknowledged).length}
                  </span>
                )}
              </h2>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <div className="p-8 text-center">
                      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                      <p className="text-gray-600">No active alerts</p>
                      <p className="text-sm text-gray-500 mt-1">All systems operating normally</p>
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <AlertRow
                        key={alert.id}
                        alert={alert}
                        onAcknowledge={handleAcknowledgeAlert}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Agent Status Grid */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {agentStats.map((agent) => (
              <AgentCard key={agent.agentId} agent={agent} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

// ========================================
// Sub-Components
// ========================================

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  subtitle?: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon,
  trend,
  trendLabel,
  subtitle,
  color,
}) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {trend > 0 ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              <span className={`text-sm font-medium ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(trend).toFixed(1)}% {trendLabel || ''}
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
};

interface InsightRowProps {
  insight: Insight;
}

const InsightRow: React.FC<InsightRowProps> = ({ insight }) => {
  const typeConfig = {
    new_pattern: { icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    optimization: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    warning: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
    connection: { icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
  };

  const config = typeConfig[insight.type];
  const Icon = config.icon;

  return (
    <div className="p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.bg}`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase">
              {insight.type.replace('_', ' ')}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(insight.createdAt).toLocaleTimeString()}
            </span>
            {insight.actionable && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                Actionable
              </span>
            )}
            {insight.appliedAt && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                Applied
              </span>
            )}
          </div>
          <p className="text-sm text-gray-900 mb-2">{insight.description}</p>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              Novelty: {(insight.noveltyScore * 100).toFixed(0)}%
            </span>
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              {insight.patterns.length} pattern{insight.patterns.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface AlertRowProps {
  alert: Alert;
  onAcknowledge: (alertId: string) => void;
}

const AlertRow: React.FC<AlertRowProps> = ({ alert, onAcknowledge }) => {
  const severityConfig = {
    error: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    warning: { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  };

  const config = severityConfig[alert.severity];
  const Icon = config.icon;

  return (
    <div className={`p-4 border-b ${config.border} hover:bg-gray-50 transition-colors`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.bg}`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium uppercase ${config.color}`}>
              {alert.severity}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(alert.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-sm text-gray-900 mb-2">{alert.message}</p>
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Current: <span className="font-medium">{(alert.currentValue * 100).toFixed(1)}%</span>
              {' | '}
              Threshold: <span className="font-medium">{(alert.threshold * 100).toFixed(1)}%</span>
            </div>
            {!alert.acknowledged && (
              <button
                onClick={() => onAcknowledge(alert.id)}
                className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Acknowledge
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface AgentCardProps {
  agent: AgentLearningStats;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
  const isActive = Date.now() - agent.lastActive.getTime() < 60 * 60 * 1000; // Active in last hour

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{agent.agentType}</p>
          <p className="text-xs text-gray-500 truncate">{agent.agentId}</p>
        </div>
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Patterns:</span>
          <span className="font-medium text-gray-900">{agent.patternsLearned}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Success Rate:</span>
          <span className="font-medium text-gray-900">
            {(agent.successRate * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Avg Task Time:</span>
          <span className="font-medium text-gray-900">
            {(agent.avgTaskTime / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Transfers:</span>
          <span className="font-medium text-gray-900">
            {agent.transfersReceived} <ChevronRight className="w-3 h-3 inline" /> {agent.transfersShared}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LearningDashboard;
