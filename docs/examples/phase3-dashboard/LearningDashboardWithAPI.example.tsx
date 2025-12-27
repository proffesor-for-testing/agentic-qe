/**
 * LearningDashboard with Real API Integration
 *
 * This example shows how to replace the mock data in LearningDashboard.tsx
 * with real API calls using the learning.ts API client.
 *
 * To use this:
 * 1. Copy the relevant sections into your LearningDashboard.tsx
 * 2. Remove the generateMockData() function
 * 3. Update the state management to use API responses
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchLearningMetrics,
  fetchActiveAlerts,
  fetchRecentInsights,
  fetchAgentStats,
  fetchTimeSeries,
  acknowledgeAlert as apiAcknowledgeAlert,
} from '../api/learning';
import type {
  LearningMetricsData,
  Alert,
  Insight,
  AgentLearningStats,
  TimeSeriesPoint,
} from '../pages/LearningDashboard';

export const LearningDashboardWithAPI: React.FC = () => {
  // State for all data
  const [metrics, setMetrics] = useState<LearningMetricsData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [agentStats, setAgentStats] = useState<AgentLearningStats[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI controls
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastRefresh, setLastRefresh] = useState(new Date());

  /**
   * Fetch all dashboard data
   */
  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [metricsData, alertsData, insightsData, agentStatsData, timeSeriesData] =
        await Promise.all([
          fetchLearningMetrics(24),
          fetchActiveAlerts(),
          fetchRecentInsights(10),
          fetchAgentStats(),
          fetchTimeSeries(24),
        ]);

      setMetrics(metricsData);
      setAlerts(alertsData);
      setInsights(insightsData);
      setAgentStats(agentStatsData);
      setTimeSeries(timeSeriesData);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Initial data load
   */
  useEffect(() => {
    fetchAllData();
  }, []);

  /**
   * Auto-refresh effect
   */
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchAllData();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  /**
   * Manual refresh handler
   */
  const handleRefresh = () => {
    fetchAllData();
  };

  /**
   * Alert acknowledgement handler
   */
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await apiAcknowledgeAlert(alertId);

      // Update local state
      setAlerts((prev) =>
        prev.map((alert) =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        )
      );
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
      alert('Failed to acknowledge alert. Please try again.');
    }
  };

  /**
   * Export data handler
   */
  const handleExport = () => {
    const data = { metrics, alerts, insights, agentStats, timeSeries, lastRefresh };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learning-metrics-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Prepare radar chart data (memoized)
   */
  const radarData = useMemo(() => {
    if (!metrics) return [];

    return [
      { metric: 'Accuracy', value: metrics.patternAccuracy * 100 },
      { metric: 'Actionability', value: metrics.insightActionability * 100 },
      { metric: 'Transfer', value: metrics.transferSuccessRate * 100 },
      { metric: 'Adoption', value: metrics.adoptionRate * 100 },
      { metric: 'Reliability', value: (1 - metrics.errorRate) * 100 },
    ];
  }, [metrics]);

  /**
   * Loading state
   */
  if (loading && !metrics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading learning metrics...</p>
        </div>
      </div>
    );
  }

  /**
   * Error state
   */
  if (error && !metrics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Failed to Load Data</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchAllData}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // If we have metrics, render the full dashboard
  // (Use the same JSX from LearningDashboard.tsx, but with real data)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - same as before */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        {/* ... header content ... */}
      </header>

      {/* Main Content - same as before, but using real state variables */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Overview Section */}
        {metrics && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Learning Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Total Experiences"
                value={metrics.patternsDiscoveredTotal.toLocaleString()}
                icon={<Database className="w-5 h-5" />}
                trend={metrics.patternsDiscoveredToday}
                trendLabel="today"
                color="blue"
              />
              {/* ... other metric cards ... */}
            </div>
          </section>
        )}

        {/* Charts Section */}
        {timeSeries.length > 0 && (
          <section className="mb-6">
            {/* ... charts using timeSeries state ... */}
          </section>
        )}

        {/* Insights & Alerts Section */}
        <section className="mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Insights */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Insights</h2>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  {insights.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      No insights available
                    </div>
                  ) : (
                    insights.map((insight) => (
                      <InsightRow key={insight.id} insight={insight} />
                    ))
                  )}
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
        {agentStats.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {agentStats.map((agent) => (
                <AgentCard key={agent.agentId} agent={agent} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

/**
 * Alternative: Using React Query for better data management
 *
 * Install: npm install @tanstack/react-query
 */

/*
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const LearningDashboardWithReactQuery: React.FC = () => {
  const queryClient = useQueryClient();
  const [refreshInterval, setRefreshInterval] = useState(30000); // ms

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['learning-metrics'],
    queryFn: () => fetchLearningMetrics(24),
    refetchInterval: refreshInterval,
  });

  // Fetch alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ['learning-alerts'],
    queryFn: fetchActiveAlerts,
    refetchInterval: refreshInterval,
  });

  // Acknowledge alert mutation
  const acknowledgeMutation = useMutation({
    mutationFn: apiAcknowledgeAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-alerts'] });
    },
  });

  const handleAcknowledgeAlert = (alertId: string) => {
    acknowledgeMutation.mutate(alertId);
  };

  // ... rest of component
};
*/

export default LearningDashboardWithAPI;
