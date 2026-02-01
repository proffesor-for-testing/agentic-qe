/**
 * Agentic QE v3 - E2E Test Runner Service (Facade)
 *
 * This file is a backward-compatible facade that re-exports from the
 * modular E2E runner components located in ./e2e/
 *
 * The E2E runner has been split into modular components:
 * - e2e/types.ts: Configuration, interfaces, errors (~170 LOC)
 * - e2e/browser-orchestrator.ts: Browser client management (~330 LOC)
 * - e2e/step-executors.ts: Individual step execution (~850 LOC)
 * - e2e/step-retry-handler.ts: Retry logic and timeout handling (~160 LOC)
 * - e2e/result-collector.ts: Result aggregation (~150 LOC)
 * - e2e/e2e-coordinator.ts: Main service orchestration (~340 LOC)
 *
 * All original public exports are preserved for backward compatibility.
 *
 * @module test-execution/services/e2e-runner
 */

// ============================================================================
// Re-export all public API from modular components
// ============================================================================

// Types and Configuration
export {
  type E2ERunnerConfig,
  type BrowserClientType,
  type ExecutionStrategy,
  DEFAULT_E2E_RUNNER_CONFIG,
  type IE2ETestRunnerService,
  E2ERunnerError,
  StepTimeoutError,
  AssertionError,
} from './e2e/types';

// Main Service and Factory Functions
export {
  E2ETestRunnerService,
  createE2ETestRunnerService,
  createE2ETestRunnerServiceWithBrowserClient,
  createAutoE2ETestRunnerService,
} from './e2e/e2e-coordinator';

// ============================================================================
// Additional exports for advanced usage (internal modules)
// ============================================================================

// Browser Orchestrator (for testing and extension)
export {
  BrowserOrchestrator,
  createBrowserOrchestrator,
  isAgentBrowserClient,
  isVibiumClient,
  toElementTarget,
  toVibiumScreenshotResult,
  toVibiumAccessibilityResult,
} from './e2e/browser-orchestrator';

// Step Executors (for testing and extension)
export {
  StepExecutors,
  createStepExecutors,
} from './e2e/step-executors';

// Step Retry Handler (for testing and extension)
export {
  StepRetryHandler,
  createStepRetryHandler,
} from './e2e/step-retry-handler';

// Result Collector (for testing and extension)
export {
  ResultCollector,
  createResultCollector,
} from './e2e/result-collector';

// Context types (for testing)
export type {
  StepExecutionContext,
  StepExecutionData,
  UnifiedBrowserClient,
} from './e2e/types';
