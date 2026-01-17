/**
 * Learning API Service
 * Handles fetching learning metrics and dashboard data
 */

import { apiClient } from './api';
import type {
  LearningDashboardData,
  AgentLearningMetrics,
  PatternTransfer,
  AlgorithmPerformance,
  DashboardFilters,
} from '../types/learning';

/**
 * Get complete learning dashboard data
 */
export const getLearningDashboard = async (
  filters?: DashboardFilters
): Promise<LearningDashboardData> => {
  const response = await apiClient.get<{ success: boolean; data: LearningDashboardData }>(
    '/api/learning/dashboard',
    { params: filters }
  );
  return response.data.data;
};

/**
 * Get metrics for a specific agent
 */
export const getAgentLearningMetrics = async (
  agentId: string
): Promise<AgentLearningMetrics> => {
  const response = await apiClient.get<{ success: boolean; data: AgentLearningMetrics }>(
    `/api/learning/agents/${agentId}/metrics`
  );
  return response.data.data;
};

/**
 * Get recent pattern transfers
 */
export const getRecentPatternTransfers = async (
  limit: number = 50
): Promise<PatternTransfer[]> => {
  const response = await apiClient.get<{ success: boolean; data: PatternTransfer[] }>(
    '/api/learning/transfers',
    { params: { limit } }
  );
  return response.data.data;
};

/**
 * Get algorithm performance comparison
 */
export const getAlgorithmComparison = async (): Promise<AlgorithmPerformance[]> => {
  const response = await apiClient.get<{ success: boolean; data: AlgorithmPerformance[] }>(
    '/api/learning/algorithms/comparison'
  );
  return response.data.data;
};

/**
 * Get learning curves for specific agent
 */
export const getAgentLearningCurve = async (
  agentId: string,
  episodes?: number
) => {
  const response = await apiClient.get(
    `/api/learning/agents/${agentId}/curve`,
    { params: { episodes } }
  );
  return response.data.data;
};

/**
 * Get pattern sharing network data
 */
export const getPatternNetwork = async () => {
  const response = await apiClient.get('/api/learning/pattern-network');
  return response.data.data;
};

/**
 * Get fleet-wide statistics
 */
export const getFleetStatistics = async () => {
  const response = await apiClient.get('/api/learning/fleet/stats');
  return response.data.data;
};

/**
 * Trigger manual training for an agent
 */
export const triggerAgentTraining = async (
  agentId: string,
  episodes: number = 100
): Promise<void> => {
  await apiClient.post(`/api/learning/agents/${agentId}/train`, { episodes });
};

/**
 * Export learning data for analysis
 */
export const exportLearningData = async (
  agentId?: string,
  format: 'json' | 'csv' = 'json'
) => {
  const response = await apiClient.get('/api/learning/export', {
    params: { agentId, format },
    responseType: format === 'csv' ? 'blob' : 'json',
  });
  return response.data;
};
