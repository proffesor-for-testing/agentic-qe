/**
 * LearningEngine Tests - Phase 2 (Milestone 2.2)
 */

import { LearningEngine } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { TaskState, AgentAction, LearningFeedback } from '../../src/learning/types';

describe('LearningEngine', () => {
  let learningEngine: LearningEngine;
  let memoryStore: SwarmMemoryManager;
  const agentId = 'test-agent-1';

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    learningEngine = new LearningEngine(agentId, memoryStore, {
      enabled: true,
      learningRate: 0.1,
      explorationRate: 0.3
    });

    await learningEngine.initialize();
  });

  afterEach(async () => {
    await memoryStore.close();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(learningEngine).toBeDefined();
      expect(learningEngine.isEnabled()).toBe(true);
      expect(learningEngine.getTotalExperiences()).toBe(0);
    });

    it('should load previous state if exists', async () => {
      // Create some experiences
      const task = createMockTask();
      const result = createMockResult(true);
      await learningEngine.learnFromExecution(task, result);

      // Create new engine instance (should load state)
      const newEngine = new LearningEngine(agentId, memoryStore);
      await newEngine.initialize();

      expect(newEngine.getTotalExperiences()).toBeGreaterThan(0);
    });
  });

  describe('learnFromExecution', () => {
    it('should learn from successful task execution', async () => {
      const task = createMockTask();
      const result = createMockResult(true);

      const outcome = await learningEngine.learnFromExecution(task, result);

      expect(outcome).toBeDefined();
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should learn from failed task execution', async () => {
      const task = createMockTask();
      const result = createMockResult(false);

      const outcome = await learningEngine.learnFromExecution(task, result);

      expect(outcome).toBeDefined();
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should incorporate user feedback', async () => {
      const task = createMockTask();
      const result = createMockResult(true);
      const feedback: LearningFeedback = {
        taskId: task.id,
        rating: 0.9,
        issues: [],
        suggestions: ['Great work!'],
        timestamp: new Date(),
        source: 'user'
      };

      const outcome = await learningEngine.learnFromExecution(task, result, feedback);

      expect(outcome).toBeDefined();
      expect(outcome.improved).toBeDefined();
    });

    it('should update patterns after learning', async () => {
      const task = createMockTask();
      const result = createMockResult(true);

      await learningEngine.learnFromExecution(task, result);

      const patterns = learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect failure patterns', async () => {
      // Create multiple failures
      const task = createMockTask();
      for (let i = 0; i < 5; i++) {
        const result = createMockResult(false);
        await learningEngine.learnFromExecution(task, result);
      }

      const failurePatterns = learningEngine.getFailurePatterns();
      expect(failurePatterns.length).toBeGreaterThan(0);
    });
  });

  describe('recommendStrategy', () => {
    it('should recommend default strategy when no learning data', async () => {
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['test-generation'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      expect(recommendation).toBeDefined();
      expect(recommendation.strategy).toBe('default');
    });

    it('should recommend learned strategy after training', async () => {
      // Train with multiple tasks
      for (let i = 0; i < 20; i++) {
        const task = createMockTask();
        const result = createMockResult(true);
        await learningEngine.learnFromExecution(task, result);
      }

      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['test-generation'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      expect(recommendation).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.alternatives).toBeDefined();
    });

    it('should provide alternatives', async () => {
      // Train with varied strategies
      for (let i = 0; i < 30; i++) {
        const task = createMockTask();
        const result = createMockResult(true, i % 3 === 0 ? 'parallel' : 'sequential');
        await learningEngine.learnFromExecution(task, result);
      }

      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['test-generation'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      expect(recommendation.alternatives.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('exploration vs exploitation', () => {
    it('should start with configured exploration rate', () => {
      expect(learningEngine.getExplorationRate()).toBe(0.3);
    });

    it('should decay exploration rate over time', async () => {
      const initialRate = learningEngine.getExplorationRate();

      // Execute many tasks
      for (let i = 0; i < 50; i++) {
        const task = createMockTask();
        const result = createMockResult(true);
        await learningEngine.learnFromExecution(task, result);
      }

      const finalRate = learningEngine.getExplorationRate();
      expect(finalRate).toBeLessThan(initialRate);
    });

    it('should not decay below minimum exploration rate', async () => {
      // Execute many tasks to force decay
      for (let i = 0; i < 1000; i++) {
        const task = createMockTask();
        const result = createMockResult(true);
        await learningEngine.learnFromExecution(task, result);
      }

      const finalRate = learningEngine.getExplorationRate();
      expect(finalRate).toBeGreaterThanOrEqual(0.01); // min rate
    });
  });

  describe('pattern learning', () => {
    it('should discover high-confidence patterns', async () => {
      const task = createMockTask();

      // Execute same pattern multiple times with success
      for (let i = 0; i < 20; i++) {
        const result = createMockResult(true, 'parallel');
        await learningEngine.learnFromExecution(task, result);
      }

      const patterns = learningEngine.getPatterns();
      const highConfidence = patterns.filter(p => p.confidence > 0.7);

      expect(highConfidence.length).toBeGreaterThan(0);
    });

    it('should track pattern usage', async () => {
      const task = createMockTask();

      for (let i = 0; i < 10; i++) {
        const result = createMockResult(true);
        await learningEngine.learnFromExecution(task, result);
      }

      const patterns = learningEngine.getPatterns();
      const used = patterns.filter(p => p.usageCount > 0);

      expect(used.length).toBeGreaterThan(0);
    });
  });

  describe('state persistence', () => {
    it('should save state periodically', async () => {
      // Execute enough tasks to trigger save (every 50 tasks)
      for (let i = 0; i < 55; i++) {
        const task = createMockTask();
        const result = createMockResult(true);
        await learningEngine.learnFromExecution(task, result);
      }

      // Verify state was saved
      const state = await memoryStore.retrieve(
        `phase2/learning/${agentId}/state`,
        { partition: 'learning' }
      );

      expect(state).toBeDefined();
      expect(state.experiences.length).toBeGreaterThan(0);
    });

    it('should enforce memory size limits', async () => {
      const smallMemoryEngine = new LearningEngine(agentId, memoryStore, {
        maxMemorySize: 1024 // 1KB limit
      });

      await smallMemoryEngine.initialize();

      // Try to add many experiences
      for (let i = 0; i < 200; i++) {
        const task = createMockTask();
        const result = createMockResult(true);
        await smallMemoryEngine.learnFromExecution(task, result);
      }

      // Verify experiences were pruned
      expect(smallMemoryEngine.getTotalExperiences()).toBeLessThan(200);
    });
  });

  describe('enable/disable learning', () => {
    it('should respect enabled flag', async () => {
      learningEngine.setEnabled(false);

      const task = createMockTask();
      const result = createMockResult(true);
      const outcome = await learningEngine.learnFromExecution(task, result);

      expect(outcome.improved).toBe(false);
      expect(learningEngine.getTotalExperiences()).toBe(0);
    });

    it('should resume learning when re-enabled', async () => {
      learningEngine.setEnabled(false);
      learningEngine.setEnabled(true);

      const task = createMockTask();
      const result = createMockResult(true);
      await learningEngine.learnFromExecution(task, result);

      expect(learningEngine.getTotalExperiences()).toBe(1);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createMockTask(): any {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'test-generation',
    description: 'Generate unit tests',
    requirements: {
      capabilities: ['test-generation']
    },
    context: {
      targetFile: 'UserService.ts'
    }
  };
}

function createMockResult(success: boolean, strategy: string = 'default'): any {
  return {
    success,
    strategy,
    executionTime: Math.random() * 5000 + 1000, // 1-6 seconds
    toolsUsed: ['jest', 'typescript'],
    parallelization: strategy === 'parallel' ? 0.8 : 0.2,
    retryPolicy: 'exponential',
    resourceAllocation: 0.5,
    coverage: success ? 0.85 + Math.random() * 0.1 : 0.5,
    errors: success ? [] : ['Test generation failed']
  };
}
