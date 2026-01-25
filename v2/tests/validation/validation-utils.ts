/**
 * Validation Utilities for Learning Quality Validation Tests
 *
 * Provides MetricsCollector class and utility functions for
 * collecting, calculating, and analyzing quality metrics
 * against issue #118 targets.
 *
 * @module tests/validation/validation-utils
 */

import type {
  ValidationMetrics,
  PatternUsageData,
  TransferData,
  TestGenerationResults,
  QualityMetrics,
  RegressionResult,
  TrendResult,
  HistoricalMetric,
  PipelineStage,
  CICDBenchmarkResults
} from './validation-types';

/**
 * MetricsCollector - Collects and calculates quality metrics
 *
 * Provides methods to calculate all issue #118 target metrics:
 * - Pattern reuse rate (target: 70%)
 * - Cross-agent transfer rate (target: 60%)
 * - Test generation accuracy (target: 90%)
 * - CI/CD speed multiplier (target: 4x)
 */
export class MetricsCollector {
  private metrics: ValidationMetrics;
  private historicalData: Map<string, HistoricalMetric[]> = new Map();

  constructor(environment: string = 'test') {
    this.metrics = {
      patternReuseRate: 0,
      crossAgentTransfer: 0,
      testGenAccuracy: 0,
      cicdSpeedMultiplier: 1,
      timestamp: new Date(),
      environment
    };
  }

  /**
   * Calculate pattern reuse rate from pattern usage data
   * Target: 70% (up from 20% baseline)
   *
   * @param patterns - Array of pattern usage data
   * @returns Reuse rate between 0 and 1
   */
  calculatePatternReuseRate(patterns: PatternUsageData[]): number {
    if (patterns.length === 0) return 0;

    const totalUsage = patterns.reduce((sum, p) => sum + p.usageCount, 0);
    const totalReused = patterns.reduce((sum, p) => sum + p.reusedCount, 0);

    if (totalUsage === 0) return 0;

    const rate = totalReused / totalUsage;
    this.metrics.patternReuseRate = rate;
    this.addHistoricalData('patternReuseRate', rate);

    return rate;
  }

  /**
   * Calculate cross-agent transfer rate
   * Target: 60% (up from 0% baseline)
   *
   * @param transferData - Transfer statistics
   * @returns Transfer rate between 0 and 1
   */
  calculateCrossAgentTransferRate(transferData: TransferData): number {
    const { totalExperiences, sharedExperiences, successfulTransfers } = transferData;

    if (totalExperiences === 0) return 0;

    // Calculate rate based on successful transfers relative to total experiences
    const rate = successfulTransfers / totalExperiences;
    this.metrics.crossAgentTransfer = rate;
    this.addHistoricalData('crossAgentTransfer', rate);

    return rate;
  }

  /**
   * Calculate test generation accuracy
   * Target: 90% (up from 75% baseline)
   *
   * Accuracy = (Passing Tests - False Positives) / (Total Tests - False Negatives)
   *
   * @param results - Test generation results
   * @returns Accuracy between 0 and 1
   */
  calculateTestGenAccuracy(results: TestGenerationResults): number {
    const { totalTests, passingTests, falsePositives, falseNegatives } = results;

    if (totalTests === 0) return 0;

    // True positives = passing tests - false positives
    const truePositives = Math.max(0, passingTests - falsePositives);

    // Effective total = total - false negatives
    const effectiveTotal = Math.max(1, totalTests - falseNegatives);

    const accuracy = truePositives / effectiveTotal;
    this.metrics.testGenAccuracy = accuracy;
    this.addHistoricalData('testGenAccuracy', accuracy);

    return accuracy;
  }

  /**
   * Calculate overall quality score from various quality metrics
   *
   * @param qualityMetrics - Quality metrics to aggregate
   * @returns Overall quality score between 0 and 1
   */
  calculateOverallQuality(qualityMetrics: QualityMetrics): number {
    const weights = {
      codeCoverage: 0.3,
      branchCoverage: 0.25,
      mutationScore: 0.25,
      testMaintainability: 0.2
    };

    const score =
      qualityMetrics.codeCoverage * weights.codeCoverage +
      qualityMetrics.branchCoverage * weights.branchCoverage +
      qualityMetrics.mutationScore * weights.mutationScore +
      qualityMetrics.testMaintainability * weights.testMaintainability;

    return score;
  }

  /**
   * Calculate CI/CD speed multiplier compared to baseline
   * Target: 4x baseline speed
   *
   * @param baselineTime - Baseline execution time in ms
   * @param currentTime - Current execution time in ms
   * @returns Speed multiplier (baseline / current)
   */
  calculateCICDSpeedMultiplier(baselineTime: number, currentTime: number): number {
    if (currentTime === 0) return baselineTime > 0 ? Infinity : 1;
    if (baselineTime === 0) return 1;

    const multiplier = baselineTime / currentTime;
    this.metrics.cicdSpeedMultiplier = multiplier;
    this.addHistoricalData('cicdSpeedMultiplier', multiplier);

    return multiplier;
  }

  /**
   * Calculate trend from a series of values
   *
   * @param values - Array of metric values over time
   * @returns Trend analysis result
   */
  calculateTrend(values: number[]): TrendResult {
    if (values.length < 2) {
      return {
        direction: 'stable',
        rate: 0,
        dataPoints: values.length
      };
    }

    // Calculate linear regression slope
    const n = values.length;
    const sumX = (n * (n - 1)) / 2; // Sum of 0..n-1
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of x^2 for 0..n-1

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Determine direction based on slope
    let direction: 'increasing' | 'decreasing' | 'stable';
    const threshold = 0.01; // Threshold for considering stable

    if (slope > threshold) {
      direction = 'increasing';
    } else if (slope < -threshold) {
      direction = 'decreasing';
    } else {
      direction = 'stable';
    }

    return {
      direction,
      rate: slope,
      dataPoints: n
    };
  }

  /**
   * Detect regressions by comparing previous and current metrics
   *
   * @param previous - Previous metric values
   * @param current - Current metric values
   * @returns Array of detected regressions
   */
  detectRegressions(
    previous: Record<string, number>,
    current: Record<string, number>
  ): RegressionResult[] {
    const regressions: RegressionResult[] = [];

    for (const [metric, prevValue] of Object.entries(previous)) {
      const currValue = current[metric];

      if (currValue !== undefined && currValue < prevValue) {
        const difference = currValue - prevValue;
        regressions.push({
          metric,
          previousValue: prevValue,
          currentValue: currValue,
          difference,
          severity: this.calculateRegressionSeverity({ metric, previousValue: prevValue, currentValue: currValue, difference })
        });
      }
    }

    return regressions;
  }

  /**
   * Calculate severity of a regression
   *
   * @param regression - Regression details
   * @returns Severity level
   */
  calculateRegressionSeverity(regression: RegressionResult): 'low' | 'medium' | 'high' {
    const percentageChange = Math.abs(regression.difference / regression.previousValue);

    if (percentageChange >= 0.2) {
      return 'high'; // 20%+ regression
    } else if (percentageChange >= 0.1) {
      return 'medium'; // 10-20% regression
    } else {
      return 'low'; // <10% regression
    }
  }

  /**
   * Add a data point to historical tracking
   *
   * @param metric - Metric name
   * @param value - Value to record
   */
  private addHistoricalData(metric: string, value: number): void {
    if (!this.historicalData.has(metric)) {
      this.historicalData.set(metric, []);
    }

    this.historicalData.get(metric)!.push({
      value,
      timestamp: new Date()
    });
  }

  /**
   * Get historical data for a metric
   *
   * @param metric - Metric name
   * @returns Array of historical values
   */
  getHistoricalData(metric: string): HistoricalMetric[] {
    return this.historicalData.get(metric) || [];
  }

  /**
   * Get current collected metrics
   *
   * @returns Current validation metrics
   */
  getMetrics(): ValidationMetrics {
    this.metrics.timestamp = new Date();
    return { ...this.metrics };
  }

  /**
   * Reset collector to initial state
   */
  reset(): void {
    this.metrics = {
      patternReuseRate: 0,
      crossAgentTransfer: 0,
      testGenAccuracy: 0,
      cicdSpeedMultiplier: 1,
      timestamp: new Date(),
      environment: this.metrics.environment
    };
    this.historicalData.clear();
  }
}

/**
 * Calculate CI/CD benchmark from pipeline stages
 *
 * @param stages - Pipeline stage timings
 * @returns Benchmark results
 */
export function calculateCICDBenchmark(stages: PipelineStage[]): CICDBenchmarkResults {
  const baselineTimes = stages.reduce(
    (acc, stage) => {
      acc.total += stage.baselineTime;
      if (stage.name === 'build') acc.build += stage.baselineTime;
      return acc;
    },
    { total: 0, build: 0 }
  );

  const currentTimes = stages.reduce(
    (acc, stage) => {
      acc.total += stage.currentTime;
      if (stage.name === 'build') acc.build += stage.currentTime;
      return acc;
    },
    { total: 0, build: 0 }
  );

  return {
    baselineExecutionTime: baselineTimes.total,
    currentExecutionTime: currentTimes.total,
    baselineBuildTime: baselineTimes.build,
    currentBuildTime: currentTimes.build
  };
}

/**
 * Calculate percentage improvement
 *
 * @param baseline - Baseline value
 * @param current - Current value
 * @returns Improvement percentage (positive = improvement)
 */
export function calculateImprovement(baseline: number, current: number): number {
  if (baseline === 0) return current > 0 ? 100 : 0;
  return ((current - baseline) / baseline) * 100;
}

/**
 * Check if a metric meets its target
 *
 * @param value - Current value
 * @param target - Target value
 * @param direction - Whether higher or lower is better
 * @returns Whether target is met
 */
export function meetsTarget(
  value: number,
  target: number,
  direction: 'higher' | 'lower' = 'higher'
): boolean {
  if (direction === 'higher') {
    return value >= target;
  }
  return value <= target;
}

/**
 * Format percentage for display
 *
 * @param value - Value between 0 and 1
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format multiplier for display
 *
 * @param value - Multiplier value
 * @param decimals - Number of decimal places
 * @returns Formatted multiplier string
 */
export function formatMultiplier(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}x`;
}
