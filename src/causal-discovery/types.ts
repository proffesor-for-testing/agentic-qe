/**
 * Agentic QE v3 - Causal Discovery Types
 * ADR-035: STDP-based spike timing correlation for root cause analysis
 *
 * Core type definitions for causal discovery using Spike-Timing Dependent Plasticity (STDP).
 * STDP naturally encodes Granger-like causality: if event A consistently precedes event B,
 * the weight W_AB reflects the causal strength A->B.
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for causal discovery engine
 */
export interface CausalDiscoveryConfig {
  /** Number of event types to track */
  numEventTypes: number;

  /** Threshold for significant causal relationship (0-1) */
  causalThreshold: number;

  /** Time window for causality detection in milliseconds */
  timeWindow: number;

  /** Learning rate for causal weight updates (STDP parameter) */
  learningRate: number;

  /** Decay rate for causal weights (prevents unbounded growth) */
  decayRate: number;

  /** Time constant for STDP positive window (tau+) */
  tauPositive: number;

  /** Time constant for STDP negative window (tau-) */
  tauNegative: number;

  /** Maximum events to keep in history */
  maxHistorySize: number;

  /** Minimum observation count before analysis is reliable */
  minObservations: number;
}

/**
 * Default configuration based on RuVector causal.rs parameters
 */
export const DEFAULT_CAUSAL_CONFIG: CausalDiscoveryConfig = {
  numEventTypes: 100,
  causalThreshold: 0.1,
  timeWindow: 50, // 50ms default window
  learningRate: 0.01,
  decayRate: 0.001,
  tauPositive: 16.67, // timeWindow / 3
  tauNegative: 16.67,
  maxHistorySize: 10000,
  minObservations: 10,
};

// ============================================================================
// Test Event Types
// ============================================================================

/**
 * Types of events that can occur in the QE system
 */
export type TestEventType =
  | 'test_started'
  | 'test_passed'
  | 'test_failed'
  | 'test_flaky'
  | 'test_skipped'
  | 'assertion_failed'
  | 'timeout'
  | 'exception'
  | 'resource_exhausted'
  | 'dependency_failed'
  | 'coverage_changed'
  | 'coverage_decreased'
  | 'coverage_increased'
  | 'build_started'
  | 'build_failed'
  | 'build_succeeded'
  | 'deploy_started'
  | 'deploy_failed'
  | 'deploy_succeeded'
  | 'rollback_triggered'
  | 'alert_fired'
  | 'config_changed'
  | 'code_changed'
  | 'merge_completed'
  | 'pr_opened'
  | 'pr_merged'
  | 'memory_spike'
  | 'cpu_spike'
  | 'network_error'
  | 'database_error'
  | 'api_error'
  | 'auth_failed'
  | 'rate_limited'
  | 'cache_miss'
  | 'queue_full';

/**
 * All known event types for iteration
 */
export const ALL_EVENT_TYPES: readonly TestEventType[] = [
  'test_started',
  'test_passed',
  'test_failed',
  'test_flaky',
  'test_skipped',
  'assertion_failed',
  'timeout',
  'exception',
  'resource_exhausted',
  'dependency_failed',
  'coverage_changed',
  'coverage_decreased',
  'coverage_increased',
  'build_started',
  'build_failed',
  'build_succeeded',
  'deploy_started',
  'deploy_failed',
  'deploy_succeeded',
  'rollback_triggered',
  'alert_fired',
  'config_changed',
  'code_changed',
  'merge_completed',
  'pr_opened',
  'pr_merged',
  'memory_spike',
  'cpu_spike',
  'network_error',
  'database_error',
  'api_error',
  'auth_failed',
  'rate_limited',
  'cache_miss',
  'queue_full',
] as const;

/**
 * A single test/system event for causal analysis
 */
export interface TestEvent {
  /** Type of event */
  type: TestEventType;

  /** Timestamp in milliseconds (Unix epoch) */
  timestamp: number;

  /** Associated test ID (if applicable) */
  testId?: string;

  /** Associated file path (if applicable) */
  file?: string;

  /** Event metadata */
  data?: Record<string, unknown>;

  /** Unique event ID */
  id?: string;
}

// ============================================================================
// Causal Relationship Types
// ============================================================================

/**
 * Type of causal relationship between events
 */
export type CausalRelation = 'causes' | 'prevents' | 'none';

/**
 * A directed edge in the causal graph
 */
export interface CausalEdge {
  /** Source event type (cause) */
  source: TestEventType;

  /** Target event type (effect) */
  target: TestEventType;

  /** Strength of the causal relationship (0-1) */
  strength: number;

  /** Type of relationship */
  relation: CausalRelation;

  /** Number of observations supporting this edge */
  observations: number;

  /** Last time this relationship was observed */
  lastObserved: number;
}

/**
 * Causal graph interface for graph operations
 */
export interface CausalGraph {
  /** All nodes (event types) in the graph */
  nodes: TestEventType[];

  /** All edges (causal relationships) in the graph */
  edges: CausalEdge[];

  /** Get all edges originating from a source event */
  edgesFrom(source: TestEventType): CausalEdge[];

  /** Get all edges pointing to a target event */
  edgesTo(target: TestEventType): CausalEdge[];

  /** Find all nodes reachable from a source via causal edges */
  reachableFrom(source: TestEventType): Set<TestEventType>;

  /** Compute transitive closure of the graph */
  transitiveClosure(): CausalGraph;

  /** Find all causal paths between two event types */
  findPaths(source: TestEventType, target: TestEventType): TestEventType[][];

  /** Get the strongly connected components */
  stronglyConnectedComponents(): TestEventType[][];
}

// ============================================================================
// Root Cause Analysis Types
// ============================================================================

/**
 * Result of root cause analysis for a target event
 */
export interface RootCauseAnalysis {
  /** Target event being analyzed */
  targetEvent: TestEventType;

  /** Direct causes (one hop away) sorted by strength */
  directCauses: CausalFactor[];

  /** Indirect causes (via transitive paths) */
  indirectCauses: IndirectCause[];

  /** Optimal intervention points to prevent target event */
  interventionPoints: InterventionPoint[];

  /** Confidence in analysis (0-1) based on evidence strength */
  confidence: number;

  /** Number of events observed for this analysis */
  observationCount: number;

  /** Timestamp of analysis */
  analyzedAt: number;
}

/**
 * A direct causal factor
 */
export interface CausalFactor {
  /** The event type that is a cause */
  event: TestEventType;

  /** Strength of causation (0-1) */
  strength: number;

  /** Number of times this causation was observed */
  observations: number;
}

/**
 * An indirect cause with the causal path
 */
export interface IndirectCause {
  /** The root event type */
  event: TestEventType;

  /** Total causal strength through path */
  strength: number;

  /** Path from source to target */
  path: TestEventType[];

  /** Path length */
  depth: number;
}

/**
 * A recommended intervention point
 */
export interface InterventionPoint {
  /** The event to intervene on */
  event: TestEventType;

  /** Score indicating effectiveness of intervention (0-1) */
  score: number;

  /** Why this is a good intervention point */
  reason: string;

  /** Events that would be prevented by intervention */
  preventedEvents: TestEventType[];
}

// ============================================================================
// Summary Types
// ============================================================================

/**
 * Summary statistics for the causal discovery engine
 */
export interface CausalSummary {
  /** Total number of causal relationships discovered */
  numRelationships: number;

  /** Number of "causes" relationships */
  causesCount: number;

  /** Number of "prevents" relationships */
  preventsCount: number;

  /** Average strength of relationships */
  avgStrength: number;

  /** Maximum strength observed */
  maxStrength: number;

  /** Total events observed */
  eventsObserved: number;

  /** Number of unique event types observed */
  uniqueEventTypes: number;

  /** Time span of observations (ms) */
  observationTimeSpan: number;

  /** Strongest causal pairs */
  strongestPairs: Array<{
    source: TestEventType;
    target: TestEventType;
    strength: number;
  }>;
}

// ============================================================================
// STDP Types
// ============================================================================

/**
 * STDP (Spike-Timing Dependent Plasticity) parameters
 */
export interface STDPParams {
  /** Maximum weight change for potentiation (A+) */
  aPlus: number;

  /** Maximum weight change for depression (A-) */
  aMinus: number;

  /** Time constant for potentiation window (tau+) */
  tauPlus: number;

  /** Time constant for depression window (tau-) */
  tauMinus: number;
}

/**
 * Default STDP parameters based on neuroscience literature
 */
export const DEFAULT_STDP_PARAMS: STDPParams = {
  aPlus: 0.01, // Potentiation amplitude
  aMinus: 0.005, // Depression amplitude (usually smaller)
  tauPlus: 20, // Potentiation time constant (ms)
  tauMinus: 20, // Depression time constant (ms)
};

// ============================================================================
// Spike Types
// ============================================================================

/**
 * A spike event (neural terminology for an event occurrence)
 */
export interface Spike {
  /** The event type that "spiked" */
  eventType: TestEventType;

  /** Timestamp of the spike */
  timestamp: number;

  /** Optional weight/intensity of the spike */
  weight?: number;
}

/**
 * Spike train - a sequence of spikes for an event type
 */
export interface SpikeTrain {
  /** Event type this train belongs to */
  eventType: TestEventType;

  /** Ordered list of spike timestamps */
  spikes: number[];

  /** Average inter-spike interval */
  avgInterval: number;

  /** Total number of spikes */
  count: number;
}

// ============================================================================
// Weight Matrix Types
// ============================================================================

/**
 * A weight entry in the causal weight matrix
 */
export interface WeightEntry {
  /** Causal weight (positive = causes, negative = prevents) */
  weight: number;

  /** Number of observations */
  observations: number;

  /** Last update timestamp */
  lastUpdate: number;

  /** Running average of timing differences */
  avgTimingDiff: number;
}

/**
 * Statistics about the weight matrix
 */
export interface WeightMatrixStats {
  /** Total number of non-zero weights */
  nonZeroWeights: number;

  /** Total number of possible weights */
  totalPossible: number;

  /** Sparsity ratio (0-1, lower is denser) */
  sparsity: number;

  /** Average absolute weight */
  avgAbsWeight: number;

  /** Maximum absolute weight */
  maxAbsWeight: number;

  /** Total observations recorded */
  totalObservations: number;
}
