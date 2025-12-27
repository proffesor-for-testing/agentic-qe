/**
 * Learning API Client
 *
 * API functions for fetching Nightly-Learner metrics and data.
 * Replace the base URL with your backend server address.
 */

import type {
  LearningMetricsData,
  Alert,
  Insight,
  AgentLearningStats,
  TimeSeriesPoint,
} from '../pages/LearningDashboard';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

/**
 * Fetch current learning metrics
 */
export async function fetchLearningMetrics(
  periodHours: number = 24
): Promise<LearningMetricsData> {
  const response = await fetch(
    `${API_BASE_URL}/api/learning/metrics?periodHours=${periodHours}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch metrics: ${response.statusText}`);
  }

  const data = await response.json();

  // Transform date strings to Date objects
  return {
    ...data,
    calculatedAt: new Date(data.calculatedAt),
    periodStart: new Date(data.periodStart),
    periodEnd: new Date(data.periodEnd),
  };
}

/**
 * Fetch active alerts
 */
export async function fetchActiveAlerts(): Promise<Alert[]> {
  const response = await fetch(`${API_BASE_URL}/api/learning/alerts`);

  if (!response.ok) {
    throw new Error(`Failed to fetch alerts: ${response.statusText}`);
  }

  const alerts = await response.json();

  // Transform date strings to Date objects
  return alerts.map((alert: any) => ({
    ...alert,
    createdAt: new Date(alert.createdAt),
  }));
}

/**
 * Fetch recent insights
 */
export async function fetchRecentInsights(limit: number = 10): Promise<Insight[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/learning/insights?limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch insights: ${response.statusText}`);
  }

  const insights = await response.json();

  // Transform date strings to Date objects
  return insights.map((insight: any) => ({
    ...insight,
    createdAt: new Date(insight.createdAt),
    appliedAt: insight.appliedAt ? new Date(insight.appliedAt) : undefined,
  }));
}

/**
 * Fetch agent learning statistics
 */
export async function fetchAgentStats(): Promise<AgentLearningStats[]> {
  const response = await fetch(`${API_BASE_URL}/api/learning/agents`);

  if (!response.ok) {
    throw new Error(`Failed to fetch agent stats: ${response.statusText}`);
  }

  const stats = await response.json();

  // Transform date strings to Date objects
  return stats.map((stat: any) => ({
    ...stat,
    lastActive: new Date(stat.lastActive),
  }));
}

/**
 * Fetch time series data for charts
 */
export async function fetchTimeSeries(hours: number = 24): Promise<TimeSeriesPoint[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/learning/timeseries?hours=${hours}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch time series: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/learning/alerts/${alertId}/acknowledge`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to acknowledge alert: ${response.statusText}`);
  }
}

/**
 * Fetch all dashboard data in a single request
 */
export async function fetchDashboardData(periodHours: number = 24): Promise<{
  metrics: LearningMetricsData;
  alerts: Alert[];
  insights: Insight[];
  agentStats: AgentLearningStats[];
  timeSeries: TimeSeriesPoint[];
}> {
  const [metrics, alerts, insights, agentStats, timeSeries] = await Promise.all([
    fetchLearningMetrics(periodHours),
    fetchActiveAlerts(),
    fetchRecentInsights(),
    fetchAgentStats(),
    fetchTimeSeries(periodHours),
  ]);

  return {
    metrics,
    alerts,
    insights,
    agentStats,
    timeSeries,
  };
}
