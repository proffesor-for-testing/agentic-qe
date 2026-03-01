/**
 * Agentic QE v3 - LLM Metrics Module
 * ADR-043: Vendor-Independent LLM Support - Milestone 11
 *
 * Comprehensive metrics and observability for LLM routing:
 * - Router metrics collection
 * - Cost tracking and analysis
 * - Per-provider and per-agent metrics
 * - Audit logging
 */

// Router metrics
export {
  RouterMetricsCollector,
  createRouterMetricsCollector,
  getGlobalRouterMetrics,
  resetGlobalRouterMetrics,
  type RoutingDecisionRecord,
  type ProviderCallRecord,
  type FallbackRecord,
  type RouterMetricsSummary,
  type ProviderMetrics,
  type AgentMetrics,
  type MetricsTimeWindow,
} from './router-metrics';

// Cost metrics
export {
  CostMetricsCollector,
  createCostMetricsCollector,
  getGlobalCostMetrics,
  resetGlobalCostMetrics,
  type CostRecord,
  type CostTrend,
  type CostBreakdown,
  type BudgetAlert,
  type CostOptimizationSuggestion,
} from './cost-metrics';
