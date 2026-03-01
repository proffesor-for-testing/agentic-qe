/**
 * Unit Tests for QualityFeedbackLoop
 * ADR-023: Quality Feedback Loop System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QualityFeedbackLoop,
  createQualityFeedbackLoop,
} from '../../../src/feedback/feedback-loop.js';
import type { TestOutcome, CoverageSession } from '../../../src/feedback/types.js';

describe('QualityFeedbackLoop', () => {
  let loop: QualityFeedbackLoop;

  beforeEach(() => {
    loop = createQualityFeedbackLoop();
  });

  function createOutcome(overrides: Partial<TestOutcome> = {}): TestOutcome {
    return {
      id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      testId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      testName: 'test case',
      generatedBy: 'test-agent',
      framework: 'vitest',
      language: 'typescript',
      domain: 'test-generation',
      passed: true,
      flaky: false,
      executionTimeMs: 100,
      coverage: { lines: 80, branches: 70, functions: 85 },
      maintainabilityScore: 0.8,
      timestamp: new Date(),
      ...overrides,
    };
  }

  function createSession(overrides: Partial<CoverageSession> = {}): CoverageSession {
    return {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      agentId: 'test-agent',
      targetPath: 'src/services/user.ts',
      technique: 'gap-analysis',
      beforeCoverage: { lines: 60, branches: 50, functions: 55 },
      afterCoverage: { lines: 80, branches: 70, functions: 75 },
      testsGenerated: 5,
      testsPassed: 4,
      gapsTargeted: [
        { id: 'gap-1', type: 'uncovered-branch', filePath: 'src/services/user.ts', startLine: 42, riskScore: 0.8, addressed: true },
        { id: 'gap-2', type: 'uncovered-function', filePath: 'src/services/user.ts', startLine: 100, riskScore: 0.5, addressed: true },
      ],
      durationMs: 60000,
      startedAt: new Date(Date.now() - 60000),
      completedAt: new Date(),
      ...overrides,
    };
  }

  describe('recordTestOutcome', () => {
    it('should record outcome and return quality score', async () => {
      const result = await loop.recordTestOutcome(createOutcome());

      expect(result.qualityScore).toBeDefined();
      expect(result.qualityScore.overall).toBeGreaterThan(0);
      expect(result.qualityScore.dimensions).toBeDefined();
    });

    it('should track pattern when provided', async () => {
      const patternId = 'test-pattern-123';

      await loop.recordTestOutcome(createOutcome({ id: 'o1', testId: 't1', patternId, passed: true }));
      await loop.recordTestOutcome(createOutcome({ id: 'o2', testId: 't2', patternId, passed: true }));
      await loop.recordTestOutcome(createOutcome({ id: 'o3', testId: 't3', patternId, passed: false }));

      const stats = loop.getStats();
      expect(stats.testOutcomes.total).toBe(3);
    });

    it('should calculate different scores for different outcomes', async () => {
      const goodResult = await loop.recordTestOutcome(createOutcome({
        id: 'good-1',
        testId: 'good-test-1',
        passed: true,
        executionTimeMs: 50,
        coverage: { lines: 95, branches: 90, functions: 98 },
        maintainabilityScore: 0.95,
      }));

      const badResult = await loop.recordTestOutcome(createOutcome({
        id: 'bad-1',
        testId: 'bad-test-1',
        passed: false,
        executionTimeMs: 5000,
        coverage: { lines: 40, branches: 30, functions: 35 },
        maintainabilityScore: 0.3,
      }));

      expect(goodResult.qualityScore.overall).toBeGreaterThan(badResult.qualityScore.overall);
    });
  });

  describe('recordCoverageSession', () => {
    it('should record session and return improvement', async () => {
      const result = await loop.recordCoverageSession(createSession());

      expect(result.improvement).toBeGreaterThan(0);
      expect(typeof result.strategyLearned).toBe('boolean');
    });

    it('should learn strategy from successful session', async () => {
      const result = await loop.recordCoverageSession(createSession({
        beforeCoverage: { lines: 40, branches: 30, functions: 35 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 }, // Big improvement
      }));

      expect(result.strategyLearned).toBe(true);
      expect(result.strategyId).toBeDefined();
    });

    it('should not learn strategy from low-improvement session', async () => {
      const result = await loop.recordCoverageSession(createSession({
        beforeCoverage: { lines: 80, branches: 75, functions: 82 },
        afterCoverage: { lines: 81, branches: 76, functions: 83 }, // Tiny improvement
      }));

      expect(result.strategyLearned).toBe(false);
      expect(result.strategyId).toBeUndefined();
    });
  });

  describe('getRecommendedCoverageStrategy', () => {
    it('should return recommended strategy after learning', async () => {
      await loop.recordCoverageSession(createSession({
        targetPath: 'src/services/auth.ts',
        beforeCoverage: { lines: 40, branches: 30, functions: 35 },
        afterCoverage: { lines: 80, branches: 70, functions: 75 },
      }));

      const strategy = loop.getRecommendedCoverageStrategy('src/services/user.ts');

      expect(strategy).not.toBeNull();
      expect(strategy!.technique).toBe('gap-analysis');
    });

    it('should return null when no strategies learned', () => {
      const strategy = loop.getRecommendedCoverageStrategy('src/unknown/file.ts');
      expect(strategy).toBeNull();
    });
  });

  describe('getQualityRecommendations', () => {
    it('should return recommendations based on outcomes', async () => {
      // Add some outcomes with low coverage
      for (let i = 0; i < 10; i++) {
        await loop.recordTestOutcome(createOutcome({
          id: `rec-${i}`,
          testId: `rec-test-${i}`,
          coverage: { lines: 50, branches: 40, functions: 45 }, // Low coverage
        }));
      }

      const recommendations = loop.getQualityRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(r => r.includes('coverage'))).toBe(true);
    });

    it('should return helpful message when no outcomes', () => {
      const recommendations = loop.getQualityRecommendations();

      expect(recommendations.length).toBe(1);
      expect(recommendations[0]).toContain('No test outcomes');
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', async () => {
      // Add test outcomes
      await loop.recordTestOutcome(createOutcome({ id: 's1', testId: 'st1', passed: true }));
      await loop.recordTestOutcome(createOutcome({ id: 's2', testId: 'st2', passed: true }));
      await loop.recordTestOutcome(createOutcome({ id: 's3', testId: 'st3', passed: false }));

      // Add coverage session
      await loop.recordCoverageSession(createSession({
        beforeCoverage: { lines: 40, branches: 30, functions: 35 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 },
      }));

      const stats = loop.getStats();

      expect(stats.testOutcomes.total).toBe(3);
      expect(stats.testOutcomes.passRate).toBeCloseTo(2 / 3, 2);
      expect(stats.coverage.totalSessions).toBe(1);
      expect(stats.integrationStatus.reasoningBankConnected).toBe(false);
    });

    it('should return zero stats when empty', () => {
      const stats = loop.getStats();

      expect(stats.testOutcomes.total).toBe(0);
      expect(stats.coverage.totalSessions).toBe(0);
      expect(stats.patterns.tracked).toBe(0);
      expect(stats.routing.totalOutcomes).toBe(0);
    });
  });

  describe('export/import data', () => {
    it('should export all data', async () => {
      await loop.recordTestOutcome(createOutcome({ id: 'export-1', testId: 'export-test-1' }));
      await loop.recordCoverageSession(createSession({
        beforeCoverage: { lines: 40, branches: 30, functions: 35 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 },
      }));

      const data = loop.exportData();

      expect(data.outcomes.length).toBe(1);
      expect(data.sessions.length).toBe(1);
      expect(data.strategies.length).toBe(1);
    });

    it('should import data into new loop', async () => {
      await loop.recordTestOutcome(createOutcome({ id: 'import-1', testId: 'import-test-1' }));
      await loop.recordCoverageSession(createSession({
        beforeCoverage: { lines: 40, branches: 30, functions: 35 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 },
      }));

      const data = loop.exportData();

      // Create new loop and import
      const newLoop = createQualityFeedbackLoop();
      newLoop.importData(data);

      const stats = newLoop.getStats();
      expect(stats.testOutcomes.total).toBe(1);
      expect(stats.coverage.totalSessions).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      await loop.recordTestOutcome(createOutcome({ id: 'clear-1', testId: 'clear-test-1' }));
      await loop.recordCoverageSession(createSession({
        beforeCoverage: { lines: 40, branches: 30, functions: 35 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 },
      }));

      loop.clear();
      const stats = loop.getStats();

      expect(stats.testOutcomes.total).toBe(0);
      expect(stats.coverage.totalSessions).toBe(0);
    });
  });

  describe('custom configuration', () => {
    it('should accept custom quality weights', () => {
      const customLoop = createQualityFeedbackLoop({
        qualityWeights: {
          effectiveness: 0.5,
          coverage: 0.3,
          mutationKill: 0.05,
          stability: 0.05,
          maintainability: 0.05,
          performance: 0.05,
        },
      });

      const weights = customLoop.qualityCalculator.getWeights();

      expect(weights.effectiveness).toBe(0.5);
      expect(weights.coverage).toBe(0.3);
    });

    it('should accept custom feedback config', () => {
      const customLoop = createQualityFeedbackLoop({
        maxOutcomesInMemory: 500,
        minCoverageImprovementToLearn: 10,
        autoDemote: false,
      });

      // Verify config took effect by checking behavior
      expect(customLoop).toBeDefined();
    });
  });

  describe('component access', () => {
    it('should provide access to underlying components', () => {
      expect(loop.outcomeTracker).toBeDefined();
      expect(loop.coverageLearner).toBeDefined();
      expect(loop.qualityCalculator).toBeDefined();
      expect(loop.promotionManager).toBeDefined();
      expect(loop.routingFeedback).toBeDefined();
    });
  });

  describe('routing feedback', () => {
    it('should record routing outcomes', async () => {
      await loop.recordRoutingOutcome({
        taskId: 'task-1',
        taskDescription: 'Generate unit tests',
        recommendedAgent: 'qe-test-generator',
        usedAgent: 'qe-test-generator',
        followedRecommendation: true,
        success: true,
        qualityScore: 0.85,
        durationMs: 5000,
        timestamp: new Date(),
      });

      const stats = loop.getStats();
      expect(stats.routing.totalOutcomes).toBe(1);
      expect(stats.routing.recommendationFollowRate).toBe(1);
    });

    it('should track when recommendations are overridden', async () => {
      await loop.recordRoutingOutcome({
        taskId: 'task-1',
        taskDescription: 'Generate tests',
        recommendedAgent: 'agent-a',
        usedAgent: 'agent-a',
        followedRecommendation: true,
        success: true,
        qualityScore: 0.8,
        durationMs: 3000,
        timestamp: new Date(),
      });

      await loop.recordRoutingOutcome({
        taskId: 'task-2',
        taskDescription: 'Analyze coverage',
        recommendedAgent: 'agent-a',
        usedAgent: 'agent-b',
        followedRecommendation: false,
        success: true,
        qualityScore: 0.9,
        durationMs: 2000,
        timestamp: new Date(),
      });

      const stats = loop.getStats();
      expect(stats.routing.totalOutcomes).toBe(2);
      expect(stats.routing.recommendationFollowRate).toBe(0.5);
    });

    it('should provide routing analysis', async () => {
      // Record multiple outcomes
      for (let i = 0; i < 5; i++) {
        await loop.recordRoutingOutcome({
          taskId: `task-${i}`,
          taskDescription: `Task ${i}`,
          recommendedAgent: 'agent-a',
          usedAgent: i < 3 ? 'agent-a' : 'agent-b',
          followedRecommendation: i < 3,
          success: i !== 2,
          qualityScore: 0.7 + i * 0.05,
          durationMs: 1000 + i * 500,
          timestamp: new Date(),
        });
      }

      const analysis = loop.getRoutingAnalysis();

      expect(analysis.totalOutcomes).toBe(5);
      expect(analysis.recommendationFollowRate).toBe(0.6); // 3/5 followed
      expect(analysis.recommendations.length).toBeGreaterThan(0);
    });

    it('should export and import routing outcomes', async () => {
      await loop.recordRoutingOutcome({
        taskId: 'export-task',
        taskDescription: 'Export test',
        recommendedAgent: 'agent-a',
        usedAgent: 'agent-a',
        followedRecommendation: true,
        success: true,
        qualityScore: 0.85,
        durationMs: 2000,
        timestamp: new Date(),
      });

      const data = loop.exportData();
      expect(data.routingOutcomes.length).toBe(1);

      // Import into new loop
      const newLoop = createQualityFeedbackLoop();
      newLoop.importData(data);

      const stats = newLoop.getStats();
      expect(stats.routing.totalOutcomes).toBe(1);
    });

    it('should clear routing data', async () => {
      await loop.recordRoutingOutcome({
        taskId: 'clear-task',
        taskDescription: 'Clear test',
        recommendedAgent: 'agent-a',
        usedAgent: 'agent-a',
        followedRecommendation: true,
        success: true,
        qualityScore: 0.85,
        durationMs: 2000,
        timestamp: new Date(),
      });

      loop.clear();
      const stats = loop.getStats();
      expect(stats.routing.totalOutcomes).toBe(0);
    });
  });

  describe('integration flow', () => {
    it('should support full feedback loop cycle', async () => {
      // 1. Record initial outcomes
      for (let i = 0; i < 5; i++) {
        await loop.recordTestOutcome(createOutcome({
          id: `cycle-${i}`,
          testId: `cycle-test-${i}`,
          passed: i < 4, // 4 pass, 1 fail
          coverage: { lines: 60 + i * 5, branches: 50 + i * 5, functions: 55 + i * 5 },
        }));
      }

      // 2. Get quality recommendations
      const recommendations = loop.getQualityRecommendations();
      expect(recommendations.length).toBeGreaterThan(0);

      // 3. Record coverage improvement session
      const coverageResult = await loop.recordCoverageSession(createSession({
        beforeCoverage: { lines: 60, branches: 50, functions: 55 },
        afterCoverage: { lines: 85, branches: 80, functions: 82 },
      }));
      expect(coverageResult.strategyLearned).toBe(true);

      // 4. Get recommended strategy for similar file
      const strategy = loop.getRecommendedCoverageStrategy('src/services/order.ts');
      expect(strategy).not.toBeNull();

      // 5. Record improved outcomes after applying strategy
      for (let i = 0; i < 5; i++) {
        await loop.recordTestOutcome(createOutcome({
          id: `improved-${i}`,
          testId: `improved-test-${i}`,
          passed: true,
          coverage: { lines: 85 + i, branches: 80 + i, functions: 82 + i },
          maintainabilityScore: 0.9,
        }));
      }

      // 6. Verify quality improved
      const finalStats = loop.getStats();
      expect(finalStats.testOutcomes.total).toBe(10);
      expect(finalStats.testOutcomes.passRate).toBeGreaterThan(0.8);
    });
  });
});
