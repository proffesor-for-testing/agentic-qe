/**
 * LearningEngine Integration Tests
 * Phase 2 - Milestone 2.2
 *
 * Tests Q-learning integration with BaseAgent:
 * - Convergence in <500 iterations
 * - Strategy recommendation accuracy
 * - Pattern storage in SwarmMemoryManager
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LearningEngine } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { TaskState, AgentAction, LearningConfig } from '../../src/learning/types';
import * as path from 'path';
import * as fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

describe('LearningEngine Integration Tests', () => {
  let learningEngine: LearningEngine;
  let memoryStore: SwarmMemoryManager;
  let tempDbPath: string;
  const agentId = 'test-agent-q-learning';

  beforeEach(async () => {
    // Create temporary database for testing
    const tempDir = path.join(process.cwd(), 'tests', 'temp');
    await fs.ensureDir(tempDir);
    tempDbPath = path.join(tempDir, `test-learning-${Date.now()}.db`);

    memoryStore = new SwarmMemoryManager(tempDbPath);
    await memoryStore.initialize();

    // Initialize learning engine with test config
    const config: Partial<LearningConfig> = {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3,
      explorationDecay: 0.995,
      minExplorationRate: 0.01,
      batchSize: 32,
      updateFrequency: 10
    };

    learningEngine = new LearningEngine(agentId, memoryStore, config);
    await learningEngine.initialize();
  });

  afterEach(async () => {
    await memoryStore.close();
    if (await fs.pathExists(tempDbPath)) {
      await fs.remove(tempDbPath);
    }
  });

  describe('Q-Learning Convergence', () => {
    it('should converge in less than 500 iterations', async () => {
      const maxIterations = 500;
      const convergenceThreshold = 0.01; // 1% improvement threshold
      let previousReward = 0;
      let convergedAt = -1;

      // Simulate task executions with consistent patterns
      for (let i = 0; i < maxIterations; i++) {
        const task = createSimulatedTask('api-test', 0.5);
        const result = createSimulatedResult(true, 1500 + Math.random() * 500);

        const outcome = await learningEngine.learnFromExecution(task, result);

        // Check for convergence
        if (outcome.improved) {
          const improvementDelta = Math.abs(outcome.improvementRate);
          if (improvementDelta < convergenceThreshold && i > 50) {
            convergedAt = i;
            break;
          }
        }

        previousReward = outcome.newPerformance;
      }

      // Verify convergence occurred within limit
      expect(convergedAt).toBeGreaterThan(-1);
      expect(convergedAt).toBeLessThan(maxIterations);
      console.log(`✓ Q-learning converged at iteration ${convergedAt}`);

      // Verify exploration rate decay
      const explorationRate = learningEngine.getExplorationRate();
      expect(explorationRate).toBeLessThan(0.3); // Should have decayed
      expect(explorationRate).toBeGreaterThanOrEqual(0.01); // Above minimum
    }, 120000); // 2 minute timeout for convergence test

    it('should show consistent improvement over 100 iterations', async () => {
      const iterations = 100;
      const performanceSnapshots: number[] = [];

      // Train the engine
      for (let i = 0; i < iterations; i++) {
        const task = createSimulatedTask('unit-test', 0.3);
        const result = createSimulatedResult(true, 800 + Math.random() * 200);

        const outcome = await learningEngine.learnFromExecution(task, result);
        if (i % 10 === 0) {
          performanceSnapshots.push(outcome.newPerformance);
        }
      }

      // Verify upward trend in performance
      expect(performanceSnapshots.length).toBeGreaterThan(5);
      const firstHalf = performanceSnapshots.slice(0, performanceSnapshots.length / 2);
      const secondHalf = performanceSnapshots.slice(performanceSnapshots.length / 2);

      const avgFirstHalf = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecondHalf = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      expect(avgSecondHalf).toBeGreaterThanOrEqual(avgFirstHalf);
      console.log(`✓ Performance improved from ${avgFirstHalf.toFixed(4)} to ${avgSecondHalf.toFixed(4)}`);
    }, 60000);
  });

  describe('Strategy Recommendation', () => {
    it('should recommend optimal strategy based on learned patterns', async () => {
      // Train with specific pattern: parallel strategy works best for complex tasks
      for (let i = 0; i < 50; i++) {
        const task = createSimulatedTask('integration-test', 0.8);
        const result = createSimulatedResult(true, 2000, 'parallel');
        await learningEngine.learnFromExecution(task, result);
      }

      // Train with different pattern: sequential for simple tasks
      for (let i = 0; i < 50; i++) {
        const task = createSimulatedTask('unit-test', 0.3);
        const result = createSimulatedResult(true, 1000, 'sequential');
        await learningEngine.learnFromExecution(task, result);
      }

      // Request recommendation for complex task
      const complexState: TaskState = {
        taskComplexity: 0.8,
        requiredCapabilities: ['api-testing', 'database', 'integration'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.9
      };

      const recommendation = await learningEngine.recommendStrategy(complexState);

      expect(recommendation).toBeDefined();
      expect(recommendation.strategy).toContain('parallel');
      expect(recommendation.confidence).toBeGreaterThan(0.5);
      expect(recommendation.expectedImprovement).toBeGreaterThanOrEqual(0);
      expect(recommendation.reasoning).toBeTruthy();
      expect(recommendation.alternatives).toBeDefined();

      console.log(`✓ Recommended strategy: ${recommendation.strategy} (confidence: ${recommendation.confidence.toFixed(2)})`);
    });

    it('should provide alternatives when confidence is low', async () => {
      // Train with limited data
      for (let i = 0; i < 10; i++) {
        const task = createSimulatedTask('new-test-type', 0.5);
        const result = createSimulatedResult(true, 1500);
        await learningEngine.learnFromExecution(task, result);
      }

      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['new-capability'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      expect(recommendation).toBeDefined();
      expect(recommendation.alternatives.length).toBeGreaterThan(0);

      // With limited training, confidence should be moderate
      expect(recommendation.confidence).toBeLessThan(0.9);
    });
  });

  describe('Pattern Storage in SwarmMemoryManager', () => {
    it('should store learned patterns in memory with correct metadata', async () => {
      // Generate learning experiences
      for (let i = 0; i < 30; i++) {
        const task = createSimulatedTask('e2e-test', 0.7);
        const result = createSimulatedResult(true, 3000);
        await learningEngine.learnFromExecution(task, result);
      }

      // Retrieve patterns from memory
      const storedPatterns = await memoryStore.query(
        `phase2/learning/${agentId}/%`,
        { partition: 'learning' }
      );

      expect(storedPatterns.length).toBeGreaterThan(0);

      // Verify pattern structure
      const stateEntry = storedPatterns.find(e => e.key.includes('/state'));
      expect(stateEntry).toBeDefined();
      expect(stateEntry!.value.patterns).toBeDefined();
      expect(stateEntry!.value.experiences).toBeDefined();
      expect(stateEntry!.value.qTable).toBeDefined();
    });

    it('should persist and restore Q-table across sessions', async () => {
      // Train in first session
      for (let i = 0; i < 50; i++) {
        const task = createSimulatedTask('api-test', 0.6);
        const result = createSimulatedResult(true, 1800);
        await learningEngine.learnFromExecution(task, result);
      }

      const beforePatterns = learningEngine.getPatterns();
      const beforeExperiences = learningEngine.getTotalExperiences();

      // Create new learning engine instance (simulates restart)
      const newLearningEngine = new LearningEngine(agentId, memoryStore, {
        enabled: true,
        learningRate: 0.1,
        discountFactor: 0.95
      });
      await newLearningEngine.initialize();

      // Verify restoration
      const afterPatterns = newLearningEngine.getPatterns();
      const afterExperiences = newLearningEngine.getTotalExperiences();

      expect(afterExperiences).toBe(beforeExperiences);
      expect(afterPatterns.length).toBe(beforePatterns.length);

      console.log(`✓ Restored ${afterExperiences} experiences and ${afterPatterns.length} patterns`);
    });

    it('should track failure patterns and store mitigation strategies', async () => {
      // Generate some failures
      for (let i = 0; i < 20; i++) {
        const task = createSimulatedTask('flaky-test', 0.4);
        const result = createSimulatedResult(i % 3 !== 0, 2000); // 33% failure rate
        await learningEngine.learnFromExecution(task, result);
      }

      const failurePatterns = learningEngine.getFailurePatterns();
      expect(failurePatterns.length).toBeGreaterThan(0);

      // Verify failure pattern structure
      const pattern = failurePatterns[0];
      expect(pattern.pattern).toBeTruthy();
      expect(pattern.frequency).toBeGreaterThan(0);
      expect(pattern.confidence).toBeGreaterThan(0);
      expect(pattern.identifiedAt).toBeInstanceOf(Date);
    });
  });

  describe('Q-Learning Parameters', () => {
    it('should use correct learning rate (α = 0.1)', () => {
      const config = (learningEngine as any).config;
      expect(config.learningRate).toBe(0.1);
    });

    it('should use correct discount factor (γ = 0.95)', () => {
      const config = (learningEngine as any).config;
      expect(config.discountFactor).toBe(0.95);
    });

    it('should decay exploration rate (ε: 0.3 → 0.01)', async () => {
      const initialRate = learningEngine.getExplorationRate();
      expect(initialRate).toBe(0.3);

      // Run enough iterations to trigger decay
      for (let i = 0; i < 200; i++) {
        const task = createSimulatedTask('test', 0.5);
        const result = createSimulatedResult(true, 1000);
        await learningEngine.learnFromExecution(task, result);
      }

      const finalRate = learningEngine.getExplorationRate();
      expect(finalRate).toBeLessThan(initialRate);
      expect(finalRate).toBeGreaterThanOrEqual(0.01); // Minimum threshold
    });
  });

  describe('Integration with Performance Tracking', () => {
    it('should improve performance metrics over time', async () => {
      const iterations = 100;
      const checkpoints: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const task = createSimulatedTask('regression-test', 0.6);
        // Gradually improve success rate
        const success = Math.random() < (0.5 + (i / iterations) * 0.4);
        const result = createSimulatedResult(success, 1500);

        const outcome = await learningEngine.learnFromExecution(task, result);

        if (i % 20 === 0) {
          checkpoints.push(outcome.newPerformance);
        }
      }

      // Verify improvement trend
      expect(checkpoints[checkpoints.length - 1]).toBeGreaterThan(checkpoints[0]);
    });
  });
});

// Helper functions

function createSimulatedTask(type: string, complexity: number): any {
  return {
    id: uuidv4(),
    type,
    requirements: {
      capabilities: ['testing', 'analysis']
    },
    context: { complexity },
    previousAttempts: 0,
    timeout: 30000
  };
}

function createSimulatedResult(success: boolean, executionTime: number, strategy?: string): any {
  return {
    success,
    executionTime,
    strategy: strategy || (Math.random() > 0.5 ? 'parallel' : 'sequential'),
    toolsUsed: ['jest', 'playwright'],
    parallelization: Math.random() > 0.5 ? 0.8 : 0.3,
    retryPolicy: 'exponential',
    resourceAllocation: 0.7,
    errors: success ? [] : ['Test failed'],
    coverage: success ? 0.85 : 0.60
  };
}
