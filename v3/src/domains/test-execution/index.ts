/**
 * Agentic QE v3 - Test Execution Domain
 * Public API exports for the test execution domain
 */

// ============================================================================
// Interfaces
// ============================================================================

export type {
  TestExecutionAPI,
  ExecuteTestsRequest,
  ParallelExecutionRequest,
  TestRunResult,
  FailedTest,
  CoverageData,
  FlakyDetectionRequest,
  FlakyTestReport,
  FlakyTest,
  RetryRequest,
  RetryResult,
  ExecutionStats,
} from './interfaces';

// ============================================================================
// Services
// ============================================================================

export {
  TestExecutorService,
  type ITestExecutionService,
  type TestExecutorConfig,
} from './services/test-executor';

export {
  FlakyDetectorService,
  type IFlakyTestDetector,
  type FlakyAnalysis,
  type FlakySuggestion,
  type Recommendation,
  type TestExecutionRecord,
  type ExecutionContext,
  type CorrelationFactor,
  type FlakyDetectorConfig,
} from './services/flaky-detector';

export {
  RetryHandlerService,
  type IRetryHandler,
  type RetryExecutionRequest,
  type RetryStatistics,
  type TestRetryStats,
  type RetryPolicy,
  type RetryCondition,
  type RetryHandlerConfig,
} from './services/retry-handler';

export {
  TestPrioritizerService,
  type TestMetadata,
  type TestPrioritizationContext,
  type TestPrioritizationAction,
  type PrioritizedTest,
  type PrioritizationResult,
  type TestPrioritizerConfig,
} from './services/test-prioritizer';

// ============================================================================
// Test Prioritization Types
// ============================================================================

export {
  type TestPrioritizationState,
  type TestPrioritizationFeatures,
  type TestExecutionHistory,
  type TestPrioritizationReward,
  mapToFeatures,
  featuresToArray,
  createTestPrioritizationState,
  calculatePrioritizationReward,
} from './test-prioritization-types';

// ============================================================================
// Coordinator
// ============================================================================

export {
  TestExecutionCoordinator,
  createTestExecutionCoordinator,
  type ITestExecutionCoordinator,
  type TestExecutionCoordinatorConfig,
} from './coordinator';

// ============================================================================
// Plugin
// ============================================================================

export {
  TestExecutionPlugin,
  createTestExecutionPlugin,
} from './plugin';
