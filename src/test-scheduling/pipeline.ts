/**
 * Test Scheduling Pipeline
 *
 * INTEGRATION LAYER that wires together all test-scheduling components:
 * - GitAwareTestSelector (with ImpactAnalyzerService for import graph analysis)
 * - PhaseScheduler (orchestrates test execution phases)
 * - VitestPhaseExecutor (runs actual tests)
 * - FlakyTestTracker (tracks historical flakiness)
 * - GitHubActionsReporter (CI/CD output)
 *
 * This pipeline ensures components are properly connected and data flows
 * between them correctly. Without this integration layer, components
 * exist in isolation and don't provide value.
 *
 * @example
 * ```typescript
 * import { TestSchedulingPipeline } from './pipeline';
 * import { createMemoryBackend } from '../kernel/memory-backend';
 *
 * const memory = await createMemoryBackend();
 * const pipeline = await TestSchedulingPipeline.create({ memory, cwd: '/my/project' });
 *
 * // Run the full pipeline: select -> execute -> track -> report
 * const results = await pipeline.run();
 * ```
 */

import { PhaseScheduler, createPhaseScheduler, type SchedulerConfig } from './phase-scheduler';
import { VitestPhaseExecutor, type VitestConfig } from './executors/vitest-executor';
import { GitAwareTestSelector, createTestSelector, type TestSelectorConfig } from './git-aware/test-selector';
import {
  FlakyTestTracker,
  createFlakyTracker,
  loadFlakyTracker,
  saveFlakyTracker,
  type FlakyTrackerConfig,
} from './flaky-tracking/flaky-tracker';
import {
  GitHubActionsReporter,
  createGitHubActionsReporter,
  detectCIEnvironment,
  type GitHubActionsConfig,
} from './cicd/github-actions';
import type { TestPhase, PhaseResult, CIEnvironment } from './interfaces';

// Type imports
type MemoryBackend = import('../kernel/interfaces').MemoryBackend;

// ============================================================================
// Types
// ============================================================================

export interface PipelineConfig {
  /** Working directory for git and test execution */
  cwd: string;

  /**
   * Memory backend for code-intelligence integration.
   * REQUIRED - no fallback. Code intelligence is mandatory for accurate test selection.
   */
  memory: MemoryBackend;

  /** Test phases to run */
  phases?: TestPhase[];

  /** Git base ref for change detection */
  baseRef?: string;

  /** Path to store flaky test history */
  flakyHistoryPath?: string;

  /** Vitest configuration */
  vitest?: Omit<VitestConfig, 'flakyTracker'>;

  /** Scheduler configuration */
  scheduler?: Omit<SchedulerConfig, 'phases'>;

  /** GitHub Actions reporter configuration */
  reporter?: GitHubActionsConfig;

  /** Flaky tracker configuration */
  flakyTracker?: Partial<FlakyTrackerConfig>;

  /** Run all tests (skip git-aware selection) */
  runAllTests?: boolean;
}

export interface PipelineResult {
  /** Test phase results */
  phaseResults: PhaseResult[];

  /** Selected tests (if using git-aware selection) */
  selectedTests: string[];

  /** Whether we ran all tests vs selected subset */
  ranAllTests: boolean;

  /** Flaky test analysis */
  flakyAnalysis: ReturnType<FlakyTestTracker['analyze']>;

  /** CI environment info */
  ciEnvironment: CIEnvironment;

  /** Total duration in milliseconds */
  totalDurationMs: number;
}

// ============================================================================
// Test Scheduling Pipeline
// ============================================================================

export class TestSchedulingPipeline {
  private selector: GitAwareTestSelector;
  private executor: VitestPhaseExecutor;
  private scheduler: PhaseScheduler;
  private flakyTracker: FlakyTestTracker;
  private reporter: GitHubActionsReporter;
  private ciEnvironment: CIEnvironment;

  private constructor(
    private readonly config: PipelineConfig,
    selector: GitAwareTestSelector,
    executor: VitestPhaseExecutor,
    scheduler: PhaseScheduler,
    flakyTracker: FlakyTestTracker,
    reporter: GitHubActionsReporter
  ) {
    this.selector = selector;
    this.executor = executor;
    this.scheduler = scheduler;
    this.flakyTracker = flakyTracker;
    this.reporter = reporter;
    this.ciEnvironment = detectCIEnvironment();
  }

  /**
   * Create a fully integrated test scheduling pipeline
   *
   * This factory method:
   * 1. Creates FlakyTracker (loads history if exists)
   * 2. Creates VitestExecutor with FlakyTracker integration
   * 3. Optionally creates ImpactAnalyzerService for import graph analysis
   * 4. Creates GitAwareTestSelector with ImpactAnalyzer integration
   * 5. Creates PhaseScheduler with the executor
   * 6. Creates GitHubActionsReporter
   */
  static async create(config: PipelineConfig): Promise<TestSchedulingPipeline> {
    // 1. Create/load FlakyTracker
    const flakyTracker = config.flakyHistoryPath
      ? await loadFlakyTracker(config.flakyHistoryPath, config.flakyTracker)
      : createFlakyTracker(config.flakyTracker);

    // 2. Create VitestExecutor with FlakyTracker integration
    const executor = new VitestPhaseExecutor({
      ...config.vitest,
      cwd: config.cwd,
      flakyTracker, // INTEGRATION: Pass tracker to executor
    });

    // 3. Create ImpactAnalyzerService for import graph analysis (REQUIRED)
    // NO FALLBACK - code intelligence is mandatory for accurate test selection
    const { ImpactAnalyzerService } = await import(
      '../domains/code-intelligence/services/impact-analyzer'
    );
    const impactAnalyzer = new ImpactAnalyzerService(config.memory);

    // 4. Create GitAwareTestSelector with ImpactAnalyzer integration
    const selector = createTestSelector({
      cwd: config.cwd,
      baseRef: config.baseRef,
      impactAnalyzer, // INTEGRATION: Pass analyzer to selector
    });

    // 5. Create PhaseScheduler with executor
    const scheduler = createPhaseScheduler(executor, {
      ...config.scheduler,
      phases: config.phases,
    });

    // 6. Create GitHubActionsReporter
    const reporter = createGitHubActionsReporter(config.reporter);

    return new TestSchedulingPipeline(
      config,
      selector,
      executor,
      scheduler,
      flakyTracker,
      reporter
    );
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Run the complete test scheduling pipeline:
   * 1. Select affected tests (git-aware + import graph)
   * 2. Execute tests in phases
   * 3. Track flaky tests
   * 4. Report to CI/CD
   */
  async run(): Promise<PipelineResult> {
    const startTime = Date.now();
    let selectedTests: string[] = [];
    let ranAllTests = this.config.runAllTests ?? false;

    // Step 1: Select affected tests (unless running all)
    if (!ranAllTests) {
      const selectionResult = await this.selector.selectAffectedTests();

      if (selectionResult.runAllTests) {
        ranAllTests = true;
        console.log(`[TestSchedulingPipeline] Running all tests: ${selectionResult.runAllReason}`);
      } else if (selectionResult.selectedTests.length === 0) {
        // No tests selected - could mean no changes affect tests
        console.log('[TestSchedulingPipeline] No affected tests found, running all');
        ranAllTests = true;
      } else {
        selectedTests = selectionResult.selectedTests;
        console.log(`[TestSchedulingPipeline] Selected ${selectedTests.length} affected tests`);
      }
    }

    // Step 2: Execute tests
    let phaseResults: PhaseResult[];

    if (ranAllTests) {
      // Run all phases with all tests
      phaseResults = await this.scheduler.run();
    } else {
      // Run with selected test files
      phaseResults = await this.runWithSelectedTests(selectedTests);
    }

    // Step 3: Get flaky analysis (tracker already updated by executor)
    const flakyAnalysis = this.flakyTracker.analyze();

    // Step 4: Save flaky history
    if (this.config.flakyHistoryPath) {
      await saveFlakyTracker(this.flakyTracker, this.config.flakyHistoryPath);
    }

    // Step 5: Report to CI/CD
    if (this.ciEnvironment.isCI) {
      await this.reporter.writeOutput(phaseResults);
    }

    const totalDurationMs = Date.now() - startTime;

    return {
      phaseResults,
      selectedTests,
      ranAllTests,
      flakyAnalysis,
      ciEnvironment: this.ciEnvironment,
      totalDurationMs,
    };
  }

  /**
   * Run only affected tests for a specific phase
   */
  async runPhase(phaseId: string): Promise<PhaseResult> {
    return this.scheduler.runPhase(phaseId);
  }

  /**
   * Get the flaky test tracker for direct access
   */
  getFlakyTracker(): FlakyTestTracker {
    return this.flakyTracker;
  }

  /**
   * Get the test selector for direct access
   */
  getSelector(): GitAwareTestSelector {
    return this.selector;
  }

  /**
   * Get scheduler stats
   */
  getStats() {
    return this.scheduler.getStats();
  }

  /**
   * Abort running tests
   */
  async abort(): Promise<void> {
    await this.scheduler.abort();
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private async runWithSelectedTests(testFiles: string[]): Promise<PhaseResult[]> {
    // For selected tests, we need to modify how the executor runs
    // This is a simplified approach - run all phases but only with selected files
    const results: PhaseResult[] = [];
    const phases = this.config.phases ?? [];

    for (const phase of phases) {
      // Filter selected tests that match this phase's patterns
      const phaseTests = testFiles.filter((file) =>
        phase.testPatterns.some((pattern) => {
          if (pattern.startsWith('!')) return false;
          const regex = this.patternToRegex(pattern);
          return regex.test(file);
        })
      );

      if (phaseTests.length > 0) {
        const result = await this.executor.execute(phase, phaseTests);
        results.push(result);
      }
    }

    return results;
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    return new RegExp(escaped);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a test scheduling pipeline with full integration
 */
export async function createTestPipeline(config: PipelineConfig): Promise<TestSchedulingPipeline> {
  return TestSchedulingPipeline.create(config);
}

/**
 * Quick function to run the full pipeline
 */
export async function runTestPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const pipeline = await createTestPipeline(config);
  return pipeline.run();
}
