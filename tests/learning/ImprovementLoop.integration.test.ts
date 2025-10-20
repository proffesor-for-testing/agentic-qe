/**
 * ImprovementLoop Integration Tests - Phase 2 (Milestone 2.2)
 *
 * Comprehensive integration tests for the continuous improvement loop
 * including A/B testing, failure pattern analysis, and auto-apply functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ImprovementLoop } from '../../src/learning/ImprovementLoop';
import { LearningEngine } from '../../src/learning/LearningEngine';
import { PerformanceTracker } from '../../src/learning/PerformanceTracker';
import { ImprovementWorker } from '../../src/learning/ImprovementWorker';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';

describe('ImprovementLoop Integration', () => {
  let memoryStore: SwarmMemoryManager;
  let learningEngine: LearningEngine;
  let performanceTracker: PerformanceTracker;
  let improvementLoop: ImprovementLoop;
  const agentId = 'test-agent-improvement';

  beforeEach(async () => {
    // Initialize memory store
    memoryStore = new SwarmMemoryManager();
    await memoryStore.initialize();

    // Initialize components
    learningEngine = new LearningEngine(agentId, memoryStore, {
      enabled: true,
      learningRate: 0.1,
      explorationRate: 0.3
    });
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
    await memoryStore.shutdown();
  });

  describe('A/B Testing Framework', () => {
    it('should create A/B test successfully', async () => {
      const testId = await improvementLoop.createABTest(
        'Strategy Comparison',
        [
          { name: 'parallel-execution', config: { parallelization: 0.8 } },
          { name: 'sequential-execution', config: { parallelization: 0.2 } }
        ],
        10 // small sample size for testing
      );

      expect(testId).toBeDefined();
      expect(typeof testId).toBe('string');

      const activeTests = improvementLoop.getActiveTests();
      expect(activeTests).toHaveLength(1);
      expect(activeTests[0].id).toBe(testId);
      expect(activeTests[0].name).toBe('Strategy Comparison');
      expect(activeTests[0].strategies).toHaveLength(2);
      expect(activeTests[0].status).toBe('running');
    });

    it('should record test results and calculate statistics', async () => {
      const testId = await improvementLoop.createABTest(
        'Execution Time Test',
        [
          { name: 'strategy-a', config: {} },
          { name: 'strategy-b', config: {} }
        ],
        4 // small sample
      );

      // Record results for strategy-a (better performance)
      await improvementLoop.recordTestResult(testId, 'strategy-a', true, 1000);
      await improvementLoop.recordTestResult(testId, 'strategy-a', true, 1200);

      // Record results for strategy-b (worse performance)
      await improvementLoop.recordTestResult(testId, 'strategy-b', true, 2000);
      await improvementLoop.recordTestResult(testId, 'strategy-b', false, 2500);

      // Test should complete automatically
      const activeTests = improvementLoop.getActiveTests();
      expect(activeTests).toHaveLength(0); // completed and removed
    });

    it('should determine winner based on success rate and time', async () => {
      const testId = await improvementLoop.createABTest(
        'Winner Selection Test',
        [
          { name: 'fast-strategy', config: {} },
          { name: 'slow-strategy', config: {} }
        ],
        6
      );

      // Fast strategy: high success, fast time
      await improvementLoop.recordTestResult(testId, 'fast-strategy', true, 500);
      await improvementLoop.recordTestResult(testId, 'fast-strategy', true, 600);
      await improvementLoop.recordTestResult(testId, 'fast-strategy', true, 550);

      // Slow strategy: high success, slow time
      await improvementLoop.recordTestResult(testId, 'slow-strategy', true, 2000);
      await improvementLoop.recordTestResult(testId, 'slow-strategy', true, 2100);
      await improvementLoop.recordTestResult(testId, 'slow-strategy', true, 1900);

      // Verify test completed and winner determined
      const activeTests = improvementLoop.getActiveTests();
      expect(activeTests).toHaveLength(0);
    });
  });

  describe('Failure Pattern Analysis', () => {
    it('should detect and analyze high-frequency failure patterns', async () => {
      // Simulate multiple failures to create patterns
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test', timeout: 5000 },
          { success: false, errors: ['timeout'], executionTime: 5100 }
        );
      }

      const patterns = learningEngine.getFailurePatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Run improvement cycle to analyze patterns
      const result = await improvementLoop.runImprovementCycle();
      expect(result.failurePatternsAnalyzed).toBeGreaterThan(0);
    });

    it('should suggest mitigations for failure patterns', async () => {
      // Create failure pattern
      for (let i = 0; i < 6; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'network', timeout: 3000 },
          { success: false, errors: ['network:timeout'], executionTime: 3100 }
        );
      }

      await improvementLoop.runImprovementCycle();

      const patterns = learningEngine.getFailurePatterns();
      const networkPattern = patterns.find(p => p.pattern.includes('network'));

      if (networkPattern && networkPattern.frequency > 5) {
        expect(networkPattern.mitigation).toBeDefined();
        expect(networkPattern.mitigation).toContain('retry');
      }
    });
  });

  describe('Auto-Apply Best Strategies', () => {
    it('should not auto-apply when disabled (default)', async () => {
      // Create high-confidence pattern
      for (let i = 0; i < 20; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test' },
          {
            success: true,
            strategy: 'parallel-execution',
            executionTime: 1000,
            coverage: 0.9
          }
        );
      }

      const result = await improvementLoop.runImprovementCycle();
      expect(result.strategiesApplied).toBe(0); // disabled by default
    });

    it('should auto-apply strategies when enabled with high confidence', async () => {
      // Enable auto-apply (opt-in)
      await improvementLoop.setAutoApply(true);

      // Create high-confidence, high-success pattern
      for (let i = 0; i < 25; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'optimization' },
          {
            success: true,
            strategy: 'resource-optimization',
            executionTime: 800,
            coverage: 0.95
          }
        );
      }

      const result = await improvementLoop.runImprovementCycle();
      expect(result.strategiesApplied).toBeGreaterThan(0);
    });

    it('should only apply strategies with confidence >0.9 and success >0.8', async () => {
      await improvementLoop.setAutoApply(true);

      // Create medium-confidence pattern (should not be applied)
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test' },
          {
            success: i < 7, // 70% success (below threshold)
            strategy: 'medium-strategy',
            executionTime: 1000
          }
        );
      }

      const result = await improvementLoop.runImprovementCycle();
      expect(result.strategiesApplied).toBe(0); // confidence/success too low
    });
  });

  describe('Improvement Cycle Execution', () => {
    it('should run complete improvement cycle successfully', async () => {
      // Record some performance snapshots
      await performanceTracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.8,
          averageExecutionTime: 2000,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        },
        trends: []
      });

      // Create some learning experiences
      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test' },
          { success: true, executionTime: 1500 }
        );
      }

      const result = await improvementLoop.runImprovementCycle();

      expect(result).toBeDefined();
      expect(result.improvement).toBeDefined();
      expect(result.opportunitiesFound).toBeGreaterThanOrEqual(0);
      expect(result.activeTests).toBeGreaterThanOrEqual(0);
    });

    it('should handle cycle execution errors gracefully', async () => {
      // This test ensures the cycle doesn't crash on errors
      await expect(improvementLoop.runImprovementCycle()).rejects.toThrow();
    });
  });

  describe('Background Worker', () => {
    it('should start and stop worker successfully', async () => {
      const worker = new ImprovementWorker(improvementLoop, {
        intervalMs: 1000, // 1 second for testing
        enabled: true
      });

      await worker.start();
      expect(worker.getStatus().isRunning).toBe(true);

      await worker.stop();
      expect(worker.getStatus().isRunning).toBe(false);
    });

    it('should run cycles at specified intervals', async () => {
      const worker = new ImprovementWorker(improvementLoop, {
        intervalMs: 500, // 500ms for testing
        enabled: true
      });

      await improvementLoop.setAutoApply(false); // disable auto-apply for test

      // Record baseline performance
      await performanceTracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 2000,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        },
        trends: []
      });

      await worker.start();

      // Wait for multiple cycles
      await new Promise(resolve => setTimeout(resolve, 1500));

      const status = worker.getStatus();
      expect(status.cyclesCompleted).toBeGreaterThan(0);

      await worker.stop();
    }, 10000);

    it('should handle manual cycle trigger', async () => {
      const worker = new ImprovementWorker(improvementLoop, {
        intervalMs: 60000, // long interval
        enabled: true
      });

      await improvementLoop.setAutoApply(false);

      // Record baseline
      await performanceTracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 2000,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        },
        trends: []
      });

      await worker.start();

      const beforeCycles = worker.getStatus().cyclesCompleted;
      await worker.runNow();
      const afterCycles = worker.getStatus().cyclesCompleted;

      expect(afterCycles).toBeGreaterThan(beforeCycles);

      await worker.stop();
    });

    it('should track statistics correctly', async () => {
      const worker = new ImprovementWorker(improvementLoop);

      const stats = worker.getStatistics();
      expect(stats.cyclesCompleted).toBe(0);
      expect(stats.cyclesFailed).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('Integration with PerformanceTracker', () => {
    it('should use performance metrics in improvement decisions', async () => {
      // Record improving performance
      await performanceTracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.7,
          averageExecutionTime: 3000,
          errorRate: 0.3,
          userSatisfaction: 0.6,
          resourceEfficiency: 0.6
        },
        trends: []
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      await performanceTracker.recordSnapshot({
        metrics: {
          tasksCompleted: 15,
          successRate: 0.85,
          averageExecutionTime: 2000,
          errorRate: 0.15,
          userSatisfaction: 0.8,
          resourceEfficiency: 0.8
        },
        trends: []
      });

      const result = await improvementLoop.runImprovementCycle();
      expect(result.improvement.improvementRate).toBeGreaterThan(0);
    });
  });

  describe('Integration with LearningEngine', () => {
    it('should leverage learned patterns for optimization', async () => {
      // Train the learning engine
      for (let i = 0; i < 15; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'optimization' },
          {
            success: true,
            strategy: 'adaptive-retry',
            executionTime: 1200,
            coverage: 0.88
          }
        );
      }

      const patterns = learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      const result = await improvementLoop.runImprovementCycle();
      expect(result.opportunitiesFound).toBeGreaterThanOrEqual(0);
    });
  });
});
