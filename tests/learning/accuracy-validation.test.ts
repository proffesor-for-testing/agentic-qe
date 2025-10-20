/**
 * Accuracy Validation Test Suite
 *
 * Comprehensive validation of neural pattern matcher accuracy:
 * - Target: 85-90% accuracy on test set
 * - Tests on production-like data (1000+ samples)
 * - Validates precision, recall, F1-score
 * - Tests edge cases and rare patterns
 * - Maintains <100ms prediction latency
 *
 * This test suite uses the new training data generator and advanced features.
 */

import { FlakyPredictionModel } from '../../src/learning/FlakyPredictionModel';
import { AdvancedFeatureExtractor } from '../../src/learning/AdvancedFeatureExtractor';
import { generateTrainingData, TestPattern } from './training-data-generator';
import { TestResult, ModelMetrics } from '../../src/learning/types';

describe('Neural Pattern Matcher - Accuracy Validation', () => {
  let model: FlakyPredictionModel;
  let trainingSet: TestPattern[];
  let testSet: TestPattern[];

  beforeAll(() => {
    // Generate large dataset (1400 total: 1000 train, 400 test)
    const allData = generateTrainingData(1400, 12345);

    // Split: 70% training, 30% testing
    const splitIndex = 1000;
    trainingSet = allData.slice(0, splitIndex);
    testSet = allData.slice(splitIndex);

    // Train model once for all tests
    model = new FlakyPredictionModel(12345);
    const trainingData = new Map<string, TestResult[]>();
    const labels = new Map<string, boolean>();

    for (const pattern of trainingSet) {
      trainingData.set(pattern.name, pattern.results);
      labels.set(pattern.name, pattern.isFlaky);
    }

    model.train(trainingData, labels);
  });

  describe('Overall Accuracy', () => {
    it('should achieve 85%+ accuracy on held-out test set', () => {
      let correctPredictions = 0;

      for (const pattern of testSet) {
        const prediction = model.predict(pattern.name, pattern.results);
        if (prediction.isFlaky === pattern.isFlaky) {
          correctPredictions++;
        }
      }

      const accuracy = correctPredictions / testSet.length;

      console.log(`\nAccuracy Validation Results:`);
      console.log(`  Correct: ${correctPredictions}/${testSet.length}`);
      console.log(`  Accuracy: ${(accuracy * 100).toFixed(2)}%`);
      console.log(`  Target: 85%+`);

      expect(accuracy).toBeGreaterThanOrEqual(0.85);
    });

    it('should maintain balanced precision and recall', () => {
      let truePositives = 0;
      let falsePositives = 0;
      let trueNegatives = 0;
      let falseNegatives = 0;

      for (const pattern of testSet) {
        const prediction = model.predict(pattern.name, pattern.results);
        const predictedFlaky = prediction.isFlaky;
        const actualFlaky = pattern.isFlaky;

        if (predictedFlaky && actualFlaky) truePositives++;
        else if (predictedFlaky && !actualFlaky) falsePositives++;
        else if (!predictedFlaky && !actualFlaky) trueNegatives++;
        else falseNegatives++;
      }

      const precision = truePositives / (truePositives + falsePositives);
      const recall = truePositives / (truePositives + falseNegatives);
      const f1Score = 2 * (precision * recall) / (precision + recall);

      console.log(`\nPrecision/Recall Metrics:`);
      console.log(`  Precision: ${(precision * 100).toFixed(2)}%`);
      console.log(`  Recall: ${(recall * 100).toFixed(2)}%`);
      console.log(`  F1-Score: ${(f1Score * 100).toFixed(2)}%`);

      expect(precision).toBeGreaterThan(0.80);
      expect(recall).toBeGreaterThan(0.80);
      expect(f1Score).toBeGreaterThan(0.80);
    });

    it('should have low false positive rate', () => {
      let falsePositives = 0;
      let trueNegatives = 0;

      for (const pattern of testSet) {
        if (!pattern.isFlaky) {
          const prediction = model.predict(pattern.name, pattern.results);
          if (prediction.isFlaky) {
            falsePositives++;
          } else {
            trueNegatives++;
          }
        }
      }

      const falsePositiveRate = falsePositives / (falsePositives + trueNegatives);

      console.log(`\nFalse Positive Rate: ${(falsePositiveRate * 100).toFixed(2)}%`);

      // False positive rate should be < 20%
      expect(falsePositiveRate).toBeLessThan(0.20);
    });

    it('should have low false negative rate', () => {
      let falseNegatives = 0;
      let truePositives = 0;

      for (const pattern of testSet) {
        if (pattern.isFlaky) {
          const prediction = model.predict(pattern.name, pattern.results);
          if (!prediction.isFlaky) {
            falseNegatives++;
          } else {
            truePositives++;
          }
        }
      }

      const falseNegativeRate = falseNegatives / (falseNegatives + truePositives);

      console.log(`\nFalse Negative Rate: ${(falseNegativeRate * 100).toFixed(2)}%`);

      // False negative rate should be < 20%
      expect(falseNegativeRate).toBeLessThan(0.20);
    });
  });

  describe('Pattern-Specific Accuracy', () => {
    it('should accurately detect flip-flop patterns', () => {
      const flipFlopTests = testSet.filter(p => p.patternType === 'flip-flop');
      if (flipFlopTests.length === 0) {
        console.warn('No flip-flop tests in test set');
        return;
      }

      let correct = 0;
      for (const pattern of flipFlopTests) {
        const prediction = model.predict(pattern.name, pattern.results);
        if (prediction.isFlaky === pattern.isFlaky) correct++;
      }

      const accuracy = correct / flipFlopTests.length;
      console.log(`\nFlip-Flop Pattern Accuracy: ${(accuracy * 100).toFixed(2)}%`);

      expect(accuracy).toBeGreaterThan(0.75);
    });

    it('should accurately detect gradual degradation patterns', () => {
      const degradationTests = testSet.filter(p => p.patternType === 'gradual-degradation');
      if (degradationTests.length === 0) return;

      let correct = 0;
      for (const pattern of degradationTests) {
        const prediction = model.predict(pattern.name, pattern.results);
        if (prediction.isFlaky === pattern.isFlaky) correct++;
      }

      const accuracy = correct / degradationTests.length;
      console.log(`\nGradual Degradation Accuracy: ${(accuracy * 100).toFixed(2)}%`);

      expect(accuracy).toBeGreaterThan(0.75);
    });

    it('should accurately detect environment-sensitive patterns', () => {
      const envTests = testSet.filter(p => p.patternType === 'environment-sensitive');
      if (envTests.length === 0) return;

      let correct = 0;
      for (const pattern of envTests) {
        const prediction = model.predict(pattern.name, pattern.results);
        if (prediction.isFlaky === pattern.isFlaky) correct++;
      }

      const accuracy = correct / envTests.length;
      console.log(`\nEnvironment-Sensitive Accuracy: ${(accuracy * 100).toFixed(2)}%`);

      expect(accuracy).toBeGreaterThan(0.75);
    });

    it('should accurately detect stable patterns', () => {
      const stableTests = testSet.filter(p => !p.isFlaky);
      if (stableTests.length === 0) return;

      let correct = 0;
      for (const pattern of stableTests) {
        const prediction = model.predict(pattern.name, pattern.results);
        if (prediction.isFlaky === pattern.isFlaky) correct++;
      }

      const accuracy = correct / stableTests.length;
      console.log(`\nStable Pattern Accuracy: ${(accuracy * 100).toFixed(2)}%`);

      expect(accuracy).toBeGreaterThan(0.85);
    });
  });

  describe('Edge Cases', () => {
    it('should handle borderline cases (80-85% pass rate)', () => {
      const borderlineTests = testSet.filter(p => p.patternType === 'edge-case');
      if (borderlineTests.length === 0) return;

      let predictions = 0;
      for (const pattern of borderlineTests) {
        const prediction = model.predict(pattern.name, pattern.results);
        predictions++;
        expect(prediction.confidence).toBeGreaterThan(0);
        expect(prediction.probability).toBeGreaterThanOrEqual(0);
        expect(prediction.probability).toBeLessThanOrEqual(1);
      }

      expect(predictions).toBeGreaterThan(0);
    });

    it('should handle tests with high variance but high pass rate', () => {
      // Create test with 95% pass rate but high variance
      const testResults: TestResult[] = [];
      const baseTime = Date.now();

      for (let i = 0; i < 50; i++) {
        testResults.push({
          testName: 'high-variance-stable',
          passed: i % 20 !== 0, // 95% pass rate
          status: i % 20 !== 0 ? 'passed' : 'failed',
          duration: 100 + Math.random() * 500, // High variance
          timestamp: baseTime + i * 1000
        });
      }

      const prediction = model.predict('high-variance-stable', testResults);

      // Should classify as stable (high pass rate trumps variance)
      expect(prediction.isFlaky).toBe(false);
    });

    it('should handle tests with low variance but low pass rate', () => {
      // Create test with 50% pass rate but very low variance
      const testResults: TestResult[] = [];
      const baseTime = Date.now();

      for (let i = 0; i < 50; i++) {
        testResults.push({
          testName: 'low-variance-flaky',
          passed: i % 2 === 0, // 50% pass rate
          status: i % 2 === 0 ? 'passed' : 'failed',
          duration: 100 + Math.random() * 5, // Very low variance
          timestamp: baseTime + i * 1000
        });
      }

      const prediction = model.predict('low-variance-flaky', testResults);

      // Should classify as flaky (low pass rate indicates flakiness)
      expect(prediction.isFlaky).toBe(true);
    });
  });

  describe('Performance Requirements', () => {
    it('should maintain <100ms prediction latency', () => {
      const testPattern = testSet[0];
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        model.predict(testPattern.name, testPattern.results);
        const elapsed = Date.now() - start;
        times.push(elapsed);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);

      console.log(`\nPrediction Performance:`);
      console.log(`  Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  Maximum: ${maxTime}ms`);
      console.log(`  Target: <100ms`);

      expect(avgTime).toBeLessThan(100);
      expect(maxTime).toBeLessThan(150); // Allow some variance
    });

    it('should handle batch predictions efficiently', () => {
      const batchSize = 100;
      const batchTests = testSet.slice(0, batchSize);

      const testMap = new Map<string, TestResult[]>();
      for (const pattern of batchTests) {
        testMap.set(pattern.name, pattern.results);
      }

      const start = Date.now();
      const predictions = model.batchPredict(testMap);
      const elapsed = Date.now() - start;

      const avgTimePerTest = elapsed / batchSize;

      console.log(`\nBatch Prediction Performance:`);
      console.log(`  Total time: ${elapsed}ms`);
      console.log(`  Tests: ${batchSize}`);
      console.log(`  Avg per test: ${avgTimePerTest.toFixed(2)}ms`);

      expect(predictions).toHaveLength(batchSize);
      expect(avgTimePerTest).toBeLessThan(50);
    });
  });

  describe('Confidence Calibration', () => {
    it('should provide higher confidence for clearer cases', () => {
      // Very flaky test
      const veryFlakyResults: TestResult[] = [];
      for (let i = 0; i < 50; i++) {
        veryFlakyResults.push({
          testName: 'very-flaky',
          passed: i % 2 === 0,
          status: i % 2 === 0 ? 'passed' : 'failed',
          duration: 100 + Math.random() * 1000,
          timestamp: Date.now() + i * 1000
        });
      }

      // Very stable test
      const veryStableResults: TestResult[] = [];
      for (let i = 0; i < 50; i++) {
        veryStableResults.push({
          testName: 'very-stable',
          passed: true,
          status: 'passed',
          duration: 100 + Math.random() * 5,
          timestamp: Date.now() + i * 1000
        });
      }

      const flakyPrediction = model.predict('very-flaky', veryFlakyResults);
      const stablePrediction = model.predict('very-stable', veryStableResults);

      console.log(`\nConfidence Scores:`);
      console.log(`  Very Flaky: ${(flakyPrediction.confidence * 100).toFixed(2)}%`);
      console.log(`  Very Stable: ${(stablePrediction.confidence * 100).toFixed(2)}%`);

      // Both should have high confidence
      expect(flakyPrediction.confidence).toBeGreaterThan(0.6);
      expect(stablePrediction.confidence).toBeGreaterThan(0.6);
    });

    it('should provide lower confidence for ambiguous cases', () => {
      // Borderline test (75% pass rate)
      const borderlineResults: TestResult[] = [];
      for (let i = 0; i < 50; i++) {
        borderlineResults.push({
          testName: 'borderline',
          passed: i % 4 !== 0,
          status: i % 4 !== 0 ? 'passed' : 'failed',
          duration: 100 + Math.random() * 100,
          timestamp: Date.now() + i * 1000
        });
      }

      const prediction = model.predict('borderline', borderlineResults);

      console.log(`\nBorderline Confidence: ${(prediction.confidence * 100).toFixed(2)}%`);

      // Confidence should be reasonable but not as high as clear cases
      expect(prediction.confidence).toBeGreaterThan(0.3);
      expect(prediction.confidence).toBeLessThan(0.9);
    });
  });

  describe('Feature Extraction Validation', () => {
    it('should extract all 27+ advanced features', () => {
      const pattern = testSet[0];
      const features = AdvancedFeatureExtractor.extractFeatures(pattern.results);

      // Validate all features are present
      expect(features.passRate).toBeGreaterThanOrEqual(0);
      expect(features.variance).toBeGreaterThanOrEqual(0);
      expect(features.skewness).toBeDefined();
      expect(features.kurtosis).toBeDefined();
      expect(features.flipFlopScore).toBeGreaterThanOrEqual(0);
      expect(features.gradualDegradationScore).toBeGreaterThanOrEqual(0);
      expect(features.environmentSensitivityScore).toBeGreaterThanOrEqual(0);

      const featureArray = AdvancedFeatureExtractor.featuresToArray(features);

      console.log(`\nFeature Vector Length: ${featureArray.length}`);
      expect(featureArray.length).toBeGreaterThanOrEqual(27);
    });

    it('should detect flip-flop pattern in features', () => {
      const flipFlopTest = trainingSet.find(p => p.patternType === 'flip-flop');
      if (!flipFlopTest) return;

      const features = AdvancedFeatureExtractor.extractFeatures(flipFlopTest.results);

      console.log(`\nFlip-Flop Score: ${(features.flipFlopScore * 100).toFixed(2)}%`);

      expect(features.flipFlopScore).toBeGreaterThan(0.5);
    });

    it('should detect gradual degradation in features', () => {
      const degradationTest = trainingSet.find(p => p.patternType === 'gradual-degradation');
      if (!degradationTest) return;

      const features = AdvancedFeatureExtractor.extractFeatures(degradationTest.results);

      console.log(`\nGradual Degradation Score: ${(features.gradualDegradationScore * 100).toFixed(2)}%`);

      expect(features.gradualDegradationScore).toBeGreaterThan(0);
    });
  });
});
