/**
 * Neural Training Integration Tests
 *
 * Tests AgentDB integration with 9 RL algorithms for neural training
 */

import { NeuralTrainer } from '../../../src/core/neural/NeuralTrainer';
import { NeuralAgentExtension } from '../../../src/agents/NeuralAgentExtension';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { createAgentDBManager } from '../../../src/core/memory/AgentDBManager';
import {
  Experience,
  State,
  Action,
  RLAlgorithm,
  NeuralConfig
} from '../../../src/core/neural/types';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('Neural Training Integration', () => {
  let memoryStore: SwarmMemoryManager;
  let agentDB: ReturnType<typeof createAgentDBManager>;
  let neuralTrainer: NeuralTrainer;
  const testDbPath = './.test-agentdb/neural-test.db';
  const testModelPath = './.test-agentdb/models';

  beforeAll(async () => {
    // Clean up test directories
    await fs.remove('./.test-agentdb');
    await fs.ensureDir(path.dirname(testDbPath));
    await fs.ensureDir(testModelPath);

    // Initialize memory store
    memoryStore = new SwarmMemoryManager({
      coordinationPort: 0,
      memoryPort: 0,
      persistencePath: './.test-agentdb/memory'
    });
    await memoryStore.initialize();

    // Initialize AgentDB with learning enabled
    agentDB = createAgentDBManager({
      dbPath: testDbPath,
      enableLearning: true,
      enableReasoning: true,
      enableQUICSync: false,
      cacheSize: 100,
      quantizationType: 'scalar'
    });
    await agentDB.initialize();

    // Initialize neural trainer
    neuralTrainer = new NeuralTrainer(
      'test-agent',
      memoryStore,
      agentDB,
      {
        enabled: true,
        algorithm: 'q-learning',
        epochs: 10,
        batchSize: 16
      }
    );
    await neuralTrainer.initialize();
  });

  afterAll(async () => {
    await agentDB.close();
    await memoryStore.shutdown();
    await fs.remove('./.test-agentdb');
  });

  describe('NeuralTrainer', () => {
    describe('Initialization', () => {
      it('should initialize successfully', async () => {
        const status = neuralTrainer.getStatus();
        expect(status.enabled).toBe(true);
        expect(status.algorithm).toBe('q-learning');
        expect(status.episodeCount).toBe(0);
        expect(status.experienceCount).toBe(0);
      });

      it('should list all 9 available RL algorithms', () => {
        const algorithms = NeuralTrainer.getAvailableAlgorithms();
        expect(algorithms).toHaveLength(9);
        expect(algorithms).toContain('decision-transformer');
        expect(algorithms).toContain('q-learning');
        expect(algorithms).toContain('sarsa');
        expect(algorithms).toContain('actor-critic');
        expect(algorithms).toContain('ppo');
        expect(algorithms).toContain('ddpg');
        expect(algorithms).toContain('td3');
        expect(algorithms).toContain('sac');
        expect(algorithms).toContain('dqn');
      });

      it('should provide descriptions for each algorithm', () => {
        const algorithms = NeuralTrainer.getAvailableAlgorithms();
        algorithms.forEach(algo => {
          const description = NeuralTrainer.getAlgorithmDescription(algo);
          expect(description).toBeTruthy();
          expect(description.length).toBeGreaterThan(10);
        });
      });
    });

    describe('Experience Collection and Training', () => {
      it('should collect and train on experiences', async () => {
        const experiences: Experience[] = createTestExperiences(10);

        const result = await neuralTrainer.train(experiences);

        expect(result.algorithm).toBe('q-learning');
        expect(result.metrics.loss).toBeGreaterThan(0);
        expect(result.metrics.epochs).toBe(10);
        expect(result.episodeCount).toBe(10);
        expect(result.modelUpdated).toBe(true);

        const status = neuralTrainer.getStatus();
        expect(status.experienceCount).toBe(10);
      }, 30000);

      it('should train with different RL algorithms', async () => {
        const algorithms: RLAlgorithm[] = ['actor-critic', 'ppo', 'dqn'];
        const experiences = createTestExperiences(5);

        for (const algo of algorithms) {
          const result = await neuralTrainer.train(experiences, algo);

          expect(result.algorithm).toBe(algo);
          expect(result.metrics.loss).toBeDefined();
          expect(result.modelUpdated).toBe(true);
        }
      }, 60000);

      it('should accumulate experiences in buffer', async () => {
        neuralTrainer.clearExperiences();

        const batch1 = createTestExperiences(5);
        await neuralTrainer.train(batch1);

        const batch2 = createTestExperiences(5);
        await neuralTrainer.train(batch2);

        const status = neuralTrainer.getStatus();
        expect(status.experienceCount).toBe(10);
      });

      it('should limit buffer size', async () => {
        const trainerWithLimit = new NeuralTrainer(
          'test-agent-2',
          memoryStore,
          agentDB,
          {
            enabled: true,
            memorySize: 20 // Small buffer
          }
        );
        await trainerWithLimit.initialize();

        const experiences = createTestExperiences(30);
        await trainerWithLimit.train(experiences);

        const status = trainerWithLimit.getStatus();
        expect(status.experienceCount).toBeLessThanOrEqual(20);
      });
    });

    describe('Action Prediction', () => {
      it('should predict actions from trained model', async () => {
        // Train model first
        const experiences = createTestExperiences(20);
        await neuralTrainer.train(experiences);

        // Predict action for a state
        const state: State = {
          taskComplexity: 0.5,
          capabilities: ['test-generation'],
          contextFeatures: { framework: 'jest' },
          resourceAvailability: 0.8,
          previousAttempts: 0
        };

        const prediction = await neuralTrainer.predictAction(state);

        expect(prediction.action).toBeDefined();
        expect(prediction.action.type).toBeTruthy();
        expect(prediction.confidence).toBeGreaterThanOrEqual(0);
        expect(prediction.confidence).toBeLessThanOrEqual(1);
        expect(prediction.qValue).toBeDefined();
        expect(prediction.algorithm).toBe('q-learning');
        expect(prediction.alternativeActions).toBeDefined();
      });

      it('should predict with different algorithms', async () => {
        const state: State = {
          taskComplexity: 0.7,
          capabilities: ['coverage-analysis'],
          contextFeatures: {}
        };

        const algorithms: RLAlgorithm[] = ['sarsa', 'ddpg', 'sac'];

        for (const algo of algorithms) {
          const prediction = await neuralTrainer.predictAction(state, algo);
          expect(prediction.algorithm).toBe(algo);
          expect(prediction.action).toBeDefined();
        }
      });
    });

    describe('Model Persistence', () => {
      it('should save and load models', async () => {
        // Train a model
        const experiences = createTestExperiences(15);
        await neuralTrainer.train(experiences);

        // Save model
        const modelId = 'test-model-save-load';
        await neuralTrainer.saveModel(modelId, testModelPath);

        const modelPath = path.join(testModelPath, `${modelId}.json`);
        expect(await fs.pathExists(modelPath)).toBe(true);

        // Create new trainer and load model
        const newTrainer = new NeuralTrainer(
          'test-agent-new',
          memoryStore,
          agentDB
        );
        await newTrainer.initialize();

        const loadedModel = await newTrainer.loadModel(modelPath);

        expect(loadedModel.id).toBe(modelId);
        expect(loadedModel.algorithm).toBe('q-learning');
        expect(loadedModel.experienceCount).toBe(15);
      });

      it('should handle model save intervals', async () => {
        const trainerWithInterval = new NeuralTrainer(
          'test-agent-interval',
          memoryStore,
          agentDB,
          {
            enabled: true,
            modelSaveInterval: 10
          }
        );
        await trainerWithInterval.initialize();

        // Train with 9 experiences (should not save)
        await trainerWithInterval.train(createTestExperiences(9));
        let status = trainerWithInterval.getStatus();
        expect(status.episodeCount).toBe(9);

        // Train with 1 more (should trigger save at 10)
        await trainerWithInterval.train(createTestExperiences(1));
        status = trainerWithInterval.getStatus();
        expect(status.episodeCount).toBe(10);
      });
    });

    describe('Algorithm Switching', () => {
      it('should switch between RL algorithms', async () => {
        let status = neuralTrainer.getStatus();
        const initialAlgo = status.algorithm;

        await neuralTrainer.switchAlgorithm('actor-critic');

        status = neuralTrainer.getStatus();
        expect(status.algorithm).toBe('actor-critic');
        expect(status.algorithm).not.toBe(initialAlgo);
      });

      it('should train with switched algorithm', async () => {
        await neuralTrainer.switchAlgorithm('ppo');

        const experiences = createTestExperiences(10);
        const result = await neuralTrainer.train(experiences);

        expect(result.algorithm).toBe('ppo');
      });
    });

    describe('Training Metrics', () => {
      it('should track training metrics over time', async () => {
        neuralTrainer.clearExperiences();

        // Multiple training rounds
        for (let i = 0; i < 3; i++) {
          const experiences = createTestExperiences(5);
          await neuralTrainer.train(experiences);
        }

        const status = neuralTrainer.getStatus();
        expect(status.metrics.size).toBeGreaterThan(0);

        const qLearningMetrics = status.metrics.get('q-learning');
        expect(qLearningMetrics).toBeDefined();
        expect(qLearningMetrics!.length).toBeGreaterThan(0);

        qLearningMetrics!.forEach(metric => {
          expect(metric.loss).toBeGreaterThan(0);
          expect(metric.epochs).toBeGreaterThan(0);
          expect(metric.duration).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('NeuralAgentExtension', () => {
    let extension: NeuralAgentExtension;

    beforeEach(async () => {
      extension = new NeuralAgentExtension(
        'test-agent-ext',
        memoryStore,
        agentDB,
        {
          enabled: true,
          algorithm: 'q-learning'
        },
        {
          enabled: true,
          collectionInterval: 1,
          maxBuffer: 50,
          autoTrain: false // Manual training for tests
        }
      );
      await extension.initialize();
    });

    it('should collect experiences from task execution', async () => {
      const postTaskData = createMockPostTaskData(true, 0.9);

      await extension.collectExperience(postTaskData);

      const status = extension.getStatus();
      expect(status.experienceCount).toBe(1);
    });

    it('should calculate rewards correctly', async () => {
      // Successful task with high quality
      const successData = createMockPostTaskData(true, 0.95);
      await extension.collectExperience(successData);

      // Failed task
      const failData = createMockPostTaskData(false, 0.3);
      await extension.collectExperience(failData);

      const status = extension.getStatus();
      expect(status.experienceCount).toBe(2);
    });

    it('should collect error experiences', async () => {
      const errorData = {
        assignment: {
          id: 'task-1',
          task: { type: 'test-generation', context: {} },
          agentId: 'test-agent',
          assignedAt: new Date(),
          status: 'failed' as const
        },
        error: new Error('Test error')
      };

      await extension.collectErrorExperience(errorData);

      const status = extension.getStatus();
      expect(status.experienceCount).toBe(1);
    });

    it('should trigger auto-training when buffer is full', async () => {
      const autoTrainExt = new NeuralAgentExtension(
        'test-agent-autotrain',
        memoryStore,
        agentDB,
        { enabled: true },
        { enabled: true, maxBuffer: 5, autoTrain: true }
      );
      await autoTrainExt.initialize();

      // Add experiences to fill buffer
      for (let i = 0; i < 5; i++) {
        const taskData = createMockPostTaskData(true, 0.8);
        await autoTrainExt.collectExperience(taskData);
      }

      const status = autoTrainExt.getStatus();
      // Buffer should have been cleared after auto-training
      expect(status.experienceCount).toBeLessThanOrEqual(5);
    }, 30000);

    it('should predict actions', async () => {
      // Train first
      const trainer = extension.getTrainer();
      await trainer.train(createTestExperiences(10));

      // Predict
      const state: State = {
        taskComplexity: 0.6,
        capabilities: ['test-execution']
      };

      const prediction = await extension.predictAction(state);
      expect(prediction).toBeDefined();
      expect(prediction.action).toBeDefined();
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should save and load models', async () => {
      await extension.getTrainer().train(createTestExperiences(10));

      await extension.saveModel(testModelPath);

      const modelFiles = await fs.readdir(testModelPath);
      expect(modelFiles.some(f => f.includes('test-agent-ext'))).toBe(true);
    });

    it('should switch algorithms', async () => {
      await extension.switchAlgorithm('sac');

      const status = extension.getStatus();
      expect(status.algorithm).toBe('sac');
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createTestExperiences(count: number): Experience[] {
  const experiences: Experience[] = [];

  for (let i = 0; i < count; i++) {
    const state: State = {
      taskComplexity: Math.random(),
      capabilities: ['test-generation', 'coverage-analysis'],
      contextFeatures: {
        framework: 'jest',
        iteration: i
      },
      resourceAvailability: 0.8 + Math.random() * 0.2,
      previousAttempts: Math.floor(Math.random() * 3)
    };

    const action: Action = {
      type: ['parallel', 'sequential', 'adaptive'][Math.floor(Math.random() * 3)],
      parameters: {
        parallelization: Math.random(),
        retryPolicy: 'exponential'
      }
    };

    const reward = Math.random() > 0.3 ? Math.random() : -Math.random();

    const nextState: State = {
      ...state,
      previousAttempts: state.previousAttempts + 1,
      resourceAvailability: state.resourceAvailability * 0.9
    };

    experiences.push({
      id: `exp-${i}`,
      state,
      action,
      reward,
      nextState,
      done: Math.random() > 0.2,
      timestamp: new Date()
    });
  }

  return experiences;
}

function createMockPostTaskData(success: boolean, quality: number): any {
  return {
    assignment: {
      id: `task-${Date.now()}`,
      task: {
        type: 'test-generation',
        requirements: {
          capabilities: ['test-generation']
        },
        context: {
          framework: 'jest'
        }
      },
      agentId: 'test-agent',
      assignedAt: new Date(),
      status: success ? 'completed' : 'failed'
    },
    result: {
      success,
      quality,
      coverage: quality,
      executionTime: 5000 + Math.random() * 5000,
      strategy: 'adaptive',
      toolsUsed: ['jest'],
      errors: success ? [] : ['Test error']
    }
  };
}
