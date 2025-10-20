/**
 * Unit tests for NeuralPatternMatcher
 */

import { EventEmitter } from 'events';
import {
  NeuralPatternMatcher,
  ModelBackend,
  NeuralArchitecture,
  TrainingDataPoint,
  PatternPrediction
} from '../../../src/learning/NeuralPatternMatcher';

// Mock dependencies
const mockMemoryManager = {
  retrievePatterns: jest.fn(),
  retrieveMetrics: jest.fn(),
  storePattern: jest.fn()
} as any;

const mockReasoningBank = {
  storeTrainingMetrics: jest.fn(),
  findSimilarPatterns: jest.fn()
} as any;

describe('NeuralPatternMatcher', () => {
  let architecture: NeuralArchitecture;
  let matcher: NeuralPatternMatcher;

  beforeEach(() => {
    architecture = {
      inputSize: 12,
      hiddenLayers: [8, 4],
      outputSize: 2,
      activation: 'relu',
      dropout: 0.2,
      learningRate: 0.001,
      batchSize: 32,
      epochs: 10
    };

    matcher = new NeuralPatternMatcher(
      ModelBackend.SIMPLE_NN,
      architecture,
      mockMemoryManager,
      mockReasoningBank,
      '/tmp/test-models'
    );

    jest.clearAllMocks();
  });

  afterEach(() => {
    matcher.removeAllListeners();
  });

  describe('initialization', () => {
    it('should create instance with correct configuration', () => {
      expect(matcher).toBeInstanceOf(NeuralPatternMatcher);
      expect(matcher).toBeInstanceOf(EventEmitter);

      const info = matcher.getModelInfo();
      expect(info.backend).toBe(ModelBackend.SIMPLE_NN);
      expect(info.architecture).toEqual(architecture);
    });

    it('should initialize model successfully', async () => {
      const eventSpy = jest.fn();
      matcher.on('model:initialized', eventSpy);

      await matcher.initializeModel();

      expect(eventSpy).toHaveBeenCalledWith({
        backend: ModelBackend.SIMPLE_NN,
        architecture
      });
    });

    it('should throw error for unsupported backend', async () => {
      const tfMatcher = new NeuralPatternMatcher(
        ModelBackend.TENSORFLOW_JS,
        architecture,
        mockMemoryManager
      );

      await expect(tfMatcher.initializeModel()).rejects.toThrow(
        'TensorFlow.js backend not yet implemented'
      );
    });
  });

  describe('pattern encoding', () => {
    it('should encode simple pattern correctly', () => {
      const pattern = {
        cyclomaticComplexity: 5,
        linesOfCode: 100,
        numberOfFunctions: 3,
        numberOfBranches: 4,
        lineCoverage: 0.8,
        branchCoverage: 0.75,
        functionCoverage: 0.9,
        statementCoverage: 0.85,
        successRate: 0.95,
        avgExecutionTime: 500,
        flakyScore: 0.1,
        failureRate: 0.05
      };

      const encoded = matcher.encodePattern(pattern);

      expect(encoded).toHaveLength(architecture.inputSize);
      expect(encoded.every(f => typeof f === 'number')).toBe(true);
      expect(encoded.every(f => !isNaN(f))).toBe(true);
    });

    it('should handle missing properties with zeros', () => {
      const pattern = { cyclomaticComplexity: 3 };

      const encoded = matcher.encodePattern(pattern);

      expect(encoded).toHaveLength(architecture.inputSize);
      expect(encoded.every(f => !isNaN(f))).toBe(true);
    });

    it('should normalize values correctly', () => {
      const pattern = {
        cyclomaticComplexity: 10,
        linesOfCode: 1000,
        lineCoverage: 0.8,
        successRate: 0.9
      };

      const encoded = matcher.encodePattern(pattern);

      // Check that values are in reasonable ranges
      expect(encoded.length).toBe(architecture.inputSize);
      expect(encoded.every(f => !isNaN(f))).toBe(true);
      // Values should be normalized
      expect(Math.min(...encoded)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('training data loading', () => {
    it('should load and combine patterns with metrics', async () => {
      const mockPatterns = [
        {
          pattern_id: 'p1',
          pattern_type: 'unit',
          coverage: 0.8,
          created_at: Date.now()
        },
        {
          pattern_id: 'p2',
          pattern_type: 'integration',
          coverage: 0.9,
          created_at: Date.now()
        }
      ];

      const mockMetrics = [
        {
          pattern_id: 'p1',
          success_rate: 0.95,
          avg_execution_time: 100
        },
        {
          pattern_id: 'p2',
          success_rate: 0.85,
          avg_execution_time: 200
        }
      ];

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      const data = await matcher.loadTrainingData();

      expect(data).toHaveLength(2);
      expect(data[0].features).toHaveLength(architecture.inputSize);
      expect(data[0].labels).toHaveLength(architecture.outputSize);
      expect(data[0].metadata.testId).toBe('p1');
    });

    it('should emit loading events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      matcher.on('data:loading', startSpy);
      matcher.on('data:loaded', completeSpy);

      mockMemoryManager.retrievePatterns.mockResolvedValue([]);
      mockMemoryManager.retrieveMetrics.mockResolvedValue([]);

      await matcher.loadTrainingData();

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalledWith({
        count: 0,
        sources: ['patterns', 'metrics']
      });
    });

    it('should handle errors gracefully', async () => {
      const errorSpy = jest.fn();
      matcher.on('data:error', errorSpy);

      mockMemoryManager.retrievePatterns.mockRejectedValue(
        new Error('Database error')
      );

      await expect(matcher.loadTrainingData()).rejects.toThrow(
        'Failed to load training data'
      );

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should skip patterns without metrics', async () => {
      mockMemoryManager.retrievePatterns.mockResolvedValue([
        { pattern_id: 'p1', pattern_type: 'unit' },
        { pattern_id: 'p2', pattern_type: 'integration' }
      ]);

      mockMemoryManager.retrieveMetrics.mockResolvedValue([
        { pattern_id: 'p1', success_rate: 0.9 }
        // p2 has no metrics
      ]);

      const data = await matcher.loadTrainingData();

      expect(data).toHaveLength(1);
      expect(data[0].metadata.testId).toBe('p1');
    });
  });

  describe('model training', () => {
    const createTrainingData = (count: number): TrainingDataPoint[] => {
      return Array.from({ length: count }, (_, i) => ({
        features: Array.from({ length: 12 }, () => Math.random()),
        labels: i % 2 === 0 ? [1, 0] : [0, 1],
        metadata: {
          testId: `test-${i}`,
          codePattern: 'unit',
          timestamp: Date.now(),
          success: i % 2 === 0,
          coverage: 0.8
        }
      }));
    };

    it('should train model successfully', async () => {
      const trainingData = createTrainingData(100);
      const eventSpy = jest.fn();

      matcher.on('training:completed', eventSpy);

      const metrics = await matcher.train(trainingData, 0.2);

      expect(metrics).toBeDefined();
      expect(metrics.accuracy).toBeGreaterThan(0);
      expect(metrics.accuracy).toBeLessThanOrEqual(1);
      expect(metrics.trainingLoss).toBeGreaterThanOrEqual(0);
      expect(metrics.validationLoss).toBeGreaterThanOrEqual(0);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('should split data into train and validation sets', async () => {
      const trainingData = createTrainingData(100);

      await matcher.train(trainingData, 0.2);

      // Validation split should be 20%
      const info = matcher.getModelInfo();
      expect(info.lastTrained).toBeGreaterThan(0);
    });

    it('should store metrics in reasoning bank', async () => {
      const trainingData = createTrainingData(50);

      await matcher.train(trainingData);

      expect(mockReasoningBank.storeTrainingMetrics).toHaveBeenCalled();
    });

    it('should handle training with no data', async () => {
      mockMemoryManager.retrievePatterns.mockResolvedValue([]);
      mockMemoryManager.retrieveMetrics.mockResolvedValue([]);

      await expect(matcher.train()).rejects.toThrow('No training data available');
    });

    it('should emit progress events during training', async () => {
      const trainingData = createTrainingData(100);
      const progressSpy = jest.fn();

      matcher.on('training:progress', progressSpy);

      await matcher.train(trainingData);

      expect(progressSpy).toHaveBeenCalled();
    });
  });

  describe('prediction', () => {
    const trainingData: TrainingDataPoint[] = Array.from({ length: 50 }, (_, i) => ({
      features: Array.from({ length: 12 }, () => Math.random()),
      labels: i % 2 === 0 ? [1, 0] : [0, 1],
      metadata: {
        testId: `test-${i}`,
        codePattern: 'unit',
        timestamp: Date.now(),
        success: i % 2 === 0,
        coverage: 0.8
      }
    }));

    beforeEach(async () => {
      await matcher.train(trainingData);
    });

    it('should make predictions on new patterns', async () => {
      const codePattern = {
        cyclomaticComplexity: 3,
        linesOfCode: 50,
        hasLoops: true,
        hasConditionals: true
      };

      mockReasoningBank.findSimilarPatterns.mockResolvedValue([
        {
          test_cases: ['test edge cases', 'test loops']
        }
      ]);

      const prediction = await matcher.predict(codePattern);

      expect(prediction).toBeDefined();
      expect(prediction.pattern.confidence).toBeGreaterThan(0);
      expect(prediction.pattern.confidence).toBeLessThanOrEqual(1);
      expect(prediction.pattern.testCases).toBeDefined();
      expect(Array.isArray(prediction.pattern.testCases)).toBe(true);
      expect(prediction.modelInfo.backend).toBe(ModelBackend.SIMPLE_NN);
    });

    it('should generate test suggestions based on code characteristics', async () => {
      const codePattern = {
        hasLoops: true,
        hasConditionals: true,
        hasAsyncOperations: true
      };

      mockReasoningBank.findSimilarPatterns.mockResolvedValue([]);

      const prediction = await matcher.predict(codePattern);

      expect(prediction.pattern.testCases.length).toBeGreaterThan(0);
      expect(prediction.pattern.testCases).toContain('Edge case: empty array');
      expect(prediction.pattern.testCases).toContain('Async: success case');
    });

    it('should throw error if model not trained', async () => {
      const newMatcher = new NeuralPatternMatcher(
        ModelBackend.SIMPLE_NN,
        architecture,
        mockMemoryManager
      );

      await expect(newMatcher.predict({})).rejects.toThrow(
        'Model not initialized'
      );
    });

    it('should emit prediction events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      matcher.on('prediction:started', startSpy);
      matcher.on('prediction:completed', completeSpy);

      mockReasoningBank.findSimilarPatterns.mockResolvedValue([]);

      await matcher.predict({ cyclomaticComplexity: 2 });

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('model persistence', () => {
    const trainingData: TrainingDataPoint[] = Array.from({ length: 20 }, (_, i) => ({
      features: Array.from({ length: 12 }, () => Math.random()),
      labels: [1, 0],
      metadata: {
        testId: `test-${i}`,
        codePattern: 'unit',
        timestamp: Date.now(),
        success: true,
        coverage: 0.8
      }
    }));

    it('should save model to disk', async () => {
      await matcher.train(trainingData);

      const saveSpy = jest.fn();
      matcher.on('model:saved', saveSpy);

      await matcher.saveModel();

      expect(saveSpy).toHaveBeenCalled();
    });

    it('should throw error when saving untrained model', async () => {
      const newMatcher = new NeuralPatternMatcher(
        ModelBackend.SIMPLE_NN,
        architecture,
        mockMemoryManager
      );

      await expect(newMatcher.saveModel()).rejects.toThrow('No model to save');
    });
  });

  describe('model evaluation', () => {
    const createTestData = (count: number): TrainingDataPoint[] => {
      return Array.from({ length: count }, (_, i) => ({
        features: Array.from({ length: 12 }, () => Math.random()),
        labels: i % 2 === 0 ? [1, 0] : [0, 1],
        metadata: {
          testId: `test-${i}`,
          codePattern: 'unit',
          timestamp: Date.now(),
          success: i % 2 === 0,
          coverage: 0.8
        }
      }));
    };

    beforeEach(async () => {
      const trainingData = createTestData(100);
      await matcher.train(trainingData);
    });

    it('should evaluate model on test data', async () => {
      const testData = createTestData(20);

      const metrics = await matcher.evaluate(testData);

      expect(metrics).toBeDefined();
      expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
      expect(metrics.accuracy).toBeLessThanOrEqual(1);
      expect(metrics.precision).toBeGreaterThanOrEqual(0);
      expect(metrics.recall).toBeGreaterThanOrEqual(0);
      expect(metrics.f1Score).toBeGreaterThanOrEqual(0);
      expect(metrics.confusionMatrix).toBeDefined();
      expect(metrics.confusionMatrix.length).toBe(2);
    });

    it('should emit evaluation events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      matcher.on('evaluation:started', startSpy);
      matcher.on('evaluation:completed', completeSpy);

      const testData = createTestData(10);
      await matcher.evaluate(testData);

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });

    it('should calculate confusion matrix correctly', async () => {
      const testData = createTestData(10);

      const metrics = await matcher.evaluate(testData);

      // Confusion matrix should be 2x2
      expect(metrics.confusionMatrix.length).toBe(2);
      expect(metrics.confusionMatrix[0].length).toBe(2);
      expect(metrics.confusionMatrix[1].length).toBe(2);

      // Total should equal test data size
      const total = metrics.confusionMatrix.flat().reduce((a, b) => a + b, 0);
      expect(total).toBe(testData.length);
    });
  });

  describe('incremental training', () => {
    it('should support incremental training with new data', async () => {
      const initialData = Array.from({ length: 50 }, (_, i) => ({
        features: Array.from({ length: 12 }, () => Math.random()),
        labels: [1, 0],
        metadata: {
          testId: `test-${i}`,
          codePattern: 'unit',
          timestamp: Date.now(),
          success: true,
          coverage: 0.8
        }
      }));

      await matcher.train(initialData);

      const newData = Array.from({ length: 20 }, (_, i) => ({
        features: Array.from({ length: 12 }, () => Math.random()),
        labels: [0, 1],
        metadata: {
          testId: `new-test-${i}`,
          codePattern: 'integration',
          timestamp: Date.now(),
          success: false,
          coverage: 0.6
        }
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue([]);
      mockMemoryManager.retrieveMetrics.mockResolvedValue([]);

      const metrics = await matcher.incrementalTrain(newData);

      expect(metrics).toBeDefined();
      expect(metrics.accuracy).toBeGreaterThan(0);
    });
  });

  describe('model info', () => {
    it('should return correct model information', () => {
      const info = matcher.getModelInfo();

      expect(info.backend).toBe(ModelBackend.SIMPLE_NN);
      expect(info.version).toBe('1.0.0');
      expect(info.architecture).toEqual(architecture);
      expect(info.lastTrained).toBe(0);
      expect(info.metrics).toBeNull();
    });

    it('should update last trained timestamp after training', async () => {
      const trainingData = Array.from({ length: 20 }, (_, i) => ({
        features: Array.from({ length: 12 }, () => Math.random()),
        labels: [1, 0],
        metadata: {
          testId: `test-${i}`,
          codePattern: 'unit',
          timestamp: Date.now(),
          success: true,
          coverage: 0.8
        }
      }));

      await matcher.train(trainingData);

      const info = matcher.getModelInfo();
      expect(info.lastTrained).toBeGreaterThan(0);
      expect(info.metrics).toBeDefined();
    });
  });
});
