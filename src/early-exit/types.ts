/**
 * Agentic QE v3 - Early Exit Testing Types
 * ADR-033: Lambda-stability decisions with speculative execution
 *
 * This module defines types for coherence-driven early exit testing,
 * enabling intelligent test layer skipping based on quality signals.
 */

// ============================================================================
// Test Layer Types
// ============================================================================

/**
 * Test layer types in the testing pyramid
 */
export type TestLayerType = 'unit' | 'integration' | 'e2e' | 'performance';

/**
 * A test layer in the testing pyramid
 */
export interface TestLayer {
  /** Layer index (0-indexed) */
  index: number;
  /** Layer type */
  type: TestLayerType;
  /** Human-readable name */
  name: string;
  /** Test files in this layer */
  testFiles: string[];
  /** Expected execution time (ms) */
  expectedDuration?: number;
  /** Historical pass rate (0-1) */
  historicalPassRate?: number;
}

/**
 * Result from executing a single test layer
 */
export interface LayerResult {
  /** Layer index */
  layerIndex: number;
  /** Layer type */
  layerType: TestLayerType;
  /** Pass rate (0-1) */
  passRate: number;
  /** Coverage percentage (0-1) */
  coverage: number;
  /** Ratio of flaky tests (0-1) */
  flakyRatio: number;
  /** Previous lambda value for delta calculation */
  previousLambda?: number;
  /** Number of tests run */
  totalTests: number;
  /** Number of tests passed */
  passedTests: number;
  /** Number of tests failed */
  failedTests: number;
  /** Number of tests skipped */
  skippedTests: number;
  /** Execution duration (ms) */
  duration: number;
  /** Detailed test results */
  testResults?: TestResult[];
}

/**
 * Individual test result
 */
export interface TestResult {
  /** Test name */
  name: string;
  /** Test file */
  file: string;
  /** Test status */
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  /** Error message if failed */
  error?: string;
  /** Duration (ms) */
  duration: number;
  /** Number of retries */
  retries?: number;
}

// ============================================================================
// Quality Signal Types
// ============================================================================

/**
 * Quality signal computed from layer results
 * Used for early exit decisions
 */
export interface QualitySignal {
  /** Current quality lambda (0-100 scale) */
  lambda: number;

  /** Previous lambda for delta calculation */
  lambdaPrev: number;

  /** Number of metrics at boundary threshold (near 70%) */
  boundaryEdges: number;

  /** Concentration of issues (0-1 scale) */
  boundaryConcentration: number;

  /** Number of quality partitions */
  partitionCount: number;

  /** Control flags for special conditions */
  flags: QualityFlags;

  /** Timestamp of signal computation */
  timestamp: Date;

  /** Source layer index */
  sourceLayer: number;
}

/**
 * Quality signal control flags
 */
export enum QualityFlags {
  NONE = 0,
  /** Critical failure detected */
  CRITICAL_FAILURE = 1 << 0,
  /** Coverage regression detected */
  COVERAGE_REGRESSION = 1 << 1,
  /** High flaky test rate */
  HIGH_FLAKY_RATE = 1 << 2,
  /** Performance degradation */
  PERFORMANCE_DEGRADATION = 1 << 3,
  /** Security vulnerability detected */
  SECURITY_ISSUE = 1 << 4,
  /** Force continue to deeper layers */
  FORCE_CONTINUE = 1 << 5,
}

// ============================================================================
// Early Exit Decision Types
// ============================================================================

/**
 * Reasons for early exit decisions
 */
export type ExitReason =
  | 'insufficient_confidence'
  | 'lambda_too_low'
  | 'lambda_unstable'
  | 'boundaries_concentrated'
  | 'confident_exit'
  | 'forced_continue'
  | 'critical_failure'
  | 'coverage_regression';

/**
 * Decision result for early exit
 */
export interface EarlyExitDecision {
  /** Whether early exit is allowed */
  canExit: boolean;

  /** Confidence in the decision (0-1) */
  confidence: number;

  /** Layer at which to exit (if canExit is true) */
  exitLayer: number;

  /** Reason for the decision */
  reason: ExitReason;

  /** Whether to enable speculative test generation */
  enableSpeculation: boolean;

  /** Explanation for logging/debugging */
  explanation: string;

  /** Timestamp of decision */
  timestamp: Date;

  /** Lambda stability value (0-1) */
  lambdaStability: number;

  /** Lambda value at decision point */
  lambdaValue: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for early exit behavior
 */
export interface EarlyExitConfig {
  /** Target exit layer (0-indexed) - exit after this layer if conditions met */
  exitLayer: number;

  /** Minimum lambda value required for early exit (0-100 scale) */
  minLambdaForExit: number;

  /** Minimum lambda stability required for exit (0-1 scale) */
  minLambdaStability: number;

  /** Maximum boundary concentration for early exit (0-1 scale) */
  maxBoundaryConcentration: number;

  /** Number of speculative test batches after early exit */
  speculativeTests: number;

  /** Number of verification layers for speculative results */
  verificationLayers: number;

  /** Enable adaptive exit layer based on lambda stability */
  adaptiveExitLayer: boolean;

  /** Minimum overall confidence threshold (0-1 scale) */
  minConfidence: number;

  /** Enable detailed logging */
  verbose: boolean;
}

/**
 * Default configuration for balanced early exit
 */
export const DEFAULT_EXIT_CONFIG: EarlyExitConfig = {
  exitLayer: 1, // Exit after integration tests
  minLambdaForExit: 80,
  minLambdaStability: 0.85,
  maxBoundaryConcentration: 0.5,
  speculativeTests: 4,
  verificationLayers: 2,
  adaptiveExitLayer: true,
  minConfidence: 0.80,
  verbose: false,
};

/**
 * Aggressive configuration for fast feedback
 */
export const AGGRESSIVE_EXIT_CONFIG: EarlyExitConfig = {
  exitLayer: 0, // Exit after unit tests
  minLambdaForExit: 60,
  minLambdaStability: 0.75,
  maxBoundaryConcentration: 0.6,
  speculativeTests: 8,
  verificationLayers: 1,
  adaptiveExitLayer: true,
  minConfidence: 0.70,
  verbose: false,
};

/**
 * Conservative configuration for high-risk changes
 */
export const CONSERVATIVE_EXIT_CONFIG: EarlyExitConfig = {
  exitLayer: 2, // Exit after E2E tests
  minLambdaForExit: 95,
  minLambdaStability: 0.92,
  maxBoundaryConcentration: 0.35,
  speculativeTests: 2,
  verificationLayers: 4,
  adaptiveExitLayer: false,
  minConfidence: 0.90,
  verbose: false,
};

// ============================================================================
// Speculative Execution Types
// ============================================================================

/**
 * Predicted outcome for speculative execution
 */
export type PredictedOutcome = 'pass' | 'fail' | 'flaky';

/**
 * Result of speculative prediction
 */
export interface SpeculativeResult {
  /** Predicted outcome */
  predicted: PredictedOutcome;

  /** Confidence in prediction (0-1) */
  confidence: number;

  /** Whether prediction was verified */
  verified: boolean;

  /** Actual outcome (if verified) */
  actual?: PredictedOutcome;

  /** Whether speculation was correct */
  correct?: boolean;

  /** Layer this prediction is for */
  layerIndex: number;

  /** Layer type */
  layerType: TestLayerType;

  /** Prediction reasoning */
  reasoning: string;
}

/**
 * Batch of speculative predictions
 */
export interface SpeculativeBatch {
  /** Predictions for each skipped layer */
  predictions: SpeculativeResult[];

  /** Overall confidence in batch */
  batchConfidence: number;

  /** Number of verified predictions */
  verifiedCount: number;

  /** Accuracy of verified predictions */
  accuracy?: number;

  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// Test Pyramid Result Types
// ============================================================================

/**
 * Complete result from test pyramid execution with early exit support
 */
export interface TestPyramidResult {
  /** Results from executed layers */
  layers: LayerResult[];

  /** Whether early exit occurred */
  exitedEarly: boolean;

  /** Layer at which exit occurred */
  exitLayer: number;

  /** Reason for exit/continuation */
  exitReason: ExitReason;

  /** Confidence in final result (0-1) */
  confidence: number;

  /** Speculative predictions for skipped layers */
  speculations: SpeculativeResult[];

  /** Number of layers skipped */
  skippedLayers: number;

  /** Total execution duration (ms) */
  totalDuration: number;

  /** Compute savings from early exit (estimated ms) */
  computeSavings: number;

  /** Final quality signal */
  finalSignal: QualitySignal;

  /** Early exit decision details */
  decision: EarlyExitDecision;
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Metrics for early exit system performance
 */
export interface EarlyExitMetrics {
  /** Total pyramid executions */
  totalExecutions: number;

  /** Number of early exits */
  earlyExitCount: number;

  /** Early exit rate (0-1) */
  earlyExitRate: number;

  /** Average compute savings (ms) */
  avgComputeSavings: number;

  /** Total compute savings (ms) */
  totalComputeSavings: number;

  /** Average confidence at exit */
  avgConfidence: number;

  /** Exit layer distribution */
  exitLayerDistribution: Map<number, number>;

  /** Exit reason distribution */
  exitReasonDistribution: Map<ExitReason, number>;

  /** Speculation accuracy */
  speculationAccuracy: number;

  /** False positive rate (exited when shouldn't have) */
  falsePositiveRate: number;

  /** False negative rate (didn't exit when should have) */
  falseNegativeRate: number;
}
