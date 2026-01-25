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
// E2E Step Types
// ============================================================================

export {
  // Factory Functions
  createNavigateStep,
  createClickStep,
  createTypeStep,
  createWaitStep,
  createAssertStep,
  createScreenshotStep,
  createA11yCheckStep,
  createE2ETestCase,

  // Type Guards
  isNavigateStep,
  isClickStep,
  isTypeStep,
  isWaitStep,
  isAssertStep,
  isScreenshotStep,
  isA11yCheckStep,
} from './types';

export type {
  // Step Type Enumeration
  E2EStepType,

  // Step Options Types
  NavigateStepOptions,
  ClickStepOptions,
  TypeStepOptions,
  WaitStepOptions,
  WaitConditionType,
  AssertStepOptions,
  AssertionType,
  ScreenshotStepOptions,
  A11yCheckStepOptions,
  StepOptions,

  // Step Interfaces
  E2EStepBase,
  NavigateStep,
  ClickStep,
  TypeStep,
  WaitStep,
  AssertStep,
  ScreenshotStep,
  A11yCheckStep,
  E2EStep,

  // Step Result
  E2EStepResult,

  // Test Case Types
  Viewport,
  BrowserContextOptions,
  E2ETestHooks,
  E2ETestCase,

  // Test Result
  E2ETestResult,

  // Test Suite
  E2ETestSuite,
  E2ETestSuiteResult,

  // Utility Types
  ExtractStepType,
  StepOptionsFor,
  E2EStepBuilder,
  SerializableE2ETestCase,
} from './types';

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

export {
  E2ETestRunnerService,
  createE2ETestRunnerService,
  createE2ETestRunnerServiceWithBrowserClient,
  createAutoE2ETestRunnerService,
  type IE2ETestRunnerService,
  type E2ERunnerConfig,
  type BrowserClientType,
  type ExecutionStrategy,
  E2ERunnerError,
  StepTimeoutError,
  AssertionError,
  DEFAULT_E2E_RUNNER_CONFIG,
} from './services/e2e-runner';

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
