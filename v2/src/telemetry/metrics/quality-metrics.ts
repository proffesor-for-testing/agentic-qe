/**
 * Quality Engineering Metrics for Agentic QE Fleet
 *
 * Metrics for tracking test quality, coverage, defects, and quality gates.
 */

import { Meter, Counter, Histogram, Gauge, UpDownCounter, Attributes } from '@opentelemetry/api';
import { getMeter } from '../bootstrap';
import { METRIC_NAMES, HISTOGRAM_BOUNDARIES } from '../types';

/**
 * Quality metrics registry
 */
export interface QualityMetrics {
  /** Total number of tests executed */
  testCount: Counter;
  /** Number of passed tests */
  testPassCount: Counter;
  /** Number of failed tests */
  testFailCount: Counter;
  /** Number of skipped tests */
  testSkipCount: Counter;
  /** Test execution duration */
  testDuration: Histogram;
  /** Line coverage percentage */
  coverageLine: Histogram;
  /** Branch coverage percentage */
  coverageBranch: Histogram;
  /** Function coverage percentage */
  coverageFunction: Histogram;
  /** Statement coverage percentage */
  coverageStatement: Histogram;
  /** Number of flaky tests detected */
  flakyTestCount: UpDownCounter;
  /** Defect density per KLOC */
  defectDensity: Histogram;
  /** Number of quality gate evaluations */
  qualityGateCount: Counter;
  /** Security vulnerabilities found */
  securityVulnerabilityCount: Counter;
}

// Singleton metrics instance
let qualityMetrics: QualityMetrics | null = null;

/**
 * Initialize quality metrics
 *
 * @param meter - OpenTelemetry Meter instance
 * @returns Quality metrics registry
 */
export function createQualityMetrics(meter?: Meter): QualityMetrics {
  if (qualityMetrics) {
    return qualityMetrics;
  }

  const m = meter || getMeter();

  qualityMetrics = {
    testCount: m.createCounter(METRIC_NAMES.TEST_COUNT, {
      description: 'Total number of tests executed',
      unit: 'tests',
    }),

    testPassCount: m.createCounter(`${METRIC_NAMES.TEST_COUNT}.pass`, {
      description: 'Number of passed tests',
      unit: 'tests',
    }),

    testFailCount: m.createCounter(`${METRIC_NAMES.TEST_COUNT}.fail`, {
      description: 'Number of failed tests',
      unit: 'tests',
    }),

    testSkipCount: m.createCounter(`${METRIC_NAMES.TEST_COUNT}.skip`, {
      description: 'Number of skipped tests',
      unit: 'tests',
    }),

    testDuration: m.createHistogram(METRIC_NAMES.TEST_DURATION, {
      description: 'Test execution duration',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: HISTOGRAM_BOUNDARIES.taskDuration,
      },
    }),

    coverageLine: m.createHistogram(METRIC_NAMES.COVERAGE_LINE, {
      description: 'Line coverage percentage',
      unit: 'percent',
      advice: {
        explicitBucketBoundaries: HISTOGRAM_BOUNDARIES.coveragePercent,
      },
    }),

    coverageBranch: m.createHistogram(METRIC_NAMES.COVERAGE_BRANCH, {
      description: 'Branch coverage percentage',
      unit: 'percent',
      advice: {
        explicitBucketBoundaries: HISTOGRAM_BOUNDARIES.coveragePercent,
      },
    }),

    coverageFunction: m.createHistogram(METRIC_NAMES.COVERAGE_FUNCTION, {
      description: 'Function coverage percentage',
      unit: 'percent',
      advice: {
        explicitBucketBoundaries: HISTOGRAM_BOUNDARIES.coveragePercent,
      },
    }),

    coverageStatement: m.createHistogram(`${METRIC_NAMES.COVERAGE_LINE}.statement`, {
      description: 'Statement coverage percentage',
      unit: 'percent',
      advice: {
        explicitBucketBoundaries: HISTOGRAM_BOUNDARIES.coveragePercent,
      },
    }),

    flakyTestCount: m.createUpDownCounter(METRIC_NAMES.FLAKY_TEST_COUNT, {
      description: 'Number of flaky tests currently tracked',
      unit: 'tests',
    }),

    defectDensity: m.createHistogram(METRIC_NAMES.DEFECT_DENSITY, {
      description: 'Defect density per 1000 lines of code',
      unit: 'defects/KLOC',
      advice: {
        explicitBucketBoundaries: [0.1, 0.5, 1, 2, 5, 10, 20, 50],
      },
    }),

    qualityGateCount: m.createCounter(METRIC_NAMES.QUALITY_GATE_PASS_RATE, {
      description: 'Number of quality gate evaluations',
      unit: 'evaluations',
    }),

    securityVulnerabilityCount: m.createCounter(METRIC_NAMES.SECURITY_VULNERABILITY_COUNT, {
      description: 'Number of security vulnerabilities found',
      unit: 'vulnerabilities',
    }),
  };

  return qualityMetrics;
}

/**
 * Get initialized quality metrics
 *
 * @returns Quality metrics registry
 */
export function getQualityMetrics(): QualityMetrics {
  if (!qualityMetrics) {
    return createQualityMetrics();
  }
  return qualityMetrics;
}

/**
 * Test execution result for recording
 */
export interface TestExecutionResult {
  /** Test framework (jest, mocha, pytest) */
  framework: string;
  /** Test suite name */
  suite: string;
  /** Total tests in this execution */
  total: number;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Number of skipped tests */
  skipped: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Test type (unit, integration, e2e) */
  testType?: string;
}

/**
 * Record test execution results
 *
 * @param result - Test execution result
 */
export function recordTestExecution(result: TestExecutionResult): void {
  const metrics = getQualityMetrics();

  const attributes: Attributes = {
    'qe.test_framework': result.framework,
    'test.suite': result.suite,
  };

  if (result.testType) {
    attributes['test.type'] = result.testType;
  }

  // Record counts
  metrics.testCount.add(result.total, attributes);
  metrics.testPassCount.add(result.passed, { ...attributes, 'test.result': 'pass' });
  metrics.testFailCount.add(result.failed, { ...attributes, 'test.result': 'fail' });
  metrics.testSkipCount.add(result.skipped, { ...attributes, 'test.result': 'skip' });

  // Record duration
  metrics.testDuration.record(result.durationMs, attributes);
}

/**
 * Coverage report for recording
 */
export interface CoverageReport {
  /** Source file or module */
  target: string;
  /** Line coverage percentage (0-100) */
  line: number;
  /** Branch coverage percentage (0-100) */
  branch: number;
  /** Function coverage percentage (0-100) */
  function: number;
  /** Statement coverage percentage (0-100) */
  statement?: number;
  /** Coverage tool used */
  tool?: string;
}

/**
 * Record coverage metrics
 *
 * @param report - Coverage report
 */
export function recordCoverage(report: CoverageReport): void {
  const metrics = getQualityMetrics();

  const attributes: Attributes = {
    'coverage.target': report.target,
  };

  if (report.tool) {
    attributes['coverage.tool'] = report.tool;
  }

  metrics.coverageLine.record(report.line, { ...attributes, 'qe.coverage_type': 'line' });
  metrics.coverageBranch.record(report.branch, { ...attributes, 'qe.coverage_type': 'branch' });
  metrics.coverageFunction.record(report.function, { ...attributes, 'qe.coverage_type': 'function' });

  if (report.statement !== undefined) {
    metrics.coverageStatement.record(report.statement, { ...attributes, 'qe.coverage_type': 'statement' });
  }
}

/**
 * Quality gate evaluation result
 */
export interface QualityGateResult {
  /** Gate name */
  gateName: string;
  /** Whether the gate passed */
  passed: boolean;
  /** Threshold value */
  threshold: number;
  /** Actual value */
  actual: number;
  /** Metric type (coverage, test_pass_rate, etc.) */
  metricType: string;
  /** Severity if failed (warning, error, critical) */
  severity?: string;
}

/**
 * Record quality gate evaluation
 *
 * @param result - Quality gate result
 */
export function recordQualityGate(result: QualityGateResult): void {
  const metrics = getQualityMetrics();

  const attributes: Attributes = {
    'qe.gate_name': result.gateName,
    'gate.result': result.passed ? 'pass' : 'fail',
    'gate.metric_type': result.metricType,
  };

  if (result.severity) {
    attributes['gate.severity'] = result.severity;
  }

  metrics.qualityGateCount.add(1, attributes);
}

/**
 * Security scan result for recording
 */
export interface SecurityScanResult {
  /** Target scanned (file, package, etc.) */
  target: string;
  /** Scanner tool used */
  scanner: string;
  /** Vulnerabilities by severity */
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

/**
 * Record security scan results
 *
 * @param result - Security scan result
 */
export function recordSecurityScan(result: SecurityScanResult): void {
  const metrics = getQualityMetrics();

  const baseAttributes: Attributes = {
    'security.target': result.target,
    'security.scanner': result.scanner,
  };

  // Record vulnerabilities by severity
  const severities: Array<[keyof typeof result.vulnerabilities, string]> = [
    ['critical', 'critical'],
    ['high', 'high'],
    ['medium', 'medium'],
    ['low', 'low'],
    ['info', 'info'],
  ];

  for (const [key, severity] of severities) {
    if (result.vulnerabilities[key] > 0) {
      metrics.securityVulnerabilityCount.add(result.vulnerabilities[key], {
        ...baseAttributes,
        'qe.security_severity': severity,
      });
    }
  }
}

/**
 * Record flaky test detection
 *
 * @param testName - Name of the flaky test
 * @param flakinessScore - Flakiness score (0-1)
 * @param isResolved - Whether the flaky test was resolved
 */
export function recordFlakyTest(
  testName: string,
  flakinessScore: number,
  isResolved: boolean = false
): void {
  const metrics = getQualityMetrics();

  const attributes: Attributes = {
    'test.name': testName,
    'flaky.score': flakinessScore,
  };

  // Update flaky test count
  metrics.flakyTestCount.add(isResolved ? -1 : 1, attributes);
}

/**
 * Record defect density
 *
 * @param module - Module or file name
 * @param defectCount - Number of defects
 * @param linesOfCode - Total lines of code
 */
export function recordDefectDensity(
  module: string,
  defectCount: number,
  linesOfCode: number
): void {
  const metrics = getQualityMetrics();

  const density = (defectCount / linesOfCode) * 1000; // per KLOC

  metrics.defectDensity.record(density, {
    'code.module': module,
    'defect.count': defectCount,
    'code.lines': linesOfCode,
  });
}

/**
 * API contract validation metrics
 */
export function createApiContractMetrics(meter?: Meter) {
  const m = meter || getMeter();

  return {
    contractValidationCount: m.createCounter('aqe.quality.api.contract.validation.count', {
      description: 'Number of API contract validations',
      unit: 'validations',
    }),

    contractViolationCount: m.createCounter('aqe.quality.api.contract.violation.count', {
      description: 'Number of API contract violations',
      unit: 'violations',
    }),

    schemaValidationDuration: m.createHistogram('aqe.quality.api.schema.validation.duration', {
      description: 'API schema validation duration',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500],
      },
    }),
  };
}
