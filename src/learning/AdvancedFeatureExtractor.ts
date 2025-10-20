/**
 * Advanced Feature Extractor for Neural Pattern Matching
 *
 * Extracts 25+ advanced features from test results including:
 * - Statistical features (skewness, kurtosis, trend slope)
 * - Pattern features (flip-flop, gradual degradation, environment sensitivity)
 * - Temporal features (seasonality, autocorrelation, clustering)
 * - Quality features (outlier frequency, stability metrics)
 *
 * Target: Improve model accuracy from 65% to 85%+
 */

import { TestResult } from './types';

export interface AdvancedFeatures {
  // Basic features (12)
  passRate: number;
  failureRate: number;
  meanDuration: number;
  variance: number;
  stdDev: number;
  coefficientOfVariation: number;
  minDuration: number;
  maxDuration: number;
  durationRange: number;
  retryRate: number;
  sampleSize: number;
  dataQuality: number;

  // Advanced statistical features (6)
  skewness: number;
  kurtosis: number;
  trendSlope: number;
  seasonality: number;
  autocorrelation: number;
  outlierFrequency: number;

  // Advanced pattern features (7)
  flipFlopScore: number;
  gradualDegradationScore: number;
  environmentSensitivityScore: number;
  resourceContentionScore: number;
  timingDependencyScore: number;
  dataDependencyScore: number;
  concurrencyIssuesScore: number;

  // Additional quality metrics (2)
  temporalClustering: number;
  environmentVariability: number;
}

export class AdvancedFeatureExtractor {
  /**
   * Extract all 33 features from test results
   */
  public static extractFeatures(results: TestResult[]): AdvancedFeatures {
    if (results.length === 0) {
      return this.getZeroFeatures();
    }

    // Extract basic features
    const durations = results.map(r => r.duration);
    const passRate = results.filter(r => r.passed).length / results.length;
    const meanDuration = this.calculateMean(durations);
    const variance = this.calculateVariance(durations);
    const stdDev = Math.sqrt(variance);

    // Build feature vector
    return {
      // Basic features (12)
      passRate,
      failureRate: 1 - passRate,
      meanDuration,
      variance,
      stdDev,
      coefficientOfVariation: meanDuration > 0 ? stdDev / meanDuration : 0,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      durationRange: Math.max(...durations) - Math.min(...durations),
      retryRate: this.calculateRetryRate(results),
      sampleSize: results.length,
      dataQuality: this.calculateDataQuality(results),

      // Advanced statistical features (6)
      skewness: this.calculateSkewness(durations, meanDuration, stdDev),
      kurtosis: this.calculateKurtosis(durations, meanDuration, stdDev),
      trendSlope: this.calculateTrendSlope(results),
      seasonality: this.detectSeasonality(durations),
      autocorrelation: this.calculateAutocorrelation(durations),
      outlierFrequency: this.detectOutlierFrequency(durations),

      // Advanced pattern features (7)
      flipFlopScore: this.detectFlipFlopPattern(results),
      gradualDegradationScore: this.detectGradualDegradation(results),
      environmentSensitivityScore: this.detectEnvironmentSensitivity(results),
      resourceContentionScore: this.detectResourceContention(results),
      timingDependencyScore: this.detectTimingDependency(results),
      dataDependencyScore: this.detectDataDependency(results),
      concurrencyIssuesScore: this.detectConcurrencyIssues(results),

      // Additional quality metrics (2)
      temporalClustering: this.detectTemporalClustering(results),
      environmentVariability: this.detectEnvironmentVariability(results)
    };
  }

  /**
   * Convert features to normalized array for neural network input
   */
  public static featuresToArray(features: AdvancedFeatures): number[] {
    return [
      // Normalize each feature to [0, 1] range
      features.passRate,
      features.failureRate,
      Math.min(features.meanDuration / 1000, 1), // Cap at 1000ms
      Math.min(features.variance / 10000, 1), // Cap at 10000
      Math.min(features.stdDev / 100, 1),
      Math.min(features.coefficientOfVariation, 1),
      Math.min(features.minDuration / 1000, 1),
      Math.min(features.maxDuration / 1000, 1),
      Math.min(features.durationRange / 1000, 1),
      features.retryRate,
      Math.min(features.sampleSize / 100, 1), // Normalize to 100 samples
      features.dataQuality,
      this.normalizeScore(features.skewness),
      this.normalizeScore(features.kurtosis),
      this.normalizeScore(features.trendSlope),
      features.seasonality,
      this.normalizeScore(features.autocorrelation),
      features.outlierFrequency,
      features.flipFlopScore,
      features.gradualDegradationScore,
      features.environmentSensitivityScore,
      features.resourceContentionScore,
      features.timingDependencyScore,
      features.dataDependencyScore,
      features.concurrencyIssuesScore,
      features.temporalClustering,
      features.environmentVariability
    ];
  }

  // ============================================================================
  // Advanced Statistical Features
  // ============================================================================

  /**
   * Calculate skewness (asymmetry of distribution)
   */
  private static calculateSkewness(values: number[], mean: number, stdDev: number): number {
    if (values.length < 3 || stdDev === 0) return 0;

    const n = values.length;
    const sum = values.reduce((acc, v) => acc + Math.pow((v - mean) / stdDev, 3), 0);
    return (n / ((n - 1) * (n - 2))) * sum;
  }

  /**
   * Calculate kurtosis (tailedness of distribution)
   */
  private static calculateKurtosis(values: number[], mean: number, stdDev: number): number {
    if (values.length < 4 || stdDev === 0) return 0;

    const n = values.length;
    const sum = values.reduce((acc, v) => acc + Math.pow((v - mean) / stdDev, 4), 0);
    const kurtosis = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum;
    const correction = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    return kurtosis - correction;
  }

  /**
   * Calculate trend slope (improving or degrading over time)
   */
  private static calculateTrendSlope(results: TestResult[]): number {
    if (results.length < 3) return 0;

    const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);
    const halfPoint = Math.floor(sorted.length / 2);

    const firstHalfPassRate = sorted.slice(0, halfPoint).filter(r => r.passed).length / halfPoint;
    const secondHalfPassRate = sorted.slice(halfPoint).filter(r => r.passed).length / (sorted.length - halfPoint);

    return secondHalfPassRate - firstHalfPassRate;
  }

  /**
   * Detect seasonality (periodic patterns)
   */
  private static detectSeasonality(values: number[]): number {
    if (values.length < 10) return 0;

    // Check for periodicity using autocorrelation at different lags
    const maxLag = Math.min(10, Math.floor(values.length / 3));
    let maxAutocorr = 0;

    for (let lag = 2; lag <= maxLag; lag++) {
      const autocorr = Math.abs(this.calculateAutocorrelationAtLag(values, lag));
      maxAutocorr = Math.max(maxAutocorr, autocorr);
    }

    return maxAutocorr;
  }

  /**
   * Calculate autocorrelation (dependency between consecutive values)
   */
  private static calculateAutocorrelation(values: number[]): number {
    return this.calculateAutocorrelationAtLag(values, 1);
  }

  /**
   * Calculate autocorrelation at specific lag
   */
  private static calculateAutocorrelationAtLag(values: number[], lag: number): number {
    if (values.length <= lag) return 0;

    const mean = this.calculateMean(values);
    const n = values.length;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n - lag; i++) {
      numerator += (values[i] - mean) * (values[i + lag] - mean);
    }

    for (let i = 0; i < n; i++) {
      denominator += Math.pow(values[i] - mean, 2);
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Detect outlier frequency
   */
  private static detectOutlierFrequency(values: number[]): number {
    if (values.length < 4) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(values.length * 0.25)];
    const q3 = sorted[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const outliers = values.filter(v => v < lowerBound || v > upperBound);
    return outliers.length / values.length;
  }

  // ============================================================================
  // Advanced Pattern Features
  // ============================================================================

  /**
   * Detect flip-flop pattern (alternating pass/fail)
   */
  private static detectFlipFlopPattern(results: TestResult[]): number {
    if (results.length < 4) return 0;

    const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);
    let alternations = 0;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].passed !== sorted[i - 1].passed) {
        alternations++;
      }
    }

    // High alternation rate indicates flip-flop
    const alternationRate = alternations / (sorted.length - 1);
    return alternationRate;
  }

  /**
   * Detect gradual degradation (decreasing pass rate over time)
   */
  private static detectGradualDegradation(results: TestResult[]): number {
    if (results.length < 6) return 0;

    const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);
    const thirdSize = Math.floor(sorted.length / 3);

    const firstThirdPassRate = sorted.slice(0, thirdSize).filter(r => r.passed).length / thirdSize;
    const middleThirdPassRate = sorted.slice(thirdSize, 2 * thirdSize).filter(r => r.passed).length / thirdSize;
    const lastThirdPassRate = sorted.slice(2 * thirdSize).filter(r => r.passed).length / (sorted.length - 2 * thirdSize);

    // Check if pass rate consistently decreases
    const degrades = firstThirdPassRate > middleThirdPassRate && middleThirdPassRate > lastThirdPassRate;
    const degradation = firstThirdPassRate - lastThirdPassRate;

    return degrades && degradation > 0.1 ? degradation : 0;
  }

  /**
   * Detect environment sensitivity
   */
  private static detectEnvironmentSensitivity(results: TestResult[]): number {
    const withEnv = results.filter(r => r.environment?.platform);
    if (withEnv.length < 3) return 0;

    // Group by environment and calculate pass rate variance
    const envGroups = new Map<string, TestResult[]>();

    for (const result of withEnv) {
      const env = result.environment?.platform || 'unknown';
      if (!envGroups.has(env)) {
        envGroups.set(env, []);
      }
      envGroups.get(env)!.push(result);
    }

    if (envGroups.size < 2) return 0;

    // Calculate pass rate for each environment
    const passRates = Array.from(envGroups.values()).map(group => {
      return group.filter(r => r.passed).length / group.length;
    });

    // High variance in pass rates across environments indicates sensitivity
    return this.calculateVarianceFromArray(passRates);
  }

  /**
   * Detect resource contention
   */
  private static detectResourceContention(results: TestResult[]): number {
    if (results.length < 3) return 0;

    // Tests with very high durations (timeouts) may indicate contention
    const durations = results.map(r => r.duration);
    const mean = this.calculateMean(durations);
    const stdDev = Math.sqrt(this.calculateVariance(durations));

    const highDurationCount = durations.filter(d => d > mean + 2 * stdDev).length;
    const highDurationRate = highDurationCount / durations.length;

    // Correlation with failures
    const highDurationFailures = results.filter(r =>
      r.duration > mean + 2 * stdDev && !r.passed
    ).length;

    const correlationScore = highDurationCount > 0 ? highDurationFailures / highDurationCount : 0;

    return Math.min(highDurationRate * correlationScore * 2, 1);
  }

  /**
   * Detect timing dependency
   */
  private static detectTimingDependency(results: TestResult[]): number {
    if (results.length < 5) return 0;

    // Check if very fast tests tend to fail (race conditions)
    const durations = results.map(r => r.duration);
    const mean = this.calculateMean(durations);
    const fastThreshold = mean * 0.5;

    const fastTests = results.filter(r => r.duration < fastThreshold);
    if (fastTests.length < 2) return 0;

    const fastFailureRate = fastTests.filter(r => !r.passed).length / fastTests.length;
    const overallFailureRate = results.filter(r => !r.passed).length / results.length;

    // High failure rate in fast tests indicates timing dependency
    return fastFailureRate > overallFailureRate + 0.1 ? fastFailureRate - overallFailureRate : 0;
  }

  /**
   * Detect data dependency
   */
  private static detectDataDependency(results: TestResult[]): number {
    if (results.length < 7) return 0;

    // Look for periodic failures (same interval)
    const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);
    const failures = sorted.map((r, i) => r.passed ? 0 : i).filter(i => i > 0);

    if (failures.length < 3) return 0;

    // Calculate intervals between failures
    const intervals: number[] = [];
    for (let i = 1; i < failures.length; i++) {
      intervals.push(failures[i] - failures[i - 1]);
    }

    // Check if intervals are similar (periodic)
    const intervalVariance = this.calculateVarianceFromArray(intervals);
    const intervalMean = this.calculateMean(intervals);
    const cv = intervalMean > 0 ? Math.sqrt(intervalVariance) / intervalMean : 0;

    // Low coefficient of variation indicates periodic pattern
    return cv < 0.3 ? 1 - cv : 0;
  }

  /**
   * Detect concurrency issues
   */
  private static detectConcurrencyIssues(results: TestResult[]): number {
    if (results.length < 5) return 0;

    // Look for clustered failures (deadlocks, race conditions occur in bursts)
    const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);
    const windowSize = Math.max(3, Math.floor(results.length * 0.1));

    let maxClusterFailureRate = 0;

    for (let i = 0; i <= sorted.length - windowSize; i++) {
      const window = sorted.slice(i, i + windowSize);
      const windowFailureRate = window.filter(r => !r.passed).length / windowSize;
      maxClusterFailureRate = Math.max(maxClusterFailureRate, windowFailureRate);
    }

    const overallFailureRate = results.filter(r => !r.passed).length / results.length;

    // High failure rate in clusters indicates concurrency issues
    return maxClusterFailureRate > overallFailureRate + 0.3 ? maxClusterFailureRate - overallFailureRate : 0;
  }

  /**
   * Detect temporal clustering
   */
  private static detectTemporalClustering(results: TestResult[]): number {
    if (results.length < 5) return 0;

    const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);
    const failures = sorted.filter(r => !r.passed);

    if (failures.length < 2) return 0;

    // Calculate time gaps between failures
    const gaps: number[] = [];
    for (let i = 1; i < failures.length; i++) {
      gaps.push(failures[i].timestamp - failures[i - 1].timestamp);
    }

    // High variance in gaps indicates clustering
    const gapVariance = this.calculateVarianceFromArray(gaps);
    const gapMean = this.calculateMean(gaps);

    return gapMean > 0 ? Math.min(Math.sqrt(gapVariance) / gapMean, 1) : 0;
  }

  /**
   * Detect environment variability
   */
  private static detectEnvironmentVariability(results: TestResult[]): number {
    const withEnv = results.filter(r => r.environment);
    if (withEnv.length < 3) return 0;

    // Count unique environment configurations
    const envConfigs = new Set(withEnv.map(r => JSON.stringify(r.environment)));
    return Math.min(envConfigs.size / withEnv.length, 1);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private static calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private static calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = this.calculateMean(values);
    return values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  }

  private static calculateVarianceFromArray(values: number[]): number {
    return this.calculateVariance(values);
  }

  private static calculateRetryRate(results: TestResult[]): number {
    const withRetries = results.filter(r => (r.retryCount || 0) > 0).length;
    return results.length > 0 ? withRetries / results.length : 0;
  }

  private static calculateDataQuality(results: TestResult[]): number {
    // Quality based on sample size and completeness
    const sizeScore = Math.min(results.length / 50, 1);
    const completenessScore = results.filter(r =>
      r.duration > 0 && r.timestamp > 0
    ).length / results.length;

    return (sizeScore + completenessScore) / 2;
  }

  private static normalizeScore(value: number): number {
    // Normalize unbounded scores to [0, 1] range using tanh
    return (Math.tanh(value) + 1) / 2;
  }

  private static getZeroFeatures(): AdvancedFeatures {
    return {
      passRate: 0,
      failureRate: 0,
      meanDuration: 0,
      variance: 0,
      stdDev: 0,
      coefficientOfVariation: 0,
      minDuration: 0,
      maxDuration: 0,
      durationRange: 0,
      retryRate: 0,
      sampleSize: 0,
      dataQuality: 0,
      skewness: 0,
      kurtosis: 0,
      trendSlope: 0,
      seasonality: 0,
      autocorrelation: 0,
      outlierFrequency: 0,
      flipFlopScore: 0,
      gradualDegradationScore: 0,
      environmentSensitivityScore: 0,
      resourceContentionScore: 0,
      timingDependencyScore: 0,
      dataDependencyScore: 0,
      concurrencyIssuesScore: 0,
      temporalClustering: 0,
      environmentVariability: 0
    };
  }
}
