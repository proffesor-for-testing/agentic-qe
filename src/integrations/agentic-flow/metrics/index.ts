/**
 * Agentic QE v3 - Metrics Module
 *
 * Runtime metrics tracking for Agent Booster, Model Router,
 * ONNX Embeddings, and ReasoningBank components.
 *
 * Replaces hardcoded "91.5% success rate" with actual measured outcomes.
 *
 * @example Basic Usage
 * ```typescript
 * import { getMetricsTracker } from 'agentic-qe/integrations/agentic-flow/metrics';
 *
 * const tracker = await getMetricsTracker();
 *
 * // Record outcomes
 * await tracker.recordOutcome('booster', 'task-123', true, 5, {
 *   subType: 'var-to-const',
 *   confidence: 0.95,
 * });
 *
 * // Get real success rate
 * const stats = await tracker.getSuccessRate('booster', '24h');
 * console.log(`Real success rate: ${(stats.rate * 100).toFixed(1)}%`);
 * ```
 *
 * @example Update Patterns
 * ```typescript
 * import { updatePatternsWithRealMetrics } from 'agentic-qe/integrations/agentic-flow/metrics';
 *
 * // At end of session, update pattern JSON files with real metrics
 * const summary = await updatePatternsWithRealMetrics();
 * console.log(`Updated ${summary.updatedFiles.length} pattern files`);
 * ```
 *
 * @module integrations/agentic-flow/metrics
 */

// ============================================================================
// Types
// ============================================================================

export type {
  MetricComponent,
  OutcomeStatus,
  OutcomeMetadata,
  RecordedOutcome,
  SuccessRateStats,
  SubTypeMetrics,
  ComponentMetricsSummary,
  MetricsSummary,
  PatternMetricsUpdate,
  TimeWindow,
  MetricsTrackerConfig,
  IMetricsTracker,
} from './types';

export {
  timeWindowToMs,
  DEFAULT_METRICS_TRACKER_CONFIG,
} from './types';

// ============================================================================
// MetricsTracker
// ============================================================================

export {
  MetricsTracker,
  createMetricsTracker,
  createMetricsTrackerSync,
  getMetricsTracker,
  resetMetricsTracker,
} from './metrics-tracker';

// ============================================================================
// Pattern Updater
// ============================================================================

export {
  PatternUpdater,
  createPatternUpdater,
  updatePatternsWithRealMetrics,
  type PatternUpdaterConfig,
} from './pattern-updater';
