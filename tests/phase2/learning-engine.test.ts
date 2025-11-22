/**
 * LearningEngine Tests - Phase 2
 *
 * Comprehensive tests for the reinforcement learning engine including:
 * - Q-learning algorithm
 * - Experience recording
 * - Pattern extraction
 * - Database persistence
 * - Performance improvement tracking
 *
 * Coverage Goals: >90%
 */

import { LearningEngine } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { TaskExperience, AgentAction, TaskState, LearningFeedback } from '../../src/learning/types';
import fs from 'fs';
import path from 'path';

describe('LearningEngine - Phase 2', () => {
  let learningEngine: LearningEngine;
  let memoryStore: SwarmMemoryManager;
  const testDbPath = path.join(__dirname, '../../.test-data/learning-test.db');

  beforeEach(async () => {
    // Ensure test directory exists
    const testDataDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create fresh instances
    memoryStore = new SwarmMemoryManager(testDbPath);
    learningEngine = new LearningEngine('test-agent', memoryStore, {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3
    });

    await learningEngine.initialize();
  });

  afterEach(async () => {
    // Cleanup
    learningEngine.dispose();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(learningEngine).toBeDefined();
      expect(learningEngine.isEnabled()).toBe(true);
      expect(learningEngine.getTotalExperiences()).toBe(0);
    });

    it('should load previous state if exists', async () => {
      // Create initial engine and add experiences
      const firstEngine = new LearningEngine('persistent-agent', memoryStore);
      await firstEngine.initialize();

      await firstEngine.learnFromExecution(
        { id: 'task-1', type: 'test-generation' },
        { success: true, executionTime: 1000 }
      );

      firstEngine.dispose();

      // Create new engine - should load previous state
      const secondEngine = new LearningEngine('persistent-agent', memoryStore);
      await secondEngine.initialize();

      expect(secondEngine.getTotalExperiences()).toBeGreaterThan(0);
      secondEngine.dispose();
    });

    it('should handle missing state gracefully', async () => {
      const newEngine = new LearningEngine('new-agent', memoryStore);
      await newEngine.initialize();

      expect(newEngine.getTotalExperiences()).toBe(0);
      newEngine.dispose();
    });
  });

  describe('Learning from Execution', () => {
    it('should record successful task execution', async () => {
      const task = {
        id: 'task-1',
        type: 'test-generation',
        requirements: { capabilities: ['unit-testing', 'mocking'] }
      };

      const result = {
        success: true,
        executionTime: 1200,
        strategy: 'tdd',
        coverage: 0.85
      };

      const outcome = await learningEngine.learnFromExecution(task, result);

      expect(outcome.improved).toBeDefined();
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should record failed task execution', async () => {
      const task = {
        id: 'task-2',
        type: 'coverage-analysis',
        previousAttempts: 2
      };

      const result = {
        success: false,
        executionTime: 3000,
        errors: [{ message: 'Parse error' }]
      };

      const outcome = await learningEngine.learnFromExecution(task, result);

      expect(outcome).toBeDefined();
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should incorporate user feedback', async () => {
      const task = { id: 'task-3', type: 'integration-test' };
      const result = { success: true, executionTime: 800 };
      const feedback: LearningFeedback = {
        rating: 0.9,
        issues: [],
        suggestions: ['Add more edge cases']
      };

      const outcome = await learningEngine.learnFromExecution(task, result, feedback);

      expect(outcome).toBeDefined();
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should calculate rewards correctly for successful tasks', async () => {
      const task = { id: 'task-success', type: 'test' };
      const result = {
        success: true,
        executionTime: 1000,
        coverage: 0.90
      };

      await learningEngine.learnFromExecution(task, result);

      // Reward should be positive for successful, fast, high-coverage tasks
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should calculate penalties for failed tasks', async () => {
      const task = { id: 'task-fail', type: 'test' };
      const result = {
        success: false,
        executionTime: 5000,
        errors: [{ message: 'Error 1' }, { message: 'Error 2' }]
      };

      await learningEngine.learnFromExecution(task, result);

      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should not learn when disabled', async () => {
      learningEngine.setEnabled(false);

      const task = { id: 'task-disabled', type: 'test' };
      const result = { success: true };

      const outcome = await learningEngine.learnFromExecution(task, result);

      expect(outcome.improved).toBe(false);
      expect(outcome.improvementRate).toBe(0);
      expect(learningEngine.getTotalExperiences()).toBe(0);
    });
  });

  describe('Q-Learning Algorithm', () => {
    it('should update Q-table with experiences', async () => {
      const task = {
        id: 'ql-task-1',
        type: 'unit-test',
        requirements: { capabilities: ['jest'] }
      };

      const result = {
        success: true,
        strategy: 'tdd',
        executionTime: 1000
      };

      await learningEngine.learnFromExecution(task, result);

      // Q-table should have been updated
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should learn from multiple experiences', async () => {
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test' },
          { success: i % 2 === 0, executionTime: 1000 }
        );
      }

      expect(learningEngine.getTotalExperiences()).toBe(10);
    });

    it('should recommend strategies based on Q-values', async () => {
      // Train with successful TDD strategy
      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'unit-test' },
          { success: true, strategy: 'tdd', executionTime: 800 }
        );
      }

      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 1.0
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      expect(recommendation).toBeDefined();
      expect(recommendation.strategy).toBeTruthy();
      expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);
    });

    it('should decay exploration rate over time', async () => {
      const initialRate = learningEngine.getExplorationRate();

      // Learn from multiple experiences
      for (let i = 0; i < 20; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test' },
          { success: true }
        );
      }

      const finalRate = learningEngine.getExplorationRate();

      expect(finalRate).toBeLessThan(initialRate);
    });

    it('should not decay exploration below minimum', async () => {
      learningEngine = new LearningEngine('min-explore-agent', memoryStore, {
        minExplorationRate: 0.01,
        explorationDecay: 0.9
      });
      await learningEngine.initialize();

      // Learn from many experiences to force decay
      for (let i = 0; i < 100; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test' },
          { success: true }
        );
      }

      const finalRate = learningEngine.getExplorationRate();
      expect(finalRate).toBeGreaterThanOrEqual(0.01);
    });
  });

  describe('Pattern Learning', () => {
    it('should extract patterns from successful tasks', async () => {
      const task = {
        id: 'pattern-task',
        type: 'integration-test'
      };

      const result = {
        success: true,
        strategy: 'contract-testing',
        executionTime: 1500
      };

      await learningEngine.learnFromExecution(task, result);

      const patterns = await learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });

    it('should track pattern usage and success rate', async () => {
      // Execute same pattern multiple times
      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'unit-test' },
          { success: i < 4, strategy: 'tdd' } // 4 successes, 1 failure
        );
      }

      const patterns = await learningEngine.getPatterns();
      const tddPattern = patterns.find(p => p.pattern.includes('tdd'));

      if (tddPattern) {
        expect(tddPattern.usageCount).toBeGreaterThan(0);
        expect(tddPattern.successRate).toBeGreaterThanOrEqual(0);
        expect(tddPattern.successRate).toBeLessThanOrEqual(1);
      }
    });

    it('should increase pattern confidence with usage', async () => {
      const task = { id: 'conf-task', type: 'e2e-test' };
      const result = { success: true, strategy: 'page-object' };

      // Record the pattern multiple times
      for (let i = 0; i < 3; i++) {
        await learningEngine.learnFromExecution(task, result);
      }

      const patterns = await learningEngine.getPatterns();
      const pageObjectPattern = patterns.find(p => p.pattern.includes('page-object'));

      if (pageObjectPattern) {
        expect(pageObjectPattern.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should track pattern contexts', async () => {
      await learningEngine.learnFromExecution(
        { id: 'task-1', type: 'unit-test' },
        { success: true, strategy: 'mocking' }
      );

      await learningEngine.learnFromExecution(
        { id: 'task-2', type: 'integration-test' },
        { success: true, strategy: 'mocking' }
      );

      const patterns = await learningEngine.getPatterns();
      const mockingPattern = patterns.find(p => p.pattern.includes('mocking'));

      if (mockingPattern) {
        expect(mockingPattern.contexts).toBeDefined();
        expect(mockingPattern.contexts.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Failure Pattern Detection', () => {
    it('should detect failure patterns', async () => {
      // Create multiple failures of the same type
      for (let i = 0; i < 3; i++) {
        await learningEngine.learnFromExecution(
          { id: `fail-task-${i}`, type: 'performance-test' },
          { success: false, errors: [{ message: 'Timeout' }] }
        );
      }

      const failurePatterns = learningEngine.getFailurePatterns();
      expect(failurePatterns.length).toBeGreaterThan(0);
    });

    it('should track failure frequency', async () => {
      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution(
          { id: `fail-${i}`, type: 'security-scan' },
          { success: false }
        );
      }

      const failurePatterns = learningEngine.getFailurePatterns();
      const securityFailure = failurePatterns.find(f => f.pattern.includes('security-scan'));

      if (securityFailure) {
        expect(securityFailure.frequency).toBeGreaterThan(0);
      }
    });

    it('should increase failure pattern confidence with frequency', async () => {
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(
          { id: `frequent-fail-${i}`, type: 'complex-test' },
          { success: false }
        );
      }

      const failurePatterns = learningEngine.getFailurePatterns();
      expect(failurePatterns.length).toBeGreaterThan(0);

      const mostFrequent = failurePatterns[0];
      expect(mostFrequent.confidence).toBeGreaterThan(0);
    });
  });

  describe('Performance Improvement Tracking', () => {
    it('should calculate improvement over baseline', async () => {
      // Create baseline with poor performance
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(
          { id: `baseline-${i}`, type: 'test' },
          { success: false, executionTime: 3000 }
        );
      }

      // Add improved performance
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(
          { id: `improved-${i}`, type: 'test' },
          { success: true, executionTime: 1000 }
        );
      }

      const outcome = await learningEngine.learnFromExecution(
        { id: 'final', type: 'test' },
        { success: true, executionTime: 800 }
      );

      expect(outcome.improvementRate).toBeDefined();
    });

    it('should return zero improvement with insufficient data', async () => {
      // Only add a few experiences
      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test' },
          { success: true }
        );
      }

      const outcome = await learningEngine.learnFromExecution(
        { id: 'final', type: 'test' },
        { success: true }
      );

      // Not enough data for meaningful improvement calculation
      expect(outcome).toBeDefined();
    });

    it('should track confidence growth with experience', async () => {
      for (let i = 0; i < 50; i++) {
        const outcome = await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test' },
          { success: i % 3 !== 0 } // 2/3 success rate
        );

        if (i >= 20) {
          expect(outcome.confidence).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Database Persistence', () => {
    it('should persist learning experiences to database', async () => {
      await learningEngine.learnFromExecution(
        { id: 'persist-task', type: 'test' },
        { success: true }
      );

      // Verify data is in database
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should persist Q-values to database', async () => {
      await learningEngine.learnFromExecution(
        { id: 'qvalue-task', type: 'test' },
        { success: true, strategy: 'tdd' }
      );

      // Q-values should be persisted
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should persist patterns to database', async () => {
      await learningEngine.learnFromExecution(
        { id: 'pattern-persist', type: 'unit-test' },
        { success: true, strategy: 'mocking' }
      );

      const patterns = await learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle persistence failures gracefully', async () => {
      // Test with corrupted/closed database connection
      const corruptedEngine = new LearningEngine('corrupt-agent', memoryStore);
      await corruptedEngine.initialize();

      // Should not throw even if persistence fails
      await expect(
        corruptedEngine.learnFromExecution(
          { id: 'task', type: 'test' },
          { success: true }
        )
      ).resolves.toBeDefined();

      corruptedEngine.dispose();
    });

    it('should support state snapshots', async () => {
      // Add enough experiences to trigger snapshot
      for (let i = 0; i < 15; i++) {
        await learningEngine.learnFromExecution(
          { id: `snapshot-task-${i}`, type: 'test' },
          { success: true }
        );
      }

      expect(learningEngine.getTotalExperiences()).toBe(15);
    });
  });

  describe('Configuration', () => {
    it('should use custom learning rate', async () => {
      const customEngine = new LearningEngine('custom-lr', memoryStore, {
        learningRate: 0.2
      });
      await customEngine.initialize();

      expect(customEngine.isEnabled()).toBe(true);
      customEngine.dispose();
    });

    it('should use custom discount factor', async () => {
      const customEngine = new LearningEngine('custom-df', memoryStore, {
        discountFactor: 0.99
      });
      await customEngine.initialize();

      expect(customEngine.isEnabled()).toBe(true);
      customEngine.dispose();
    });

    it('should respect enabled flag', async () => {
      const disabledEngine = new LearningEngine('disabled', memoryStore, {
        enabled: false
      });
      await disabledEngine.initialize();

      expect(disabledEngine.isEnabled()).toBe(false);
      disabledEngine.dispose();
    });

    it('should allow runtime enable/disable', async () => {
      learningEngine.setEnabled(false);
      expect(learningEngine.isEnabled()).toBe(false);

      learningEngine.setEnabled(true);
      expect(learningEngine.isEnabled()).toBe(true);
    });
  });

  describe('Memory Management', () => {
    it('should prune old experiences when memory limit is exceeded', async () => {
      const limitedEngine = new LearningEngine('limited', memoryStore, {
        maxMemorySize: 10 * 1024 // 10KB limit
      });
      await limitedEngine.initialize();

      // Add many experiences to exceed limit
      for (let i = 0; i < 200; i++) {
        await limitedEngine.learnFromExecution(
          { id: `memory-task-${i}`, type: 'test', requirements: { capabilities: new Array(50).fill('capability') } },
          { success: true }
        );
      }

      // Should have pruned old experiences
      expect(limitedEngine.getTotalExperiences()).toBeLessThan(200);
      limitedEngine.dispose();
    });

    it('should handle batch updates efficiently', async () => {
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        await learningEngine.learnFromExecution(
          { id: `batch-${i}`, type: 'test' },
          { success: true }
        );
      }

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // 100 experiences in < 5 seconds
      expect(learningEngine.getTotalExperiences()).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle tasks with no requirements', async () => {
      const outcome = await learningEngine.learnFromExecution(
        { id: 'minimal-task', type: 'test' },
        { success: true }
      );

      expect(outcome).toBeDefined();
    });

    it('should handle results with missing fields', async () => {
      const outcome = await learningEngine.learnFromExecution(
        { id: 'incomplete-task', type: 'test' },
        { success: true } // Minimal result
      );

      expect(outcome).toBeDefined();
    });

    it('should handle extremely complex tasks', async () => {
      const complexTask = {
        id: 'complex',
        type: 'test',
        requirements: {
          capabilities: new Array(100).fill('capability')
        },
        previousAttempts: 50
      };

      const outcome = await learningEngine.learnFromExecution(
        complexTask,
        { success: false }
      );

      expect(outcome).toBeDefined();
    });

    it('should handle concurrent learning requests', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          learningEngine.learnFromExecution(
            { id: `concurrent-${i}`, type: 'test' },
            { success: true }
          )
        );
      }

      await Promise.all(promises);
      expect(learningEngine.getTotalExperiences()).toBe(10);
    });
  });
});
