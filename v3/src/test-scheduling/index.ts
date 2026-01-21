/**
 * Test Scheduling Module
 *
 * Practical test scheduling without the oscillator complexity.
 * Run tests in phases, track flakiness, select affected tests.
 *
 * ============================================================================
 * INTEGRATION PREVENTION PATTERN
 * ============================================================================
 *
 * WHY COMPONENTS GET IMPLEMENTED BUT NOT INTEGRATED:
 * 1. Each component is built in isolation with its own tests
 * 2. Factory functions return standalone instances
 * 3. No integration layer enforces component wiring
 * 4. Tests pass for individual components even when system is broken
 *
 * HOW TO PREVENT THIS:
 * 1. ALWAYS create an integration layer (see pipeline.ts)
 * 2. Factory functions should accept dependencies, not create them
 * 3. Write integration tests that use the full pipeline
 * 4. Document required integrations in component docstrings
 * 5. Review checklist: "Is this component wired to its consumers?"
 *
 * INTEGRATION CHECKLIST for test-scheduling:
 * ✓ VitestPhaseExecutor receives FlakyTracker via config
 * ✓ GitAwareTestSelector receives ImpactAnalyzerService via config
 * ✓ TestSchedulingPipeline wires all components together
 * ✓ Index exports the pipeline as the primary API
 *
 * ============================================================================
 *
 * RECOMMENDED USAGE (use the integrated pipeline):
 * @example
 * ```typescript
 * import { createTestPipeline } from './test-scheduling';
 * import { createMemoryBackend } from '../kernel/memory-backend';
 *
 * // Create fully integrated pipeline
 * const memory = await createMemoryBackend();
 * const pipeline = await createTestPipeline({
 *   cwd: '/my/project',
 *   memory, // Enables code-intelligence integration
 *   useCodeIntelligence: true,
 *   flakyHistoryPath: '.agentic-qe/flaky-history.json',
 * });
 *
 * // Run complete pipeline: select -> execute -> track -> report
 * const results = await pipeline.run();
 * ```
 *
 * MANUAL USAGE (individual components - requires manual wiring):
 * @example
 * ```typescript
 * import {
 *   createPhaseScheduler,
 *   createVitestExecutor,
 *   createTestSelector,
 *   createFlakyTracker,
 * } from './test-scheduling';
 *
 * // WARNING: Manual wiring required!
 * const flakyTracker = createFlakyTracker();
 * const executor = createVitestExecutor({ flakyTracker }); // Pass tracker
 * const scheduler = createPhaseScheduler(executor);
 * ```
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  TestType,
  QualityThresholds,
  TestPhase,
  PhaseResult,
  TestResult,
  PhaseExecutor,
  ChangedFile,
  TestMapping,
  FlakyTestRecord,
  CIEnvironment,
  GitHubActionsOutput,
  GitHubAnnotation,
} from './interfaces';

export { DEFAULT_TEST_PHASES } from './interfaces';

// ============================================================================
// Phase Scheduler
// ============================================================================

export {
  PhaseScheduler,
  createPhaseScheduler,
  checkQualityThresholds,
  type SchedulerState,
  type SchedulerConfig,
  type SchedulerStats,
} from './phase-scheduler';

// ============================================================================
// Vitest Executor
// ============================================================================

export {
  VitestPhaseExecutor,
  createVitestExecutor,
  type VitestConfig,
} from './executors/vitest-executor';

// ============================================================================
// Git-Aware Test Selection
// ============================================================================

export {
  GitAwareTestSelector,
  createTestSelector,
  getAffectedTests,
  type TestSelectorConfig,
  type MappingRule,
  type TestSelectionResult,
} from './git-aware/test-selector';

// ============================================================================
// Flaky Test Tracking
// ============================================================================

export {
  FlakyTestTracker,
  createFlakyTracker,
  loadFlakyTracker,
  saveFlakyTracker,
  type FlakyTrackerConfig,
  type FlakyAnalysis,
} from './flaky-tracking/flaky-tracker';

// ============================================================================
// CI/CD Integration
// ============================================================================

export {
  GitHubActionsReporter,
  createGitHubActionsReporter,
  reportToGitHubActions,
  detectCIEnvironment,
  type GitHubActionsConfig,
} from './cicd/github-actions';

// ============================================================================
// Integration Pipeline
// ============================================================================

export {
  TestSchedulingPipeline,
  createTestPipeline,
  runTestPipeline,
  type PipelineConfig,
  type PipelineResult,
} from './pipeline';
