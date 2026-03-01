/**
 * Agentic QE v3 - Dynamic Agent Scaling
 * ADR-064 Phase 4C: Workload-Based Auto-Scaling
 *
 * Reactive scaling module that monitors workload metrics (queue depth,
 * agent utilization, error rates) and automatically adjusts agent count
 * within tier-defined bounds. Integrates with the Queen Coordinator and
 * Fleet Tier system for end-to-end fleet management.
 *
 * @example
 * ```typescript
 * import {
 *   createDynamicScaler,
 *   DEFAULT_SCALING_POLICY,
 * } from './coordination/dynamic-scaling';
 *
 * const scaler = createDynamicScaler(4);
 *
 * scaler.recordMetrics({
 *   queueDepth: 20,
 *   activeAgents: 4,
 *   idleAgents: 0,
 *   avgTaskDurationMs: 1500,
 *   errorRate: 0.02,
 *   throughput: 10,
 *   timestamp: Date.now(),
 * });
 *
 * const decision = scaler.evaluate();
 * console.log(decision.action);       // 'scale-up'
 * console.log(decision.targetAgents); // 7
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  WorkloadMetrics,
  ScalingDecision,
  ScalingAction,
  ScalingPolicy,
  ScalingEvent,
  ScalerStats,
  DynamicScalingConfig,
} from './types';

export {
  DEFAULT_SCALING_POLICY,
  DEFAULT_DYNAMIC_SCALING_CONFIG,
} from './types';

// ============================================================================
// Scaler
// ============================================================================

export { DynamicScaler, createDynamicScaler } from './dynamic-scaler';

export type { ScaleExecutor } from './dynamic-scaler';
