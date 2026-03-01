/**
 * Agentic QE v3 - Metric Collector Interfaces
 *
 * Real metric measurement interfaces for LOC, tests, and code patterns.
 * Part of RM-001 (Real Metric Measurement) improvement.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 5
 */

// ============================================================================
// Core Interface
// ============================================================================

/**
 * MetricCollector interface for collecting real code metrics
 * using actual tooling (cloc, tokei, test runners) instead of estimation.
 */
export interface MetricCollector {
  /**
   * Collect all metrics for a project
   * @param projectPath - Absolute path to the project root
   * @returns ProjectMetrics containing LOC, test counts, and patterns
   */
  collectAll(projectPath: string): Promise<ProjectMetrics>;

  /**
   * Count lines of code using actual tooling (cloc/tokei)
   * @param projectPath - Absolute path to the project root
   * @returns LOCMetrics with accurate counts per language
   */
  countLOC(projectPath: string): Promise<LOCMetrics>;

  /**
   * Count tests using actual test runners (vitest/jest/cargo/pytest)
   * @param projectPath - Absolute path to the project root
   * @returns TestMetrics with accurate test counts by type
   */
  countTests(projectPath: string): Promise<TestMetrics>;

  /**
   * Count language-specific patterns (unwrap, unsafe, TODOs, console)
   * @param projectPath - Absolute path to the project root
   * @param language - Target language ('typescript', 'rust', 'python', etc.)
   * @returns PatternMetrics with counts by pattern type
   */
  countPatterns(projectPath: string, language: string): Promise<PatternMetrics>;
}

// ============================================================================
// Metric Types
// ============================================================================

/**
 * Aggregated project metrics from all collectors
 */
export interface ProjectMetrics {
  /** Lines of code metrics */
  loc: LOCMetrics;
  /** Test count metrics */
  tests: TestMetrics;
  /** Pattern count metrics */
  patterns: PatternMetrics;
  /** Timestamp when metrics were collected */
  collectedAt: Date;
  /** Tools used for collection (e.g., ['cloc', 'vitest']) */
  toolsUsed: string[];
  /** Fix #281: Accuracy indicator when fallback counting is used */
  accuracy?: {
    loc: 'accurate' | 'approximate';
    tests: 'accurate' | 'approximate';
    overall: 'accurate' | 'approximate';
  };
}

/**
 * Lines of Code metrics from cloc/tokei/fallback
 */
export interface LOCMetrics {
  /** Total lines of code (excluding comments and blanks) */
  total: number;
  /** Lines of code by language (e.g., { TypeScript: 5000, JavaScript: 200 }) */
  byLanguage: Record<string, number>;
  /** Source tool used for counting */
  source: LOCSource;
  /** Directories excluded from counting */
  excludedDirs: string[];
}

/**
 * Available LOC counting tools
 */
export type LOCSource = 'cloc' | 'tokei' | 'node-native' | 'fallback';

/**
 * Test count metrics from test runners
 */
export interface TestMetrics {
  /** Total number of tests */
  total: number;
  /** Number of unit tests */
  unit: number;
  /** Number of integration tests */
  integration: number;
  /** Number of end-to-end tests */
  e2e: number;
  /** Source test runner used */
  source: TestSource;
}

/**
 * Available test runners for counting
 */
export type TestSource = 'vitest' | 'jest' | 'cargo' | 'pytest' | 'go' | 'fallback';

/**
 * Pattern metrics for code quality indicators
 */
export interface PatternMetrics {
  /** Count of unwrap() calls (Rust-specific) */
  unwraps: number;
  /** Count of unsafe blocks (Rust-specific) */
  unsafeBlocks: number;
  /** Count of TODO/FIXME/HACK comments */
  todoComments: number;
  /** Count of console.log/print statements */
  consoleStatements: number;
  /** Pattern counts by file */
  byFile: Record<string, PatternCounts>;
}

/**
 * Per-file pattern counts
 */
export interface PatternCounts {
  /** Count of unwrap() calls */
  unwraps: number;
  /** Count of unsafe blocks */
  unsafeBlocks: number;
  /** Count of TODO/FIXME/HACK comments */
  todoComments: number;
  /** Count of console.log/print statements */
  consoleStatements: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the MetricCollector service
 */
export interface MetricCollectorConfig {
  /** Timeout for tool execution in milliseconds (default: 60000) */
  timeout: number;
  /** Directories to exclude from LOC counting */
  excludeDirs: string[];
  /** File patterns to include for test counting */
  testPatterns: string[];
  /** Enable caching of metrics (default: true) */
  enableCache: boolean;
  /** Cache TTL in milliseconds (default: 300000 = 5 minutes) */
  cacheTTL: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_METRIC_CONFIG: MetricCollectorConfig = {
  timeout: 60000,
  excludeDirs: [
    // JS/TS ecosystem
    'node_modules', 'dist', 'build', 'coverage', '.nyc_output', '.next', '.nuxt', '.output',
    // Python ecosystem
    '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', '.eggs', '*.egg-info',
    // Rust / Java / Go
    'target', '.gradle', 'vendor', '.bundle',
    // General
    '.git', '.svn', '.hg',
  ],
  testPatterns: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js'],
  enableCache: true,
  cacheTTL: 300000,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of tool availability check
 */
export interface ToolAvailability {
  /** Tool name */
  name: string;
  /** Whether the tool is available */
  available: boolean;
  /** Tool version if available */
  version?: string;
  /** Path to tool executable */
  path?: string;
}

/**
 * Error information for metric collection failures
 */
export interface MetricError {
  /** Error code */
  code: 'TOOL_NOT_AVAILABLE' | 'TIMEOUT' | 'PARSE_ERROR' | 'FILE_NOT_FOUND' | 'UNKNOWN';
  /** Human-readable error message */
  message: string;
  /** Tool that failed */
  tool?: string;
  /** Original error if available */
  cause?: Error;
}
