/**
 * Algorithm Switching Integration Tests
 *
 * Tests dynamic switching between RL algorithms (Q-Learning, SARSA)
 * and state transfer between algorithms.
 */

import { LearningEngine, RLAlgorithmType } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { QLearning } from '../../src/learning/QLearning';
import { SARSALearner } from '../../src/learning/algorithms/SARSALearner';
import { TaskState, AgentAction } from '../../src/learning/types';

describe('Algorithm Switching Integration', () => {
  let memoryStore: SwarmMemoryManager;
  let learningEngine: LearningEngine;

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager(':memory:', {
      enablePatternLearning: true,
      enableNeuralFeatures: false
    });
    await memoryStore.initialize();
  });

  afterEach(async () => {
    if (memoryStore) {
      await memoryStore.dispose();
    }
  });

  const createState = (complexity: number = 0.5): TaskState => ({
    taskComplexity: complexity,
    requiredCapabilities: ['test'],
    contextFeatures: {},
    previousAttempts: 0,
    availableResources: 1.0
  });

  const createAction = (strategy: string): AgentAction => ({
    strategy,
    toolsUsed: [],
    parallelization: 0.5,
    retryPolicy: 'exponential',
    resourceAllocation: 0.5
  });

  describe('Algorithm Selection', () => {
    it('should initialize with Q-Learning by default', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore);
      await learningEngine.initialize();

      expect(learningEngine.getAlgorithm()).toBe('q-learning');
      expect(learningEngine.isQLearningEnabled()).toBe(true);
    });

    it('should initialize with SARSA when specified', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'sarsa'
      });
      await learningEngine.initialize();

      expect(learningEngine.getAlgorithm()).toBe('sarsa');
      expect(learningEngine.isQLearningEnabled()).toBe(false);
    });

    it('should initialize with legacy mode when specified', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'legacy'
      });
      await learningEngine.initialize();

      expect(learningEngine.getAlgorithm()).toBe('legacy');
      expect(learningEngine.isQLearningEnabled()).toBe(false);
    });
  });

  describe('Dynamic Algorithm Switching', () => {
    it('should switch from Q-Learning to SARSA', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning'
      });
      await learningEngine.initialize();

      expect(learningEngine.getAlgorithm()).toBe('q-learning');

      // Switch to SARSA
      learningEngine.setAlgorithm('sarsa');

      expect(learningEngine.getAlgorithm()).toBe('sarsa');
      const rlAlgorithm = learningEngine.getRLAlgorithm();
      expect(rlAlgorithm).toBeInstanceOf(SARSALearner);
    });

    it('should switch from SARSA to Q-Learning', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'sarsa'
      });
      await learningEngine.initialize();

      expect(learningEngine.getAlgorithm()).toBe('sarsa');

      // Switch to Q-Learning
      learningEngine.setAlgorithm('q-learning');

      expect(learningEngine.getAlgorithm()).toBe('q-learning');
      const rlAlgorithm = learningEngine.getRLAlgorithm();
      expect(rlAlgorithm).toBeInstanceOf(QLearning);
    });

    it('should switch to legacy mode from Q-Learning', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning'
      });
      await learningEngine.initialize();

      learningEngine.setAlgorithm('legacy');

      expect(learningEngine.getAlgorithm()).toBe('legacy');
      expect(learningEngine.getRLAlgorithm()).toBeUndefined();
    });

    it('should throw error for unknown algorithm', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore);
      await learningEngine.initialize();

      expect(() => {
        learningEngine.setAlgorithm('unknown-algo' as RLAlgorithmType);
      }).toThrow('Unknown RL algorithm');
    });
  });

  describe('State Transfer Between Algorithms', () => {
    it('should preserve Q-values when switching from Q-Learning to SARSA', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning',
        learningRate: 0.1
      });
      await learningEngine.initialize();

      const state = createState();
      const action = createAction('test-strategy');

      // Learn with Q-Learning
      const result = {
        success: true,
        strategy: 'test-strategy',
        executionTime: 1000,
        errors: []
      };

      await learningEngine.learnFromExecution({ id: 'task1', type: 'test' }, result);
      await learningEngine.learnFromExecution({ id: 'task2', type: 'test' }, result);

      const qLearningAlgo = learningEngine.getRLAlgorithm();
      const qValueBefore = qLearningAlgo!.getQValue(state, action);
      const tableSize = qLearningAlgo!.getTableSize();

      // Switch to SARSA
      learningEngine.setAlgorithm('sarsa');

      const sarsaAlgo = learningEngine.getRLAlgorithm();
      const qValueAfter = sarsaAlgo!.getQValue(state, action);

      // Q-values should be preserved (approximately, due to state encoding)
      expect(sarsaAlgo!.getTableSize()).toBeGreaterThanOrEqual(tableSize);

      // If the state-action pair exists, values should match
      if (qValueBefore !== 0) {
        expect(qValueAfter).toBeCloseTo(qValueBefore, 5);
      }
    });

    it('should preserve Q-values when switching from SARSA to Q-Learning', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'sarsa',
        learningRate: 0.1
      });
      await learningEngine.initialize();

      const state = createState();
      const action = createAction('test-strategy');

      // Learn with SARSA
      const result = {
        success: true,
        strategy: 'test-strategy',
        executionTime: 1000,
        errors: []
      };

      await learningEngine.learnFromExecution({ id: 'task1', type: 'test' }, result);
      await learningEngine.learnFromExecution({ id: 'task2', type: 'test' }, result);

      const sarsaAlgo = learningEngine.getRLAlgorithm();
      const qValueBefore = sarsaAlgo!.getQValue(state, action);
      const tableSize = sarsaAlgo!.getTableSize();

      // Switch to Q-Learning
      learningEngine.setAlgorithm('q-learning');

      const qLearningAlgo = learningEngine.getRLAlgorithm();
      const qValueAfter = qLearningAlgo!.getQValue(state, action);

      // Q-values should be preserved
      expect(qLearningAlgo!.getTableSize()).toBeGreaterThanOrEqual(tableSize);

      if (qValueBefore !== 0) {
        expect(qValueAfter).toBeCloseTo(qValueBefore, 5);
      }
    });

    it('should preserve learning progress during switches', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning',
        learningRate: 0.1
      });
      await learningEngine.initialize();

      // Train Q-Learning
      const result = { success: true, strategy: 'test', executionTime: 1000, errors: [] };
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution({ id: `task${i}`, type: 'test' }, result);
      }

      const stepsBefore = learningEngine.getRLAlgorithm()!.getStepCount();

      // Switch to SARSA
      learningEngine.setAlgorithm('sarsa');

      // Continue training with SARSA
      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution({ id: `task${i + 10}`, type: 'test' }, result);
      }

      const stepsAfter = learningEngine.getRLAlgorithm()!.getStepCount();

      // Should have accumulated more steps
      expect(stepsAfter).toBeGreaterThanOrEqual(stepsBefore + 5);
    });
  });

  describe('Algorithm Statistics', () => {
    it('should provide algorithm-specific statistics', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning'
      });
      await learningEngine.initialize();

      const stats = learningEngine.getAlgorithmStats();

      expect(stats.algorithm).toBe('q-learning');
      expect(stats.stats).toBeDefined();
      expect(stats.stats!.steps).toBe(0);
      expect(stats.stats!.episodes).toBe(0);
    });

    it('should update statistics after switching algorithms', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning'
      });
      await learningEngine.initialize();

      // Train some
      const result = { success: true, strategy: 'test', executionTime: 1000, errors: [] };
      await learningEngine.learnFromExecution({ id: 'task1', type: 'test' }, result);

      learningEngine.setAlgorithm('sarsa');

      const stats = learningEngine.getAlgorithmStats();
      expect(stats.algorithm).toBe('sarsa');
      expect(stats.stats).toBeDefined();
    });

    it('should return legacy stats when using legacy mode', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'legacy'
      });
      await learningEngine.initialize();

      const stats = learningEngine.getAlgorithmStats();
      expect(stats.algorithm).toBe('legacy');
      expect(stats.stats).toBeUndefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should support enableQLearning() for backward compatibility', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'legacy'
      });
      await learningEngine.initialize();

      // Use legacy enableQLearning method
      learningEngine.enableQLearning();

      expect(learningEngine.isQLearningEnabled()).toBe(true);
      expect(learningEngine.getAlgorithm()).toBe('q-learning');
    });

    it('should support disableQLearning() for backward compatibility', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning'
      });
      await learningEngine.initialize();

      // Use legacy disableQLearning method
      learningEngine.disableQLearning();

      expect(learningEngine.isQLearningEnabled()).toBe(false);
      expect(learningEngine.getAlgorithm()).toBe('legacy');
    });
  });

  describe('Learning Performance', () => {
    it('should continue learning effectively after algorithm switch', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning',
        learningRate: 0.2
      });
      await learningEngine.initialize();

      const goodResult = {
        success: true,
        strategy: 'good-strategy',
        executionTime: 1000,
        errors: [],
        coverage: 0.9
      };

      const badResult = {
        success: false,
        strategy: 'bad-strategy',
        executionTime: 5000,
        errors: ['error1'],
        coverage: 0.3
      };

      // Train with Q-Learning
      for (let i = 0; i < 20; i++) {
        await learningEngine.learnFromExecution(
          { id: `task${i}`, type: 'test' },
          i % 2 === 0 ? goodResult : badResult
        );
      }

      // Switch to SARSA
      learningEngine.setAlgorithm('sarsa');

      // Continue training
      for (let i = 20; i < 40; i++) {
        await learningEngine.learnFromExecution(
          { id: `task${i}`, type: 'test' },
          i % 2 === 0 ? goodResult : badResult
        );
      }

      // Should still provide useful recommendations
      const state = createState();
      const recommendation = await learningEngine.recommendStrategy(state);

      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.strategy).toBeDefined();
    });

    it('should maintain exploration/exploitation balance after switch', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning',
        explorationRate: 0.3,
        explorationDecay: 0.99
      });
      await learningEngine.initialize();

      const initialRate = learningEngine.getExplorationRate();

      // Switch algorithms
      learningEngine.setAlgorithm('sarsa');

      // Exploration rate should be preserved
      expect(learningEngine.getExplorationRate()).toBeCloseTo(initialRate, 5);
    });
  });

  describe('Multiple Switches', () => {
    it('should handle multiple algorithm switches without data loss', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning',
        learningRate: 0.1
      });
      await learningEngine.initialize();

      const result = { success: true, strategy: 'test', executionTime: 1000, errors: [] };

      // Train with Q-Learning
      await learningEngine.learnFromExecution({ id: 'task1', type: 'test' }, result);
      const size1 = learningEngine.getRLAlgorithm()!.getTableSize();

      // Switch to SARSA
      learningEngine.setAlgorithm('sarsa');
      await learningEngine.learnFromExecution({ id: 'task2', type: 'test' }, result);
      const size2 = learningEngine.getRLAlgorithm()!.getTableSize();

      // Switch back to Q-Learning
      learningEngine.setAlgorithm('q-learning');
      await learningEngine.learnFromExecution({ id: 'task3', type: 'test' }, result);
      const size3 = learningEngine.getRLAlgorithm()!.getTableSize();

      // Table should grow or stay same (learning continues)
      expect(size2).toBeGreaterThanOrEqual(size1);
      expect(size3).toBeGreaterThanOrEqual(size2);
    });

    it('should maintain correct step counts across switches', async () => {
      learningEngine = new LearningEngine('test-agent', memoryStore, {
        algorithm: 'q-learning'
      });
      await learningEngine.initialize();

      const result = { success: true, strategy: 'test', executionTime: 1000, errors: [] };

      // Q-Learning: 5 steps
      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution({ id: `q-task${i}`, type: 'test' }, result);
      }

      const stepsQ = learningEngine.getRLAlgorithm()!.getStepCount();

      // SARSA: 3 more steps
      learningEngine.setAlgorithm('sarsa');
      for (let i = 0; i < 3; i++) {
        await learningEngine.learnFromExecution({ id: `s-task${i}`, type: 'test' }, result);
      }

      const stepsS = learningEngine.getRLAlgorithm()!.getStepCount();

      // Steps should accumulate
      expect(stepsS).toBeGreaterThanOrEqual(stepsQ + 3);
    });
  });
});
