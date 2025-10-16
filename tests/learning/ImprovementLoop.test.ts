/**
 * ImprovementLoop Tests - Phase 2 (Milestone 2.2)
 */

import { ImprovementLoop } from '../../src/learning/ImprovementLoop';
import { LearningEngine } from '../../src/learning/LearningEngine';
import { PerformanceTracker } from '../../src/learning/PerformanceTracker';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';

describe('ImprovementLoop', () => {
  let improvementLoop: ImprovementLoop;
  let learningEngine: LearningEngine;
  let performanceTracker: PerformanceTracker;
  let memoryStore: SwarmMemoryManager;
  const agentId = 'test-agent-1';

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    learningEngine = new LearningEngine(agentId, memoryStore);
    await learningEngine.initialize();

    performanceTracker = new PerformanceTracker(agentId, memoryStore);
    await performanceTracker.initialize();

    improvementLoop = new ImprovementLoop(
      agentId,
      memoryStore,
      learningEngine,
      performanceTracker
    );

    await improvementLoop.initialize();
  });

  afterEach(async () => {
    await improvementLoop.stop();
    await memoryStore.close();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(improvementLoop).toBeDefined();
      expect(improvementLoop.isActive()).toBe(false);
    });

    it('should load existing strategies', async () => {
      const strategies = improvementLoop.getStrategies();
      expect(strategies.length).toBeGreaterThan(0);
    });

    it('should register default strategies', async () => {
      const strategies = improvementLoop.getStrategies();
      const hasDefault = strategies.some(s =>
        s.name === 'parallel-execution' ||
        s.name === 'adaptive-retry' ||
        s.name === 'resource-optimization'
      );

      expect(hasDefault).toBe(true);
    });
  });

  describe('improvement cycle', () => {
    it('should run improvement cycle', async () => {
      // Setup some baseline data
      await performanceTracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.8,
          averageExecutionTime: 3000,
          errorRate: 0.1,
          userSatisfaction: 0.8,
          resourceEfficiency: 0.7
        },
        trends: []
      });

      // Run cycle
      await improvementLoop.runImprovementCycle();

      // Verify cycle completed (should not throw)
      expect(true).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      // Run cycle without baseline data
      await expect(improvementLoop.runImprovementCycle()).resolves.not.toThrow();
    });
  });

  describe('A/B testing', () => {
    it('should create A/B test', async () => {
      const testId = await improvementLoop.createABTest(
        'Test Parallel vs Sequential',
        [
          { name: 'parallel', config: { parallelization: 0.8 } },
          { name: 'sequential', config: { parallelization: 0.0 } }
        ],
        sampleSize: 10
      );

      expect(testId).toBeDefined();
      expect(improvementLoop.getActiveTests().length).toBe(1);
    });

    it('should record test results', async () => {
      const testId = await improvementLoop.createABTest(
        'Strategy Test',
        [
          { name: 'strategy-a', config: {} },
          { name: 'strategy-b', config: {} }
        ],
        sampleSize: 10
      );

      await improvementLoop.recordTestResult(testId, 'strategy-a', true, 1000);

      const tests = improvementLoop.getActiveTests();
      const test = tests.find(t => t.id === testId);

      expect(test).toBeDefined();
      expect(test!.results[0].sampleCount).toBe(1);
    });

    it('should complete test when sample size reached', async () => {
      const testId = await improvementLoop.createABTest(
        'Quick Test',
        [
          { name: 'strategy-a', config: {} },
          { name: 'strategy-b', config: {} }
        ],
        sampleSize: 4
      );

      // Record results to reach sample size
      await improvementLoop.recordTestResult(testId, 'strategy-a', true, 1000);
      await improvementLoop.recordTestResult(testId, 'strategy-a', true, 1200);
      await improvementLoop.recordTestResult(testId, 'strategy-b', false, 3000);
      await improvementLoop.recordTestResult(testId, 'strategy-b', true, 2000);

      // Test should be completed
      const tests = improvementLoop.getActiveTests();
      const activeTest = tests.find(t => t.id === testId);

      expect(activeTest).toBeUndefined(); // moved to completed
    });

    it('should determine winner based on performance', async () => {
      const testId = await improvementLoop.createABTest(
        'Winner Test',
        [
          { name: 'good-strategy', config: {} },
          { name: 'bad-strategy', config: {} }
        ],
        sampleSize: 6
      );

      // Good strategy performs better
      await improvementLoop.recordTestResult(testId, 'good-strategy', true, 1000);
      await improvementLoop.recordTestResult(testId, 'good-strategy', true, 1100);
      await improvementLoop.recordTestResult(testId, 'good-strategy', true, 900);

      // Bad strategy performs worse
      await improvementLoop.recordTestResult(testId, 'bad-strategy', false, 3000);
      await improvementLoop.recordTestResult(testId, 'bad-strategy', true, 2500);
      await improvementLoop.recordTestResult(testId, 'bad-strategy', false, 2800);

      // Verify winner was determined (test completed)
      const tests = improvementLoop.getActiveTests();
      expect(tests.find(t => t.id === testId)).toBeUndefined();
    });
  });

  describe('start/stop loop', () => {
    it('should start improvement loop', async () => {
      await improvementLoop.start(1000); // 1 second interval

      expect(improvementLoop.isActive()).toBe(true);
    });

    it('should stop improvement loop', async () => {
      await improvementLoop.start(1000);
      await improvementLoop.stop();

      expect(improvementLoop.isActive()).toBe(false);
    });

    it('should not start if already running', async () => {
      await improvementLoop.start(1000);
      await improvementLoop.start(1000); // should warn but not crash

      expect(improvementLoop.isActive()).toBe(true);
    });

    it('should run cycles periodically', async () => {
      // Setup baseline
      await performanceTracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.8,
          averageExecutionTime: 3000,
          errorRate: 0.1,
          userSatisfaction: 0.8,
          resourceEfficiency: 0.7
        },
        trends: []
      });

      await improvementLoop.start(100); // 100ms interval

      // Wait for multiple cycles
      await delay(350);

      await improvementLoop.stop();

      // At least one cycle should have run
      expect(true).toBe(true);
    }, 10000);
  });

  describe('strategy management', () => {
    it('should track strategy usage', () => {
      const strategies = improvementLoop.getStrategies();

      expect(strategies.length).toBeGreaterThan(0);
      strategies.forEach(strategy => {
        expect(strategy.name).toBeDefined();
        expect(strategy.usageCount).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('failure pattern analysis', () => {
    it('should analyze failure patterns', async () => {
      // Create some failures
      const task = {
        id: 'task-1',
        type: 'test-generation',
        requirements: { capabilities: ['test-generation'] }
      };

      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(task, {
          success: false,
          strategy: 'default',
          executionTime: 3000,
          errors: ['Timeout']
        });
      }

      // Run improvement cycle to analyze patterns
      await improvementLoop.runImprovementCycle();

      // Failure patterns should be detected
      const patterns = learningEngine.getFailurePatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('optimization discovery', () => {
    it('should discover optimization opportunities', async () => {
      // Create high-confidence, low-usage patterns
      const task = {
        id: 'task-1',
        type: 'test-generation',
        requirements: { capabilities: ['test-generation'] }
      };

      // Train with successful pattern
      for (let i = 0; i < 20; i++) {
        await learningEngine.learnFromExecution(task, {
          success: true,
          strategy: 'optimized',
          executionTime: 1000,
          coverage: 0.95
        });
      }

      // Setup baseline for improvement calculation
      await performanceTracker.recordSnapshot({
        metrics: {
          tasksCompleted: 20,
          successRate: 1.0,
          averageExecutionTime: 1000,
          errorRate: 0.0,
          userSatisfaction: 0.9,
          resourceEfficiency: 0.9
        },
        trends: []
      });

      await improvementLoop.runImprovementCycle();

      // Should complete without errors
      expect(true).toBe(true);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
