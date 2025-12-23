/**
 * BaselineCollector Unit Tests
 *
 * Tests the baseline collection system for Phase 0 of Nightly-Learner.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
  BaselineCollector,
  LearningBaseline,
  BaselineStats,
  ImprovementTarget,
} from '../../../../src/learning/baselines/BaselineCollector';
import { StandardTaskSuite } from '../../../../src/learning/baselines/StandardTaskSuite';
import { QEAgentType } from '../../../../src/types';

describe('BaselineCollector', () => {
  let collector: BaselineCollector;
  let testDbPath: string;

  beforeEach(async () => {
    // Use in-memory database for tests
    testDbPath = ':memory:';
    collector = new BaselineCollector({
      dbPath: testDbPath,
      sampleSize: 5, // Smaller sample for faster tests
      taskTimeout: 5000,
      debug: false,
    });
    await collector.initialize();
  });

  afterEach(() => {
    if (collector) {
      collector.close();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newCollector = new BaselineCollector({ dbPath: ':memory:' });
      await expect(newCollector.initialize()).resolves.not.toThrow();
      newCollector.close();
    });

    it('should not re-initialize if already initialized', async () => {
      // Should not throw on second initialization
      await expect(collector.initialize()).resolves.not.toThrow();
    });
  });

  describe('baseline collection', () => {
    it('should collect baseline for test-generator', async () => {
      const baseline = await collector.collectBaseline(
        'test-gen-001',
        QEAgentType.TEST_GENERATOR,
        'unit-test-generation'
      );

      expect(baseline).toBeDefined();
      expect(baseline.agentId).toBe('test-gen-001');
      expect(baseline.agentType).toBe(QEAgentType.TEST_GENERATOR);
      expect(baseline.taskType).toBe('unit-test-generation');
      expect(baseline.sampleSize).toBe(5);
      expect(baseline.metrics).toBeDefined();
      expect(baseline.metrics.avgCompletionTime).toBeGreaterThan(0);
      expect(baseline.metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(baseline.metrics.successRate).toBeLessThanOrEqual(1);
      expect(baseline.metrics.coverageAchieved).toBeGreaterThanOrEqual(0);
      expect(baseline.metrics.coverageAchieved).toBeLessThanOrEqual(100);
    });

    it('should collect baseline for coverage-analyzer', async () => {
      const baseline = await collector.collectBaseline(
        'coverage-001',
        QEAgentType.COVERAGE_ANALYZER,
        'line-coverage-analysis'
      );

      expect(baseline).toBeDefined();
      expect(baseline.agentType).toBe(QEAgentType.COVERAGE_ANALYZER);
      expect(baseline.taskType).toBe('line-coverage-analysis');
    });

    it('should collect baseline for security-scanner', async () => {
      const baseline = await collector.collectBaseline(
        'security-001',
        QEAgentType.SECURITY_SCANNER,
        'vulnerability-scan'
      );

      expect(baseline).toBeDefined();
      expect(baseline.agentType).toBe(QEAgentType.SECURITY_SCANNER);
      expect(baseline.taskType).toBe('vulnerability-scan');
    });

    it('should throw error for non-existent task type', async () => {
      await expect(
        collector.collectBaseline(
          'test-001',
          QEAgentType.TEST_GENERATOR,
          'non-existent-task'
        )
      ).rejects.toThrow('No standard tasks found');
    });

    it('should store baseline in database', async () => {
      const baseline = await collector.collectBaseline(
        'test-gen-002',
        QEAgentType.TEST_GENERATOR,
        'unit-test-generation'
      );

      // Retrieve from database
      const retrieved = collector.getBaseline(
        QEAgentType.TEST_GENERATOR,
        'unit-test-generation'
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.agentType).toBe(baseline.agentType);
      expect(retrieved?.taskType).toBe(baseline.taskType);
      expect(retrieved?.metrics.avgCompletionTime).toBe(baseline.metrics.avgCompletionTime);
    });
  });

  describe('baseline retrieval', () => {
    beforeEach(async () => {
      // Collect some baselines
      await collector.collectBaseline(
        'test-gen-001',
        QEAgentType.TEST_GENERATOR,
        'unit-test-generation'
      );
      await collector.collectBaseline(
        'test-gen-002',
        QEAgentType.TEST_GENERATOR,
        'integration-test-generation'
      );
      await collector.collectBaseline(
        'coverage-001',
        QEAgentType.COVERAGE_ANALYZER,
        'line-coverage-analysis'
      );
    });

    it('should retrieve baseline by agent type and task type', () => {
      const baseline = collector.getBaseline(
        QEAgentType.TEST_GENERATOR,
        'unit-test-generation'
      );

      expect(baseline).toBeDefined();
      expect(baseline?.taskType).toBe('unit-test-generation');
    });

    it('should return null for non-existent baseline', () => {
      const baseline = collector.getBaseline(
        QEAgentType.PERFORMANCE_TESTER,
        'non-existent'
      );

      expect(baseline).toBeNull();
    });

    it('should retrieve all baselines for an agent', () => {
      const baselines = collector.getBaselinesForAgent(QEAgentType.TEST_GENERATOR);

      expect(baselines).toHaveLength(2);
      expect(baselines[0].agentType).toBe(QEAgentType.TEST_GENERATOR);
      expect(baselines[1].agentType).toBe(QEAgentType.TEST_GENERATOR);
    });

    it('should return empty array for agent with no baselines', () => {
      const baselines = collector.getBaselinesForAgent(QEAgentType.CHAOS_ENGINEER);

      expect(baselines).toHaveLength(0);
    });
  });

  describe('baseline statistics', () => {
    beforeEach(async () => {
      // Collect multiple baselines
      await collector.collectBaseline(
        'test-gen-001',
        QEAgentType.TEST_GENERATOR,
        'unit-test-generation'
      );
      await collector.collectBaseline(
        'test-gen-002',
        QEAgentType.TEST_GENERATOR,
        'integration-test-generation'
      );
    });

    it('should calculate baseline stats for agent', () => {
      const stats = collector.getBaselineStats(QEAgentType.TEST_GENERATOR);

      expect(stats).toBeDefined();
      expect(stats?.agentType).toBe(QEAgentType.TEST_GENERATOR);
      expect(stats?.totalBaselines).toBe(2);
      expect(stats?.avgSuccessRate).toBeGreaterThanOrEqual(0);
      expect(stats?.avgSuccessRate).toBeLessThanOrEqual(1);
      expect(stats?.avgCompletionTime).toBeGreaterThan(0);
      expect(stats?.avgCoverage).toBeGreaterThanOrEqual(0);
      expect(stats?.lastCollected).toBeInstanceOf(Date);
    });

    it('should return null for agent with no baselines', () => {
      const stats = collector.getBaselineStats(QEAgentType.CHAOS_ENGINEER);

      expect(stats).toBeNull();
    });
  });

  describe('improvement targets', () => {
    let baseline: LearningBaseline;

    beforeEach(async () => {
      baseline = await collector.collectBaseline(
        'test-gen-001',
        QEAgentType.TEST_GENERATOR,
        'unit-test-generation'
      );
    });

    it('should calculate improvement target from baseline', () => {
      const target = collector.getImprovementTarget(baseline);

      expect(target).toBeDefined();
      expect(target.agentType).toBe(QEAgentType.TEST_GENERATOR);
      expect(target.taskType).toBe('unit-test-generation');
      expect(target.baseline).toEqual(baseline);
      expect(target.minImprovementThreshold).toBe(0.1); // 10%
      expect(target.aspirationalThreshold).toBe(0.2); // 20%

      // Target completion time should be 20% faster
      expect(target.targets.targetCompletionTime).toBe(
        baseline.metrics.avgCompletionTime * 0.8
      );

      // Target success rate should be 20% higher (capped at 1.0)
      // When baseline is already 100%, target equals baseline (at cap)
      expect(target.targets.targetSuccessRate).toBeLessThanOrEqual(1.0);
      expect(target.targets.targetSuccessRate).toBeGreaterThanOrEqual(baseline.metrics.successRate);

      // Target coverage should be 20% higher (capped at 100)
      expect(target.targets.targetCoverage).toBeLessThanOrEqual(100);
      expect(target.targets.targetCoverage).toBeGreaterThan(baseline.metrics.coverageAchieved);
    });

    it('should check if metrics meet improvement target', () => {
      const improvedMetrics = {
        avgCompletionTime: baseline.metrics.avgCompletionTime * 0.85, // 15% faster
        successRate: baseline.metrics.successRate * 1.15, // 15% better
        patternRecallAccuracy: baseline.metrics.patternRecallAccuracy * 1.15,
        coverageAchieved: baseline.metrics.coverageAchieved * 1.15, // 15% better
      };

      const result = collector.meetsImprovementTarget(baseline, improvedMetrics);

      expect(result.meetsTarget).toBe(true);
      expect(result.improvements.completionTime.met).toBe(true);
      expect(result.improvements.successRate.met).toBe(true);
      expect(result.improvements.coverage.met).toBe(true);
    });

    it('should detect when metrics do not meet target', () => {
      const unchangedMetrics = {
        avgCompletionTime: baseline.metrics.avgCompletionTime, // No improvement
        successRate: baseline.metrics.successRate, // No improvement
        patternRecallAccuracy: baseline.metrics.patternRecallAccuracy,
        coverageAchieved: baseline.metrics.coverageAchieved, // No improvement
      };

      const result = collector.meetsImprovementTarget(baseline, unchangedMetrics);

      expect(result.meetsTarget).toBe(false);
      expect(result.improvements.completionTime.met).toBe(false);
      expect(result.improvements.successRate.met).toBe(false);
      expect(result.improvements.coverage.met).toBe(false);
    });

    it('should pass with partial improvement (2 out of 3 metrics)', () => {
      const partialImprovement = {
        avgCompletionTime: baseline.metrics.avgCompletionTime * 0.85, // 15% faster (meets)
        successRate: baseline.metrics.successRate * 1.15, // 15% better (meets)
        patternRecallAccuracy: baseline.metrics.patternRecallAccuracy,
        coverageAchieved: baseline.metrics.coverageAchieved, // No improvement (does not meet)
      };

      const result = collector.meetsImprovementTarget(baseline, partialImprovement);

      expect(result.meetsTarget).toBe(true); // 2 out of 3 met
      expect(result.improvements.completionTime.met).toBe(true);
      expect(result.improvements.successRate.met).toBe(true);
      expect(result.improvements.coverage.met).toBe(false);
    });
  });

  describe('StandardTaskSuite integration', () => {
    let taskSuite: StandardTaskSuite;

    beforeEach(() => {
      taskSuite = new StandardTaskSuite();
    });

    it('should have tasks for all agent types', () => {
      const agentTypes = Object.values(QEAgentType);

      for (const agentType of agentTypes) {
        const tasks = taskSuite.getTasksForAgent(agentType);
        expect(tasks.length).toBeGreaterThan(0);
      }
    });

    it('should have 10 tasks per agent type', () => {
      // Most agent types should have 10 tasks
      const testGenTasks = taskSuite.getTasksForAgent(QEAgentType.TEST_GENERATOR);
      expect(testGenTasks).toHaveLength(10);

      const coverageTasks = taskSuite.getTasksForAgent(QEAgentType.COVERAGE_ANALYZER);
      expect(coverageTasks).toHaveLength(10);

      const securityTasks = taskSuite.getTasksForAgent(QEAgentType.SECURITY_SCANNER);
      expect(securityTasks).toHaveLength(10);
    });

    it('should filter tasks by task type', () => {
      const tasks = taskSuite.getTasksForAgent(
        QEAgentType.TEST_GENERATOR,
        'unit-test-generation'
      );

      expect(tasks.length).toBeGreaterThan(0);
      tasks.forEach(task => {
        expect(task.taskType).toBe('unit-test-generation');
      });
    });

    it('should get task types for an agent', () => {
      const taskTypes = taskSuite.getTaskTypesForAgent(QEAgentType.TEST_GENERATOR);

      expect(taskTypes.length).toBeGreaterThan(0);
      expect(taskTypes).toContain('unit-test-generation');
      expect(taskTypes).toContain('integration-test-generation');
    });

    it('should have valid task metadata', () => {
      const tasks = taskSuite.getTasksForAgent(QEAgentType.PERFORMANCE_TESTER);

      tasks.forEach(task => {
        expect(task.id).toBeDefined();
        expect(task.agentType).toBe(QEAgentType.PERFORMANCE_TESTER);
        expect(task.taskType).toBeDefined();
        expect(task.name).toBeDefined();
        expect(task.description).toBeDefined();
        expect(task.complexity).toMatch(/^(low|medium|high)$/);
        expect(task.expectedDuration).toBeGreaterThan(0);
        expect(task.input).toBeDefined();
      });
    });
  });

  describe('comprehensive baseline collection', () => {
    it('should collect baselines for multiple agents', async () => {
      const agentTypes = [
        QEAgentType.TEST_GENERATOR,
        QEAgentType.COVERAGE_ANALYZER,
        QEAgentType.QUALITY_GATE,
      ];

      for (const agentType of agentTypes) {
        const taskSuite = new StandardTaskSuite();
        const taskTypes = taskSuite.getTaskTypesForAgent(agentType);
        const taskType = taskTypes[0]; // Use first task type

        const baseline = await collector.collectBaseline(
          `agent-${agentType}`,
          agentType,
          taskType
        );

        expect(baseline).toBeDefined();
        expect(baseline.agentType).toBe(agentType);
      }
    });

    it('should handle concurrent baseline collection', async () => {
      const promises = [
        collector.collectBaseline(
          'test-gen-001',
          QEAgentType.TEST_GENERATOR,
          'unit-test-generation'
        ),
        collector.collectBaseline(
          'coverage-001',
          QEAgentType.COVERAGE_ANALYZER,
          'line-coverage-analysis'
        ),
        collector.collectBaseline(
          'security-001',
          QEAgentType.SECURITY_SCANNER,
          'vulnerability-scan'
        ),
      ];

      const baselines = await Promise.all(promises);

      expect(baselines).toHaveLength(3);
      baselines.forEach(baseline => {
        expect(baseline).toBeDefined();
        expect(baseline.metrics).toBeDefined();
      });
    });
  });
});
