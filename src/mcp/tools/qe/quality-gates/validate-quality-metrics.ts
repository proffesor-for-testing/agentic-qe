/**
 * Quality Metrics Validation Tool
 *
 * Validates quality metrics against defined standards, detects anomalies,
 * and provides actionable insights for quality improvement.
 *
 * @module tools/qe/quality-gates/validate-quality-metrics
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-09
 */

import {
  QualityMetrics,
  Environment,
  Priority,
  QEToolResponse,
  ResponseMetadata
} from '../shared/types.js';

// ==================== Types ====================

/**
 * Parameters for quality metrics validation
 */
export interface ValidateQualityMetricsParams {
  /** Metrics to validate */
  metrics: QualityMetrics;

  /** Validation standards */
  standards?: QualityStandards;

  /** Historical metrics for trend analysis */
  historicalMetrics?: QualityMetrics[];

  /** Environment context */
  environment?: Environment;

  /** Enable anomaly detection */
  detectAnomalies?: boolean;

  /** Enable trend analysis */
  analyzeTrends?: boolean;
}

/**
 * Quality standards definition
 */
export interface QualityStandards {
  /** Coverage standards */
  coverage: {
    line: number;
    branch: number;
    function: number;
    overall: number;
  };

  /** Test quality standards */
  testQuality: {
    maxFailureRate: number;
    minSuccessRate: number;
    maxFlakyRate: number;
  };

  /** Security standards */
  security: {
    maxCritical: number;
    maxHigh: number;
    maxMedium: number;
  };

  /** Performance standards */
  performance: {
    maxErrorRate: number;
    maxP99ResponseTime: number;
    minThroughput: number;
  };

  /** Code quality standards */
  codeQuality: {
    minMaintainability: number;
    maxComplexity: number;
    maxTechnicalDebt: number;
    maxDuplication: number;
  };
}

/**
 * Quality metrics validation result
 */
export interface QualityMetricsValidation {
  /** Overall validation status */
  valid: boolean;

  /** Overall quality score (0-100) */
  qualityScore: number;

  /** Validation results by category */
  validations: {
    coverage: CategoryValidation;
    testQuality: CategoryValidation;
    security: CategoryValidation;
    performance: CategoryValidation;
    codeQuality: CategoryValidation;
  };

  /** Detected anomalies */
  anomalies: Anomaly[];

  /** Trend analysis */
  trends?: TrendAnalysis;

  /** Recommendations */
  recommendations: Recommendation[];

  /** Summary */
  summary: ValidationSummary;
}

/**
 * Category-specific validation
 */
export interface CategoryValidation {
  /** Category name */
  category: string;

  /** Validation passed */
  passed: boolean;

  /** Category score (0-100) */
  score: number;

  /** Individual metric validations */
  metrics: MetricValidation[];

  /** Critical failures */
  criticalFailures: string[];

  /** Warnings */
  warnings: string[];
}

/**
 * Individual metric validation
 */
export interface MetricValidation {
  /** Metric name */
  name: string;

  /** Actual value */
  actualValue: number;

  /** Expected value/threshold */
  expectedValue: number;

  /** Validation passed */
  passed: boolean;

  /** Severity if failed */
  severity: Priority;

  /** Message */
  message: string;

  /** Deviation from standard */
  deviation: number;
}

/**
 * Detected anomaly
 */
export interface Anomaly {
  /** Anomaly type */
  type: 'spike' | 'drop' | 'outlier' | 'trend-break';

  /** Metric affected */
  metric: string;

  /** Severity */
  severity: Priority;

  /** Description */
  description: string;

  /** Detected value */
  detectedValue: number;

  /** Expected range */
  expectedRange: {
    min: number;
    max: number;
  };

  /** Confidence (0-1) */
  confidence: number;
}

/**
 * Trend analysis
 */
export interface TrendAnalysis {
  /** Overall trend direction */
  direction: 'improving' | 'stable' | 'degrading';

  /** Trend confidence */
  confidence: number;

  /** Category trends */
  categories: {
    coverage: CategoryTrend;
    testQuality: CategoryTrend;
    security: CategoryTrend;
    performance: CategoryTrend;
    codeQuality: CategoryTrend;
  };

  /** Predictions */
  predictions?: {
    nextQualityScore: number;
    riskLevel: Priority;
  };
}

/**
 * Category trend
 */
export interface CategoryTrend {
  /** Trend direction */
  direction: 'improving' | 'stable' | 'degrading';

  /** Change percentage */
  changePercentage: number;

  /** Data points */
  dataPoints: number;

  /** Key insights */
  insights: string[];
}

/**
 * Recommendation
 */
export interface Recommendation {
  /** Priority */
  priority: Priority;

  /** Category */
  category: string;

  /** Recommendation text */
  recommendation: string;

  /** Expected impact */
  expectedImpact: string;

  /** Effort required */
  effort: 'low' | 'medium' | 'high';

  /** Actions */
  actions: string[];
}

/**
 * Validation summary
 */
export interface ValidationSummary {
  /** Total metrics validated */
  totalMetrics: number;

  /** Passed validations */
  passedCount: number;

  /** Failed validations */
  failedCount: number;

  /** Critical failures */
  criticalCount: number;

  /** Anomalies detected */
  anomalyCount: number;

  /** Pass rate */
  passRate: number;
}

// ==================== Default Standards ====================

/**
 * Default quality standards
 */
const DEFAULT_STANDARDS: QualityStandards = {
  coverage: {
    line: 80,
    branch: 75,
    function: 80,
    overall: 80
  },
  testQuality: {
    maxFailureRate: 0.05,
    minSuccessRate: 0.95,
    maxFlakyRate: 0.02
  },
  security: {
    maxCritical: 0,
    maxHigh: 2,
    maxMedium: 10
  },
  performance: {
    maxErrorRate: 0.05,
    maxP99ResponseTime: 2000,
    minThroughput: 100
  },
  codeQuality: {
    minMaintainability: 70,
    maxComplexity: 15,
    maxTechnicalDebt: 100,
    maxDuplication: 5
  }
};

// ==================== Main Validation Function ====================

/**
 * Validate quality metrics against standards
 *
 * @param params - Validation parameters
 * @returns Comprehensive validation results
 */
export async function validateQualityMetrics(
  params: ValidateQualityMetricsParams
): Promise<QEToolResponse<QualityMetricsValidation>> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    // Validate parameters
    validateParameters(params);

    // Use provided standards or defaults
    const standards = params.standards || DEFAULT_STANDARDS;

    // Validate each category
    const coverageValidation = validateCoverage(params.metrics, standards);
    const testQualityValidation = validateTestQuality(params.metrics, standards);
    const securityValidation = validateSecurity(params.metrics, standards);
    const performanceValidation = validatePerformance(params.metrics, standards);
    const codeQualityValidation = validateCodeQuality(params.metrics, standards);

    const validations = {
      coverage: coverageValidation,
      testQuality: testQualityValidation,
      security: securityValidation,
      performance: performanceValidation,
      codeQuality: codeQualityValidation
    };

    // Detect anomalies if enabled
    const anomalies =
      params.detectAnomalies && params.historicalMetrics
        ? detectAnomalies(params.metrics, params.historicalMetrics)
        : [];

    // Analyze trends if enabled
    const trends =
      params.analyzeTrends && params.historicalMetrics
        ? analyzeTrends(params.metrics, params.historicalMetrics)
        : undefined;

    // Calculate overall quality score
    const qualityScore = calculateQualityScore(validations);

    // Determine overall validation status
    const valid = Object.values(validations).every((v) => v.passed);

    // Generate recommendations
    const recommendations = generateRecommendations(validations, anomalies, trends);

    // Build summary
    const summary = buildSummary(validations, anomalies);

    const validation: QualityMetricsValidation = {
      valid,
      qualityScore,
      validations,
      anomalies,
      trends,
      recommendations,
      summary
    };

    return createSuccessResponse(validation, requestId, Date.now() - startTime);
  } catch (error) {
    return createErrorResponse(error as Error, requestId, Date.now() - startTime);
  }
}

// ==================== Category Validations ====================

/**
 * Validate coverage metrics
 */
function validateCoverage(
  metrics: QualityMetrics,
  standards: QualityStandards
): CategoryValidation {
  const metricValidations: MetricValidation[] = [];
  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  // Line coverage
  metricValidations.push(
    validateMetric(
      'line coverage',
      metrics.coverage.coveredLines / Math.max(1, metrics.coverage.totalLines) * 100,
      standards.coverage.line,
      'gte',
      'high'
    )
  );

  // Branch coverage
  metricValidations.push(
    validateMetric(
      'branch coverage',
      metrics.coverage.coveredBranches / Math.max(1, metrics.coverage.totalBranches) * 100,
      standards.coverage.branch,
      'gte',
      'high'
    )
  );

  // Function coverage
  metricValidations.push(
    validateMetric(
      'function coverage',
      metrics.coverage.coveredFunctions / Math.max(1, metrics.coverage.totalFunctions) * 100,
      standards.coverage.function,
      'gte',
      'medium'
    )
  );

  // Overall coverage
  metricValidations.push(
    validateMetric(
      'overall coverage',
      metrics.coverage.overallPercentage,
      standards.coverage.overall,
      'gte',
      'critical'
    )
  );

  // Collect failures and warnings
  for (const validation of metricValidations) {
    if (!validation.passed) {
      if (validation.severity === 'critical' || validation.severity === 'high') {
        criticalFailures.push(validation.message);
      } else {
        warnings.push(validation.message);
      }
    }
  }

  const passed = criticalFailures.length === 0;
  const score = calculateCategoryScore(metricValidations);

  return {
    category: 'coverage',
    passed,
    score,
    metrics: metricValidations,
    criticalFailures,
    warnings
  };
}

/**
 * Validate test quality metrics
 */
function validateTestQuality(
  metrics: QualityMetrics,
  standards: QualityStandards
): CategoryValidation {
  const metricValidations: MetricValidation[] = [];
  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  // Failure rate
  metricValidations.push(
    validateMetric(
      'test failure rate',
      metrics.testResults.failureRate,
      standards.testQuality.maxFailureRate,
      'lte',
      'critical'
    )
  );

  // Success rate
  const successRate = metrics.testResults.passed / Math.max(1, metrics.testResults.total);
  metricValidations.push(
    validateMetric(
      'test success rate',
      successRate,
      standards.testQuality.minSuccessRate,
      'gte',
      'high'
    )
  );

  // Flaky test rate
  if (metrics.testResults.flakyTests !== undefined) {
    const flakyRate = metrics.testResults.flakyTests / Math.max(1, metrics.testResults.total);
    metricValidations.push(
      validateMetric(
        'flaky test rate',
        flakyRate,
        standards.testQuality.maxFlakyRate,
        'lte',
        'medium'
      )
    );
  }

  // Collect failures and warnings
  for (const validation of metricValidations) {
    if (!validation.passed) {
      if (validation.severity === 'critical' || validation.severity === 'high') {
        criticalFailures.push(validation.message);
      } else {
        warnings.push(validation.message);
      }
    }
  }

  const passed = criticalFailures.length === 0;
  const score = calculateCategoryScore(metricValidations);

  return {
    category: 'testQuality',
    passed,
    score,
    metrics: metricValidations,
    criticalFailures,
    warnings
  };
}

/**
 * Validate security metrics
 */
function validateSecurity(
  metrics: QualityMetrics,
  standards: QualityStandards
): CategoryValidation {
  const metricValidations: MetricValidation[] = [];
  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  // Critical vulnerabilities
  metricValidations.push(
    validateMetric(
      'critical vulnerabilities',
      metrics.security.summary.critical,
      standards.security.maxCritical,
      'lte',
      'critical'
    )
  );

  // High vulnerabilities
  metricValidations.push(
    validateMetric(
      'high vulnerabilities',
      metrics.security.summary.high,
      standards.security.maxHigh,
      'lte',
      'high'
    )
  );

  // Medium vulnerabilities
  metricValidations.push(
    validateMetric(
      'medium vulnerabilities',
      metrics.security.summary.medium,
      standards.security.maxMedium,
      'lte',
      'medium'
    )
  );

  // Collect failures and warnings
  for (const validation of metricValidations) {
    if (!validation.passed) {
      if (validation.severity === 'critical' || validation.severity === 'high') {
        criticalFailures.push(validation.message);
      } else {
        warnings.push(validation.message);
      }
    }
  }

  const passed = criticalFailures.length === 0;
  const score = calculateCategoryScore(metricValidations);

  return {
    category: 'security',
    passed,
    score,
    metrics: metricValidations,
    criticalFailures,
    warnings
  };
}

/**
 * Validate performance metrics
 */
function validatePerformance(
  metrics: QualityMetrics,
  standards: QualityStandards
): CategoryValidation {
  const metricValidations: MetricValidation[] = [];
  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  // Error rate
  metricValidations.push(
    validateMetric(
      'error rate',
      metrics.performance.errorRate,
      standards.performance.maxErrorRate,
      'lte',
      'high'
    )
  );

  // P99 response time
  metricValidations.push(
    validateMetric(
      'p99 response time',
      metrics.performance.responseTime.p99,
      standards.performance.maxP99ResponseTime,
      'lte',
      'medium'
    )
  );

  // Throughput
  metricValidations.push(
    validateMetric(
      'throughput',
      metrics.performance.throughput,
      standards.performance.minThroughput,
      'gte',
      'medium'
    )
  );

  // Collect failures and warnings
  for (const validation of metricValidations) {
    if (!validation.passed) {
      if (validation.severity === 'critical' || validation.severity === 'high') {
        criticalFailures.push(validation.message);
      } else {
        warnings.push(validation.message);
      }
    }
  }

  const passed = criticalFailures.length === 0;
  const score = calculateCategoryScore(metricValidations);

  return {
    category: 'performance',
    passed,
    score,
    metrics: metricValidations,
    criticalFailures,
    warnings
  };
}

/**
 * Validate code quality metrics
 */
function validateCodeQuality(
  metrics: QualityMetrics,
  standards: QualityStandards
): CategoryValidation {
  const metricValidations: MetricValidation[] = [];
  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  // Maintainability index
  metricValidations.push(
    validateMetric(
      'maintainability index',
      metrics.codeQuality.maintainabilityIndex,
      standards.codeQuality.minMaintainability,
      'gte',
      'medium'
    )
  );

  // Cyclomatic complexity
  metricValidations.push(
    validateMetric(
      'cyclomatic complexity',
      metrics.codeQuality.cyclomaticComplexity,
      standards.codeQuality.maxComplexity,
      'lte',
      'medium'
    )
  );

  // Technical debt
  metricValidations.push(
    validateMetric(
      'technical debt',
      metrics.codeQuality.technicalDebt,
      standards.codeQuality.maxTechnicalDebt,
      'lte',
      'low'
    )
  );

  // Duplication
  metricValidations.push(
    validateMetric(
      'code duplication',
      metrics.codeQuality.duplications,
      standards.codeQuality.maxDuplication,
      'lte',
      'low'
    )
  );

  // Collect failures and warnings
  for (const validation of metricValidations) {
    if (!validation.passed) {
      if (validation.severity === 'critical' || validation.severity === 'high') {
        criticalFailures.push(validation.message);
      } else {
        warnings.push(validation.message);
      }
    }
  }

  const passed = warnings.length === 0 && criticalFailures.length === 0;
  const score = calculateCategoryScore(metricValidations);

  return {
    category: 'codeQuality',
    passed,
    score,
    metrics: metricValidations,
    criticalFailures,
    warnings
  };
}

// ==================== Metric Validation ====================

/**
 * Validate individual metric
 */
function validateMetric(
  name: string,
  actualValue: number,
  expectedValue: number,
  operator: 'gte' | 'lte',
  severity: Priority
): MetricValidation {
  const passed =
    operator === 'gte' ? actualValue >= expectedValue : actualValue <= expectedValue;

  const deviation = Math.abs(actualValue - expectedValue) / Math.max(1, expectedValue);

  const message = passed
    ? `${name}: ${actualValue.toFixed(2)} meets standard (${expectedValue})`
    : `${name}: ${actualValue.toFixed(2)} fails standard (expected ${operator === 'gte' ? '≥' : '≤'} ${expectedValue})`;

  return {
    name,
    actualValue,
    expectedValue,
    passed,
    severity,
    message,
    deviation
  };
}

/**
 * Calculate category score
 */
function calculateCategoryScore(validations: MetricValidation[]): number {
  if (validations.length === 0) return 100;

  const passedCount = validations.filter((v) => v.passed).length;
  return Math.round((passedCount / validations.length) * 100);
}

// ==================== Anomaly Detection ====================

/**
 * Detect anomalies in metrics
 */
function detectAnomalies(
  current: QualityMetrics,
  historical: QualityMetrics[]
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (historical.length < 3) {
    return anomalies; // Need at least 3 data points
  }

  // Coverage anomalies
  const coverageAnomaly = detectMetricAnomaly(
    'overall coverage',
    current.coverage.overallPercentage,
    historical.map((m) => m.coverage.overallPercentage)
  );
  if (coverageAnomaly) anomalies.push(coverageAnomaly);

  // Test failure rate anomalies
  const failureAnomaly = detectMetricAnomaly(
    'test failure rate',
    current.testResults.failureRate,
    historical.map((m) => m.testResults.failureRate)
  );
  if (failureAnomaly) anomalies.push(failureAnomaly);

  // Performance anomalies
  const errorRateAnomaly = detectMetricAnomaly(
    'error rate',
    current.performance.errorRate,
    historical.map((m) => m.performance.errorRate)
  );
  if (errorRateAnomaly) anomalies.push(errorRateAnomaly);

  return anomalies;
}

/**
 * Detect anomaly in a single metric
 */
function detectMetricAnomaly(
  metricName: string,
  currentValue: number,
  historicalValues: number[]
): Anomaly | null {
  if (historicalValues.length < 3) return null;

  // Calculate statistics
  const mean = historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
  const variance =
    historicalValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / historicalValues.length;
  const stdDev = Math.sqrt(variance);

  // Define expected range (2 standard deviations)
  const expectedRange = {
    min: mean - 2 * stdDev,
    max: mean + 2 * stdDev
  };

  // Check if current value is an outlier
  if (currentValue < expectedRange.min || currentValue > expectedRange.max) {
    const deviation = Math.abs(currentValue - mean) / stdDev;
    const severity: Priority = deviation > 3 ? 'high' : deviation > 2 ? 'medium' : 'low';

    return {
      type: currentValue > mean ? 'spike' : 'drop',
      metric: metricName,
      severity,
      description: `${metricName} shows unusual ${currentValue > mean ? 'increase' : 'decrease'}`,
      detectedValue: currentValue,
      expectedRange,
      confidence: Math.min(0.95, deviation / 3)
    };
  }

  return null;
}

// ==================== Trend Analysis ====================

/**
 * Analyze quality trends
 */
function analyzeTrends(current: QualityMetrics, historical: QualityMetrics[]): TrendAnalysis {
  const allMetrics = [...historical, current];

  // Analyze category trends
  const coverageTrend = analyzeCategoryTrend(
    'coverage',
    allMetrics.map((m) => m.coverage.overallPercentage)
  );

  const testQualityTrend = analyzeCategoryTrend(
    'testQuality',
    allMetrics.map((m) => (1 - m.testResults.failureRate) * 100)
  );

  const securityTrend = analyzeCategoryTrend(
    'security',
    allMetrics.map((m) => Math.max(0, 100 - m.security.summary.critical * 50 - m.security.summary.high * 10))
  );

  const performanceTrend = analyzeCategoryTrend(
    'performance',
    allMetrics.map((m) => (1 - m.performance.errorRate) * 100)
  );

  const codeQualityTrend = analyzeCategoryTrend(
    'codeQuality',
    allMetrics.map((m) => m.codeQuality.maintainabilityIndex)
  );

  // Determine overall direction
  const trends = [coverageTrend, testQualityTrend, securityTrend, performanceTrend, codeQualityTrend];
  const improvingCount = trends.filter((t) => t.direction === 'improving').length;
  const degradingCount = trends.filter((t) => t.direction === 'degrading').length;

  const direction =
    improvingCount > degradingCount
      ? 'improving'
      : degradingCount > improvingCount
        ? 'degrading'
        : 'stable';

  return {
    direction,
    confidence: 0.75,
    categories: {
      coverage: coverageTrend,
      testQuality: testQualityTrend,
      security: securityTrend,
      performance: performanceTrend,
      codeQuality: codeQualityTrend
    }
  };
}

/**
 * Analyze category trend
 */
function analyzeCategoryTrend(category: string, values: number[]): CategoryTrend {
  if (values.length < 2) {
    return {
      direction: 'stable',
      changePercentage: 0,
      dataPoints: values.length,
      insights: ['Insufficient data for trend analysis']
    };
  }

  // Calculate linear regression slope
  const n = values.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Determine direction and change percentage
  const firstValue = values[0];
  const lastValue = values[n - 1];
  const changePercentage = ((lastValue - firstValue) / Math.max(1, firstValue)) * 100;

  const direction =
    Math.abs(slope) < 0.01 ? 'stable' : slope > 0 ? 'improving' : 'degrading';

  const insights: string[] = [];
  if (direction === 'improving') {
    insights.push(`${category} shows positive trend (+${changePercentage.toFixed(1)}%)`);
  } else if (direction === 'degrading') {
    insights.push(`${category} shows negative trend (${changePercentage.toFixed(1)}%)`);
  } else {
    insights.push(`${category} remains stable`);
  }

  return {
    direction,
    changePercentage,
    dataPoints: n,
    insights
  };
}

// ==================== Recommendations ====================

/**
 * Generate recommendations
 */
function generateRecommendations(
  validations: Record<string, CategoryValidation>,
  anomalies: Anomaly[],
  trends?: TrendAnalysis
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Recommendations from failed validations
  for (const [category, validation] of Object.entries(validations)) {
    if (!validation.passed) {
      for (const failure of validation.criticalFailures) {
        recommendations.push({
          priority: 'critical',
          category,
          recommendation: failure,
          expectedImpact: 'Resolves critical quality issue',
          effort: 'high',
          actions: [`Address: ${failure}`, 'Re-run validation', 'Verify improvement']
        });
      }
    }
  }

  // Recommendations from anomalies
  for (const anomaly of anomalies) {
    if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
      recommendations.push({
        priority: anomaly.severity,
        category: 'anomaly',
        recommendation: `Investigate ${anomaly.metric} anomaly`,
        expectedImpact: 'Prevents potential quality regression',
        effort: 'medium',
        actions: [
          `Analyze root cause of ${anomaly.type} in ${anomaly.metric}`,
          'Review recent changes',
          'Implement corrective measures'
        ]
      });
    }
  }

  // Recommendations from trends
  if (trends && trends.direction === 'degrading') {
    recommendations.push({
      priority: 'high',
      category: 'trend',
      recommendation: 'Quality metrics showing degrading trend',
      expectedImpact: 'Reverses negative quality trajectory',
      effort: 'high',
      actions: [
        'Identify root causes of quality degradation',
        'Implement quality improvement initiatives',
        'Increase testing rigor',
        'Review development processes'
      ]
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations.slice(0, 10); // Top 10 recommendations
}

// ==================== Summary ====================

/**
 * Build validation summary
 */
function buildSummary(
  validations: Record<string, CategoryValidation>,
  anomalies: Anomaly[]
): ValidationSummary {
  let totalMetrics = 0;
  let passedCount = 0;
  let failedCount = 0;
  let criticalCount = 0;

  for (const validation of Object.values(validations)) {
    totalMetrics += validation.metrics.length;
    passedCount += validation.metrics.filter((m) => m.passed).length;
    failedCount += validation.metrics.filter((m) => !m.passed).length;
    criticalCount += validation.criticalFailures.length;
  }

  const passRate = totalMetrics > 0 ? (passedCount / totalMetrics) * 100 : 0;

  return {
    totalMetrics,
    passedCount,
    failedCount,
    criticalCount,
    anomalyCount: anomalies.length,
    passRate: Math.round(passRate * 100) / 100
  };
}

// ==================== Quality Score ====================

/**
 * Calculate overall quality score
 */
function calculateQualityScore(validations: Record<string, CategoryValidation>): number {
  const weights = {
    coverage: 0.25,
    testQuality: 0.30,
    security: 0.25,
    performance: 0.10,
    codeQuality: 0.10
  };

  let weightedSum = 0;
  for (const [category, validation] of Object.entries(validations)) {
    const weight = weights[category as keyof typeof weights] || 0.1;
    weightedSum += validation.score * weight;
  }

  return Math.round(weightedSum * 100) / 100;
}

// ==================== Utility Functions ====================

/**
 * Validate parameters
 */
function validateParameters(params: ValidateQualityMetricsParams): void {
  if (!params.metrics) {
    throw new Error('metrics are required');
  }
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `qm-validate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create success response
 */
function createSuccessResponse(
  data: QualityMetricsValidation,
  requestId: string,
  executionTime: number
): QEToolResponse<QualityMetricsValidation> {
  return {
    success: true,
    data,
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'quality-metrics-validator',
      version: '1.0.0'
    }
  };
}

/**
 * Create error response
 */
function createErrorResponse(
  error: Error,
  requestId: string,
  executionTime: number
): QEToolResponse<QualityMetricsValidation> {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'quality-metrics-validator',
      version: '1.0.0'
    }
  };
}
