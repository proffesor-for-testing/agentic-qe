/**
 * DAG Attention Scheduler Types
 * RuVector Integration Plan - Phase 4, Task 4.2
 *
 * Type definitions for DAG-based test execution ordering.
 *
 * @module test-scheduling/dag-attention-types
 */

// ============================================================================
// Core Types
// ============================================================================

/** A test node in the dependency graph */
export interface TestNode {
  /** Unique identifier */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Estimated duration in milliseconds */
  estimatedDuration: number;
  /** IDs of tests that must complete before this test can start */
  dependencies: string[];
  /** Numeric priority (higher = more important) */
  priority: number;
  /** Tags for categorization (e.g., 'unit', 'integration') */
  tags: string[];
  /** Last recorded execution time in ms */
  lastExecutionTime?: number;
  /** Last test result */
  lastResult?: 'pass' | 'fail' | 'skip';
}

/** Internal DAG representation built from TestNode[] */
export interface TestDAG {
  /** All nodes indexed by ID */
  nodes: Map<string, TestNode>;
  /** Forward edges: node -> its direct dependents */
  edges: Map<string, string[]>;
  /** IDs on the critical path, in execution order */
  criticalPath: string[];
  /** Groups of test IDs that can run in parallel */
  parallelGroups: string[][];
}

/** A single phase in the scheduled execution */
export interface SchedulePhase {
  /** Tests assigned to this phase */
  tests: TestNode[];
  /** Whether the tests in this phase can run concurrently */
  canRunInParallel: boolean;
}

/** Full scheduled execution plan */
export interface ScheduledExecution {
  /** Ordered phases of execution */
  phases: SchedulePhase[];
  /** Total estimated wall-clock time in ms */
  totalEstimatedTime: number;
  /** Sum of durations along the critical path in ms */
  criticalPathTime: number;
  /** Effective parallelism factor (total work / wall-clock) */
  parallelism: number;
}

/** Statistics about scheduler optimizations */
export interface SchedulerStats {
  /** Total number of tests in the DAG */
  totalTests: number;
  /** Number of tests on the critical path */
  criticalPathLength: number;
  /** Number of parallel groups discovered */
  parallelGroupCount: number;
  /** Number of tests pruned by MinCut */
  prunedTests: number;
  /** Estimated time saved via parallelism (ms) */
  estimatedTimeSaved: number;
  /** Number of completed scheduling runs tracked */
  historicalRuns: number;
  /** Whether the native WASM backend is in use */
  usingNativeBackend: boolean;
}

/** Historical record for self-learning */
export interface ExecutionRecord {
  testId: string;
  actualDuration: number;
  result: 'pass' | 'fail' | 'skip';
  timestamp: number;
}
