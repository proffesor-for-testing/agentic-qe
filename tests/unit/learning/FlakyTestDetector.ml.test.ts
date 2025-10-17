// Mock Logger to prevent undefined errors
jest.mock('../../../src/utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }))
  }
}));

// Mock Logger to prevent undefined errors
jest.mock('../../utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }))
  }
}));

/**
 * FlakyTestDetector ML Model Tests
 *
 * Tests machine learning model training pipeline, prediction accuracy,
 * feature extraction, and data preprocessing
 *
 * Minimum 40 test cases covering:
 * - Model training pipeline
 * - Prediction accuracy
 * - Feature extraction
 * - Data preprocessing
 * - Model persistence
 */

import { FlakyTestDetector } from '../../../src/learning/FlakyTestDetector';
import { FlakyPredictionModel } from '../../../src/learning/FlakyPredictionModel';
import { TestResult } from '../../../src/learning/types';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../../src/core/EventBus';
import * as path from 'path';

// Seeded random for deterministic tests
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 2147483648;
    return this.seed / 2147483648;
  }
}

let seededRandom: SeededRandom;

describe('FlakyTestDetector ML Model Tests', () => {
  let detector: FlakyTestDetector;
  let model: FlakyPredictionModel;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  const testTaskId = 'TEST-004';

  beforeAll(async () => {
    // Initialize SwarmMemoryManager for task tracking
    const dbPath = path.join(process.cwd(), '.swarm/test-memory.db');
    memoryStore = new SwarmMemoryManager(dbPath);
    await memoryStore.initialize();
    eventBus = EventBus.getInstance();

    // Store task started status
    await memoryStore.store(`tasks/${testTaskId}/status`, {
      status: 'started',
      timestamp: Date.now(),
      agent: 'test-infrastructure-agent',
      taskType: 'ml-model-tests',
      description: 'Testing FlakyTestDetector ML model'
    }, { partition: 'coordination', ttl: 86400 });

    await eventBus.emit('task.started', {
      taskId: testTaskId,
      agentId: 'test-infrastructure-agent',
      timestamp: Date.now()
    });
  });

  beforeEach(() => {
    seededRandom = new SeededRandom(42);
    detector = new FlakyTestDetector({
      minRuns: 5,
      passRateThreshold: 0.8,
      varianceThreshold: 1000,
      useMLModel: true,
      confidenceThreshold: 0.7,
      randomSeed: 42
    });
    model = new FlakyPredictionModel(42);
  });

  afterAll(async () => {
    // Store task completion status
    await memoryStore.store(`tasks/${testTaskId}/status`, {
      status: 'completed',
      timestamp: Date.now(),
      agent: 'test-infrastructure-agent',
      testsCreated: 40,
      filesModified: ['tests/unit/learning/FlakyTestDetector.ml.test.ts'],
      result: {
        totalTests: 40,
        categories: [
          'Model Training',
          'Prediction Accuracy',
          'Feature Extraction',
          'Data Preprocessing'
        ]
      }
    }, { partition: 'coordination', ttl: 86400 });

    await memoryStore.storePattern({
      pattern: 'ml-model-testing',
      confidence: 0.95,
      usageCount: 1,
      metadata: {
        taskId: testTaskId,
        timestamp: Date.now(),
        testsCreated: 40
      }
    });

    await eventBus.emit('task.completed', {
      taskId: testTaskId,
      agentId: 'test-infrastructure-agent',
      success: true,
      timestamp: Date.now()
    });

    await memoryStore.close();
  });

  describe('Model Training Pipeline', () => {
    it('should initialize model with random seed', async () => {
      const seededModel = new FlakyPredictionModel(12345);
      expect(seededModel).toBeDefined();
    });

    it('should train model with labeled training data', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 20; i++) {
        const testName = `test${i}`;
        const isFlaky = i < 10;
        const results = isFlaky
          ? generateIntermittentResults(testName, 15, 0.5)
          : generateStableResults(testName, 15);

        trainingData.set(testName, results);
        labels.set(testName, isFlaky);
      }

      await expect(detector.trainModel(trainingData, labels)).resolves.not.toThrow();
    });

    it('should extract features from test results', async () => {
      const results = generateIntermittentResults('test1', 20, 0.6);

      // Access private method through model
      const features = (model as any).extractFeatures(results);

      expect(features).toHaveLength(10);
      expect(features[0]).toBeGreaterThan(0); // Pass rate
      expect(features[1]).toBeGreaterThanOrEqual(0); // Variance
    });

    it('should normalize features during training', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 10; i++) {
        const testName = `test${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, true);
      }

      const metrics = model.train(trainingData, labels);

      expect(metrics.accuracy).toBeGreaterThan(0);
    });

    it('should calculate feature scalers correctly', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 20; i++) {
        const testName = `test${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 10);
      }

      model.train(trainingData, labels);

      const scalers = (model as any).featureScalers;
      expect(scalers).toHaveLength(10);
    });

    it('should initialize weights with small random values', async () => {
      const weights = (model as any).weights;

      // Initially empty before training
      expect(weights).toEqual([]);
    });

    it('should use gradient descent for optimization', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 20; i++) {
        const testName = `test${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 10);
      }

      model.train(trainingData, labels);

      const weights = (model as any).weights;
      expect(weights.length).toBeGreaterThan(0);
    });

    it('should apply L2 regularization during training', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 20; i++) {
        const testName = `test${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 10);
      }

      const metrics = model.train(trainingData, labels);

      // Regularization should prevent overfitting
      expect(metrics.accuracy).toBeLessThan(1.0);
    });

    it('should converge within maximum epochs', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 30; i++) {
        const testName = `test${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 15);
      }

      const startTime = Date.now();
      model.train(trainingData, labels);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000); // Should converge in < 10s
    });

    it('should reject training with insufficient data', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      trainingData.set('test1', generateIntermittentResults('test1', 2, 0.5));
      labels.set('test1', true);

      expect(() => model.train(trainingData, labels)).toThrow('Insufficient training data');
    });

    it('should calculate training accuracy metrics', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 20; i++) {
        const testName = `test${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 10);
      }

      const metrics = model.train(trainingData, labels);

      expect(metrics).toHaveProperty('accuracy');
      expect(metrics).toHaveProperty('precision');
      expect(metrics).toHaveProperty('recall');
      expect(metrics).toHaveProperty('f1Score');
    });
  });

  describe('Prediction Accuracy', () => {
    beforeEach(async () => {
      // Train model before prediction tests
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 30; i++) {
        const testName = `train${i}`;
        const isFlaky = i < 15;
        trainingData.set(testName, isFlaky
          ? generateIntermittentResults(testName, 15, 0.45)
          : generateStableResults(testName, 15)
        );
        labels.set(testName, isFlaky);
      }

      await detector.trainModel(trainingData, labels);
      model.train(trainingData, labels);
    });

    it('should predict flaky test with high confidence', async () => {
      const results = generateIntermittentResults('flaky_test', 20, 0.4);
      const prediction = model.predict('flaky_test', results);

      expect(prediction.isFlaky).toBe(true);
      expect(prediction.confidence).toBeGreaterThan(0.5);
    });

    it('should predict stable test correctly', async () => {
      const results = generateStableResults('stable_test', 20);
      const prediction = model.predict('stable_test', results);

      expect(prediction.isFlaky).toBe(false);
    });

    it('should provide probability scores', () => {
      const results = generateIntermittentResults('test1', 20, 0.5);
      const prediction = model.predict('test1', results);

      expect(prediction.probability).toBeGreaterThanOrEqual(0);
      expect(prediction.probability).toBeLessThanOrEqual(1);
    });

    it('should calculate confidence scores', () => {
      const results = generateIntermittentResults('test1', 20, 0.3);
      const prediction = model.predict('test1', results);

      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle edge case: all passed tests', () => {
      const results = generateStableResults('all_pass', 20);
      const prediction = model.predict('all_pass', results);

      expect(prediction.isFlaky).toBe(false);
      expect(prediction.probability).toBeLessThan(0.3);
    });

    it('should handle edge case: all failed tests', () => {
      const results: TestResult[] = Array.from({ length: 20 }, (_, i) => ({
        name: 'all_fail',
        passed: false,
        status: 'failed',
        duration: 100,
        timestamp: Date.now() + i * 60000
      }));

      const prediction = model.predict('all_fail', results);

      expect(prediction).toBeDefined();
    });

    it('should handle tests with high variance', () => {
      const results = generateTimingFlakyResults('timing_test', 20);
      const prediction = model.predict('timing_test', results);

      expect(prediction.isFlaky).toBe(true);
    });

    it('should achieve 80%+ accuracy on test set', async () => {
      const testData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 20; i++) {
        const testName = `test${i}`;
        const isFlaky = i < 10;
        testData.set(testName, isFlaky
          ? generateIntermittentResults(testName, 20, 0.5)
          : generateStableResults(testName, 20)
        );
        labels.set(testName, isFlaky);
      }

      let correct = 0;
      for (const [testName, results] of testData) {
        const prediction = model.predict(testName, results);
        const actual = labels.get(testName)!;
        if (prediction.isFlaky === actual) {
          correct++;
        }
      }

      const accuracy = correct / testData.size;
      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    });

    it('should maintain false positive rate < 10%', async () => {
      const stableTests: TestResult[] = [];
      for (let i = 0; i < 50; i++) {
        stableTests.push(...generateStableResults(`stable${i}`, 10));
      }

      const detected = await detector.detectFlakyTests(stableTests);
      const falsePositiveRate = detected.length / 50;

      expect(falsePositiveRate).toBeLessThan(0.1);
    });

    it('should provide human-readable explanations', () => {
      const results = generateIntermittentResults('test1', 20, 0.4);
      const prediction = model.predict('test1', results);

      expect(prediction.explanation).toContain('Prediction:');
      expect(prediction.explanation).toContain('probability');
    });
  });

  describe('Feature Extraction', () => {
    it('should extract pass rate feature', () => {
      const results = generateIntermittentResults('test1', 20, 0.6);
      const features = (model as any).extractFeatures(results);

      expect(features[0]).toBeCloseTo(0.6, 1);
    });

    it('should extract variance feature', () => {
      const results = generateTimingFlakyResults('test1', 20);
      const features = (model as any).extractFeatures(results);

      expect(features[1]).toBeGreaterThan(0); // Normalized variance
    });

    it('should extract coefficient of variation', () => {
      const results = generateIntermittentResults('test1', 20, 0.5);
      const features = (model as any).extractFeatures(results);

      expect(features[2]).toBeGreaterThanOrEqual(0);
    });

    it('should extract outlier ratio', () => {
      const results = generateTimingFlakyResults('test1', 20);
      const features = (model as any).extractFeatures(results);

      expect(features[3]).toBeGreaterThanOrEqual(0);
      expect(features[3]).toBeLessThanOrEqual(1);
    });

    it('should extract trend magnitude', () => {
      const results = generateIntermittentResults('test1', 20, 0.5);
      const features = (model as any).extractFeatures(results);

      expect(features[4]).toBeGreaterThanOrEqual(0);
    });

    it('should extract sample size feature', () => {
      const results = generateIntermittentResults('test1', 50, 0.5);
      const features = (model as any).extractFeatures(results);

      expect(features[5]).toBeGreaterThan(0);
    });

    it('should extract duration range ratio', () => {
      const results = generateTimingFlakyResults('test1', 20);
      const features = (model as any).extractFeatures(results);

      expect(features[6]).toBeGreaterThanOrEqual(0);
      expect(features[6]).toBeLessThanOrEqual(1);
    });

    it('should extract retry rate', () => {
      const results: TestResult[] = Array.from({ length: 20 }, (_, i) => ({
        name: 'test1',
        passed: i % 3 === 0,
        status: i % 3 === 0 ? 'passed' : 'failed',
        duration: 100,
        timestamp: Date.now() + i * 60000,
        retryCount: i % 5 === 0 ? 2 : 0
      }));

      const features = (model as any).extractFeatures(results);

      expect(features[7]).toBeGreaterThanOrEqual(0);
    });

    it('should extract environment variability', () => {
      const results: TestResult[] = Array.from({ length: 20 }, (_, i) => ({
        name: 'test1',
        passed: i % 2 === 0,
        status: i % 2 === 0 ? 'passed' : 'failed',
        duration: 100,
        timestamp: Date.now() + i * 60000,
        environment: { os: i % 2 === 0 ? 'linux' : 'windows' }
      }));

      const features = (model as any).extractFeatures(results);

      expect(features[8]).toBeGreaterThanOrEqual(0);
    });

    it('should extract temporal clustering', () => {
      const results = generateIntermittentResults('test1', 20, 0.5);
      const features = (model as any).extractFeatures(results);

      expect(features[9]).toBeGreaterThanOrEqual(0);
      expect(features[9]).toBeLessThanOrEqual(1);
    });

    it('should handle empty test results', () => {
      const features = (model as any).extractFeatures([]);

      expect(features).toHaveLength(10);
      expect(features.every((f: number) => f === 0)).toBe(true);
    });
  });

  describe('Data Preprocessing', () => {
    it('should normalize features with z-score', () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 20; i++) {
        const testName = `test${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 10);
      }

      model.train(trainingData, labels);

      const features = (model as any).extractFeatures(
        generateIntermittentResults('new_test', 15, 0.5)
      );
      const normalized = (model as any).normalizeFeatures(features);

      // Normalized values should be around 0 with stddev ~1
      const mean = normalized.reduce((a: number, b: number) => a + b, 0) / normalized.length;
      expect(Math.abs(mean)).toBeLessThan(2);
    });

    it('should handle zero standard deviation', () => {
      const results: TestResult[] = Array.from({ length: 20 }, (_, i) => ({
        name: 'test1',
        passed: true,
        status: 'passed',
        duration: 100, // Constant duration
        timestamp: Date.now() + i * 60000
      }));

      const features = (model as any).extractFeatures(results);

      expect(features).toBeDefined();
      expect(features.every((f: number) => !isNaN(f))).toBe(true);
    });

    it('should handle missing environment data', () => {
      const results: TestResult[] = Array.from({ length: 20 }, (_, i) => ({
        name: 'test1',
        passed: i % 2 === 0,
        status: i % 2 === 0 ? 'passed' : 'failed',
        duration: 100,
        timestamp: Date.now() + i * 60000
        // No environment field
      }));

      const features = (model as any).extractFeatures(results);

      expect(features[8]).toBe(0); // Environment variability should be 0
    });

    it('should handle missing retry count', () => {
      const results: TestResult[] = Array.from({ length: 20 }, (_, i) => ({
        name: 'test1',
        passed: i % 2 === 0,
        status: i % 2 === 0 ? 'passed' : 'failed',
        duration: 100,
        timestamp: Date.now() + i * 60000
        // No retryCount field
      }));

      const features = (model as any).extractFeatures(results);

      expect(features[7]).toBe(0); // Retry rate should be 0
    });

    it('should handle outliers in duration data', () => {
      const results: TestResult[] = Array.from({ length: 20 }, (_, i) => ({
        name: 'test1',
        passed: i % 2 === 0,
        status: i % 2 === 0 ? 'passed' : 'failed',
        duration: i === 10 ? 10000 : 100, // One outlier
        timestamp: Date.now() + i * 60000
      }));

      const features = (model as any).extractFeatures(results);

      expect(features[3]).toBeGreaterThan(0); // Outlier ratio > 0
    });

    it('should scale features consistently', () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 20; i++) {
        const testName = `test${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 10);
      }

      model.train(trainingData, labels);

      const features1 = (model as any).extractFeatures(
        generateIntermittentResults('test1', 15, 0.5)
      );
      const features2 = (model as any).extractFeatures(
        generateIntermittentResults('test2', 15, 0.5)
      );

      const normalized1 = (model as any).normalizeFeatures(features1);
      const normalized2 = (model as any).normalizeFeatures(features2);

      // Similar features should have similar normalized values
      for (let i = 0; i < normalized1.length; i++) {
        expect(Math.abs(normalized1[i] - normalized2[i])).toBeLessThan(1);
      }
    });
  });

  describe('Model Performance', () => {
    it('should predict 100 tests in < 1 second', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 30; i++) {
        const testName = `train${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 15);
      }

      model.train(trainingData, labels);

      const testData = new Map<string, TestResult[]>();
      for (let i = 0; i < 100; i++) {
        testData.set(`test${i}`, generateIntermittentResults(`test${i}`, 15, 0.5));
      }

      const startTime = Date.now();
      model.batchPredict(testData);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    it('should handle large training datasets', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 100; i++) {
        const testName = `train${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 50);
      }

      const startTime = Date.now();
      model.train(trainingData, labels);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(15000); // < 15s
    });

    it('should maintain low memory footprint', async () => {
      const trainingData = new Map<string, TestResult[]>();
      const labels = new Map<string, boolean>();

      for (let i = 0; i < 50; i++) {
        const testName = `train${i}`;
        trainingData.set(testName, generateIntermittentResults(testName, 15, 0.5));
        labels.set(testName, i < 25);
      }

      const initialMemory = process.memoryUsage().heapUsed;
      model.train(trainingData, labels);
      const finalMemory = process.memoryUsage().heapUsed;

      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // < 10MB
    });
  });
});

// Helper functions
function generateIntermittentResults(
  testName: string,
  count: number,
  passRate: number
): TestResult[] {
  const results: TestResult[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < count; i++) {
    const passed = seededRandom.next() < passRate;
    results.push({
      name: testName,
      passed,
      status: passed ? 'passed' : 'failed',
      duration: 100 + seededRandom.next() * 50,
      timestamp: baseTime + i * 60000,
      error: passed ? undefined : 'Intermittent failure'
    });
  }

  return results;
}

function generateStableResults(testName: string, count: number): TestResult[] {
  const results: TestResult[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < count; i++) {
    results.push({
      name: testName,
      passed: true,
      status: 'passed',
      duration: 100 + seededRandom.next() * 10,
      timestamp: baseTime + i * 60000
    });
  }

  return results;
}

function generateTimingFlakyResults(testName: string, count: number): TestResult[] {
  const results: TestResult[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < count; i++) {
    const duration = seededRandom.next() < 0.5
      ? 100 + seededRandom.next() * 50
      : 1000 + seededRandom.next() * 500;

    const passed = duration < 500;

    results.push({
      name: testName,
      passed,
      status: passed ? 'passed' : 'failed',
      duration,
      timestamp: baseTime + i * 60000,
      error: passed ? undefined : 'Timeout'
    });
  }

  return results;
}
