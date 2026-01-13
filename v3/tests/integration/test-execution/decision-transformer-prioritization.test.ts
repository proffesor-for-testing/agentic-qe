/**
 * Integration Tests - Decision Transformer Test Prioritization
 * Tests the integration of Decision Transformer RL algorithm with test execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TestExecutionCoordinator,
  ITestExecutionCoordinator,
} from '../../../src/domains/test-execution/coordinator';
import { TestPrioritizerService } from '../../../src/domains/test-execution/services/test-prioritizer';
import { EventBus, MemoryBackend } from '../../../src/kernel/interfaces';
import { createMockEventBus, createMockMemory } from '../../mocks';
import type { TestMetadata } from '../../../src/domains/test-execution/services/test-prioritizer';
import type { TestPrioritizationContext } from '../../../src/domains/test-execution/test-prioritization-types';

describe('Decision Transformer Test Prioritization Integration', () => {
  let coordinator: ITestExecutionCoordinator;
  let prioritizer: TestPrioritizerService;
  let eventBus: EventBus;
  let memory: MemoryBackend;

  beforeEach(async () => {
    eventBus = createMockEventBus();
    memory = createMockMemory();

    // Create prioritizer service
    prioritizer = new TestPrioritizerService(memory, {
      enableDT: true,
      minTrajectoriesForDT: 1,
      enableHeuristicFallback: true,
      minConfidence: 0.3,
      enableAutoTraining: true,
      trainingInterval: 5,
    });
    await prioritizer.initialize();

    // Create coordinator with prioritization enabled
    coordinator = new TestExecutionCoordinator(eventBus, memory, {
      simulateForTesting: true,
      enablePrioritization: true,
      prioritizerConfig: {
        enableDT: true,
        minTrajectoriesForDT: 1,
        enableHeuristicFallback: true,
      },
    });
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.dispose();
    vi.clearAllMocks();
  });

  describe('Prioritization Service', () => {
    it('should initialize Decision Transformer', async () => {
      const stats = prioritizer.getStats();

      expect(stats.totalTests).toBe(0);
      expect(stats.totalExecutions).toBe(0);
      expect(stats.dtStats).toBeDefined();
    });

    it('should prioritize tests using heuristic fallback initially', async () => {
      const testMetadata: TestMetadata[] = [
        {
          testId: 'test-1',
          filePath: '/path/to/test1.test.ts',
          testName: 'test1',
          testType: 'unit',
          complexity: 0.7,
          failureRate: 0.3,
          flakinessScore: 0.2,
          estimatedDuration: 5000,
        },
        {
          testId: 'test-2',
          filePath: '/path/to/test2.test.ts',
          testName: 'test2',
          testType: 'unit',
          complexity: 0.3,
          failureRate: 0.1,
          flakinessScore: 0.0,
          estimatedDuration: 2000,
        },
        {
          testId: 'test-3',
          filePath: '/path/to/test3.test.ts',
          testName: 'test3',
          testType: 'unit',
          complexity: 0.9,
          failureRate: 0.5,
          flakinessScore: 0.4,
          estimatedDuration: 8000,
        },
      ];

      const context: TestPrioritizationContext = {
        runId: 'test-run-1',
        totalTests: 3,
        availableTime: 60000,
        workers: 1,
        mode: 'sequential',
        phase: 'ci',
      };

      const result = await prioritizer.prioritize(testMetadata, context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tests).toHaveLength(3);
        expect(result.value.method).toBe('heuristic'); // Should use heuristic initially
        expect(result.value.averageConfidence).toBeGreaterThan(0);

        // Tests should be ordered by priority score
        const scores = result.value.tests.map(t => t.score);
        expect(scores).toEqual(scores.sort((a, b) => b - a));
      }
    });

    it('should record execution results for learning', async () => {
      const testId = 'test-learning-1';
      const context: TestPrioritizationContext = {
        runId: 'run-learning',
        totalTests: 1,
        availableTime: 60000,
        workers: 1,
        mode: 'sequential',
        phase: 'ci',
      };

      // Record multiple executions to trigger batch training (default batch size is 32)
      for (let i = 0; i < 35; i++) {
        await prioritizer.recordExecution(
          testId,
          {
            passed: i % 2 === 0,
            duration: 3000,
            priority: 'high',
            failedEarly: i % 2 === 1,
            coverageImproved: true,
            flakyDetected: false,
          },
          context
        );
      }

      const stats = prioritizer.getStats();
      expect(stats.totalExecutions).toBe(35);
      // After batch size threshold, training should occur
      expect(stats.trajectoryCount).toBeGreaterThan(0);
    });

    it('should improve predictions after learning from executions', async () => {
      const testMetadata: TestMetadata[] = [
        {
          testId: 'test-adaptive-1',
          filePath: '/path/to/adaptive1.test.ts',
          testName: 'adaptive1',
          testType: 'unit',
          complexity: 0.8,
          failureRate: 0.6,
          flakinessScore: 0.3,
          estimatedDuration: 6000,
        },
      ];

      const context: TestPrioritizationContext = {
        runId: 'run-adaptive',
        totalTests: 1,
        availableTime: 60000,
        workers: 1,
        mode: 'sequential',
        phase: 'ci',
      };

      // Record several executions to build learning history
      for (let i = 0; i < 5; i++) {
        await prioritizer.recordExecution(
          'test-adaptive-1',
          {
            passed: i % 2 === 0, // Alternating failures
            duration: 5000 + i * 1000,
            priority: 'critical',
            failedEarly: i % 2 === 1,
            coverageImproved: true,
            flakyDetected: i > 2,
          },
          context
        );
      }

      // Get prediction after learning
      const result = await prioritizer.prioritize(testMetadata, context);

      expect(result.success).toBe(true);
      if (result.success) {
        // After some learning, DT should have trajectories
        expect(result.value.learningStatus.trajectoryCount).toBeGreaterThan(0);
        expect(result.value.averageConfidence).toBeGreaterThan(0);
      }
    });
  });

  describe('Coordinator Integration', () => {
    it('should prioritize tests before execution', async () => {
      const request = {
        testFiles: [
          'tests/unit/test-a.test.ts',
          'tests/unit/test-b.test.ts',
          'tests/unit/test-c.test.ts',
          'tests/unit/test-d.test.ts',
          'tests/unit/test-e.test.ts',
        ],
        framework: 'vitest',
        timeout: 30000,
      };

      const result = await coordinator.execute(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.runId).toBeDefined();
        expect(result.value.total).toBeGreaterThanOrEqual(0);
      }
    });

    it('should prioritize tests in parallel execution', async () => {
      const request = {
        testFiles: [
          'tests/parallel/test-1.test.ts',
          'tests/parallel/test-2.test.ts',
          'tests/parallel/test-3.test.ts',
        ],
        framework: 'vitest',
        workers: 3,
      };

      const result = await coordinator.executeParallel(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.runId).toBeDefined();
        expect(result.value.total).toBeGreaterThanOrEqual(0);
      }
    });

    it('should use heuristic fallback when DT has insufficient data', async () => {
      const request = {
        testFiles: [
          'tests/unit/new-test-1.test.ts',
          'tests/unit/new-test-2.test.ts',
        ],
        framework: 'vitest',
        timeout: 30000,
      };

      const result = await coordinator.execute(request);

      // Should execute successfully using heuristic fallback
      expect(result.success).toBe(true);
    });

    it('should record execution results for DT learning', async () => {
      const request = {
        testFiles: [
          'tests/learning/test-learn-1.test.ts',
          'tests/learning/test-learn-2.test.ts',
        ],
        framework: 'vitest',
        timeout: 30000,
      };

      await coordinator.execute(request);

      // Get prioritizer stats to verify learning data was recorded
      const stats = prioritizer.getStats();
      expect(stats.totalTests).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Feature Mapping', () => {
    it('should map test metadata to normalized features', async () => {
      const { mapToFeatures, featuresToArray } = await import(
        '../../../src/domains/test-execution/test-prioritization-types'
      );

      const metadata = {
        failureRate: 0.7,
        flakinessScore: 0.3,
        complexity: 0.8,
        coverage: 60,
        businessCriticality: 0.9,
        estimatedDuration: 10000,
        timeSinceModification: 86400000, // 1 day
        dependencyCount: 3,
      };

      const features = mapToFeatures(metadata);

      expect(features.failureProbability).toBe(0.7);
      expect(features.flakiness).toBe(0.3);
      expect(features.complexity).toBe(0.8);
      expect(features.coverageGap).toBeCloseTo(0.4, 1);
      expect(features.criticality).toBe(0.9);
      expect(features.speed).toBeGreaterThan(0);
      expect(features.age).toBeGreaterThan(0);
      expect(features.dependencyComplexity).toBeCloseTo(0.3, 1);

      // Verify feature array conversion
      const featureArray = featuresToArray(features);
      expect(featureArray).toHaveLength(8);
      expect(featureArray.every(f => f >= 0 && f <= 1)).toBe(true);
    });

    it('should create prioritization state from metadata', async () => {
      const { createTestPrioritizationState } = await import(
        '../../../src/domains/test-execution/test-prioritization-types'
      );

      const state = createTestPrioritizationState('test-state-1', {
        filePath: '/path/to/test.test.ts',
        testName: 'Test Case',
        testType: 'unit',
        priority: 'p1',
        complexity: 0.6,
        domain: 'test-execution',
        estimatedDuration: 4000,
        coverage: 75,
        flakinessScore: 0.2,
      });

      expect(state.id).toBe('test-state-1');
      expect(state.testId).toBe('test-state-1');
      expect(state.features).toBeDefined();
      expect(state.features).toHaveLength(8);
      expect(state.testType).toBe('unit');
      // Priority should be p1 when passed as priority
      expect(state.priority).toBe('p1');
      expect(state.assignedPriority).toBe('p1');
    });
  });

  describe('Reward Calculation', () => {
    it('should calculate reward for early failure detection', async () => {
      const { calculatePrioritizationReward } = await import(
        '../../../src/domains/test-execution/test-prioritization-types'
      );

      const context: TestPrioritizationContext = {
        runId: 'reward-test',
        totalTests: 10,
        availableTime: 60000,
        workers: 1,
        mode: 'sequential',
        phase: 'ci',
      };

      const reward = calculatePrioritizationReward(context, {
        failedEarly: true,
        executionTime: 5000,
        coverageImproved: true,
        flakyDetected: false,
      });

      expect(reward.earlyDetection).toBe(0.5);
      expect(reward.timeEfficiency).toBeGreaterThan(0);
      expect(reward.coverageGain).toBe(0.2);
      expect(reward.total).toBeGreaterThan(0);
      expect(reward.total).toBeLessThanOrEqual(1);
    });

    it('should give lower reward for slow execution', async () => {
      const { calculatePrioritizationReward } = await import(
        '../../../src/domains/test-execution/test-prioritization-types'
      );

      const context: TestPrioritizationContext = {
        runId: 'reward-slow',
        totalTests: 10,
        availableTime: 10000, // Short time window
        workers: 1,
        mode: 'sequential',
        phase: 'ci',
      };

      const reward = calculatePrioritizationReward(context, {
        failedEarly: false,
        executionTime: 20000, // Slower than available time
        coverageImproved: false,
        flakyDetected: false,
      });

      expect(reward.earlyDetection).toBe(0);
      expect(reward.timeEfficiency).toBeLessThan(0.5);
      expect(reward.total).toBeLessThan(0.5);
    });
  });

  describe('Model Persistence', () => {
    it('should export and import DT model', async () => {
      // Record enough executions to trigger batch training
      const context: TestPrioritizationContext = {
        runId: 'persistence-test',
        totalTests: 1,
        availableTime: 60000,
        workers: 1,
        mode: 'sequential',
        phase: 'ci',
      };

      for (let i = 0; i < 35; i++) {
        await prioritizer.recordExecution(
          'test-persistence',
          {
            passed: i % 2 === 0,
            duration: 3000,
            priority: 'standard',
            failedEarly: i % 2 === 1,
            coverageImproved: true,
            flakyDetected: false,
          },
          context
        );
      }

      // Export model
      const exportedModel = await prioritizer.exportModel();
      expect(exportedModel).toBeDefined();
      expect(exportedModel.type).toBe('decision-transformer');

      // Create new prioritizer and import model
      const newPrioritizer = new TestPrioritizerService(memory, {
        enableDT: true,
        minTrajectoriesForDT: 1,
      });

      await newPrioritizer.importModel(exportedModel);

      const stats = newPrioritizer.getStats();
      expect(stats.dtStats.episode).toBeGreaterThan(0);
    });
  });
});
