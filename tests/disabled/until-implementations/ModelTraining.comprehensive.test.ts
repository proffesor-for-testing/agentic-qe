import { ModelTrainingSystem } from '@learning/ModelTrainingSystem';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { EventBus } from '@core/EventBus';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('ModelTraining Comprehensive Tests', () => {
  let trainingSystem: ModelTrainingSystem;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  const testDbPath = path.join(process.cwd(), '.swarm/test-model-training.db');

  beforeAll(async () => {
    await fs.ensureDir(path.dirname(testDbPath));
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();
    eventBus = EventBus.getInstance();
    await eventBus.initialize();
  });

  beforeEach(() => {
    trainingSystem = new ModelTrainingSystem(memoryStore, eventBus);
  });

  afterAll(async () => {
    await eventBus.shutdown();
    await memoryStore.close();
    await fs.remove(testDbPath);
  });

  describe('Model Training', () => {
    it('should train classification model', async () => {
      const data = [
        { features: [1, 2, 3], label: 'A' },
        { features: [4, 5, 6], label: 'B' },
        { features: [1.5, 2.5, 3.5], label: 'A' }
      ];
      const model = await trainingSystem.trainClassifier(data);
      expect(model.accuracy).toBeGreaterThan(0.5);
    });

    it('should train regression model', async () => {
      const data = [
        { features: [1], target: 2 },
        { features: [2], target: 4 },
        { features: [3], target: 6 }
      ];
      const model = await trainingSystem.trainRegressor(data);
      expect(model.rmse).toBeLessThan(0.5);
    });

    it('should implement gradient descent', async () => {
      const weights = [0, 0];
      const data = [
        { x: [1, 2], y: 3 },
        { x: [2, 3], y: 5 }
      ];
      const optimized = await trainingSystem.gradientDescent(weights, data, 0.01, 100);
      expect(optimized).not.toEqual([0, 0]);
    });

    it('should implement backpropagation', async () => {
      const network = {
        layers: [2, 3, 1],
        weights: [
          [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
          [[0.1], [0.2], [0.3]]
        ]
      };
      const data = [{ input: [1, 2], expected: 3 }];
      const trained = await trainingSystem.backpropagate(network, data, 0.1);
      expect(trained.weights).not.toEqual(network.weights);
    });

    it('should implement stochastic gradient descent', async () => {
      const data = Array(100).fill(null).map(() => ({
        features: [Math.random()],
        label: Math.random() > 0.5 ? 1 : 0
      }));
      const model = await trainingSystem.sgd(data, 0.01, 10);
      expect(model.converged).toBe(true);
    });

    it('should implement mini-batch training', async () => {
      const data = Array(1000).fill(null).map((_, i) => ({
        features: [i % 10],
        label: i % 2
      }));
      const model = await trainingSystem.miniBatchTrain(data, 32, 10);
      expect(model.loss).toBeLessThan(1);
    });

    it('should implement early stopping', async () => {
      const model = await trainingSystem.trainWithEarlyStopping(
        Array(100).fill({ features: [1], label: 0 }),
        { patience: 5, minDelta: 0.001 }
      );
      expect(model.epochsStopped).toBeLessThan(100);
    });

    it('should implement learning rate scheduling', async () => {
      const schedule = await trainingSystem.learningRateSchedule({
        initial: 0.1,
        strategy: 'exponential-decay',
        epochs: 100
      });
      expect(schedule[99]).toBeLessThan(schedule[0]);
    });

    it('should implement momentum optimization', async () => {
      const optimizer = await trainingSystem.momentumOptimizer({
        learningRate: 0.01,
        momentum: 0.9
      });
      expect(optimizer).toHaveProperty('update');
    });

    it('should implement Adam optimizer', async () => {
      const optimizer = await trainingSystem.adamOptimizer({
        learningRate: 0.001,
        beta1: 0.9,
        beta2: 0.999
      });
      expect(optimizer).toHaveProperty('update');
    });
  });

  describe('Model Evaluation', () => {
    it('should calculate accuracy', async () => {
      const predictions = [1, 0, 1, 1, 0];
      const actual = [1, 0, 1, 0, 0];
      const accuracy = await trainingSystem.calculateAccuracy(predictions, actual);
      expect(accuracy).toBe(0.8);
    });

    it('should calculate precision and recall', async () => {
      const predictions = [1, 1, 0, 1, 0];
      const actual = [1, 0, 0, 1, 0];
      const metrics = await trainingSystem.calculatePrecisionRecall(predictions, actual);
      expect(metrics.precision).toBeCloseTo(0.67, 1);
      expect(metrics.recall).toBe(1);
    });

    it('should calculate F1 score', async () => {
      const precision = 0.8;
      const recall = 0.6;
      const f1 = await trainingSystem.calculateF1(precision, recall);
      expect(f1).toBeCloseTo(0.686, 2);
    });

    it('should generate confusion matrix', async () => {
      const predictions = [0, 1, 0, 1, 1];
      const actual = [0, 1, 1, 1, 0];
      const matrix = await trainingSystem.confusionMatrix(predictions, actual);
      expect(matrix).toHaveLength(2);
      expect(matrix[0]).toHaveLength(2);
    });

    it('should calculate ROC AUC', async () => {
      const scores = [0.9, 0.8, 0.4, 0.3, 0.1];
      const labels = [1, 1, 0, 0, 0];
      const auc = await trainingSystem.calculateROC(scores, labels);
      expect(auc).toBeGreaterThan(0.5);
    });

    it('should perform cross-validation', async () => {
      const data = Array(100).fill(null).map((_, i) => ({
        features: [i],
        label: i % 2
      }));
      const results = await trainingSystem.crossValidate(data, 5);
      expect(results.scores).toHaveLength(5);
    });

    it('should calculate mean squared error', async () => {
      const predictions = [2, 3, 4];
      const actual = [2.5, 3.2, 3.8];
      const mse = await trainingSystem.calculateMSE(predictions, actual);
      expect(mse).toBeGreaterThan(0);
    });

    it('should calculate R-squared', async () => {
      const predictions = [2, 4, 6];
      const actual = [2, 4, 6];
      const r2 = await trainingSystem.calculateR2(predictions, actual);
      expect(r2).toBe(1);
    });
  });

  describe('Feature Engineering', () => {
    it('should normalize features', async () => {
      const features = [[1, 10], [2, 20], [3, 30]];
      const normalized = await trainingSystem.normalize(features);
      expect(normalized[0][0]).toBeCloseTo(0, 1);
      expect(normalized[2][0]).toBeCloseTo(1, 1);
    });

    it('should standardize features', async () => {
      const features = [[1], [2], [3]];
      const standardized = await trainingSystem.standardize(features);
      const mean = standardized.reduce((a, b) => a + b[0], 0) / 3;
      expect(mean).toBeCloseTo(0, 1);
    });

    it('should perform PCA', async () => {
      const features = [
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 5]
      ];
      const reduced = await trainingSystem.pca(features, 2);
      expect(reduced[0]).toHaveLength(2);
    });

    it('should perform feature selection', async () => {
      const features = [
        [1, 2, 3, 4],
        [2, 3, 4, 5]
      ];
      const labels = [0, 1];
      const selected = await trainingSystem.selectFeatures(features, labels, 2);
      expect(selected.indices).toHaveLength(2);
    });

    it('should create polynomial features', async () => {
      const features = [[1], [2]];
      const poly = await trainingSystem.polynomialFeatures(features, 2);
      expect(poly[0].length).toBeGreaterThan(1);
    });

    it('should perform one-hot encoding', async () => {
      const categories = ['A', 'B', 'A', 'C'];
      const encoded = await trainingSystem.oneHotEncode(categories);
      expect(encoded[0]).toHaveLength(3);
    });
  });

  describe('Model Persistence', () => {
    it('should save model', async () => {
      const model = {
        type: 'classifier',
        weights: [1, 2, 3],
        accuracy: 0.95
      };
      await trainingSystem.saveModel('test-model', model);
      const saved = await memoryStore.retrieve('aqe/models/test-model', {
        partition: 'learning'
      });
      expect(saved).toBeDefined();
    });

    it('should load model', async () => {
      const model = { weights: [1, 2, 3] };
      await memoryStore.store('aqe/models/saved-model', model, {
        partition: 'learning'
      });
      const loaded = await trainingSystem.loadModel('saved-model');
      expect(loaded.weights).toEqual([1, 2, 3]);
    });

    it('should version models', async () => {
      await trainingSystem.saveModel('model-v1', { version: 1 });
      await trainingSystem.saveModel('model-v2', { version: 2 });
      const versions = await trainingSystem.getModelVersions('model');
      expect(versions).toHaveLength(2);
    });
  });

  describe('Hyperparameter Tuning', () => {
    it('should perform grid search', async () => {
      const paramGrid = {
        learningRate: [0.01, 0.1],
        batchSize: [16, 32]
      };
      const data = Array(100).fill({ features: [1], label: 0 });
      const best = await trainingSystem.gridSearch(data, paramGrid);
      expect(best.params).toHaveProperty('learningRate');
    });

    it('should perform random search', async () => {
      const paramSpace = {
        learningRate: { min: 0.001, max: 0.1 },
        batchSize: { values: [16, 32, 64] }
      };
      const best = await trainingSystem.randomSearch(paramSpace, 10);
      expect(best.params).toBeDefined();
    });

    it('should implement Bayesian optimization', async () => {
      const objective = async (params: any) => {
        return -Math.pow(params.x - 5, 2);
      };
      const best = await trainingSystem.bayesianOptimize(objective, {
        x: { min: 0, max: 10 }
      }, 20);
      expect(best.x).toBeCloseTo(5, 0);
    });
  });

  describe('Ensemble Methods', () => {
    it('should implement bagging', async () => {
      const data = Array(100).fill(null).map((_, i) => ({
        features: [i],
        label: i % 2
      }));
      const ensemble = await trainingSystem.bagging(data, 5);
      expect(ensemble.models).toHaveLength(5);
    });

    it('should implement boosting', async () => {
      const data = Array(100).fill(null).map((_, i) => ({
        features: [i],
        label: i % 2
      }));
      const ensemble = await trainingSystem.boosting(data, 5);
      expect(ensemble.models).toHaveLength(5);
    });

    it('should implement stacking', async () => {
      const baseModels = ['model1', 'model2', 'model3'];
      const stacked = await trainingSystem.stacking(baseModels);
      expect(stacked.metaModel).toBeDefined();
    });
  });

  describe('Online Learning', () => {
    it('should support incremental learning', async () => {
      const model = await trainingSystem.createOnlineModel();
      await trainingSystem.incrementalUpdate(model, { features: [1], label: 0 });
      await trainingSystem.incrementalUpdate(model, { features: [2], label: 1 });
      expect(model.samples).toBe(2);
    });

    it('should handle concept drift', async () => {
      const model = await trainingSystem.createAdaptiveModel();
      await trainingSystem.detectDrift(model, [
        { features: [1], label: 0 },
        { features: [100], label: 1 }
      ]);
      expect(model.driftDetected).toBe(true);
    });
  });

  describe('Event Handling', () => {
    it('should emit training complete events', async () => {
      const eventPromise = new Promise(resolve => {
        eventBus.on('training:complete', resolve);
      });
      await trainingSystem.trainClassifier([
        { features: [1], label: 0 }
      ]);
      await expect(eventPromise).resolves.toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle training failures', async () => {
      const result = await trainingSystem.safeTrain(async () => {
        throw new Error('Training failed');
      });
      expect(result).toHaveProperty('error');
    });

    it('should handle invalid data', async () => {
      const result = await trainingSystem.trainClassifier([]);
      expect(result).toHaveProperty('error');
    });
  });
});
