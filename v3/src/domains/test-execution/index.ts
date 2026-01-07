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
} from './services/flaky-detector';

export {
  RetryHandlerService,
  type IRetryHandler,
  type RetryExecutionRequest,
  type RetryStatistics,
  type TestRetryStats,
  type RetryPolicy,
  type RetryCondition,
} from './services/retry-handler';

// ============================================================================
// Coordinator
// ============================================================================

export {
  TestExecutionCoordinator,
  createTestExecutionCoordinator,
  type ITestExecutionCoordinator,
} from './coordinator';

// ============================================================================
// Plugin
// ============================================================================

export {
  TestExecutionPlugin,
  createTestExecutionPlugin,
} from './plugin';
