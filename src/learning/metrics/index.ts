/**
 * Learning Metrics - Phase 3
 *
 * Exports all metrics-related components for learning system monitoring.
 */

// Original Phase 3 implementation (SwarmMemoryManager-based)
export * from './MetricsCollector';
export * from './TrendAnalyzer';
export * from './AlertManager';

// Enhanced Phase 3 implementation (BetterSqlite3-based, aligns with DreamEngine/TransferProtocol)
export {
  LearningMetricsData,
  MetricsSummary,
  DiscoveryBreakdown,
  QualityBreakdown,
  TransferBreakdown,
  ImpactBreakdown,
  SystemHealthBreakdown,
  MetricsConfig,
  LearningMetrics as LearningMetricsCollector,
} from './LearningMetrics';

export {
  MetricsSnapshot,
  MetricsQuery,
  MetricsAggregation,
  MetricsStoreConfig,
  MetricsStore,
} from './MetricsStore';

export { default as LearningMetricsDefault } from './LearningMetrics';
export { default as MetricsStoreDefault } from './MetricsStore';
