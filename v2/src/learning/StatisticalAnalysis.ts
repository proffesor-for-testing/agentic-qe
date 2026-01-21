/**
 * Statistical Analysis Tools for Flaky Test Detection
 * Provides statistical methods for analyzing test result patterns
 */

import type { TestResult, StatisticalMetrics } from './types';

export class StatisticalAnalysis {
  /**
   * Calculate pass rate for a set of test results
   */
  static calculatePassRate(results: TestResult[]): number {
    if (results.length === 0) return 0;
    const passed = results.filter(r => r.passed).length;
    return passed / results.length;
  }

  /**
   * Calculate variance in test execution times
   */
  static calculateVariance(results: TestResult[]): number {
    if (results.length < 2) return 0;

    const durations = results.map(r => r.duration);
    const mean = this.calculateMean(durations);
    const squaredDiffs = durations.map(d => Math.pow(d - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / durations.length;
  }

  /**
   * Calculate confidence interval for pass rate
   * Returns confidence level (0-1) based on sample size and consistency
   */
  static calculateConfidence(results: TestResult[]): number {
    if (results.length === 0) return 0;

    // Confidence increases with sample size
    const sampleSizeConfidence = Math.min(results.length / 100, 1);

    // Confidence decreases with variance
    const variance = this.calculateVariance(results);
    const mean = this.calculateMean(results.map(r => r.duration));
    const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 0;
    const varianceConfidence = 1 - Math.min(coefficientOfVariation, 1);

    // Combined confidence score
    return (sampleSizeConfidence * 0.6 + varianceConfidence * 0.4);
  }

  /**
   * Calculate comprehensive statistical metrics
   */
  static calculateMetrics(values: number[]): StatisticalMetrics {
    if (values.length === 0) {
      return {
        mean: 0,
        median: 0,
        variance: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        coefficientOfVariation: 0,
        outliers: []
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = this.calculateMean(values);
    const variance = this.calculateVariance(values.map(v => ({ duration: v, name: '', passed: true, timestamp: 0 })));
    const stdDev = Math.sqrt(variance);

    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    // Calculate coefficient of variation
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

    // Identify outliers using z-score method
    const outliers = values.filter(v => {
      const zScore = stdDev > 0 ? Math.abs((v - mean) / stdDev) : 0;
      return zScore > 2;
    });

    return {
      mean,
      median,
      variance,
      stdDev,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      coefficientOfVariation,
      outliers
    };
  }

  /**
   * Detect trends in test results over time
   * Returns positive number for improving, negative for degrading
   */
  static detectTrend(results: TestResult[]): number {
    if (results.length < 3) return 0;

    // Sort by timestamp
    const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);

    // Split into two halves and compare pass rates
    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint);
    const secondHalf = sorted.slice(midpoint);

    const firstPassRate = this.calculatePassRate(firstHalf);
    const secondPassRate = this.calculatePassRate(secondHalf);

    return secondPassRate - firstPassRate;
  }

  /**
   * Calculate z-scores for all test results
   */
  static calculateZScores(results: TestResult[]): number[] {
    const durations = results.map(r => r.duration);
    const mean = this.calculateMean(durations);
    const stdDev = Math.sqrt(this.calculateVariance(results));

    if (stdDev === 0) return durations.map(() => 0);

    return durations.map(d => (d - mean) / stdDev);
  }

  /**
   * Identify outliers using IQR method
   */
  static identifyOutliers(values: number[]): number[] {
    if (values.length < 4) return [];

    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return values.filter(v => v < lowerBound || v > upperBound);
  }

  /**
   * Check if test shows flaky characteristics
   */
  static isFlakyCandidate(passRate: number, variance: number): boolean {
    // Flaky if pass rate between 20% and 80%
    const hasIntermittentFailures = passRate > 0.2 && passRate < 0.8;

    // High variance indicates inconsistent behavior
    const hasHighVariance = variance > 1000; // Threshold for duration variance

    return hasIntermittentFailures || (passRate < 0.95 && hasHighVariance);
  }

  /**
   * Calculate correlation between two series
   */
  static calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const meanX = this.calculateMean(x);
    const meanY = this.calculateMean(y);

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < x.length; i++) {
      const diffX = x[i] - meanX;
      const diffY = y[i] - meanY;
      numerator += diffX * diffY;
      denomX += diffX * diffX;
      denomY += diffY * diffY;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom === 0 ? 0 : numerator / denom;
  }

  // Helper methods
  private static calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
