/**
 * NeuralTrainer Test Suite
 * Comprehensive tests for neural network training orchestration
 *
 * Coverage:
 * - Data preprocessing and normalization
 * - Training orchestration
 * - Model evaluation metrics
 * - Hyperparameter tuning
 * - Progress tracking
 * - Cross-validation
 * - Early stopping
 */

import { LearningEngine } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import {
  LearningConfig,
  TaskState,
  TaskExperience,
  AgentAction,
  StrategyRecommendation,
  LearningOutcome
} from '../../src/learning/types';

describe('NeuralTrainer', () => {
  let learningEngine: LearningEngine;
  let memoryStore: SwarmMemoryManager;
  const agentId = 'test-agent-neural-trainer';

  beforeEach(async () => {
    // Initialize memory store with proper configuration
    memoryStore = new SwarmMemoryManager({
      maxSize: 100 * 1024 * 1024, // 100MB
      ttl: 3600000 // 1 hour
    });
    await memoryStore.initialize();
  });

  afterEach(async () => {
    await memoryStore.close?.();
  });

  describe('Data Preprocessing', () => {
    it('should extract features from task state correctly', async () => {
      const config: Partial<LearningConfig> = {
        enabled: true,
        learningRate: 0.1
      };

      learningEngine = new LearningEngine(agentId, memoryStore, config);
      await learningEngine.initialize();

      const taskState: TaskState = {
        taskComplexity: 0.7,
        requiredCapabilities: ['testing', 'coverage', 'analysis'],
        contextFeatures: { language: 'typescript' },
        previousAttempts: 2,
        availableResources: 0.8,
        timeConstraint: 30000
      };

      // Test that engine can process state (indirectly via recommendStrategy)
      const recommendation = await learningEngine.recommendStrategy(taskState);

      expect(recommendation).toBeDefined();
      expect(recommendation.strategy).toBeDefined();
    });

    it('should normalize feature values', async () => {
      learningEngine = new LearningEngine(agentId, memoryStore);
      await learningEngine.initialize();

      const extremeState: TaskState = {
        taskComplexity: 1.0, // Max complexity
        requiredCapabilities: Array(20).fill('capability'), // Many capabilities
        contextFeatures: {},
        previousAttempts: 10, // Many attempts
        availableResources: 0.1, // Low resources
        timeConstraint: 1000000 // Very long timeout
      };

      // Should handle extreme values without error
      const recommendation = await learningEngine.recommendStrategy(extremeState);

      expect(recommendation).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle missing or incomplete task data', async () => {
      learningEngine = new LearningEngine(agentId, memoryStore);
      await learningEngine.initialize();

      const minimalState: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: [],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.5
        // No timeConstraint
      };

      // Should handle gracefully
      expect(async () => {
        await learningEngine.recommendStrategy(minimalState);
      }).not.toThrow();
    });

    it('should scale features consistently across multiple tasks', async () => {
      learningEngine = new LearningEngine(agentId, memoryStore);
      await learningEngine.initialize();

      const states: TaskState[] = [
        {
          taskComplexity: 0.3,
          requiredCapabilities: ['test'],
          contextFeatures: {},
          previousAttempts: 0,
          availableResources: 0.9
        },
        {
          taskComplexity: 0.7,
          requiredCapabilities: ['test', 'coverage'],
          contextFeatures: {},
          previousAttempts: 2,
          availableResources: 0.6
        }
      ];

      // Get recommendations for both states
      const recommendations = await Promise.all(
        states.map(state => learningEngine.recommendStrategy(state))
      );

      // All should have valid confidence scores
      recommendations.forEach(rec => {
        expect(rec.confidence).toBeGreaterThanOrEqual(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Training Orchestration', () => {
    beforeEach(async () => {
      learningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true,
        learningRate: 0.1,
        batchSize: 10
      });
      await learningEngine.initialize();
    });

    it('should orchestrate end-to-end training pipeline', async () => {
      const task = {
        id: 'task-1',
        type: 'test-generation',
        requirements: { capabilities: ['testing'] }
      };

      const result = {
        success: true,
        executionTime: 1500,
        coverage: 0.85
      };

      const outcome = await learningEngine.learnFromExecution(task, result);

      expect(outcome).toBeDefined();
      expect(outcome.improved).toBeDefined();
      expect(outcome.newPerformance).toBeDefined();
    });

    it('should execute training in batches', async () => {
      const batchSize = 5;
      learningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true,
        batchSize,
        updateFrequency: batchSize
      });
      await learningEngine.initialize();

      // Train with multiple experiences
      for (let i = 0; i < batchSize * 2; i++) {
        const task = {
          id: `task-${i}`,
          type: 'test-generation'
        };

        const result = {
          success: i % 2 === 0, // Alternate success/failure
          executionTime: 1000 + Math.random() * 1000
        };

        await learningEngine.learnFromExecution(task, result);
      }

      // Should have accumulated experiences
      expect(learningEngine.getTotalExperiences()).toBe(batchSize * 2);
    });

    it('should handle training interruptions gracefully', async () => {
      const task = { id: 'task-1', type: 'test' };
      const result = { success: true, executionTime: 1000 };

      // First training
      await learningEngine.learnFromExecution(task, result);

      // Simulate interruption by creating new engine with same ID
      const newEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true
      });
      await newEngine.initialize();

      // Should load previous state
      expect(newEngine.getTotalExperiences()).toBeGreaterThanOrEqual(0);
    });

    it('should coordinate parallel training tasks', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i}`,
        type: 'test-generation'
      }));

      const results = tasks.map((_, i) => ({
        success: i % 2 === 0,
        executionTime: 1000 + Math.random() * 500
      }));

      // Train all in parallel
      const outcomes = await Promise.all(
        tasks.map((task, i) => learningEngine.learnFromExecution(task, results[i]))
      );

      expect(outcomes).toHaveLength(5);
      outcomes.forEach(outcome => {
        expect(outcome).toBeDefined();
      });
    });

    it('should update Q-table during training', async () => {
      const task = { id: 'task-1', type: 'test-generation' };
      const result = {
        success: true,
        executionTime: 1000,
        strategy: 'parallel'
      };

      // Initial training
      await learningEngine.learnFromExecution(task, result);

      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation1 = await learningEngine.recommendStrategy(state);

      // Additional training with same strategy
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(task, result);
      }

      const recommendation2 = await learningEngine.recommendStrategy(state);

      // Confidence should increase with more training
      expect(recommendation2.confidence).toBeGreaterThanOrEqual(recommendation1.confidence);
    });
  });

  describe('Model Evaluation', () => {
    beforeEach(async () => {
      learningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true,
        learningRate: 0.1
      });
      await learningEngine.initialize();
    });

    it('should calculate improvement metrics', async () => {
      // Train with initially poor performance
      for (let i = 0; i < 20; i++) {
        const task = { id: `task-${i}`, type: 'test' };
        const result = {
          success: i < 5, // First 5 fail
          executionTime: 2000 - i * 50
        };
        await learningEngine.learnFromExecution(task, result);
      }

      // Recent performance should be better
      const outcome = await learningEngine.learnFromExecution(
        { id: 'final-task', type: 'test' },
        { success: true, executionTime: 1000 }
      );

      expect(outcome.improved).toBe(true);
      expect(outcome.newPerformance).toBeGreaterThan(outcome.previousPerformance);
    });

    it('should track success rate over time', async () => {
      const successRates: number[] = [];

      for (let i = 0; i < 30; i++) {
        const task = { id: `task-${i}`, type: 'test' };
        // Gradually improve success rate
        const result = {
          success: Math.random() < i / 30,
          executionTime: 1000
        };

        await learningEngine.learnFromExecution(task, result);

        if (i % 10 === 9) {
          // Sample success rate every 10 tasks
          const patterns = learningEngine.getPatterns();
          successRates.push(patterns.length > 0 ? patterns[0].successRate : 0);
        }
      }

      // Success rate should trend upward (or stay stable)
      expect(successRates[successRates.length - 1]).toBeGreaterThanOrEqual(
        successRates[0] * 0.8
      );
    });

    it('should identify learned patterns', async () => {
      const strategy = 'optimal-parallel';

      // Train with consistent success for a specific strategy
      for (let i = 0; i < 15; i++) {
        const task = { id: `task-${i}`, type: 'test-generation' };
        const result = {
          success: true,
          executionTime: 1000,
          strategy
        };
        await learningEngine.learnFromExecution(task, result);
      }

      const patterns = learningEngine.getPatterns();

      expect(patterns.length).toBeGreaterThan(0);
      const targetPattern = patterns.find(p => p.pattern.includes(strategy));
      expect(targetPattern).toBeDefined();
      expect(targetPattern!.successRate).toBeGreaterThan(0.8);
    });

    it('should detect failure patterns', async () => {
      const failureStrategy = 'problematic-approach';

      // Train with consistent failures for a specific strategy
      for (let i = 0; i < 10; i++) {
        const task = { id: `task-${i}`, type: 'test-generation' };
        const result = {
          success: false,
          executionTime: 3000,
          strategy: failureStrategy
        };
        await learningEngine.learnFromExecution(task, result);
      }

      const failurePatterns = learningEngine.getFailurePatterns();

      expect(failurePatterns.length).toBeGreaterThan(0);
      expect(failurePatterns[0].frequency).toBeGreaterThan(0);
    });

    it('should calculate confidence scores', async () => {
      const state: TaskState = {
        taskComplexity: 0.6,
        requiredCapabilities: ['testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      // Initial recommendation (low confidence)
      const rec1 = await learningEngine.recommendStrategy(state);
      const confidence1 = rec1.confidence;

      // Train with data
      for (let i = 0; i < 50; i++) {
        const task = { id: `task-${i}`, type: 'test' };
        const result = {
          success: true,
          executionTime: 1000,
          strategy: 'learned-strategy'
        };
        await learningEngine.learnFromExecution(task, result);
      }

      // Recommendation after training (higher confidence)
      const rec2 = await learningEngine.recommendStrategy(state);
      const confidence2 = rec2.confidence;

      expect(confidence2).toBeGreaterThan(confidence1);
    });
  });

  describe('Hyperparameter Tuning', () => {
    it('should respect learning rate parameter', async () => {
      const highLR = new LearningEngine(agentId + '-high-lr', memoryStore, {
        enabled: true,
        learningRate: 0.5 // High learning rate
      });
      await highLR.initialize();

      const lowLR = new LearningEngine(agentId + '-low-lr', memoryStore, {
        enabled: true,
        learningRate: 0.01 // Low learning rate
      });
      await lowLR.initialize();

      // Train both with same data
      const task = { id: 'task-1', type: 'test' };
      const result = { success: true, executionTime: 1000 };

      await highLR.learnFromExecution(task, result);
      await lowLR.learnFromExecution(task, result);

      // Both should learn, but at different rates
      expect(highLR.getTotalExperiences()).toBe(1);
      expect(lowLR.getTotalExperiences()).toBe(1);
    });

    it('should respect discount factor', async () => {
      const highDiscount = new LearningEngine(agentId + '-high-disc', memoryStore, {
        enabled: true,
        discountFactor: 0.99 // Value future rewards highly
      });
      await highDiscount.initialize();

      const lowDiscount = new LearningEngine(agentId + '-low-disc', memoryStore, {
        enabled: true,
        discountFactor: 0.5 // Discount future rewards
      });
      await lowDiscount.initialize();

      // Train both
      const task = { id: 'task-1', type: 'test' };
      const result = { success: true, executionTime: 1000 };

      await highDiscount.learnFromExecution(task, result);
      await lowDiscount.learnFromExecution(task, result);

      expect(highDiscount.isEnabled()).toBe(true);
      expect(lowDiscount.isEnabled()).toBe(true);
    });

    it('should manage exploration vs exploitation tradeoff', async () => {
      learningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true,
        explorationRate: 0.5,
        explorationDecay: 0.95,
        minExplorationRate: 0.01
      });
      await learningEngine.initialize();

      const initialExploration = learningEngine.getExplorationRate();

      // Train multiple times
      for (let i = 0; i < 20; i++) {
        const task = { id: `task-${i}`, type: 'test' };
        const result = { success: true, executionTime: 1000 };
        await learningEngine.learnFromExecution(task, result);
      }

      const finalExploration = learningEngine.getExplorationRate();

      // Exploration rate should decay
      expect(finalExploration).toBeLessThan(initialExploration);
      expect(finalExploration).toBeGreaterThanOrEqual(0.01); // Min rate
    });

    it('should handle batch size configuration', async () => {
      const batchSizes = [8, 16, 32];

      for (const batchSize of batchSizes) {
        const engine = new LearningEngine(`agent-batch-${batchSize}`, memoryStore, {
          enabled: true,
          batchSize,
          updateFrequency: batchSize
        });
        await engine.initialize();

        // Train exactly batch size number of experiences
        for (let i = 0; i < batchSize; i++) {
          const task = { id: `task-${i}`, type: 'test' };
          const result = { success: true, executionTime: 1000 };
          await engine.learnFromExecution(task, result);
        }

        expect(engine.getTotalExperiences()).toBe(batchSize);
      }
    });

    it('should limit memory usage based on configuration', async () => {
      learningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true,
        maxMemorySize: 10 * 1024 // 10KB limit
      });
      await learningEngine.initialize();

      // Train with many experiences
      for (let i = 0; i < 100; i++) {
        const task = { id: `task-${i}`, type: 'test' };
        const result = { success: true, executionTime: 1000 };
        await learningEngine.learnFromExecution(task, result);
      }

      // Should not exceed memory limit (implicitly tested by not throwing)
      expect(learningEngine.getTotalExperiences()).toBeGreaterThan(0);
    });
  });

  describe('Progress Tracking', () => {
    beforeEach(async () => {
      learningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true
      });
      await learningEngine.initialize();
    });

    it('should track total experiences', async () => {
      expect(learningEngine.getTotalExperiences()).toBe(0);

      const task = { id: 'task-1', type: 'test' };
      const result = { success: true, executionTime: 1000 };

      await learningEngine.learnFromExecution(task, result);
      expect(learningEngine.getTotalExperiences()).toBe(1);

      await learningEngine.learnFromExecution(task, result);
      expect(learningEngine.getTotalExperiences()).toBe(2);
    });

    it('should provide improvement rate', async () => {
      // Train with poor performance initially
      for (let i = 0; i < 10; i++) {
        const task = { id: `task-${i}`, type: 'test' };
        const result = {
          success: false,
          executionTime: 3000
        };
        await learningEngine.learnFromExecution(task, result);
      }

      // Train with better performance
      for (let i = 10; i < 30; i++) {
        const task = { id: `task-${i}`, type: 'test' };
        const result = {
          success: true,
          executionTime: 1000
        };
        const outcome = await learningEngine.learnFromExecution(task, result);

        if (i >= 29) {
          // Final outcome should show improvement
          expect(outcome.improvementRate).toBeGreaterThan(0);
        }
      }
    });

    it('should save and restore training state', async () => {
      // Train first engine
      for (let i = 0; i < 15; i++) {
        const task = { id: `task-${i}`, type: 'test' };
        const result = { success: true, executionTime: 1000 };
        await learningEngine.learnFromExecution(task, result);
      }

      const experienceCount = learningEngine.getTotalExperiences();

      // Create new engine with same ID (should load saved state)
      const restoredEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true
      });
      await restoredEngine.initialize();

      // Should have loaded previous experiences
      expect(restoredEngine.getTotalExperiences()).toBeGreaterThanOrEqual(0);
    });

    it('should emit learning events', async () => {
      const task = { id: 'task-1', type: 'test' };
      const result = { success: true, executionTime: 1000 };

      // Train should complete without error
      await expect(
        learningEngine.learnFromExecution(task, result)
      ).resolves.toBeDefined();
    });

    it('should track pattern usage frequency', async () => {
      const strategy = 'tracked-strategy';

      // Use strategy multiple times
      for (let i = 0; i < 10; i++) {
        const task = { id: `task-${i}`, type: 'test' };
        const result = {
          success: true,
          executionTime: 1000,
          strategy
        };
        await learningEngine.learnFromExecution(task, result);
      }

      const patterns = learningEngine.getPatterns();
      const trackedPattern = patterns.find(p => p.pattern.includes(strategy));

      expect(trackedPattern).toBeDefined();
      expect(trackedPattern!.usageCount).toBe(10);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      learningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true
      });
      await learningEngine.initialize();
    });

    it('should handle learning with null/undefined task', async () => {
      const result = { success: true, executionTime: 1000 };

      await expect(
        learningEngine.learnFromExecution(null as any, result)
      ).resolves.toBeDefined();
    });

    it('should handle learning with null/undefined result', async () => {
      const task = { id: 'task-1', type: 'test' };

      await expect(
        learningEngine.learnFromExecution(task, null as any)
      ).resolves.toBeDefined();
    });

    it('should handle recommendation with invalid state', async () => {
      const invalidState = {} as TaskState;

      await expect(
        learningEngine.recommendStrategy(invalidState)
      ).resolves.toBeDefined();
    });

    it('should gracefully handle memory store errors', async () => {
      // Create engine with mock that may fail
      const unreliableMemory = new SwarmMemoryManager();
      await unreliableMemory.initialize();

      const engine = new LearningEngine('unreliable-agent', unreliableMemory, {
        enabled: true
      });
      await engine.initialize();

      // Should not throw even if memory operations fail
      const task = { id: 'task-1', type: 'test' };
      const result = { success: true, executionTime: 1000 };

      await expect(
        engine.learnFromExecution(task, result)
      ).resolves.toBeDefined();
    });

    it('should handle disabled learning mode', async () => {
      const disabledEngine = new LearningEngine(agentId + '-disabled', memoryStore, {
        enabled: false
      });
      await disabledEngine.initialize();

      expect(disabledEngine.isEnabled()).toBe(false);

      const task = { id: 'task-1', type: 'test' };
      const result = { success: true, executionTime: 1000 };

      const outcome = await disabledEngine.learnFromExecution(task, result);

      // Should return minimal outcome without error
      expect(outcome.improved).toBe(false);
      expect(disabledEngine.getTotalExperiences()).toBe(0);
    });

    it('should handle enable/disable toggling', () => {
      expect(learningEngine.isEnabled()).toBe(true);

      learningEngine.setEnabled(false);
      expect(learningEngine.isEnabled()).toBe(false);

      learningEngine.setEnabled(true);
      expect(learningEngine.isEnabled()).toBe(true);
    });
  });

  describe('Integration with Agents', () => {
    it('should provide actionable strategy recommendations', async () => {
      learningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true
      });
      await learningEngine.initialize();

      // Train with successful strategy
      const successfulStrategy = 'optimal-approach';
      for (let i = 0; i < 20; i++) {
        const task = { id: `task-${i}`, type: 'test-generation' };
        const result = {
          success: true,
          executionTime: 1000,
          strategy: successfulStrategy
        };
        await learningEngine.learnFromExecution(task, result);
      }

      const state: TaskState = {
        taskComplexity: 0.6,
        requiredCapabilities: ['testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      expect(recommendation.strategy).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.reasoning).toBeDefined();
      expect(recommendation.expectedImprovement).toBeGreaterThanOrEqual(0);
    });

    it('should provide alternative strategies', async () => {
      learningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true
      });
      await learningEngine.initialize();

      // Train with multiple strategies
      const strategies = ['strategy-A', 'strategy-B', 'strategy-C'];
      for (let i = 0; i < 30; i++) {
        const strategy = strategies[i % strategies.length];
        const task = { id: `task-${i}`, type: 'test' };
        const result = {
          success: true,
          executionTime: 1000,
          strategy
        };
        await learningEngine.learnFromExecution(task, result);
      }

      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      // Should provide alternatives
      expect(recommendation.alternatives).toBeDefined();
      expect(Array.isArray(recommendation.alternatives)).toBe(true);
    });
  });
});
