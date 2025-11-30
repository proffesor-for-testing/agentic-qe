/**
 * Output Generation & Reporting Types
 *
 * Type definitions for the multi-format reporting system.
 * Supports human-readable, JSON, and control-loop feedback formats.
 *
 * @module reporting/types
 * @version 1.0.0
 */

import {
  QualityMetrics,
  TestResult,
  CoverageReport,
  TestResultsSummary,
  SecurityScanResults,
  PerformanceMetrics,
  CodeQualityMetrics
} from '../mcp/tools/qe/shared/types';

// ==================== Reporter Configuration ====================

/**
 * Supported output formats
 */
export type ReportFormat = 'human' | 'json' | 'control-loop' | 'html' | 'markdown';

/**
 * Report detail levels
 */
export type ReportDetailLevel = 'summary' | 'detailed' | 'comprehensive';

/**
 * Reporter configuration
 */
export interface ReporterConfig {
  /** Output format */
  format: ReportFormat;

  /** Detail level */
  detailLevel?: ReportDetailLevel;

  /** Include color/ANSI codes (for human format) */
  useColors?: boolean;

  /** Include timestamps */
  includeTimestamps?: boolean;

  /** Include metadata */
  includeMetadata?: boolean;

  /** Output file path (optional) */
  outputPath?: string;

  /** Pretty print JSON */
  prettyPrint?: boolean;
}

// ==================== Aggregated Results ====================

/**
 * Aggregated test execution results
 */
export interface AggregatedResults {
  /** Unique execution ID */
  executionId: string;

  /** Execution timestamp */
  timestamp: string;

  /** Project information */
  project: ProjectInfo;

  /** Test execution results */
  testResults: TestExecutionResults;

  /** Coverage data */
  coverage?: CoverageData;

  /** Quality metrics */
  qualityMetrics?: QualityMetricsData;

  /** Performance metrics */
  performance?: PerformanceData;

  /** Security scan results */
  security?: SecurityData;

  /** Execution metadata */
  metadata: ExecutionMetadata;

  /** Overall status */
  status: ExecutionStatus;

  /** Summary */
  summary: ExecutionSummary;
}

/**
 * Project information
 */
export interface ProjectInfo {
  /** Project name */
  name: string;

  /** Project version */
  version?: string;

  /** Repository URL */
  repository?: string;

  /** Branch/commit */
  branch?: string;
  commit?: string;

  /** Environment */
  environment?: string;
}

/**
 * Test execution results
 */
export interface TestExecutionResults {
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

  /** Total duration (ms) */
  duration: number;

  /** Individual test results */
  tests: TestResult[];

  /** Test suites */
  suites?: TestSuiteResult[];

  /** Pass rate (0-1) */
  passRate: number;

  /** Failure rate (0-1) */
  failureRate: number;
}

/**
 * Test suite result
 */
export interface TestSuiteResult {
  /** Suite name */
  name: string;

  /** Suite file path */
  file: string;

  /** Total tests in suite */
  total: number;

  /** Passed tests */
  passed: number;

  /** Failed tests */
  failed: number;

  /** Duration (ms) */
  duration: number;

  /** Status */
  status: 'passed' | 'failed' | 'skipped';
}

/**
 * Coverage data
 */
export interface CoverageData {
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

  /** File-level coverage */
  files?: FileCoverageData[];

  /** Coverage trend */
  trend?: 'improving' | 'stable' | 'degrading';
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

  /** Coverage percentage */
  percentage: number;
}

/**
 * File coverage data
 */
export interface FileCoverageData {
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
}

/**
 * Quality metrics data
 */
export interface QualityMetricsData {
  /** Overall quality score (0-100) */
  score: number;

  /** Quality grade */
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

  /** Code quality metrics */
  codeQuality: {
    maintainabilityIndex: number;
    cyclomaticComplexity: number;
    technicalDebt: number;
    codeSmells: number;
    duplications: number;
  };

  /** Quality gates passed */
  gatesPassed: number;

  /** Quality gates failed */
  gatesFailed: number;

  /** Quality gate details */
  gates?: QualityGateResult[];
}

/**
 * Quality gate result
 */
export interface QualityGateResult {
  /** Gate name */
  name: string;

  /** Status */
  status: 'passed' | 'failed' | 'warning';

  /** Actual value */
  actualValue: number;

  /** Expected threshold */
  threshold: number;

  /** Operator */
  operator: string;

  /** Message */
  message: string;
}

/**
 * Performance data
 */
export interface PerformanceData {
  /** Response time metrics (ms) */
  responseTime: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };

  /** Throughput (requests/sec) */
  throughput: number;

  /** Error rate (0-1) */
  errorRate: number;

  /** Resource usage */
  resources: {
    cpu: number;
    memory: number;
    disk?: number;
  };
}

/**
 * Security data
 */
export interface SecurityData {
  /** Total vulnerabilities */
  total: number;

  /** Vulnerabilities by severity */
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };

  /** Security score (0-100) */
  score: number;

  /** Vulnerability details */
  vulnerabilities?: SecurityVulnerability[];
}

/**
 * Security vulnerability
 */
export interface SecurityVulnerability {
  /** Vulnerability ID */
  id: string;

  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';

  /** Title */
  title: string;

  /** Description */
  description: string;

  /** Affected file */
  file?: string;

  /** Line number */
  line?: number;

  /** CWE ID */
  cwe?: string;

  /** CVSS score */
  cvss?: number;
}

/**
 * Execution metadata
 */
export interface ExecutionMetadata {
  /** Execution start time */
  startedAt: string;

  /** Execution end time */
  completedAt: string;

  /** Total execution duration (ms) */
  duration: number;

  /** CI/CD information */
  ci?: {
    provider: string;
    buildNumber: string;
    buildUrl?: string;
  };

  /** Agent information */
  agent?: {
    id: string;
    type: string;
    version: string;
  };

  /** Environment variables */
  environment?: Record<string, string>;
}

/**
 * Execution status
 */
export type ExecutionStatus = 'success' | 'failure' | 'warning' | 'error';

/**
 * Execution summary
 */
export interface ExecutionSummary {
  /** Overall status */
  status: ExecutionStatus;

  /** Status message */
  message: string;

  /** Critical issues count */
  criticalIssues: number;

  /** Warnings count */
  warnings: number;

  /** Recommendations */
  recommendations: string[];

  /** Deployment ready */
  deploymentReady: boolean;

  /** Key highlights */
  highlights: string[];
}

// ==================== Reporter Output ====================

/**
 * Reporter output
 */
export interface ReporterOutput {
  /** Format used */
  format: ReportFormat;

  /** Generated content */
  content: string;

  /** Generation timestamp */
  timestamp: string;

  /** File path (if written to file) */
  filePath?: string;

  /** Content size (bytes) */
  size: number;

  /** Generation duration (ms) */
  generationDuration: number;
}

// ==================== Control Loop Feedback ====================

/**
 * Control loop feedback for automated systems
 */
export interface ControlLoopFeedback {
  /** Execution ID */
  executionId: string;

  /** Timestamp */
  timestamp: string;

  /** Overall status */
  status: ExecutionStatus;

  /** Success flag */
  success: boolean;

  /** Quality score (0-100) */
  qualityScore: number;

  /** Metrics for decision making */
  metrics: {
    testPassRate: number;
    coveragePercentage: number;
    securityScore: number;
    performanceScore: number;
    qualityGatesPassed: number;
    qualityGatesFailed: number;
  };

  /** Actionable signals */
  signals: {
    canDeploy: boolean;
    criticalIssuesFound: boolean;
    coverageDecreased: boolean;
    performanceDegraded: boolean;
    securityRisks: boolean;
    testsUnstable: boolean;
  };

  /** Required actions */
  actions: ControlLoopAction[];

  /** Threshold violations */
  violations: ThresholdViolation[];

  /** Next steps */
  nextSteps: string[];
}

/**
 * Control loop action
 */
export interface ControlLoopAction {
  /** Action type */
  type: 'block_deployment' | 'require_review' | 'trigger_rollback' | 'alert' | 'retry' | 'approve';

  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';

  /** Reason */
  reason: string;

  /** Recommended resolution */
  resolution?: string;
}

/**
 * Threshold violation
 */
export interface ThresholdViolation {
  /** Metric name */
  metric: string;

  /** Expected threshold */
  threshold: number;

  /** Actual value */
  actualValue: number;

  /** Operator */
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';

  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low';

  /** Impact */
  impact: string;
}

// ==================== Reporter Interface ====================

/**
 * Base reporter interface
 */
export interface Reporter {
  /**
   * Generate report from aggregated results
   */
  report(results: AggregatedResults): Promise<ReporterOutput> | ReporterOutput;

  /**
   * Get supported format
   */
  getFormat(): ReportFormat;

  /**
   * Validate configuration
   */
  validateConfig(config: ReporterConfig): boolean;
}
