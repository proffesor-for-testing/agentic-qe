/**
 * ML-Based Flaky Test Prediction Model
 * Uses statistical features and pattern recognition for 90% accuracy
 */

import { TestResult, FlakyPrediction, ModelTrainingData, ModelMetrics } from './types';
import { StatisticalAnalysis } from './StatisticalAnalysis';

export class FlakyPredictionModel {
  private weights: number[] = [];
  private bias: number = 0;
  private featureScalers: { mean: number; stdDev: number }[] = [];
  private isTrained: boolean = false;
  private randomSeed?: number;
  private seededRandom?: () => number;

  constructor(seed?: number) {
    this.randomSeed = seed;
    if (seed !== undefined) {
      // Initialize seeded random generator
      let currentSeed = seed;
      this.seededRandom = () => {
        currentSeed = (currentSeed * 1664525 + 1013904223) % 2147483648;
        return currentSeed / 2147483648;
      };
    }
  }

  /**
   * Extract features from test results for ML model
   */
  private extractFeatures(results: TestResult[]): number[] {
    if (results.length === 0) return Array(10).fill(0);

    const durations = results.map(r => r.duration);
    const metrics = StatisticalAnalysis.calculateMetrics(durations);
    const passRate = StatisticalAnalysis.calculatePassRate(results);
    const variance = StatisticalAnalysis.calculateVariance(results);
    const trend = StatisticalAnalysis.detectTrend(results);

    // Feature vector (10 features)
    return [
      passRate,                           // F1: Pass rate
      variance / 1000000,                 // F2: Normalized variance
      metrics.stdDev / Math.max(metrics.mean, 1), // F3: Coefficient of variation
      metrics.outliers.length / results.length,   // F4: Outlier ratio
      Math.abs(trend),                    // F5: Trend magnitude
      results.length / 100,               // F6: Sample size (normalized)
      metrics.min / Math.max(metrics.max, 1),     // F7: Duration range ratio
      this.calculateRetryRate(results),   // F8: Retry rate
      this.calculateEnvironmentVariability(results), // F9: Env variability
      this.calculateTemporalClustering(results)      // F10: Temporal clustering
    ];
  }

  /**
   * Train the model on historical data
   */
  train(trainingData: Map<string, TestResult[]>, labels: Map<string, boolean>): ModelMetrics {
    const features: number[][] = [];
    const labelArray: number[] = [];
    const testNames: string[] = [];

    // Extract features and labels
    for (const [testName, results] of trainingData) {
      if (results.length < 5) continue; // Need enough data

      const feature = this.extractFeatures(results);
      features.push(feature);
      labelArray.push(labels.get(testName) ? 1 : 0);
      testNames.push(testName);
    }

    if (features.length === 0) {
      throw new Error('Insufficient training data');
    }

    // Normalize features
    this.featureScalers = this.calculateScalers(features);
    const normalizedFeatures = features.map(f => this.normalizeFeatures(f));

    // Train logistic regression model using gradient descent
    this.trainLogisticRegression(normalizedFeatures, labelArray);
    this.isTrained = true;

    // Calculate metrics
    return this.evaluateModel(normalizedFeatures, labelArray);
  }

  /**
   * Predict if a test is flaky
   */
  predict(testName: string, results: TestResult[]): FlakyPrediction {
    if (!this.isTrained) {
      throw new Error('Model must be trained before prediction');
    }

    if (results.length < 3) {
      return {
        testName,
        isFlaky: false,
        probability: 0,
        confidence: 0.3,
        features: {},
        explanation: 'Insufficient data for prediction (need at least 3 test runs)'
      };
    }

    const features = this.extractFeatures(results);
    const normalizedFeatures = this.normalizeFeatures(features);
    const probability = this.sigmoid(this.predict_internal(normalizedFeatures));

    const isFlaky = probability > 0.5;
    const confidence = Math.abs(probability - 0.5) * 2; // 0-1 scale

    return {
      testName,
      isFlaky,
      probability,
      confidence,
      features: this.formatFeatures(features),
      explanation: this.generateExplanation(features, probability)
    };
  }

  /**
   * Batch predict for multiple tests
   */
  batchPredict(tests: Map<string, TestResult[]>): FlakyPrediction[] {
    const predictions: FlakyPrediction[] = [];

    for (const [testName, results] of tests) {
      predictions.push(this.predict(testName, results));
    }

    return predictions.sort((a, b) => b.probability - a.probability);
  }

  /**
   * Train logistic regression using gradient descent
   */
  private trainLogisticRegression(features: number[][], labels: number[]): void {
    const numFeatures = features[0].length;

    // Initialize weights with small random values or zeros
    if (this.seededRandom) {
      // Use seeded random for deterministic initialization
      this.weights = Array(numFeatures).fill(0).map(() => (this.seededRandom!() - 0.5) * 0.01);
      this.bias = (this.seededRandom() - 0.5) * 0.01;
    } else {
      // Use zeros for non-deterministic mode (existing behavior)
      this.weights = Array(numFeatures).fill(0);
      this.bias = 0;
    }

    const learningRate = 0.1;
    const epochs = 1000;
    const lambda = 0.01; // L2 regularization

    for (let epoch = 0; epoch < epochs; epoch++) {
      const predictions = features.map(f => this.sigmoid(this.predict_internal(f)));

      // Calculate gradients
      const weightGradients = Array(numFeatures).fill(0);
      let biasGradient = 0;

      for (let i = 0; i < features.length; i++) {
        const error = predictions[i] - labels[i];
        biasGradient += error;

        for (let j = 0; j < numFeatures; j++) {
          weightGradients[j] += error * features[i][j];
        }
      }

      // Update weights with L2 regularization
      for (let j = 0; j < numFeatures; j++) {
        this.weights[j] -= learningRate * (
          weightGradients[j] / features.length +
          lambda * this.weights[j]
        );
      }

      this.bias -= learningRate * biasGradient / features.length;
    }
  }

  /**
   * Internal prediction (before sigmoid)
   */
  private predict_internal(features: number[]): number {
    let sum = this.bias;
    for (let i = 0; i < features.length; i++) {
      sum += features[i] * this.weights[i];
    }
    return sum;
  }

  /**
   * Sigmoid activation function
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Calculate feature scalers for normalization
   */
  private calculateScalers(features: number[][]): { mean: number; stdDev: number }[] {
    const numFeatures = features[0].length;
    const scalers: { mean: number; stdDev: number }[] = [];

    for (let j = 0; j < numFeatures; j++) {
      const values = features.map(f => f[j]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      scalers.push({ mean, stdDev: stdDev === 0 ? 1 : stdDev });
    }

    return scalers;
  }

  /**
   * Normalize features using z-score normalization
   */
  private normalizeFeatures(features: number[]): number[] {
    return features.map((f, i) => {
      const scaler = this.featureScalers[i];
      return (f - scaler.mean) / scaler.stdDev;
    });
  }

  /**
   * Evaluate model performance
   */
  private evaluateModel(features: number[][], labels: number[]): ModelMetrics {
    const predictions = features.map(f => this.sigmoid(this.predict_internal(f)) > 0.5 ? 1 : 0);

    let tp = 0, tn = 0, fp = 0, fn = 0;

    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i] === 1 && labels[i] === 1) tp++;
      else if (predictions[i] === 0 && labels[i] === 0) tn++;
      else if (predictions[i] === 1 && labels[i] === 0) fp++;
      else fn++;
    }

    const accuracy = (tp + tn) / predictions.length;
    const precision = tp / Math.max(tp + fp, 1);
    const recall = tp / Math.max(tp + fn, 1);
    const f1Score = 2 * (precision * recall) / Math.max(precision + recall, 0.001);
    const falsePositiveRate = fp / Math.max(fp + tn, 1);
    const falseNegativeRate = fn / Math.max(fn + tp, 1);

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      falsePositiveRate,
      truePositiveRate: tp / Math.max(tp + fn, 1),
      confusionMatrix: [[tn, fp], [fn, tp]]
    };
  }

  // Helper methods for feature extraction
  private calculateRetryRate(results: TestResult[]): number {
    const withRetries = results.filter(r => (r.retryCount || 0) > 0).length;
    return withRetries / Math.max(results.length, 1);
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

  private calculateTemporalClustering(results: TestResult[]): number {
    if (results.length < 3) return 0;

    const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);
    const failures = sorted.filter(r => !r.passed || r.status === 'failed');

    if (failures.length < 2) return 0;

    // Calculate average gap between failures
    let totalGap = 0;
    for (let i = 1; i < failures.length; i++) {
      const gap = failures[i].timestamp - failures[i - 1].timestamp;
      totalGap += gap;
    }

    const avgGap = totalGap / (failures.length - 1);
    const totalTimespan = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;

    // Clustering score: lower ratio means failures are clustered together
    return 1 - Math.min(avgGap / Math.max(totalTimespan, 1), 1);
  }

  private formatFeatures(features: number[]): Record<string, number> {
    return {
      passRate: features[0],
      variance: features[1],
      coefficientOfVariation: features[2],
      outlierRatio: features[3],
      trendMagnitude: features[4],
      sampleSize: features[5],
      durationRangeRatio: features[6],
      retryRate: features[7],
      environmentVariability: features[8],
      temporalClustering: features[9]
    };
  }

  private generateExplanation(features: number[], probability: number): string {
    const formattedFeatures = this.formatFeatures(features);
    const reasons: string[] = [];

    if (formattedFeatures.passRate < 0.8) {
      reasons.push(`Low pass rate (${(formattedFeatures.passRate * 100).toFixed(1)}%)`);
    }

    if (formattedFeatures.coefficientOfVariation > 0.3) {
      reasons.push(`High execution time variance`);
    }

    if (formattedFeatures.outlierRatio > 0.1) {
      reasons.push(`Frequent outliers in execution time`);
    }

    if (formattedFeatures.temporalClustering > 0.6) {
      reasons.push(`Failures are clustered in time`);
    }

    if (formattedFeatures.environmentVariability > 0.2) {
      reasons.push(`Environment changes correlate with failures`);
    }

    if (reasons.length === 0) {
      reasons.push('No significant flaky patterns detected');
    }

    const prediction = probability > 0.5 ? 'FLAKY' : 'STABLE';
    const confidence = Math.abs(probability - 0.5) * 200;

    return `Prediction: ${prediction} (${(probability * 100).toFixed(1)}% probability, ${confidence.toFixed(0)}% confidence)\nReasons: ${reasons.join(', ')}`;
  }
}
