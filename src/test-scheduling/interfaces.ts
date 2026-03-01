/**
 * Test Scheduling - Core Interfaces
 *
 * Practical types for test phase management.
 * No oscillators, no crystals - just useful abstractions.
 */

// ============================================================================
// Test Phase Types
// ============================================================================

/**
 * Types of tests that can be executed
 */
export type TestType =
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'performance'
  | 'security'
  | 'visual'
  | 'accessibility'
  | 'contract';

/**
 * Quality thresholds for phase completion
 */
export interface QualityThresholds {
  /** Minimum pass rate to proceed (0-1) */
  minPassRate: number;

  /** Maximum flaky test ratio allowed (0-1) */
  maxFlakyRatio: number;

  /** Minimum coverage requirement (0-1) */
  minCoverage: number;
}

/**
 * Test phase definition
 */
export interface TestPhase {
  /** Phase identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Test types to run in this phase */
  testTypes: TestType[];

  /** Glob patterns for test files */
  testPatterns: string[];

  /** Quality requirements */
  thresholds: QualityThresholds;

  /** Maximum parallel workers */
  parallelism: number;

  /** Timeout in milliseconds */
  timeoutMs: number;

  /** Whether to fail fast on first error */
  failFast: boolean;
}

/**
 * Result of executing a test phase
 */
export interface PhaseResult {
  /** Phase that was executed */
  phaseId: string;

  /** Phase name */
  phaseName: string;

  /** Whether all quality thresholds were met */
  success: boolean;

  /** Test pass rate (0-1) */
  passRate: number;

  /** Flaky test ratio (0-1) */
  flakyRatio: number;

  /** Code coverage achieved (0-1) */
  coverage: number;

  /** Execution duration in ms */
  durationMs: number;

  /** Total tests discovered */
  totalTests: number;

  /** Tests that passed */
  passed: number;

  /** Tests that failed */
  failed: number;

  /** Tests that were skipped */
  skipped: number;

  /** Individual test results */
  testResults: TestResult[];

  /** Flaky tests detected */
  flakyTests: string[];

  /** Error message if phase failed */
  error?: string;
}

/**
 * Individual test result
 */
export interface TestResult {
  /** Test file path */
  file: string;

  /** Test name/title */
  name: string;

  /** Test suite/describe block */
  suite: string;

  /** Whether test passed */
  passed: boolean;

  /** Duration in ms */
  durationMs: number;

  /** Number of retries needed */
  retries: number;

  /** Error message if failed */
  error?: string;

  /** Stack trace if failed */
  stack?: string;
}

// ============================================================================
// Executor Interface
// ============================================================================

/**
 * Interface for test phase execution
 * Implement this to integrate with your test runner
 */
export interface PhaseExecutor {
  /**
   * Execute tests for a given phase
   * @param phase - Phase configuration
   * @param testFiles - Specific files to run (if empty, runs all matching patterns)
   * @returns Promise resolving to phase result
   */
  execute(phase: TestPhase, testFiles?: string[]): Promise<PhaseResult>;

  /**
   * Check if executor is ready (dependencies installed, etc.)
   */
  isReady(): Promise<boolean>;

  /**
   * Get executor name for logging
   */
  getName(): string;

  /**
   * Abort currently running tests
   */
  abort(): Promise<void>;
}

// ============================================================================
// Git-Aware Types
// ============================================================================

/**
 * A changed file detected by git
 */
export interface ChangedFile {
  /** File path relative to repo root */
  path: string;

  /** Type of change */
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';

  /** Previous path (for renames) */
  previousPath?: string;
}

/**
 * Mapping from source files to their tests
 */
export interface TestMapping {
  /** Source file path */
  sourceFile: string;

  /** Test files that cover this source */
  testFiles: string[];

  /** Confidence score (0-1) based on naming/imports */
  confidence: number;
}

// ============================================================================
// Flaky Test Types
// ============================================================================

/**
 * Historical record of a test's flakiness
 */
export interface FlakyTestRecord {
  /** Test identifier (file:suite:name) */
  testId: string;

  /** Test file path */
  file: string;

  /** Test name */
  name: string;

  /** Number of times this test has run */
  totalRuns: number;

  /** Number of times it passed */
  passCount: number;

  /** Number of times it failed */
  failCount: number;

  /** Number of times it was flaky (passed on retry) */
  flakyCount: number;

  /** Calculated flakiness score (0-1) */
  flakinessScore: number;

  /** Last time this test ran */
  lastRun: Date;

  /** Last time this test was flaky */
  lastFlaky?: Date;

  /** Recent error messages */
  recentErrors: string[];
}

// ============================================================================
// CI/CD Types
// ============================================================================

/**
 * CI environment detection result
 */
export interface CIEnvironment {
  /** Whether running in CI */
  isCI: boolean;

  /** CI provider name */
  provider?: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'circleci' | 'unknown';

  /** Current branch */
  branch?: string;

  /** Commit SHA */
  commitSha?: string;

  /** Pull request number */
  prNumber?: number;

  /** Base branch for PR */
  baseBranch?: string;

  /** Build URL */
  buildUrl?: string;
}

/**
 * GitHub Actions specific output
 */
export interface GitHubActionsOutput {
  /** Summary markdown */
  summary: string;

  /** Annotations for failed tests */
  annotations: GitHubAnnotation[];

  /** Output variables to set */
  outputs: Record<string, string>;
}

/**
 * GitHub annotation for inline comments
 */
export interface GitHubAnnotation {
  /** File path */
  file: string;

  /** Line number */
  line: number;

  /** Annotation level */
  level: 'notice' | 'warning' | 'error';

  /** Message */
  message: string;

  /** Title */
  title: string;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default test phases - practical defaults for most projects
 */
export const DEFAULT_TEST_PHASES: TestPhase[] = [
  {
    id: 'unit',
    name: 'Unit Tests',
    testTypes: ['unit'],
    testPatterns: ['**/*.test.ts', '**/*.spec.ts', '!**/*.integration.*', '!**/*.e2e.*'],
    thresholds: { minPassRate: 0.99, maxFlakyRatio: 0.01, minCoverage: 0.8 },
    parallelism: 8,
    timeoutMs: 60000,
    failFast: true,
  },
  {
    id: 'integration',
    name: 'Integration Tests',
    testTypes: ['integration', 'contract'],
    testPatterns: ['**/*.integration.test.ts', '**/*.integration.spec.ts'],
    thresholds: { minPassRate: 0.95, maxFlakyRatio: 0.05, minCoverage: 0.7 },
    parallelism: 4,
    timeoutMs: 300000,
    failFast: false,
  },
  {
    id: 'e2e',
    name: 'E2E Tests',
    testTypes: ['e2e', 'visual'],
    testPatterns: ['**/*.e2e.test.ts', '**/*.e2e.spec.ts'],
    thresholds: { minPassRate: 0.9, maxFlakyRatio: 0.1, minCoverage: 0.5 },
    parallelism: 2,
    timeoutMs: 600000,
    failFast: false,
  },
];
