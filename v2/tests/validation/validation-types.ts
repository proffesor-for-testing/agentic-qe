/**
 * Validation Types for Learning Quality Validation Tests
 *
 * Defines interfaces for metrics collection, validation results,
 * and comprehensive reports for issue #118 quality targets.
 *
 * @module tests/validation/validation-types
 */

/**
 * Core validation metrics from issue #118
 */
export interface ValidationMetrics {
  /** Pattern reuse rate (target: 70%) */
  patternReuseRate: number;
  /** Cross-agent transfer rate (target: 60%) */
  crossAgentTransfer: number;
  /** Test generation accuracy (target: 90%) */
  testGenAccuracy: number;
  /** CI/CD speed multiplier (target: 4x) */
  cicdSpeedMultiplier: number;
  /** Timestamp of metrics collection */
  timestamp: Date;
  /** Environment where metrics were collected */
  environment: string;
}

/**
 * Pattern usage data for reuse rate calculation
 */
export interface PatternUsageData {
  id: string;
  usageCount: number;
  reusedCount: number;
}

/**
 * Cross-agent transfer data
 */
export interface TransferData {
  totalExperiences: number;
  sharedExperiences: number;
  receivedExperiences: number;
  successfulTransfers: number;
}

/**
 * Test generation results
 */
export interface TestGenerationResults {
  totalTests: number;
  passingTests: number;
  failingTests: number;
  falsePositives: number;
  falseNegatives: number;
}

/**
 * Quality metrics for test suite assessment
 */
export interface QualityMetrics {
  codeCoverage: number;
  branchCoverage: number;
  mutationScore: number;
  testMaintainability: number;
}

/**
 * Individual validation result for a metric
 */
export interface ValidationResult {
  /** Metric name */
  metric: string;
  /** Current value */
  value: number;
  /** Target value */
  target: number;
  /** Baseline value */
  baseline: number;
  /** Whether metric passes target */
  passed: boolean;
  /** Improvement from baseline */
  improvement: number;
  /** Human-readable description */
  description: string;
}

/**
 * Regression detection result
 */
export interface RegressionResult {
  /** Metric name */
  metric: string;
  /** Previous value */
  previousValue: number;
  /** Current value */
  currentValue: number;
  /** Difference (negative indicates regression) */
  difference: number;
  /** Severity level */
  severity?: 'low' | 'medium' | 'high';
}

/**
 * Trend analysis result
 */
export interface TrendResult {
  /** Trend direction */
  direction: 'increasing' | 'decreasing' | 'stable';
  /** Rate of change */
  rate: number;
  /** Data points analyzed */
  dataPoints: number;
}

/**
 * Summary of validation report
 */
export interface ValidationSummary {
  /** Whether all metrics pass */
  passed: boolean;
  /** Count of passed metrics */
  passedCount: number;
  /** Count of failed metrics */
  failedCount: number;
  /** Overall score (0-100) */
  score: number;
  /** Report generation timestamp */
  generatedAt: Date;
}

/**
 * Improvements from baseline to current
 */
export interface ValidationImprovements {
  patternReuseRate: number;
  crossAgentTransfer: number;
  testGenAccuracy: number;
  cicdSpeedMultiplier: number;
}

/**
 * Comprehensive validation report
 */
export interface ValidationReport {
  /** Report summary */
  summary: ValidationSummary;
  /** Individual metric results */
  results: ValidationResult[];
  /** Improvement metrics */
  improvements: ValidationImprovements;
  /** Current metrics */
  metrics: ValidationMetrics;
  /** Target metrics */
  targets: Record<string, number>;
  /** Baseline metrics */
  baseline: Record<string, number>;
  /** Export to markdown format */
  toMarkdown(): string;
}

/**
 * Historical metric entry for trend tracking
 */
export interface HistoricalMetric {
  value: number;
  timestamp: Date;
}

/**
 * CI/CD pipeline stage timing
 */
export interface PipelineStage {
  name: string;
  baselineTime: number;
  currentTime: number;
}

/**
 * CI/CD benchmark results
 */
export interface CICDBenchmarkResults {
  baselineExecutionTime: number;
  currentExecutionTime: number;
  baselineBuildTime: number;
  currentBuildTime: number;
}
