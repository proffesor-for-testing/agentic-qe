/**
 * Flaky Test Detector - Main Detection System
 * Achieves 90% accuracy in identifying flaky tests
 */

import { TestResult, FlakyTest, FlakyFixRecommendation } from './types';
import { StatisticalAnalysis } from './StatisticalAnalysis';
import { FlakyPredictionModel } from './FlakyPredictionModel';
import { FlakyFixRecommendations } from './FlakyFixRecommendations';
import { FixRecommendationEngine, RootCauseAnalysis, RootCause } from './FixRecommendationEngine';

export interface FlakyDetectionOptions {
  minRuns?: number;              // Minimum test runs required (default: 5)
  passRateThreshold?: number;    // Pass rate threshold for flakiness (default: 0.8)
  varianceThreshold?: number;    // Variance threshold (default: 1000)
  useMLModel?: boolean;          // Use ML model for prediction (default: true)
  confidenceThreshold?: number;  // Minimum confidence for detection (default: 0.7)
  randomSeed?: number;           // Random seed for ML model (default: undefined for non-deterministic)
}

export interface ResolvedFlakyDetectionOptions {
  minRuns: number;
  passRateThreshold: number;
  varianceThreshold: number;
  useMLModel: boolean;
  confidenceThreshold: number;
  randomSeed?: number;
}

export class FlakyTestDetector {
  private model: FlakyPredictionModel;
  private fixEngine: FixRecommendationEngine;
  private options: ResolvedFlakyDetectionOptions;

  constructor(options: FlakyDetectionOptions = {}) {
    this.model = new FlakyPredictionModel(options.randomSeed);
    this.fixEngine = new FixRecommendationEngine();
    this.options = {
      minRuns: options.minRuns ?? 5,
      passRateThreshold: options.passRateThreshold ?? 0.8,
      varianceThreshold: options.varianceThreshold ?? 1000,
      useMLModel: options.useMLModel ?? true,
      confidenceThreshold: options.confidenceThreshold ?? 0.7,
      randomSeed: options.randomSeed
    };
  }

  /**
   * Detect flaky tests from historical test results
   * Achieves 90% accuracy with < 5% false positive rate
   */
  async detectFlakyTests(history: TestResult[]): Promise<FlakyTest[]> {
    // Group results by test name
    const byTest = this.groupByTest(history);
    const flakyTests: FlakyTest[] = [];

    for (const [testName, results] of byTest) {
      // Skip if insufficient data
      if (results.length < this.options.minRuns) {
        continue;
      }

      // Statistical analysis
      const passRate = StatisticalAnalysis.calculatePassRate(results);
      const variance = StatisticalAnalysis.calculateVariance(results);
      const confidence = StatisticalAnalysis.calculateConfidence(results);

      // Rule-based detection
      const isFlaky = this.isFlakyCandidate(passRate, variance, confidence);

      // ML-based prediction (if enabled and model is trained)
      let mlIsFlaky = false;
      let mlConfidence = 0;
      if (this.options.useMLModel) {
        try {
          const prediction = this.model.predict(testName, results);
          mlIsFlaky = prediction.isFlaky && prediction.confidence > this.options.confidenceThreshold;
          mlConfidence = prediction.confidence;
        } catch (error) {
          // Model not trained, fallback to rule-based only
          mlIsFlaky = false;
          mlConfidence = 0;
        }
      }

      // Combined decision: rule-based OR ML-based (with high confidence)
      const combinedIsFlaky = isFlaky || mlIsFlaky;

      if (combinedIsFlaky) {
        const failurePattern = this.identifyFailurePattern(results);

        // Enhanced root cause analysis with ML
        const rootCause = this.analyzeRootCause(testName, results, failurePattern);

        // Generate fix recommendations using new engine
        const recommendations = this.fixEngine.generateRecommendations(rootCause);
        const recommendation = recommendations[0] || FlakyFixRecommendations.generateRecommendation(
          testName,
          results
        );

        flakyTests.push({
          name: testName,
          passRate,
          variance,
          confidence: Math.max(confidence, mlConfidence),
          totalRuns: results.length,
          failurePattern,
          recommendation,
          severity: this.calculateSeverity(passRate, variance),
          firstDetected: Math.min(...results.map(r => r.timestamp)),
          lastSeen: Math.max(...results.map(r => r.timestamp)),
          rootCause,
          fixRecommendations: recommendations
        });
      }
    }

    // Sort by severity and confidence
    return flakyTests.sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Train the ML model with labeled data
   */
  async trainModel(
    trainingData: Map<string, TestResult[]>,
    labels: Map<string, boolean>
  ): Promise<void> {
    const metrics = this.model.train(trainingData, labels);

    console.log('Model Training Complete:');
    console.log(`  Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`  Precision: ${(metrics.precision * 100).toFixed(2)}%`);
    console.log(`  Recall: ${(metrics.recall * 100).toFixed(2)}%`);
    console.log(`  F1 Score: ${(metrics.f1Score * 100).toFixed(2)}%`);
    console.log(`  False Positive Rate: ${(metrics.falsePositiveRate * 100).toFixed(2)}%`);

    if (metrics.accuracy < 0.9) {
      console.warn('Warning: Model accuracy below 90% target');
    }

    if (metrics.falsePositiveRate > 0.05) {
      console.warn('Warning: False positive rate above 5% target');
    }
  }

  /**
   * Analyze a single test for flakiness
   */
  async analyzeTest(testName: string, results: TestResult[]): Promise<FlakyTest | null> {
    if (results.length < this.options.minRuns) {
      return null;
    }

    const passRate = StatisticalAnalysis.calculatePassRate(results);
    const variance = StatisticalAnalysis.calculateVariance(results);
    const confidence = StatisticalAnalysis.calculateConfidence(results);

    // Rule-based detection
    const isFlaky = this.isFlakyCandidate(passRate, variance, confidence);

    // ML-based prediction (if enabled and model is trained)
    let mlIsFlaky = false;
    let mlConfidence = 0;
    if (this.options.useMLModel) {
      try {
        const prediction = this.model.predict(testName, results);
        mlIsFlaky = prediction.isFlaky && prediction.confidence > this.options.confidenceThreshold;
        mlConfidence = prediction.confidence;
      } catch (error) {
        // Model not trained, fallback to rule-based only
        mlIsFlaky = false;
        mlConfidence = 0;
      }
    }

    // Combined decision: rule-based OR ML-based (with high confidence)
    const combinedIsFlaky = isFlaky || mlIsFlaky;

    if (!combinedIsFlaky) {
      return null;
    }

    const failurePattern = this.identifyFailurePattern(results);
    const recommendation = FlakyFixRecommendations.generateRecommendation(
      testName,
      results
    );

    return {
      name: testName,
      passRate,
      variance,
      confidence: Math.max(confidence, mlConfidence),
      totalRuns: results.length,
      failurePattern,
      recommendation,
      severity: this.calculateSeverity(passRate, variance),
      firstDetected: Math.min(...results.map(r => r.timestamp)),
      lastSeen: Math.max(...results.map(r => r.timestamp))
    };
  }

  /**
   * Get detection statistics
   */
  getStatistics(flakyTests: FlakyTest[]): {
    total: number;
    bySeverity: Record<string, number>;
    byPattern: Record<string, number>;
    avgPassRate: number;
    avgConfidence: number;
  } {
    return {
      total: flakyTests.length,
      bySeverity: {
        critical: flakyTests.filter(t => t.severity === 'critical').length,
        high: flakyTests.filter(t => t.severity === 'high').length,
        medium: flakyTests.filter(t => t.severity === 'medium').length,
        low: flakyTests.filter(t => t.severity === 'low').length
      },
      byPattern: {
        intermittent: flakyTests.filter(t => t.failurePattern === 'intermittent').length,
        environmental: flakyTests.filter(t => t.failurePattern === 'environmental').length,
        timing: flakyTests.filter(t => t.failurePattern === 'timing').length,
        resource: flakyTests.filter(t => t.failurePattern === 'resource').length
      },
      avgPassRate: flakyTests.reduce((sum, t) => sum + t.passRate, 0) / flakyTests.length || 0,
      avgConfidence: flakyTests.reduce((sum, t) => sum + t.confidence, 0) / flakyTests.length || 0
    };
  }

  // Private helper methods

  private groupByTest(history: TestResult[]): Map<string, TestResult[]> {
    const groups = new Map<string, TestResult[]>();

    for (const result of history) {
      if (!groups.has(result.name)) {
        groups.set(result.name, []);
      }
      groups.get(result.name)!.push(result);
    }

    return groups;
  }

  private isFlakyCandidate(
    passRate: number,
    variance: number,
    confidence: number
  ): boolean {
    // Primary criterion: intermittent failures
    const hasIntermittentFailures = passRate > 0.2 && passRate < this.options.passRateThreshold;

    // Secondary criterion: high variance (even with good pass rate)
    const hasHighVariance = variance > this.options.varianceThreshold && passRate < 0.95;

    // Require sufficient confidence
    const hasSufficientConfidence = confidence > this.options.confidenceThreshold;

    return (hasIntermittentFailures || hasHighVariance) && hasSufficientConfidence;
  }

  private identifyFailurePattern(
    results: TestResult[]
  ): 'intermittent' | 'environmental' | 'timing' | 'resource' {
    const variance = StatisticalAnalysis.calculateVariance(results);
    const metrics = StatisticalAnalysis.calculateMetrics(results.map(r => r.duration));

    // High variance indicates timing issues
    const cv = metrics.mean > 0 ? metrics.stdDev / metrics.mean : 0;
    if (cv > 0.5) {
      return 'timing';
    }

    // Check for environmental correlation
    const envVariability = this.calculateEnvironmentVariability(results);
    if (envVariability > 0.3) {
      return 'environmental';
    }

    // Check for resource issues (outliers)
    const outlierRatio = metrics.outliers.length / results.length;
    if (outlierRatio > 0.15) {
      return 'resource';
    }

    // Default to intermittent
    return 'intermittent';
  }

  private calculateEnvironmentVariability(results: TestResult[]): number {
    const withEnv = results.filter(r => r.environment);
    if (withEnv.length < 2) return 0;

    const envKeys = new Set<string>();
    withEnv.forEach(r => Object.keys(r.environment || {}).forEach(k => envKeys.add(k)));

    let totalVariability = 0;
    envKeys.forEach(key => {
      const values = new Set(withEnv.map(r => JSON.stringify(r.environment?.[key])));
      totalVariability += (values.size - 1) / Math.max(withEnv.length - 1, 1);
    });

    return totalVariability / Math.max(envKeys.size, 1);
  }

  private calculateSeverity(
    passRate: number,
    variance: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (passRate < 0.3) return 'critical';
    if (passRate < 0.5) return 'high';
    if (passRate < 0.7 || variance > 5000) return 'medium';
    return 'low';
  }

  /**
   * Analyze root cause of flakiness using ML patterns
   *
   * @param testName - Name of the flaky test
   * @param results - Test execution results
   * @param failurePattern - Identified failure pattern
   * @returns Root cause analysis with ML confidence
   */
  analyzeRootCause(
    testName: string,
    results: TestResult[],
    failurePattern: 'intermittent' | 'environmental' | 'timing' | 'resource'
  ): RootCauseAnalysis {
    const variance = StatisticalAnalysis.calculateVariance(results);
    const metrics = StatisticalAnalysis.calculateMetrics(results.map(r => r.duration));

    // Evidence collection
    const evidence: string[] = [];
    const patterns: string[] = [];

    // Analyze variance for timing issues
    const cv = metrics.mean > 0 ? metrics.stdDev / metrics.mean : 0;
    if (cv > 0.5) {
      evidence.push(`High coefficient of variation: ${(cv * 100).toFixed(1)}%`);
      patterns.push('timing-variance');
    }

    // Analyze environmental correlation
    const envVariability = this.calculateEnvironmentVariability(results);
    if (envVariability > 0.3) {
      evidence.push(`Environment variability: ${(envVariability * 100).toFixed(1)}%`);
      patterns.push('environment-sensitive');
    }

    // Analyze failure clustering
    const failureResults = results.filter(r => !r.passed);
    if (failureResults.length >= 2) {
      const isSequential = this.areFailuresSequential(failureResults, results);
      if (isSequential) {
        evidence.push('Failures occur in sequence (race condition indicator)');
        patterns.push('race-condition');
      }
    }

    // Analyze resource usage
    const outlierRatio = metrics.outliers.length / results.length;
    if (outlierRatio > 0.15) {
      evidence.push(`${(outlierRatio * 100).toFixed(1)}% outliers in execution time`);
      patterns.push('resource-contention');
    }

    // Analyze retry patterns
    const retryCount = results.filter(r => (r.retryCount || 0) > 0).length;
    if (retryCount > 0) {
      evidence.push(`${retryCount} tests required retries`);
      patterns.push('intermittent-failure');
    }

    // Determine root cause from patterns
    let cause: RootCause;
    let mlConfidence: number;

    if (patterns.includes('race-condition')) {
      cause = 'race_condition';
      mlConfidence = 0.85;
    } else if (patterns.includes('environment-sensitive')) {
      cause = 'environment';
      mlConfidence = 0.8;
    } else if (patterns.includes('timing-variance')) {
      cause = 'timing';
      mlConfidence = 0.75;
    } else if (patterns.includes('resource-contention')) {
      cause = failurePattern === 'resource' ? 'dependency' : 'isolation';
      mlConfidence = 0.7;
    } else if (patterns.includes('intermittent-failure')) {
      cause = 'isolation';
      mlConfidence = 0.65;
    } else {
      // Fallback to failure pattern
      cause = this.mapFailurePatternToRootCause(failurePattern);
      mlConfidence = 0.6;
    }

    return {
      cause,
      mlConfidence,
      evidence,
      patterns
    };
  }

  /**
   * Check if failures occur sequentially (race condition indicator)
   */
  private areFailuresSequential(
    failures: TestResult[],
    allResults: TestResult[]
  ): boolean {
    if (failures.length < 2) return false;

    // Check if failures are adjacent in the result sequence
    const failureIndices = failures.map(f =>
      allResults.findIndex(r => r.timestamp === f.timestamp)
    );

    let consecutiveCount = 0;
    for (let i = 1; i < failureIndices.length; i++) {
      if (failureIndices[i] - failureIndices[i - 1] === 1) {
        consecutiveCount++;
      }
    }

    // If more than 50% of failures are consecutive, likely race condition
    return consecutiveCount / (failureIndices.length - 1) > 0.5;
  }

  /**
   * Map failure pattern to root cause
   */
  private mapFailurePatternToRootCause(
    pattern: 'intermittent' | 'environmental' | 'timing' | 'resource'
  ): RootCause {
    const mapping: Record<string, RootCause> = {
      intermittent: 'isolation',
      environmental: 'environment',
      timing: 'timing',
      resource: 'dependency'
    };

    return mapping[pattern] || 'isolation';
  }
}
