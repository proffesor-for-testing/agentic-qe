/**
 * Unit Tests for CoverageLearner
 * ADR-023: Quality Feedback Loop System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CoverageLearner,
  createCoverageLearner,
} from '../../../src/feedback/coverage-learner.js';
import type { CoverageSession } from '../../../src/feedback/types.js';

describe('CoverageLearner', () => {
  let learner: CoverageLearner;

  beforeEach(() => {
    learner = createCoverageLearner();
  });

  function createSession(overrides: Partial<CoverageSession> = {}): CoverageSession {
    return {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      agentId: 'test-agent',
      targetPath: 'src/services/user.ts',
      technique: 'gap-analysis',
      beforeCoverage: { lines: 60, branches: 50, functions: 55 },
      afterCoverage: { lines: 75, branches: 65, functions: 70 },
      testsGenerated: 5,
      testsPassed: 4,
      gapsTargeted: [
        { id: 'gap-1', type: 'uncovered-branch', filePath: 'src/services/user.ts', startLine: 42, riskScore: 0.8, addressed: true },
        { id: 'gap-2', type: 'uncovered-function', filePath: 'src/services/user.ts', startLine: 100, riskScore: 0.5, addressed: true },
        { id: 'gap-3', type: 'uncovered-line', filePath: 'src/services/user.ts', startLine: 150, riskScore: 0.3, addressed: false },
      ],
      durationMs: 60000,
      startedAt: new Date(Date.now() - 60000),
      completedAt: new Date(),
      ...overrides,
    };
  }

  describe('learnFromSession', () => {
    it('should learn from successful coverage session', async () => {
      const session = createSession({
        beforeCoverage: { lines: 50, branches: 40, functions: 45 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 }, // 25% improvement
      });

      const strategy = await learner.learnFromSession(session);

      expect(strategy).not.toBeNull();
      expect(strategy!.technique).toBe('gap-analysis');
      expect(strategy!.avgImprovement).toBeGreaterThan(0);
      expect(strategy!.successCount).toBe(1);
    });

    it('should not learn from low improvement session', async () => {
      const session = createSession({
        beforeCoverage: { lines: 70, branches: 65, functions: 72 },
        afterCoverage: { lines: 71, branches: 66, functions: 73 }, // Only ~1% improvement
      });

      const strategy = await learner.learnFromSession(session);

      expect(strategy).toBeNull();
    });

    it('should update existing strategy on repeated success', async () => {
      const session1 = createSession({
        beforeCoverage: { lines: 50, branches: 40, functions: 45 },
        afterCoverage: { lines: 70, branches: 60, functions: 65 },
      });

      const session2 = createSession({
        id: 'session-2',
        beforeCoverage: { lines: 55, branches: 45, functions: 50 },
        afterCoverage: { lines: 80, branches: 70, functions: 75 },
      });

      await learner.learnFromSession(session1);
      const strategy = await learner.learnFromSession(session2);

      expect(strategy).not.toBeNull();
      expect(strategy!.successCount).toBe(2);
      expect(strategy!.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('getRecommendedStrategy', () => {
    it('should recommend best strategy for file pattern', async () => {
      // Learn from multiple sessions
      await learner.learnFromSession(createSession({
        targetPath: 'src/services/auth.ts',
        technique: 'gap-analysis',
        beforeCoverage: { lines: 40, branches: 30, functions: 35 },
        afterCoverage: { lines: 70, branches: 60, functions: 65 },
      }));

      await learner.learnFromSession(createSession({
        id: 'session-branch',
        targetPath: 'src/services/user.ts',
        technique: 'branch-coverage',
        beforeCoverage: { lines: 50, branches: 40, functions: 45 },
        afterCoverage: { lines: 85, branches: 80, functions: 82 },
      }));

      const recommendation = learner.getRecommendedStrategy('src/services/order.ts');

      expect(recommendation).not.toBeNull();
      // Should recommend branch-coverage as it had better improvement
      expect(recommendation!.technique).toBe('branch-coverage');
    });

    it('should return null when no strategies learned', () => {
      const recommendation = learner.getRecommendedStrategy('src/unknown/file.ts');
      expect(recommendation).toBeNull();
    });
  });

  describe('getSessionStats', () => {
    it('should return correct session statistics', async () => {
      await learner.learnFromSession(createSession({
        technique: 'gap-analysis',
        beforeCoverage: { lines: 50, branches: 40, functions: 45 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 },
      }));

      await learner.learnFromSession(createSession({
        id: 'session-2',
        technique: 'branch-coverage',
        beforeCoverage: { lines: 60, branches: 50, functions: 55 },
        afterCoverage: { lines: 80, branches: 75, functions: 78 },
      }));

      await learner.learnFromSession(createSession({
        id: 'session-3',
        technique: 'gap-analysis',
        beforeCoverage: { lines: 70, branches: 65, functions: 68 },
        afterCoverage: { lines: 72, branches: 67, functions: 70 }, // Low improvement
      }));

      const stats = learner.getSessionStats();

      expect(stats.totalSessions).toBe(3);
      expect(stats.successfulSessions).toBe(2); // Only 2 above threshold
      expect(stats.byTechnique.get('gap-analysis')!.count).toBe(2);
      expect(stats.byTechnique.get('branch-coverage')!.count).toBe(1);
      expect(stats.strategiesLearned).toBe(2);
    });

    it('should return zero stats for empty learner', () => {
      const stats = learner.getSessionStats();

      expect(stats.totalSessions).toBe(0);
      expect(stats.successfulSessions).toBe(0);
      expect(stats.avgImprovement).toBe(0);
    });
  });

  describe('analyzeGapResolution', () => {
    it('should analyze gap resolution effectiveness', async () => {
      await learner.learnFromSession(createSession({
        gapsTargeted: [
          { id: 'g1', type: 'uncovered-branch', filePath: 'file.ts', startLine: 10, riskScore: 0.8, addressed: true },
          { id: 'g2', type: 'uncovered-branch', filePath: 'file.ts', startLine: 20, riskScore: 0.7, addressed: true },
          { id: 'g3', type: 'uncovered-function', filePath: 'file.ts', startLine: 30, riskScore: 0.5, addressed: false },
        ],
        beforeCoverage: { lines: 50, branches: 40, functions: 45 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 },
      }));

      await learner.learnFromSession(createSession({
        id: 'session-2',
        gapsTargeted: [
          { id: 'g4', type: 'uncovered-branch', filePath: 'file.ts', startLine: 40, riskScore: 0.6, addressed: true },
          { id: 'g5', type: 'uncovered-line', filePath: 'file.ts', startLine: 50, riskScore: 0.3, addressed: true },
        ],
        beforeCoverage: { lines: 60, branches: 50, functions: 55 },
        afterCoverage: { lines: 80, branches: 75, functions: 78 },
      }));

      const analysis = learner.analyzeGapResolution();

      expect(analysis.totalGapsTargeted).toBe(5);
      expect(analysis.gapsAddressed).toBe(4);
      expect(analysis.resolutionRate).toBe(0.8);
      expect(analysis.byGapType.get('uncovered-branch')!.targeted).toBe(3);
      expect(analysis.byGapType.get('uncovered-branch')!.addressed).toBe(3);
    });

    it('should return zero analysis for empty learner', () => {
      const analysis = learner.analyzeGapResolution();

      expect(analysis.totalGapsTargeted).toBe(0);
      expect(analysis.resolutionRate).toBe(0);
    });
  });

  describe('getAllStrategies', () => {
    it('should return all learned strategies', async () => {
      await learner.learnFromSession(createSession({
        technique: 'gap-analysis',
        beforeCoverage: { lines: 50, branches: 40, functions: 45 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 },
      }));

      await learner.learnFromSession(createSession({
        id: 'session-2',
        technique: 'edge-case-generation',
        targetPath: 'src/utils/parser.ts',
        beforeCoverage: { lines: 60, branches: 50, functions: 55 },
        afterCoverage: { lines: 85, branches: 80, functions: 82 },
      }));

      const strategies = learner.getAllStrategies();

      expect(strategies.length).toBe(2);
      expect(strategies.some(s => s.technique === 'gap-analysis')).toBe(true);
      expect(strategies.some(s => s.technique === 'edge-case-generation')).toBe(true);
    });
  });

  describe('export/import', () => {
    it('should export and import sessions', async () => {
      await learner.learnFromSession(createSession({
        beforeCoverage: { lines: 50, branches: 40, functions: 45 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 },
      }));

      const exportedSessions = learner.exportSessions();
      const exportedStrategies = learner.exportStrategies();

      // Create new learner and import
      const newLearner = createCoverageLearner();
      newLearner.importSessions(exportedSessions);
      newLearner.importStrategies(exportedStrategies);

      const stats = newLearner.getSessionStats();
      expect(stats.totalSessions).toBe(1);
      expect(stats.strategiesLearned).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      await learner.learnFromSession(createSession({
        beforeCoverage: { lines: 50, branches: 40, functions: 45 },
        afterCoverage: { lines: 75, branches: 65, functions: 70 },
      }));

      learner.clear();
      const stats = learner.getSessionStats();

      expect(stats.totalSessions).toBe(0);
      expect(stats.strategiesLearned).toBe(0);
    });
  });

  describe('technique strategies', () => {
    it('should generate descriptive strategy for each technique', async () => {
      const techniques = [
        'gap-analysis',
        'branch-coverage',
        'edge-case-generation',
        'mutation-guided',
        'risk-based',
      ] as const;

      for (let i = 0; i < techniques.length; i++) {
        await learner.learnFromSession(createSession({
          id: `tech-session-${i}`,
          technique: techniques[i],
          targetPath: `src/test-${i}.ts`,
          beforeCoverage: { lines: 50, branches: 40, functions: 45 },
          afterCoverage: { lines: 80, branches: 70, functions: 75 },
        }));
      }

      const strategies = learner.getAllStrategies();
      expect(strategies.length).toBe(5);

      for (const strategy of strategies) {
        expect(strategy.description).toBeTruthy();
        expect(strategy.description.length).toBeGreaterThan(20);
      }
    });
  });
});
