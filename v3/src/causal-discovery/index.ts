/**
 * Agentic QE v3 - Causal Discovery Module
 * ADR-035: STDP-based spike timing correlation for root cause analysis
 *
 * Provides automated causal inference using Spike-Timing Dependent Plasticity (STDP).
 * The system learns causal relationships between events from observation data,
 * enabling intelligent root cause analysis and intervention recommendations.
 *
 * Key Components:
 * - CausalWeightMatrix: STDP-based weight learning
 * - CausalGraphImpl: Graph operations (reachability, transitive closure, SCC)
 * - CausalDiscoveryEngine: Main engine for observation and analysis
 *
 * @example
 * ```typescript
 * import { CausalDiscoveryEngine, TestEvent } from './causal-discovery';
 *
 * const engine = new CausalDiscoveryEngine();
 *
 * // Observe events as they occur
 * engine.observe({ type: 'code_changed', timestamp: Date.now() });
 * engine.observe({ type: 'build_started', timestamp: Date.now() + 100 });
 * engine.observe({ type: 'test_failed', timestamp: Date.now() + 200 });
 *
 * // Analyze root cause of failures
 * const analysis = engine.analyzeRootCause('test_failed');
 * console.log('Direct causes:', analysis.directCauses);
 * console.log('Intervention points:', analysis.interventionPoints);
 * ```
 */

// Export types (use 'export type' for type-only exports with isolatedModules)
export type {
  // Configuration
  CausalDiscoveryConfig,

  // Event types
  TestEventType,
  TestEvent,

  // Causal relationships
  CausalRelation,
  CausalEdge,
  CausalGraph,

  // Root cause analysis
  RootCauseAnalysis,
  CausalFactor,
  IndirectCause,
  InterventionPoint,

  // Summary
  CausalSummary,

  // STDP
  STDPParams,

  // Spike types
  Spike,
  SpikeTrain,

  // Weight matrix types
  WeightEntry,
  WeightMatrixStats,
} from './types.js';

// Export runtime values
export {
  DEFAULT_CAUSAL_CONFIG,
  ALL_EVENT_TYPES,
  DEFAULT_STDP_PARAMS,
} from './types.js';

// Export implementations
export { CausalWeightMatrix } from './weight-matrix.js';
export { CausalGraphImpl } from './causal-graph.js';
export { CausalDiscoveryEngine } from './discovery-engine.js';

// Factory function for creating a configured engine
import type { CausalDiscoveryConfig } from './types.js';
import { DEFAULT_CAUSAL_CONFIG } from './types.js';
import { CausalDiscoveryEngine } from './discovery-engine.js';

/**
 * Create a causal discovery engine with optional configuration
 */
export function createCausalDiscoveryEngine(
  config: Partial<CausalDiscoveryConfig> = {}
): CausalDiscoveryEngine {
  return new CausalDiscoveryEngine(config);
}

/**
 * Create a causal discovery engine optimized for QE testing scenarios
 */
export function createQECausalEngine(): CausalDiscoveryEngine {
  return new CausalDiscoveryEngine({
    ...DEFAULT_CAUSAL_CONFIG,
    timeWindow: 100, // Larger window for test events
    learningRate: 0.02, // Faster learning for shorter sessions
    minObservations: 5, // Lower threshold for quick feedback
  });
}

/**
 * Create a causal discovery engine optimized for production monitoring
 */
export function createProductionCausalEngine(): CausalDiscoveryEngine {
  return new CausalDiscoveryEngine({
    ...DEFAULT_CAUSAL_CONFIG,
    timeWindow: 30000, // 30 second window for production events
    learningRate: 0.005, // Slower learning for stability
    decayRate: 0.0001, // Slower decay for long-term patterns
    maxHistorySize: 50000, // Larger history
    minObservations: 50, // More observations needed for confidence
  });
}
