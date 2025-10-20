/**
 * Unit tests for NeuralTrainer
 */

import { EventEmitter } from 'events';
import {
  NeuralTrainer,
  TrainingConfig,
  HyperparameterConfig,
  TrainingResult
} from '../../../src/learning/NeuralTrainer';
import {
  ModelBackend,
  NeuralArchitecture,
  TrainingDataPoint
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

describe('NeuralTrainer', () => {
  let config: TrainingConfig;
  let trainer: NeuralTrainer;

  beforeEach(() => {
    const architecture: NeuralArchitecture = {
      inputSize: 12,
      hiddenLayers: [8, 4],
      outputSize: 2,
      activation: 'relu',
      dropout: 0.2,
      learningRate: 0.001,
      batchSize: 32,
      epochs: 5 // Reduced for faster tests
    };

    config = {
      backend: ModelBackend.SIMPLE_NN,
      architecture,
      validationSplit: 0.2,
      earlyStoppingPatience: 3,
      minImprovement: 0.001,
      dataAugmentation: false,
      crossValidationFolds: 0,
      modelPath: '/tmp/test-models'
    };

    trainer = new NeuralTrainer(config, mockMemoryManager, mockReasoningBank);

    jest.clearAllMocks();
  });

  afterEach(() => {
    trainer.removeAllListeners();
  });

  describe('initialization', () => {
    it('should create instance with correct configuration', () => {
      expect(trainer).toBeInstanceOf(NeuralTrainer);
      expect(trainer).toBeInstanceOf(EventEmitter);
    });

    it('should initialize pattern matcher', () => {
      const matcher = trainer.getPatternMatcher();
      expect(matcher).toBeDefined();

      const info = matcher.getModelInfo();
      expect(info.backend).toBe(ModelBackend.SIMPLE_NN);
    });
  });

  describe('data preprocessing', () => {
    const createRawData = (): TrainingDataPoint[] => {
      return [
        {
          features: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          labels: [1, 0],
          metadata: {
            testId: 'test-1',
            codePattern: 'unit',
            timestamp: Date.now(),
            success: true,
            coverage: 0.8
          }
        },
        {
          features: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
          labels: [0, 1],
          metadata: {
            testId: 'test-2',
            codePattern: 'integration',
            timestamp: Date.now(),
            success: false,
            coverage: 0.6
          }
        }
      ];
    };

    it('should preprocess data with default options', async () => {
      const rawData = createRawData();
      const eventSpy = jest.fn();

      trainer.on('preprocessing:completed', eventSpy);

      const processed = await trainer.preprocessData(rawData);

      expect(processed.length).toBeGreaterThan(0);
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should handle missing values', async () => {
      const dataWithMissing: TrainingDataPoint[] = [
        {
          features: [1, 2, NaN, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          labels: [1, 0],
          metadata: {
            testId: 'test-1',
            codePattern: 'unit',
            timestamp: Date.now(),
            success: true,
            coverage: 0.8
          }
        },
        {
          features: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          labels: [0, 1],
          metadata: {
            testId: 'test-2',
            codePattern: 'unit',
            timestamp: Date.now(),
            success: false,
            coverage: 0.7
          }
        }
      ];

      const processed = await trainer.preprocessData(dataWithMissing, {
        normalize: false,
        handleMissing: true,
        removeOutliers: false,
        balanceClasses: false
      });

      // Should filter out data with NaN
      expect(processed.length).toBe(1);
      expect(processed[0].features.every(f => !isNaN(f))).toBe(true);
    });

    it('should normalize features', async () => {
      const data = createRawData();

      const processed = await trainer.preprocessData(data, {
        normalize: true,
        handleMissing: false,
        removeOutliers: false,
        balanceClasses: false
      });

      // Check that values are normalized to [0, 1]
      for (const point of processed) {
        for (const feature of point.features) {
          expect(feature).toBeGreaterThanOrEqual(0);
          expect(feature).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should balance classes', async () => {
      const imbalancedData: TrainingDataPoint[] = [
        ...Array.from({ length: 10 }, (_, i) => ({
          features: Array.from({ length: 12 }, () => Math.random()),
          labels: [1, 0],
          metadata: {
            testId: `test-${i}`,
            codePattern: 'unit',
            timestamp: Date.now(),
            success: true,
            coverage: 0.8
          }
        })),
        ...Array.from({ length: 2 }, (_, i) => ({
          features: Array.from({ length: 12 }, () => Math.random()),
          labels: [0, 1],
          metadata: {
            testId: `test-${i + 10}`,
            codePattern: 'integration',
            timestamp: Date.now(),
            success: false,
            coverage: 0.6
          }
        }))
      ];

      const balanced = await trainer.preprocessData(imbalancedData, {
        normalize: false,
        handleMissing: false,
        removeOutliers: false,
        balanceClasses: true
      });

      // Count classes
      const class0 = balanced.filter(d => d.labels[0] === 1).length;
      const class1 = balanced.filter(d => d.labels[1] === 1).length;

      // Should be roughly equal
      expect(class0).toBe(class1);
    });

    it('should emit preprocessing events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      trainer.on('preprocessing:started', startSpy);
      trainer.on('preprocessing:completed', completeSpy);

      const data = createRawData();
      await trainer.preprocessData(data);

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('data augmentation', () => {
    it('should augment data with specified factor', async () => {
      const originalData: TrainingDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
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

      const augmented = await trainer.augmentData(originalData, 3);

      // Should be 3x original size
      expect(augmented.length).toBe(originalData.length * 3);
    });

    it('should add noise to augmented samples', async () => {
      const originalData: TrainingDataPoint[] = [{
        features: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        labels: [1, 0],
        metadata: {
          testId: 'test-1',
          codePattern: 'unit',
          timestamp: Date.now(),
          success: true,
          coverage: 0.8
        }
      }];

      const augmented = await trainer.augmentData(originalData, 2);

      // Original + augmented
      expect(augmented.length).toBe(2);

      // Augmented sample should be slightly different
      const original = augmented[0];
      const augmentedSample = augmented[1];

      expect(original.features).not.toEqual(augmentedSample.features);
    });

    it('should emit augmentation events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      trainer.on('augmentation:started', startSpy);
      trainer.on('augmentation:completed', completeSpy);

      const data: TrainingDataPoint[] = Array.from({ length: 5 }, (_, i) => ({
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

      await trainer.augmentData(data);

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('training', () => {
    const mockPatterns = Array.from({ length: 50 }, (_, i) => ({
      pattern_id: `p${i}`,
      pattern_type: 'unit',
      coverage: 0.8,
      created_at: Date.now()
    }));

    const mockMetrics = Array.from({ length: 50 }, (_, i) => ({
      pattern_id: `p${i}`,
      success_rate: 0.9,
      avg_execution_time: 100
    }));

    beforeEach(() => {
      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);
    });

    it('should train model successfully', async () => {
      const eventSpy = jest.fn();
      trainer.on('training:completed', eventSpy);

      const result = await trainer.train();

      expect(result).toBeDefined();
      expect(result.metrics.accuracy).toBeGreaterThan(0);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.modelVersion).toBeDefined();
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should handle data augmentation during training', async () => {
      config.dataAugmentation = true;
      const augTrainer = new NeuralTrainer(config, mockMemoryManager);

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      const augSpy = jest.fn();
      augTrainer.on('augmentation:completed', augSpy);

      await augTrainer.train();

      expect(augSpy).toHaveBeenCalled();
    });

    it('should throw error with no training data', async () => {
      mockMemoryManager.retrievePatterns.mockResolvedValue([]);
      mockMemoryManager.retrieveMetrics.mockResolvedValue([]);

      await expect(trainer.train()).rejects.toThrow('No training data available');
    });

    it('should emit training events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      trainer.on('training:started', startSpy);
      trainer.on('training:completed', completeSpy);

      await trainer.train();

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('cross-validation', () => {
    beforeEach(() => {
      const mockPatterns = Array.from({ length: 100 }, (_, i) => ({
        pattern_id: `p${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const mockMetrics = Array.from({ length: 100 }, (_, i) => ({
        pattern_id: `p${i}`,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);
    });

    it('should perform cross-validation training', async () => {
      config.crossValidationFolds = 3;
      const cvTrainer = new NeuralTrainer(config, mockMemoryManager);

      const foldStartSpy = jest.fn();
      const foldCompleteSpy = jest.fn();

      cvTrainer.on('crossvalidation:fold:started', foldStartSpy);
      cvTrainer.on('crossvalidation:fold:completed', foldCompleteSpy);

      const result = await cvTrainer.train();

      expect(result.metrics).toBeDefined();
      expect(foldStartSpy).toHaveBeenCalledTimes(3);
      expect(foldCompleteSpy).toHaveBeenCalledTimes(3);
    });

    it('should average metrics across folds', async () => {
      config.crossValidationFolds = 2;
      const cvTrainer = new NeuralTrainer(config, mockMemoryManager);

      const result = await cvTrainer.train();

      // Metrics should be averaged
      expect(result.metrics.accuracy).toBeGreaterThan(0);
      expect(result.metrics.accuracy).toBeLessThanOrEqual(1);
    });
  });

  describe('hyperparameter tuning', () => {
    const mockPatterns = Array.from({ length: 30 }, (_, i) => ({
      pattern_id: `p${i}`,
      pattern_type: 'unit',
      coverage: 0.8,
      created_at: Date.now()
    }));

    const mockMetrics = Array.from({ length: 30 }, (_, i) => ({
      pattern_id: `p${i}`,
      success_rate: 0.9,
      avg_execution_time: 100
    }));

    beforeEach(() => {
      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);
    });

    it('should perform grid search for hyperparameters', async () => {
      const tuningConfig: HyperparameterConfig = {
        learningRates: [0.001, 0.01],
        batchSizes: [16, 32],
        hiddenLayerConfigs: [[8, 4], [16, 8]],
        dropoutRates: [0.1, 0.2],
        trialsPerConfig: 1,
        maxTrials: 4 // Limit trials for faster test
      };

      const trialSpy = jest.fn();
      trainer.on('tuning:trial:completed', trialSpy);

      const result = await trainer.tuneHyperparameters(tuningConfig);

      expect(result.bestConfig).toBeDefined();
      expect(result.bestMetrics).toBeDefined();
      expect(result.trials.length).toBeGreaterThan(0);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(trialSpy).toHaveBeenCalled();
    });

    it('should find best configuration', async () => {
      const tuningConfig: HyperparameterConfig = {
        learningRates: [0.001],
        batchSizes: [32],
        hiddenLayerConfigs: [[8, 4]],
        dropoutRates: [0.2],
        trialsPerConfig: 1,
        maxTrials: 1
      };

      const result = await trainer.tuneHyperparameters(tuningConfig);

      expect(result.bestConfig.learningRate).toBe(0.001);
      expect(result.bestConfig.batchSize).toBe(32);
      expect(result.bestMetrics.accuracy).toBeGreaterThan(0);
    });

    it('should respect max trials limit', async () => {
      const tuningConfig: HyperparameterConfig = {
        learningRates: [0.001, 0.01, 0.1],
        batchSizes: [16, 32, 64],
        hiddenLayerConfigs: [[8], [16]],
        dropoutRates: [0.1, 0.2],
        trialsPerConfig: 1,
        maxTrials: 3
      };

      const result = await trainer.tuneHyperparameters(tuningConfig);

      expect(result.trials.length).toBeLessThanOrEqual(3);
    });

    it('should emit tuning events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      trainer.on('tuning:started', startSpy);
      trainer.on('tuning:completed', completeSpy);

      const tuningConfig: HyperparameterConfig = {
        learningRates: [0.001],
        batchSizes: [32],
        hiddenLayerConfigs: [[8, 4]],
        dropoutRates: [0.2],
        trialsPerConfig: 1,
        maxTrials: 1
      };

      await trainer.tuneHyperparameters(tuningConfig);

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('model evaluation', () => {
    beforeEach(async () => {
      const mockPatterns = Array.from({ length: 50 }, (_, i) => ({
        pattern_id: `p${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const mockMetrics = Array.from({ length: 50 }, (_, i) => ({
        pattern_id: `p${i}`,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      await trainer.train();
    });

    it('should evaluate model with custom test data', async () => {
      const testData: TrainingDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
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

      const metrics = await trainer.evaluate(testData);

      expect(metrics).toBeDefined();
      expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
      expect(metrics.accuracy).toBeLessThanOrEqual(1);
    });

    it('should use default test data if not provided', async () => {
      const metrics = await trainer.evaluate();

      expect(metrics).toBeDefined();
    });

    it('should emit evaluation events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      trainer.on('evaluation:started', startSpy);
      trainer.on('evaluation:completed', completeSpy);

      await trainer.evaluate();

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('incremental training', () => {
    beforeEach(async () => {
      const mockPatterns = Array.from({ length: 30 }, (_, i) => ({
        pattern_id: `p${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const mockMetrics = Array.from({ length: 30 }, (_, i) => ({
        pattern_id: `p${i}`,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      await trainer.train();
    });

    it('should perform incremental training with new data', async () => {
      const newData: TrainingDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
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

      const eventSpy = jest.fn();
      trainer.on('incremental:training:completed', eventSpy);

      // Mock empty data for incremental train
      mockMemoryManager.retrievePatterns.mockResolvedValue([]);
      mockMemoryManager.retrieveMetrics.mockResolvedValue([]);

      const result = await trainer.incrementalTrain(newData);

      expect(result).toBeDefined();
      expect(result.metrics.accuracy).toBeGreaterThan(0);
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should emit incremental training events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      trainer.on('incremental:training:started', startSpy);
      trainer.on('incremental:training:completed', completeSpy);

      const newData: TrainingDataPoint[] = Array.from({ length: 5 }, (_, i) => ({
        features: Array.from({ length: 12 }, () => Math.random()),
        labels: [1, 0],
        metadata: {
          testId: `new-test-${i}`,
          codePattern: 'unit',
          timestamp: Date.now(),
          success: true,
          coverage: 0.8
        }
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue([]);
      mockMemoryManager.retrieveMetrics.mockResolvedValue([]);

      await trainer.incrementalTrain(newData);

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('prediction', () => {
    beforeEach(async () => {
      const mockPatterns = Array.from({ length: 30 }, (_, i) => ({
        pattern_id: `p${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const mockMetrics = Array.from({ length: 30 }, (_, i) => ({
        pattern_id: `p${i}`,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      await trainer.train();
    });

    it('should make predictions using trained model', async () => {
      const codePattern = {
        cyclomaticComplexity: 5,
        linesOfCode: 100,
        hasLoops: true
      };

      mockReasoningBank.findSimilarPatterns.mockResolvedValue([]);

      const prediction = await trainer.predict(codePattern);

      expect(prediction).toBeDefined();
      expect(prediction.pattern.confidence).toBeGreaterThan(0);
      expect(prediction.pattern.testCases).toBeDefined();
    });
  });

  describe('training history', () => {
    it('should track training history', async () => {
      const mockPatterns = Array.from({ length: 20 }, (_, i) => ({
        pattern_id: `p${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const mockMetrics = Array.from({ length: 20 }, (_, i) => ({
        pattern_id: `p${i}`,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      await trainer.train();

      const history = trainer.getTrainingHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
