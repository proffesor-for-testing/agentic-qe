/**
 * AI-Friendly Output Formatter
 *
 * Provides structured JSON output optimized for AI agent consumption,
 * enabling 100x faster parsing vs natural language terminal output.
 *
 * @module output/OutputFormatter
 * @version 1.0.0
 * @see /workspaces/agentic-qe-cf/docs/design/ai-output-format-spec.md
 */

// ==================== Output Modes ====================

/**
 * Output mode enum
 */
export enum OutputMode {
  /** Human-readable terminal output with colors */
  HUMAN = 'human',

  /** Structured JSON output for AI consumption */
  AI = 'ai',

  /** Auto-detect based on environment variables */
  AUTO = 'auto'
}

/**
 * Output type identifiers
 */
export type OutputType =
  | 'test_results'
  | 'coverage_report'
  | 'agent_status'
  | 'quality_metrics'
  | 'security_scan'
  | 'performance_metrics'
  | 'test_results_stream';

/**
 * Execution status
 */
export type ExecutionStatus = 'success' | 'failure' | 'warning' | 'error';

/**
 * Priority levels for action suggestions
 */
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Stream types for long-running operations
 */
export type StreamType = 'start' | 'progress' | 'complete' | 'error';

// ==================== Base Schema ====================

/**
 * Base AI output schema - all outputs must include these fields
 */
export interface BaseAIOutput {
  /** Schema version (semantic versioning) */
  schemaVersion: string;

  /** Output type identifier */
  outputType: OutputType;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Unique execution identifier */
  executionId: string;

  /** Overall execution status */
  status: ExecutionStatus;

  /** Execution metadata */
  metadata: ExecutionMetadata;

  /** Type-specific data payload */
  data: unknown;

  /** Actionable suggestions for next steps */
  actionSuggestions: ActionSuggestion[];

  /** Non-critical warnings */
  warnings: OutputWarning[];

  /** Critical errors */
  errors: OutputError[];
}

/**
 * Execution metadata
 */
export interface ExecutionMetadata {
  /** Agent identifier */
  agentId: string;

  /** Agent version */
  agentVersion: string;

  /** Execution duration in milliseconds */
  duration: number;

  /** Environment name */
  environment: 'production' | 'staging' | 'development' | 'test';

  /** Optional: Test framework used */
  framework?: string;

  /** Optional: CI/CD information */
  ci?: {
    provider: string;
    buildNumber: string;
    buildUrl?: string;
  };

  /** Optional: Additional metadata */
  [key: string]: unknown;
}

// ==================== Action Suggestions ====================

/**
 * Action suggestion for AI agents
 */
export interface ActionSuggestion {
  /** Action type identifier */
  action: string;

  /** Priority level */
  priority: ActionPriority;

  /** Human-readable reason for this action */
  reason: string;

  /** Affected test names (for test-related actions) */
  affectedTests?: string[];

  /** Target file paths (for file-related actions) */
  targetFiles?: string[];

  /** Affected components (for architectural actions) */
  affectedComponents?: string[];

  /** Step-by-step guidance */
  steps: string[];

  /** Automation support */
  automation: ActionAutomation;

  /** Optional: Impact assessment */
  impact?: ActionImpact;

  /** Optional: Related documentation */
  relatedDocs?: string[];
}

/**
 * Automation support for actions
 */
export interface ActionAutomation {
  /** CLI command to execute */
  command: string;

  /** Can this action be automated? */
  canAutoFix: boolean;

  /** Confidence score (0-1) */
  confidence: number;

  /** Estimated time in minutes */
  estimatedTime?: number;

  /** Estimated number of tests to generate (for test generation) */
  estimatedTests?: number;
}

/**
 * Action impact assessment
 */
export interface ActionImpact {
  /** Current value */
  currentValue: number;

  /** Target value */
  targetValue: number;

  /** Estimated improvement */
  estimatedImprovement: number;

  /** Business value */
  businessValue: 'critical' | 'high' | 'medium' | 'low';
}

// ==================== Warnings & Errors ====================

/**
 * Output warning
 */
export interface OutputWarning {
  /** Warning code */
  code: string;

  /** Warning message */
  message: string;

  /** Severity level */
  severity: 'warning' | 'info';

  /** Additional details */
  details?: string;
}

/**
 * Output error
 */
export interface OutputError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Error stack trace */
  stack?: string;

  /** Additional context */
  context?: Record<string, unknown>;
}

// ==================== Test Results Schema ====================

/**
 * Test results output schema
 */
export interface TestResultsOutput extends BaseAIOutput {
  outputType: 'test_results';
  data: TestResultsData;
}

/**
 * Test results data
 */
export interface TestResultsData {
  /** Summary statistics */
  summary: TestSummary;

  /** Test suites */
  suites: TestSuite[];

  /** Failed tests */
  failures: TestFailure[];

  /** Flaky tests detected */
  flaky: FlakyTest[];

  /** Coverage information */
  coverage?: CoverageSummary;
}

/**
 * Test summary
 */
export interface TestSummary {
  /** Total tests executed */
  total: number;

  /** Passed tests */
  passed: number;

  /** Failed tests */
  failed: number;

  /** Skipped tests */
  skipped: number;

  /** Flaky tests detected */
  flaky?: number;

  /** Total duration in milliseconds */
  duration: number;

  /** Pass rate (0-100) */
  passRate: number;

  /** Failure rate (0-100) */
  failureRate: number;

  /** Flaky rate (0-100) */
  flakyRate?: number;
}

/**
 * Test suite result
 */
export interface TestSuite {
  /** Suite name */
  name: string;

  /** Suite file path */
  file: string;

  /** Status */
  status: 'passed' | 'failed' | 'skipped';

  /** Total tests */
  total: number;

  /** Passed tests */
  passed: number;

  /** Failed tests */
  failed: number;

  /** Skipped tests */
  skipped: number;

  /** Duration in milliseconds */
  duration: number;
}

/**
 * Test failure
 */
export interface TestFailure {
  /** Test name */
  testName: string;

  /** Suite name */
  suiteName: string;

  /** File path */
  file: string;

  /** Line number */
  line: number;

  /** Error information */
  error: {
    message: string;
    stack: string;
    type: string;
  };

  /** Test duration in milliseconds */
  duration: number;

  /** Number of retries attempted */
  retries: number;

  /** Last run timestamp */
  lastRun: string;
}

/**
 * Flaky test
 */
export interface FlakyTest {
  /** Test name */
  testName: string;

  /** Suite name */
  suiteName: string;

  /** File path */
  file: string;

  /** Line number */
  line: number;

  /** Flakiness score (0-1) */
  flakinessScore: number;

  /** Failure rate (0-1) */
  failureRate: number;

  /** Total runs analyzed */
  totalRuns: number;

  /** Recent failures count */
  recentFailures: number;

  /** Pattern detected */
  pattern: string;
}

// ==================== Coverage Report Schema ====================

/**
 * Coverage report output schema
 */
export interface CoverageReportOutput extends BaseAIOutput {
  outputType: 'coverage_report';
  data: CoverageReportData;
}

/**
 * Coverage report data
 */
export interface CoverageReportData {
  /** Summary statistics */
  summary: CoverageSummary;

  /** Coverage trend */
  trend?: CoverageTrend;

  /** Coverage gaps */
  gaps: CoverageGap[];

  /** File-level coverage */
  files: FileCoverage[];
}

/**
 * Coverage summary
 */
export interface CoverageSummary {
  /** Overall coverage percentage */
  overall: number;

  /** Line coverage */
  lines: CoverageMetric;

  /** Branch coverage */
  branches: CoverageMetric;

  /** Function coverage */
  functions: CoverageMetric;

  /** Statement coverage */
  statements: CoverageMetric;
}

/**
 * Coverage metric
 */
export interface CoverageMetric {
  /** Total items */
  total: number;

  /** Covered items */
  covered: number;

  /** Uncovered items */
  uncovered: number;

  /** Percentage (0-100) */
  percentage: number;
}

/**
 * Coverage trend
 */
export interface CoverageTrend {
  /** Trend direction */
  direction: 'improving' | 'stable' | 'degrading';

  /** Percentage change */
  change: number;

  /** Previous coverage */
  previousCoverage: number;

  /** Current coverage */
  currentCoverage: number;
}

/**
 * Coverage gap
 */
export interface CoverageGap {
  /** File path */
  file: string;

  /** Gap type */
  type: 'critical_path' | 'high_complexity' | 'error_handling' | 'edge_cases';

  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';

  /** Coverage metrics for this gap */
  coverage: {
    lines: number;
    branches: number;
    functions: number;
  };

  /** Uncovered line numbers */
  uncoveredLines: number[];

  /** Uncovered branches */
  uncoveredBranches: Array<{
    line: number;
    branch: string;
    condition?: string;
  }>;

  /** Impact level */
  impact: 'critical' | 'high' | 'medium' | 'low';

  /** Reason for priority */
  reason: string;
}

/**
 * File coverage
 */
export interface FileCoverage {
  /** File path */
  path: string;

  /** Line coverage */
  lines: CoverageMetric;

  /** Branch coverage */
  branches: CoverageMetric;

  /** Function coverage */
  functions: CoverageMetric;

  /** Uncovered line numbers */
  uncoveredLines: number[];

  /** Uncovered branches */
  uncoveredBranches: Array<{
    line: number;
    branch: string;
  }>;
}

// ==================== Agent Status Schema ====================

/**
 * Agent status output schema
 */
export interface AgentStatusOutput extends BaseAIOutput {
  outputType: 'agent_status';
  data: AgentStatusData;
}

/**
 * Agent status data
 */
export interface AgentStatusData {
  /** Agent information */
  agent: AgentInfo;

  /** Dependencies status */
  dependencies: DependenciesStatus;

  /** Agent configuration */
  configuration: AgentConfiguration;
}

/**
 * Agent information
 */
export interface AgentInfo {
  /** Agent ID */
  id: string;

  /** Agent name */
  name: string;

  /** Agent version */
  version: string;

  /** Current status */
  status: 'active' | 'idle' | 'busy' | 'error' | 'stopped';

  /** Health status */
  health: 'healthy' | 'degraded' | 'unhealthy';

  /** Agent capabilities */
  capabilities: string[];

  /** Agent statistics */
  stats: AgentStats;

  /** Learning information */
  learning?: LearningInfo;
}

/**
 * Agent statistics
 */
export interface AgentStats {
  /** Total executions */
  totalExecutions: number;

  /** Success rate (0-100) */
  successRate: number;

  /** Average duration in milliseconds */
  averageDuration: number;

  /** Tests generated (for test generation agents) */
  testsGenerated?: number;

  /** Last execution timestamp */
  lastExecution: string;
}

/**
 * Learning information
 */
export interface LearningInfo {
  /** Patterns learned */
  patternsLearned: number;

  /** Confidence score (0-1) */
  confidenceScore: number;

  /** Training iterations */
  trainingIterations: number;

  /** Last training timestamp */
  lastTraining: string;
}

/**
 * Dependencies status
 */
export interface DependenciesStatus {
  /** Required dependencies */
  required: Dependency[];

  /** Optional dependencies */
  optional: Dependency[];
}

/**
 * Dependency
 */
export interface Dependency {
  /** Service name */
  service: string;

  /** Health status */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /** Service version */
  version?: string;

  /** Latency in milliseconds */
  latency?: number;

  /** Provider (for LLM services) */
  provider?: string;

  /** Model (for LLM services) */
  model?: string;
}

/**
 * Agent configuration
 */
export interface AgentConfiguration {
  /** Max concurrency */
  maxConcurrency: number;

  /** Timeout in milliseconds */
  timeout: number;

  /** Retry attempts */
  retryAttempts: number;

  /** Learning enabled */
  learningEnabled: boolean;

  /** Memory persistence enabled */
  memoryPersistence: boolean;

  /** Additional configuration */
  [key: string]: unknown;
}

// ==================== Quality Metrics Schema ====================

/**
 * Quality metrics output schema
 */
export interface QualityMetricsOutput extends BaseAIOutput {
  outputType: 'quality_metrics';
  data: QualityMetricsData;
}

/**
 * Quality metrics data
 */
export interface QualityMetricsData {
  /** Overall quality score (0-100) */
  overallScore: number;

  /** Quality grade */
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

  /** Quality dimensions */
  dimensions: QualityDimensions;

  /** Quality gates */
  qualityGates: QualityGates;

  /** Code smells */
  codeSmells: CodeSmells;

  /** Technical debt */
  technicalDebt: TechnicalDebt;
}

/**
 * Quality dimensions
 */
export interface QualityDimensions {
  testCoverage: QualityDimension;
  codeQuality: QualityDimension;
  security: QualityDimension;
  performance: QualityDimension;
  maintainability: QualityDimension;
}

/**
 * Quality dimension
 */
export interface QualityDimension {
  /** Score (0-100) */
  score: number;

  /** Weight in overall score (0-1) */
  weight: number;

  /** Status */
  status: 'excellent' | 'good' | 'fair' | 'needs_improvement' | 'critical';
}

/**
 * Quality gates
 */
export interface QualityGates {
  /** Gates passed */
  passed: number;

  /** Gates failed */
  failed: number;

  /** Total gates */
  total: number;

  /** Individual gate results */
  gates: QualityGate[];
}

/**
 * Quality gate
 */
export interface QualityGate {
  /** Gate name */
  name: string;

  /** Status */
  status: 'passed' | 'failed' | 'warning';

  /** Actual value */
  actualValue: number;

  /** Threshold */
  threshold: number;

  /** Operator */
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';

  /** Optional message */
  message?: string;
}

/**
 * Code smells
 */
export interface CodeSmells {
  /** Total code smells */
  total: number;

  /** Code smells by type */
  byType: {
    duplicate_code: number;
    long_method: number;
    large_class: number;
    long_parameter_list: number;
    [key: string]: number;
  };

  /** Critical smells */
  criticalSmells: CriticalSmell[];
}

/**
 * Critical smell
 */
export interface CriticalSmell {
  /** Smell type */
  type: string;

  /** File path */
  file: string;

  /** Line number */
  line: number;

  /** Severity */
  severity: 'blocker' | 'critical' | 'major' | 'minor';

  /** Message */
  message: string;
}

/**
 * Technical debt
 */
export interface TechnicalDebt {
  /** Total debt */
  total: number;

  /** Unit (hours, days, etc.) */
  unit: string;

  /** Debt by category */
  byCategory: {
    code_smells: number;
    complexity: number;
    duplications: number;
    [key: string]: number;
  };
}

// ==================== Streaming Support ====================

/**
 * Stream start message
 */
export interface StreamStart {
  schemaVersion: string;
  outputType: OutputType;
  streamType: 'start';
  executionId: string;
  timestamp: string;
  metadata: {
    totalTests?: number;
    totalFiles?: number;
    estimatedDuration?: number;
    [key: string]: unknown;
  };
}

/**
 * Stream progress message
 */
export interface StreamProgress {
  streamType: 'progress';
  completed: number;
  total: number;
  passed?: number;
  failed?: number;
  elapsed?: number;
  [key: string]: unknown;
}

/**
 * Stream complete message (full schema)
 */
export interface StreamComplete extends BaseAIOutput {
  streamType: 'complete';
}

/**
 * Stream error message
 */
export interface StreamError {
  streamType: 'error';
  executionId: string;
  timestamp: string;
  error: OutputError;
}

// ==================== Output Formatter Interface ====================

/**
 * Output formatter interface
 */
export interface OutputFormatter {
  /**
   * Format data for output
   */
  format(data: unknown, outputType: OutputType, mode?: OutputMode): string;

  /**
   * Detect output mode based on environment
   */
  detectMode(): OutputMode;

  /**
   * Generate test results output
   */
  formatTestResults(results: TestResultsData, metadata: ExecutionMetadata): TestResultsOutput;

  /**
   * Generate coverage report output
   */
  formatCoverageReport(coverage: CoverageReportData, metadata: ExecutionMetadata): CoverageReportOutput;

  /**
   * Generate agent status output
   */
  formatAgentStatus(status: AgentStatusData, metadata: ExecutionMetadata): AgentStatusOutput;

  /**
   * Generate quality metrics output
   */
  formatQualityMetrics(metrics: QualityMetricsData, metadata: ExecutionMetadata): QualityMetricsOutput;

  /**
   * Generate action suggestions
   */
  generateActionSuggestions(data: unknown, outputType: OutputType): ActionSuggestion[];

  /**
   * Check schema version compatibility
   */
  isCompatibleVersion(outputVersion: string, requiredVersion: string): boolean;
}

// ==================== Environment Detection ====================

/**
 * Environment detection for AI mode
 */
export class OutputModeDetector {
  /**
   * Detect output mode based on environment variables
   */
  static detectMode(): OutputMode {
    // Explicit AI mode flag
    if (process.env.AQE_AI_OUTPUT === '1') {
      return OutputMode.AI;
    }

    // Explicit human mode flag
    if (process.env.AQE_AI_OUTPUT === '0') {
      return OutputMode.HUMAN;
    }

    // Auto-detect AI agents
    if (this.isClaudeCode()) {
      return OutputMode.AI;
    }

    if (this.isCursorAI()) {
      return OutputMode.AI;
    }

    if (this.isAiderAI()) {
      return OutputMode.AI;
    }

    // Default: human mode
    return OutputMode.HUMAN;
  }

  /**
   * Check if running in Claude Code
   */
  private static isClaudeCode(): boolean {
    return process.env.CLAUDECODE === '1';
  }

  /**
   * Check if running in Cursor AI
   */
  private static isCursorAI(): boolean {
    return process.env.CURSOR_AI === '1';
  }

  /**
   * Check if running in Aider AI
   */
  private static isAiderAI(): boolean {
    return process.env.AIDER_AI === '1';
  }

  /**
   * Get configured schema version
   */
  static getSchemaVersion(): string {
    return process.env.AQE_OUTPUT_VERSION || '1.0.0';
  }

  /**
   * Check if pretty-print is enabled
   */
  static isPrettyPrintEnabled(): boolean {
    return process.env.AQE_OUTPUT_PRETTY === '1';
  }

  /**
   * Check if streaming is enabled
   */
  static isStreamingEnabled(): boolean {
    return process.env.AQE_OUTPUT_STREAM === '1';
  }
}

// ==================== Constants ====================

/**
 * Current schema version
 */
export const SCHEMA_VERSION = '1.0.0';

/**
 * Action type constants
 */
export const ActionTypes = {
  FIX_TEST_FAILURES: 'fix_test_failures',
  STABILIZE_FLAKY_TESTS: 'stabilize_flaky_tests',
  INCREASE_COVERAGE: 'increase_coverage',
  REDUCE_COMPLEXITY: 'reduce_complexity',
  FIX_VULNERABILITIES: 'fix_vulnerabilities',
  OPTIMIZE_PERFORMANCE: 'optimize_performance',
  FIX_CODE_SMELLS: 'fix_code_smells',
  UPDATE_DEPENDENCIES: 'update_dependencies',
  REVIEW_COVERAGE_TREND: 'review_coverage_trend',
  AGENT_READY: 'agent_ready'
} as const;

/**
 * Priority weights for sorting
 */
export const PriorityWeights = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
  info: 5
} as const;
