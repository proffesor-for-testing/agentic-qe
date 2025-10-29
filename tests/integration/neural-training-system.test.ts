/**
 * Integration tests for Neural Training System
 *
 * Tests the complete workflow of:
 * - Data loading from SwarmMemoryManager
 * - Model training with NeuralTrainer
 * - Pattern prediction with NeuralPatternMatcher
 * - Integration with QEReasoningBank
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  NeuralPatternMatcher,
  ModelBackend,
  NeuralArchitecture
} from '@learning/NeuralPatternMatcher';
import {
  NeuralTrainer,
  TrainingConfig
} from '@learning/NeuralTrainer';

describe('Neural Training System Integration', () => {
  let mockMemoryManager: any;
  let mockReasoningBank: any;
  let testModelPath: string;

  beforeAll(() => {
    testModelPath = path.join(process.cwd(), '.test-models');
  });

  beforeEach(() => {
    mockMemoryManager = {
      retrievePatterns: jest.fn(),
      retrieveMetrics: jest.fn(),
      storePattern: jest.fn()
    };

    mockReasoningBank = {
      storeTrainingMetrics: jest.fn(),
      findSimilarPatterns: jest.fn()
    };
  });

  afterEach(async () => {
    // Cleanup test models
    try {
      await fs.rm(testModelPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('End-to-End Training Workflow', () => {
    it('should complete full training workflow', async () => {
      // Arrange: Create realistic training data
      const mockPatterns = Array.from({ length: 100 }, (_, i) => ({
        pattern_id: `pattern-${i}`,
        pattern_type: i % 3 === 0 ? 'unit' : i % 3 === 1 ? 'integration' : 'e2e',
        coverage: 0.7 + Math.random() * 0.3,
        created_at: Date.now() - i * 1000,
        cyclomaticComplexity: Math.floor(Math.random() * 10) + 1,
        linesOfCode: Math.floor(Math.random() * 500) + 50,
        numberOfFunctions: Math.floor(Math.random() * 20) + 1,
        numberOfBranches: Math.floor(Math.random() * 15) + 1
      }));

      const mockMetrics = mockPatterns.map(pattern => ({
        pattern_id: pattern.pattern_id,
        success_rate: 0.8 + Math.random() * 0.2,
        avg_execution_time: Math.floor(Math.random() * 1000) + 100,
        flaky_score: Math.random() * 0.2,
        failure_rate: Math.random() * 0.1
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);
      mockReasoningBank.findSimilarPatterns.mockResolvedValue([]);

      // Configure training
      const architecture: NeuralArchitecture = {
        inputSize: 12,
        hiddenLayers: [16, 8],
        outputSize: 2,
        activation: 'relu',
        dropout: 0.2,
        learningRate: 0.01,
        batchSize: 16,
        epochs: 20
      };

      const config: TrainingConfig = {
        backend: ModelBackend.SIMPLE_NN,
        architecture,
        validationSplit: 0.2,
        dataAugmentation: true,
        modelPath: testModelPath
      };

      // Act: Train model
      const trainer = new NeuralTrainer(config, mockMemoryManager, mockReasoningBank);

      const trainingResult = await trainer.train();

      // Assert: Verify training completed successfully
      expect(trainingResult).toBeDefined();
      expect(trainingResult.metrics.accuracy).toBeGreaterThan(0);
      expect(trainingResult.metrics.accuracy).toBeLessThanOrEqual(1);
      expect(trainingResult.totalTime).toBeGreaterThan(0);
      expect(trainingResult.modelVersion).toBeDefined();

      // Verify model can make predictions
      const codePattern = {
        cyclomaticComplexity: 5,
        linesOfCode: 150,
        numberOfFunctions: 8,
        numberOfBranches: 6,
        hasLoops: true,
        hasConditionals: true,
        hasAsyncOperations: false
      };

      const prediction = await trainer.predict(codePattern);

      expect(prediction).toBeDefined();
      expect(prediction.pattern.confidence).toBeGreaterThan(0);
      expect(prediction.pattern.testCases.length).toBeGreaterThan(0);
      expect(prediction.modelInfo.accuracy).toBeGreaterThan(0);

      // Verify model was saved
      await trainer.saveModel();
    }, 30000); // Increase timeout for training

    it('should handle incremental training workflow', async () => {
      // Initial training
      const initialPatterns = Array.from({ length: 50 }, (_, i) => ({
        pattern_id: `pattern-${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const initialMetrics = initialPatterns.map(p => ({
        pattern_id: p.pattern_id,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(initialPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(initialMetrics);

      const architecture: NeuralArchitecture = {
        inputSize: 12,
        hiddenLayers: [8, 4],
        outputSize: 2,
        activation: 'relu',
        learningRate: 0.01,
        batchSize: 16,
        epochs: 10
      };

      const config: TrainingConfig = {
        backend: ModelBackend.SIMPLE_NN,
        architecture,
        validationSplit: 0.2,
        dataAugmentation: false,
        modelPath: testModelPath
      };

      const trainer = new NeuralTrainer(config, mockMemoryManager);

      // Initial training
      const initialResult = await trainer.train();
      expect(initialResult.metrics.accuracy).toBeGreaterThan(0);

      // Incremental training with new data
      const newData = Array.from({ length: 20 }, (_, i) => ({
        features: Array.from({ length: 12 }, () => Math.random()),
        labels: [0, 1],
        metadata: {
          testId: `new-test-${i}`,
          codePattern: 'integration',
          timestamp: Date.now(),
          success: false,
          coverage: 0.7
        }
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue([]);
      mockMemoryManager.retrieveMetrics.mockResolvedValue([]);

      const incrementalResult = await trainer.incrementalTrain(newData);

      expect(incrementalResult).toBeDefined();
      expect(incrementalResult.metrics.accuracy).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Model Persistence and Loading', () => {
    it('should save and load model successfully', async () => {
      // Train a model
      const mockPatterns = Array.from({ length: 30 }, (_, i) => ({
        pattern_id: `pattern-${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const mockMetrics = mockPatterns.map(p => ({
        pattern_id: p.pattern_id,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      const architecture: NeuralArchitecture = {
        inputSize: 12,
        hiddenLayers: [8, 4],
        outputSize: 2,
        activation: 'relu',
        learningRate: 0.01,
        batchSize: 16,
        epochs: 5
      };

      const config: TrainingConfig = {
        backend: ModelBackend.SIMPLE_NN,
        architecture,
        validationSplit: 0.2,
        dataAugmentation: false,
        modelPath: testModelPath
      };

      const trainer = new NeuralTrainer(config, mockMemoryManager);
      await trainer.train();
      await trainer.saveModel();

      // Load model in new instance
      const newTrainer = new NeuralTrainer(config, mockMemoryManager);
      await newTrainer.loadModel();

      const matcher = newTrainer.getPatternMatcher();
      const info = matcher.getModelInfo();

      expect(info.lastTrained).toBeGreaterThan(0);
      expect(info.metrics).toBeDefined();

      // Verify loaded model can make predictions
      mockReasoningBank.findSimilarPatterns.mockResolvedValue([]);

      const prediction = await newTrainer.predict({
        cyclomaticComplexity: 3,
        linesOfCode: 100
      });

      expect(prediction).toBeDefined();
      expect(prediction.pattern.confidence).toBeGreaterThan(0);
    }, 20000);
  });

  describe('Integration with QEReasoningBank', () => {
    it('should store training metrics in reasoning bank', async () => {
      const mockPatterns = Array.from({ length: 30 }, (_, i) => ({
        pattern_id: `pattern-${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const mockMetrics = mockPatterns.map(p => ({
        pattern_id: p.pattern_id,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      const architecture: NeuralArchitecture = {
        inputSize: 12,
        hiddenLayers: [8, 4],
        outputSize: 2,
        activation: 'relu',
        learningRate: 0.01,
        batchSize: 16,
        epochs: 5
      };

      const config: TrainingConfig = {
        backend: ModelBackend.SIMPLE_NN,
        architecture,
        validationSplit: 0.2,
        dataAugmentation: false,
        modelPath: testModelPath
      };

      const trainer = new NeuralTrainer(config, mockMemoryManager, mockReasoningBank);
      await trainer.train();

      // Verify reasoning bank was called
      expect(mockReasoningBank.storeTrainingMetrics).toHaveBeenCalled();

      const call = mockReasoningBank.storeTrainingMetrics.mock.calls[0][0];
      expect(call.modelVersion).toBeDefined();
      expect(call.backend).toBe(ModelBackend.SIMPLE_NN);
      expect(call.metrics).toBeDefined();
    }, 20000);

    it('should use similar patterns for predictions', async () => {
      const mockPatterns = Array.from({ length: 30 }, (_, i) => ({
        pattern_id: `pattern-${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const mockMetrics = mockPatterns.map(p => ({
        pattern_id: p.pattern_id,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      const similarPatterns = [
        {
          pattern_id: 'similar-1',
          test_cases: ['test case 1', 'test case 2'],
          similarity_score: 0.95
        },
        {
          pattern_id: 'similar-2',
          test_cases: ['test case 3', 'test case 4'],
          similarity_score: 0.85
        }
      ];

      mockReasoningBank.findSimilarPatterns.mockResolvedValue(similarPatterns);

      const architecture: NeuralArchitecture = {
        inputSize: 12,
        hiddenLayers: [8, 4],
        outputSize: 2,
        activation: 'relu',
        learningRate: 0.01,
        batchSize: 16,
        epochs: 5
      };

      const config: TrainingConfig = {
        backend: ModelBackend.SIMPLE_NN,
        architecture,
        validationSplit: 0.2,
        dataAugmentation: false,
        modelPath: testModelPath
      };

      const trainer = new NeuralTrainer(config, mockMemoryManager, mockReasoningBank);
      await trainer.train();

      const prediction = await trainer.predict({
        cyclomaticComplexity: 4,
        linesOfCode: 120,
        hasLoops: true
      });

      // Verify similar patterns were queried
      expect(mockReasoningBank.findSimilarPatterns).toHaveBeenCalled();

      // Verify test cases include similar patterns
      expect(prediction.pattern.testCases).toContain('test case 1');
      expect(prediction.pattern.testCases).toContain('test case 2');
    }, 20000);
  });

  describe('Hyperparameter Tuning', () => {
    it('should find optimal hyperparameters', async () => {
      const mockPatterns = Array.from({ length: 50 }, (_, i) => ({
        pattern_id: `pattern-${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now(),
        cyclomaticComplexity: Math.floor(Math.random() * 10) + 1,
        linesOfCode: Math.floor(Math.random() * 500) + 50
      }));

      const mockMetrics = mockPatterns.map(p => ({
        pattern_id: p.pattern_id,
        success_rate: 0.85 + Math.random() * 0.15,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      const architecture: NeuralArchitecture = {
        inputSize: 12,
        hiddenLayers: [8, 4],
        outputSize: 2,
        activation: 'relu',
        learningRate: 0.01,
        batchSize: 16,
        epochs: 5
      };

      const config: TrainingConfig = {
        backend: ModelBackend.SIMPLE_NN,
        architecture,
        validationSplit: 0.2,
        dataAugmentation: false,
        modelPath: testModelPath
      };

      const trainer = new NeuralTrainer(config, mockMemoryManager);

      const tuningConfig = {
        learningRates: [0.001, 0.01],
        batchSizes: [16, 32],
        hiddenLayerConfigs: [[8, 4], [16, 8]],
        dropoutRates: [0.1, 0.2],
        trialsPerConfig: 1,
        maxTrials: 4
      };

      const result = await trainer.tuneHyperparameters(tuningConfig);

      expect(result.bestConfig).toBeDefined();
      expect(result.bestMetrics).toBeDefined();
      expect(result.bestMetrics.accuracy).toBeGreaterThan(0);
      expect(result.trials.length).toBeGreaterThan(0);
      expect(result.trials.length).toBeLessThanOrEqual(4);

      // Verify best config is within search space
      expect(tuningConfig.learningRates).toContain(result.bestConfig.learningRate);
      expect(tuningConfig.batchSizes).toContain(result.bestConfig.batchSize);
    }, 40000);
  });

  describe('Event Emission', () => {
    it('should emit all training lifecycle events', async () => {
      const mockPatterns = Array.from({ length: 20 }, (_, i) => ({
        pattern_id: `pattern-${i}`,
        pattern_type: 'unit',
        coverage: 0.8,
        created_at: Date.now()
      }));

      const mockMetrics = mockPatterns.map(p => ({
        pattern_id: p.pattern_id,
        success_rate: 0.9,
        avg_execution_time: 100
      }));

      mockMemoryManager.retrievePatterns.mockResolvedValue(mockPatterns);
      mockMemoryManager.retrieveMetrics.mockResolvedValue(mockMetrics);

      const architecture: NeuralArchitecture = {
        inputSize: 12,
        hiddenLayers: [8, 4],
        outputSize: 2,
        activation: 'relu',
        learningRate: 0.01,
        batchSize: 16,
        epochs: 3
      };

      const config: TrainingConfig = {
        backend: ModelBackend.SIMPLE_NN,
        architecture,
        validationSplit: 0.2,
        dataAugmentation: false,
        modelPath: testModelPath
      };

      const trainer = new NeuralTrainer(config, mockMemoryManager);

      const events: string[] = [];

      trainer.on('training:started', () => events.push('training:started'));
      trainer.on('preprocessing:started', () => events.push('preprocessing:started'));
      trainer.on('preprocessing:completed', () => events.push('preprocessing:completed'));
      trainer.on('training:completed', () => events.push('training:completed'));

      await trainer.train();

      expect(events).toContain('training:started');
      expect(events).toContain('preprocessing:started');
      expect(events).toContain('preprocessing:completed');
      expect(events).toContain('training:completed');
    }, 20000);
  });
});
