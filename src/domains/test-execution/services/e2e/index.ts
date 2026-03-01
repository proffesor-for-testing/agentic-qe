/**
 * Agentic QE v3 - E2E Runner Module
 *
 * Modular E2E test runner composed of:
 * - types.ts: Configuration, interfaces, errors
 * - browser-orchestrator.ts: Browser client management
 * - step-executors.ts: Individual step execution
 * - step-retry-handler.ts: Retry logic and timeout handling
 * - result-collector.ts: Result aggregation
 * - e2e-coordinator.ts: Main service orchestration
 *
 * @module test-execution/services/e2e
 */

// ============================================================================
// Types and Configuration
// ============================================================================

export {
  // Configuration
  type E2ERunnerConfig,
  type BrowserClientType,
  type ExecutionStrategy,
  DEFAULT_E2E_RUNNER_CONFIG,

  // Context types
  type StepExecutionContext,
  type StepExecutionData,
  type UnifiedBrowserClient,

  // Error classes
  E2ERunnerError,
  StepTimeoutError,
  AssertionError,

  // Service interface
  type IE2ETestRunnerService,
} from './types';

// ============================================================================
// Browser Orchestrator
// ============================================================================

export {
  BrowserOrchestrator,
  createBrowserOrchestrator,

  // Type guards
  isAgentBrowserClient,
  isVibiumClient,

  // Utilities
  toElementTarget,
  toVibiumScreenshotResult,
  toVibiumAccessibilityResult,
} from './browser-orchestrator';

// ============================================================================
// Step Executors
// ============================================================================

export {
  StepExecutors,
  createStepExecutors,
} from './step-executors';

// ============================================================================
// Assertion Handlers
// ============================================================================

export {
  AssertionHandlers,
  createAssertionHandlers,
} from './assertion-handlers';

// ============================================================================
// Wait Condition Handler
// ============================================================================

export {
  WaitConditionHandler,
  createWaitConditionHandler,
} from './wait-condition-handler';

// ============================================================================
// Step Retry Handler
// ============================================================================

export {
  StepRetryHandler,
  createStepRetryHandler,
} from './step-retry-handler';

// ============================================================================
// Result Collector
// ============================================================================

export {
  ResultCollector,
  createResultCollector,
} from './result-collector';

// ============================================================================
// E2E Coordinator (Main Service)
// ============================================================================

export {
  E2ETestRunnerService,
  createE2ETestRunnerService,
  createE2ETestRunnerServiceWithBrowserClient,
  createAutoE2ETestRunnerService,
} from './e2e-coordinator';
