/**
 * Test Partitioning Types
 *
 * Types for MinCut-based test suite partitioning to optimize
 * parallel execution by minimizing cross-partition dependencies.
 */

/**
 * A test file with metadata for partitioning decisions
 */
export interface TestFile {
  /** File path */
  path: string;
  /** Estimated execution time in milliseconds */
  estimatedDuration: number;
  /** Files this test depends on (imports) */
  dependencies: string[];
  /** Files that depend on this test (shared fixtures, etc.) */
  dependents: string[];
  /** Historical flakiness score (0-1, higher = more flaky) */
  flakinessScore: number;
  /** Priority level for execution order */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Optional tags for grouping */
  tags?: string[];
}

/**
 * A partition (batch) of tests to run on a single worker
 */
export interface TestPartition {
  /** Partition identifier */
  id: string;
  /** Tests in this partition */
  tests: TestFile[];
  /** Total estimated duration for this partition */
  estimatedDuration: number;
  /** Number of cross-partition dependencies (fewer = better) */
  crossPartitionDeps: number;
  /** Worker assignment (for tracking) */
  workerIndex?: number;
}

/**
 * Result of partitioning a test suite
 */
export interface PartitionResult {
  /** The partitions created */
  partitions: TestPartition[];
  /** Algorithm used for partitioning */
  algorithm: 'mincut' | 'round-robin' | 'duration-balanced' | 'dependency-aware';
  /** Total cross-partition dependencies (lower = more efficient) */
  totalCrossPartitionDeps: number;
  /** Load balance score (0-1, higher = more balanced) */
  loadBalanceScore: number;
  /** Time taken to compute partitions in ms */
  computationTimeMs: number;
  /** MinCut value if using mincut algorithm */
  minCutValue?: number;
  /** Estimated speedup over naive partitioning */
  estimatedSpeedup: number;
}

/**
 * Configuration for test partitioning
 */
export interface PartitionConfig {
  /** Number of partitions (workers) to create */
  partitionCount: number;
  /** Maximum time imbalance allowed (0.1 = 10%) */
  maxImbalance: number;
  /** Weight for duration vs dependencies trade-off (0-1) */
  durationWeight: number;
  /** Whether to prioritize flaky tests first */
  prioritizeFlakyTests: boolean;
  /** Whether to keep related tests together */
  keepRelatedTogether: boolean;
  /** Timeout for partitioning computation in ms */
  timeout: number;
}

/**
 * Default configuration for test partitioning
 */
export const DEFAULT_PARTITION_CONFIG: PartitionConfig = {
  partitionCount: 4,
  maxImbalance: 0.15, // 15% max difference
  durationWeight: 0.6, // 60% weight on duration, 40% on deps
  prioritizeFlakyTests: true,
  keepRelatedTogether: true,
  timeout: 5000,
};

/**
 * Test dependency graph node
 */
export interface TestGraphNode {
  /** Test file path */
  id: string;
  /** Associated test file */
  testFile: TestFile;
  /** Weight for graph algorithms (based on duration) */
  weight: number;
}

/**
 * Test dependency graph edge
 */
export interface TestGraphEdge {
  /** Source test ID */
  source: string;
  /** Target test ID */
  target: string;
  /** Dependency strength (higher = stronger coupling) */
  weight: number;
  /** Type of dependency */
  type: 'import' | 'fixture' | 'data' | 'execution-order';
}

/**
 * Statistics for partition quality analysis
 */
export interface PartitionStats {
  /** Duration variance across partitions */
  durationVariance: number;
  /** Standard deviation of partition sizes */
  sizeStdDev: number;
  /** Percentage of tests with cross-partition dependencies */
  crossDepPercentage: number;
  /** Estimated parallel efficiency (0-1) */
  parallelEfficiency: number;
  /** Comparison with naive round-robin */
  vsNaiveImprovement: number;
}
