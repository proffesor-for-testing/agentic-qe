/**
 * Agentic QE v3 - Time Crystal Types & Interfaces
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 4
 *
 * All types, interfaces, and configuration constants for the Time Crystal
 * CI/CD coordination system.
 */

import type { CPGConfig, CPGTestPhase, CPGPhaseResult } from './kuramoto-cpg';
import type { DomainName } from '../../shared/types';

/** Domain name for time crystal events */
export const TIME_CRYSTAL_SOURCE: DomainName = 'coordination';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Temporal attractors - states the CI/CD system naturally evolves toward
 */
export type TemporalAttractor = 'stable' | 'degraded' | 'chaotic';

/**
 * Phase state in the time crystal
 */
export type PhaseState = 'dormant' | 'activating' | 'active' | 'completing' | 'cooldown';

/**
 * CI/CD execution metrics for a time window
 */
export interface ExecutionMetrics {
  /** Timestamp of the metrics */
  readonly timestamp: Date;

  /** Number of builds executed */
  readonly buildCount: number;

  /** Number of successful builds */
  readonly successfulBuilds: number;

  /** Number of tests executed */
  readonly testCount: number;

  /** Number of tests passed */
  readonly testsPassed: number;

  /** Number of tests failed */
  readonly testsFailed: number;

  /** Average build duration (ms) */
  readonly avgBuildDuration: number;

  /** Average test duration (ms) */
  readonly avgTestDuration: number;

  /** Resource utilization (0-1) */
  readonly resourceUtilization: number;

  /** Queue depth (pending items) */
  readonly queueDepth: number;

  /** Throughput (items/minute) */
  readonly throughput: number;
}

/**
 * Time crystal phase representing a periodic CI/CD pattern
 */
export interface TimeCrystalPhase {
  /** Phase ID */
  readonly id: string;

  /** Phase name */
  readonly name: string;

  /** Phase state */
  state: PhaseState;

  /** Phase period (ms) - how long a complete cycle takes */
  readonly periodMs: number;

  /** Phase offset (ms) - when this phase starts within a cycle */
  readonly offsetMs: number;

  /** Expected duration (ms) */
  readonly expectedDuration: number;

  /** Optimal parallelism for this phase */
  readonly optimalParallelism: number;

  /** Test types typically run in this phase */
  readonly testTypes: string[];

  /** Historical success rate (0-1) */
  successRate: number;

  /** Average actual duration (ms) */
  avgActualDuration: number;

  /** Execution count */
  executionCount: number;

  /** Last activation timestamp */
  lastActivation?: Date;
}

/**
 * Temporal dependency between execution units
 */
export interface TemporalDependency {
  /** Source execution unit ID */
  readonly sourceId: string;

  /** Target execution unit ID */
  readonly targetId: string;

  /** Dependency type */
  readonly type: 'must-precede' | 'should-precede' | 'independent' | 'conflicts';

  /** Dependency strength (0-1) */
  readonly strength: number;

  /** Historical latency between executions (ms) */
  readonly latencyMs: number;

  /** Observation count */
  observationCount: number;
}

/**
 * Crystal lattice - network of temporal dependencies
 */
export interface CrystalLattice {
  /** All execution units in the lattice */
  readonly nodes: Map<string, LatticeNode>;

  /** Dependencies between nodes */
  readonly dependencies: TemporalDependency[];

  /** Computed execution order (mutable for optimization) */
  executionOrder: string[];

  /** Parallel execution groups (mutable for optimization) */
  parallelGroups: string[][];

  /** Last optimization timestamp */
  lastOptimized: Date;
}

/**
 * Node in the crystal lattice
 */
export interface LatticeNode {
  /** Node ID (test or build unit) */
  readonly id: string;

  /** Node type */
  readonly type: 'test' | 'build' | 'deploy' | 'validate';

  /** Average execution time (ms) */
  avgExecutionTime: number;

  /** Failure probability (0-1) */
  failureProbability: number;

  /** Priority (higher = execute earlier) */
  priority: number;

  /** Resource requirements */
  readonly resources: {
    cpu: number;
    memory: number;
    io: number;
  };
}

/**
 * Observation from CI/CD execution
 */
export interface CrystalObservation {
  /** Observation ID */
  readonly id: string;

  /** Timestamp */
  readonly timestamp: Date;

  /** Current attractor state */
  readonly attractor: TemporalAttractor;

  /** Execution metrics */
  readonly metrics: ExecutionMetrics;

  /** Active phases */
  readonly activePhases: string[];

  /** Detected anomalies */
  readonly anomalies: CrystalAnomaly[];

  /** Predicted next phase */
  readonly predictedNextPhase?: string;

  /** Confidence in prediction */
  readonly predictionConfidence: number;
}

/**
 * Anomaly detected in CI/CD patterns
 */
export interface CrystalAnomaly {
  /** Anomaly type */
  readonly type: 'phase-drift' | 'cascade-failure' | 'resource-contention' | 'timeout-spike' | 'throughput-drop';

  /** Severity (0-1) */
  readonly severity: number;

  /** Affected phase/node IDs */
  readonly affected: string[];

  /** Description */
  readonly description: string;

  /** Suggested action */
  readonly suggestion: string;
}

/**
 * Optimization action for the scheduler
 */
export type ScheduleOptimization =
  | { readonly type: 'reorder'; readonly newOrder: string[] }
  | { readonly type: 'parallelize'; readonly groups: string[][] }
  | { readonly type: 'delay'; readonly nodeId: string; readonly delayMs: number }
  | { readonly type: 'skip'; readonly nodeId: string; readonly reason: string }
  | { readonly type: 'retry'; readonly nodeId: string; readonly maxAttempts: number }
  | { readonly type: 'no_change'; readonly reason: string };

/**
 * Stabilization action to move toward stable attractor
 */
export type StabilizationAction =
  | { readonly type: 'reduce_parallelism'; readonly by: number }
  | { readonly type: 'increase_parallelism'; readonly by: number }
  | { readonly type: 'isolate_flaky'; readonly testIds: string[] }
  | { readonly type: 'warm_cache'; readonly cacheKeys: string[] }
  | { readonly type: 'clear_queue'; readonly reason: string }
  | { readonly type: 'throttle'; readonly durationMs: number }
  | { readonly type: 'no_action'; readonly reason: string };

// ============================================================================
// Phase Executor Interface (ADR-032)
// ============================================================================

/**
 * Interface for executing test phases
 * Allows dependency injection of test execution strategy
 */
export interface PhaseExecutor {
  /**
   * Execute tests for a given phase
   * @param phase - The CPG test phase to execute
   * @returns Promise resolving to phase execution result
   */
  execute(phase: CPGTestPhase): Promise<CPGPhaseResult>;

  /**
   * Check if executor is ready to run tests
   */
  isReady(): boolean;

  /**
   * Get executor name for logging
   */
  getName(): string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Time crystal controller configuration
 */
export interface TimeCrystalConfig {
  /** Enable time crystal coordination */
  enabled: boolean;

  /** Observation interval (ms) */
  observationIntervalMs: number;

  /** Phase detection window (ms) */
  phaseDetectionWindowMs: number;

  /** Minimum observations for pattern detection */
  minObservationsForPattern: number;

  /** Anomaly detection sensitivity (0-1, higher = more sensitive) */
  anomalySensitivity: number;

  /** Stability threshold for attractor detection */
  stabilityThreshold: number;

  /** Maximum parallel execution groups */
  maxParallelGroups: number;

  /** Prediction horizon (ms) */
  predictionHorizonMs: number;

  /** Enable automatic optimization */
  autoOptimize: boolean;

  /** Enable automatic stabilization */
  autoStabilize: boolean;

  /** Enable Kuramoto CPG-driven phase scheduling */
  useCPGScheduling: boolean;

  /** CPG configuration override (uses DEFAULT_CPG_CONFIG if not provided) */
  cpgConfig?: Partial<CPGConfig>;

  /** CPG test phases override (uses DEFAULT_CPG_TEST_PHASES if not provided) */
  cpgPhases?: CPGTestPhase[];
}

/**
 * Default time crystal configuration
 */
export const DEFAULT_TIME_CRYSTAL_CONFIG: TimeCrystalConfig = {
  enabled: true,
  observationIntervalMs: 30000, // 30 seconds
  phaseDetectionWindowMs: 3600000, // 1 hour
  minObservationsForPattern: 10,
  anomalySensitivity: 0.7,
  stabilityThreshold: 0.8,
  maxParallelGroups: 8,
  predictionHorizonMs: 600000, // 10 minutes
  autoOptimize: true,
  autoStabilize: true,
  useCPGScheduling: true, // Enable CPG by default
};

/**
 * Time crystal event types
 */
export type TimeCrystalEventType =
  | 'crystal.observation'
  | 'crystal.phase.activated'
  | 'crystal.phase.completed'
  | 'crystal.attractor.changed'
  | 'crystal.anomaly.detected'
  | 'crystal.optimization.applied'
  | 'crystal.stabilization.applied'
  | 'crystal.cpg.tick'
  | 'crystal.cpg.transition'
  | 'crystal.cpg.started'
  | 'crystal.cpg.stopped'
  | 'crystal.cpg.repair';

/**
 * Default CI/CD phase definitions for time crystal initialization
 */
export const DEFAULT_CRYSTAL_PHASES: Omit<TimeCrystalPhase, 'state' | 'successRate' | 'avgActualDuration' | 'executionCount'>[] = [
  {
    id: 'unit-tests',
    name: 'Unit Tests',
    periodMs: 60000,
    offsetMs: 0,
    expectedDuration: 30000,
    optimalParallelism: 8,
    testTypes: ['unit'],
  },
  {
    id: 'integration-tests',
    name: 'Integration Tests',
    periodMs: 120000,
    offsetMs: 30000,
    expectedDuration: 60000,
    optimalParallelism: 4,
    testTypes: ['integration'],
  },
  {
    id: 'e2e-tests',
    name: 'End-to-End Tests',
    periodMs: 300000,
    offsetMs: 90000,
    expectedDuration: 180000,
    optimalParallelism: 2,
    testTypes: ['e2e', 'visual'],
  },
  {
    id: 'performance-tests',
    name: 'Performance Tests',
    periodMs: 600000,
    offsetMs: 270000,
    expectedDuration: 120000,
    optimalParallelism: 1,
    testTypes: ['performance', 'load'],
  },
];
