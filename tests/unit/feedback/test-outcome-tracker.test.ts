/**
 * Unit Tests for TestOutcomeTracker
 * ADR-023: Quality Feedback Loop System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TestOutcomeTracker,
  createTestOutcomeTracker,
} from '../../../src/feedback/test-outcome-tracker.js';
import type { TestOutcome } from '../../../src/feedback/types.js';

describe('TestOutcomeTracker', () => {
  let tracker: TestOutcomeTracker;

  beforeEach(() => {
    tracker = createTestOutcomeTracker();
  });

  function createOutcome(overrides: Partial<TestOutcome> = {}): TestOutcome {
    return {
      id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      testId: `test-${Date.now()}`,
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

  describe('track', () => {
    it('should track a passing test outcome', async () => {
      const outcome = createOutcome({
        passed: true,
      });

      await tracker.track(outcome);
      const stats = tracker.getStats();

      expect(stats.totalTests).toBe(1);
      expect(stats.passedTests).toBe(1);
      expect(stats.passRate).toBe(1);
    });

    it('should track a failing test outcome', async () => {
      const outcome = createOutcome({
        passed: false,
        errorMessage: 'Test failed',
      });

      await tracker.track(outcome);
      const stats = tracker.getStats();

      expect(stats.totalTests).toBe(1);
      expect(stats.passedTests).toBe(0);
      expect(stats.passRate).toBe(0);
    });

    it('should track flaky tests', async () => {
      const outcome = createOutcome({
        passed: true,
        flaky: true,
        flakinessScore: 0.6,
      });

      await tracker.track(outcome);
      const stats = tracker.getStats();

      expect(stats.flakyTests).toBe(1);
    });

    it('should track outcomes with pattern associations', async () => {
      const outcome = createOutcome({
        patternId: 'pattern-123',
        passed: true,
      });

      await tracker.track(outcome);
      const metrics = tracker.getPatternMetrics('pattern-123');

      expect(metrics).toBeDefined();
      expect(metrics!.successCount).toBe(1);
      expect(metrics!.failureCount).toBe(0);
      expect(metrics!.successRate).toBe(1);
    });
  });

  describe('trackBatch', () => {
    it('should track multiple outcomes at once', async () => {
      const outcomes: TestOutcome[] = [
        createOutcome({ id: 'batch-1', testId: 'test-1', passed: true }),
        createOutcome({ id: 'batch-2', testId: 'test-2', passed: false }),
        createOutcome({ id: 'batch-3', testId: 'test-3', passed: true }),
      ];

      await tracker.trackBatch(outcomes);
      const stats = tracker.getStats();

      expect(stats.totalTests).toBe(3);
      expect(stats.passedTests).toBe(2);
      expect(stats.passRate).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('getStats', () => {
    it('should return correct aggregate statistics', async () => {
      // Add mixed outcomes
      await tracker.track(createOutcome({
        id: 't1', testId: 'test-1', passed: true, executionTimeMs: 100, maintainabilityScore: 0.7,
      }));
      await tracker.track(createOutcome({
        id: 't2', testId: 'test-2', passed: true, executionTimeMs: 50, maintainabilityScore: 0.9,
      }));
      await tracker.track(createOutcome({
        id: 't3', testId: 'test-3', passed: false, executionTimeMs: 200, maintainabilityScore: 0.5,
      }));
      await tracker.track(createOutcome({
        id: 't4', testId: 'test-4', passed: true, flaky: true, executionTimeMs: 150, maintainabilityScore: 0.65,
      }));

      const stats = tracker.getStats();

      expect(stats.totalTests).toBe(4);
      expect(stats.passedTests).toBe(3);
      expect(stats.flakyTests).toBe(1);
      expect(stats.passRate).toBe(0.75);
      expect(stats.avgExecutionTimeMs).toBe(125); // (100+50+200+150)/4
      expect(stats.avgMaintainability).toBeCloseTo(0.6875, 2);
    });

    it('should return zero stats for empty tracker', () => {
      const stats = tracker.getStats();

      expect(stats.totalTests).toBe(0);
      expect(stats.passedTests).toBe(0);
      expect(stats.passRate).toBe(0);
    });
  });

  describe('getPatternMetrics', () => {
    it('should aggregate metrics for a pattern', async () => {
      const patternId = 'pattern-abc';

      // Track multiple outcomes for the same pattern
      await tracker.track(createOutcome({
        id: 'p1', testId: 'test-1', patternId, passed: true, maintainabilityScore: 0.8,
      }));
      await tracker.track(createOutcome({
        id: 'p2', testId: 'test-2', patternId, passed: true, maintainabilityScore: 0.85,
      }));
      await tracker.track(createOutcome({
        id: 'p3', testId: 'test-3', patternId, passed: false, maintainabilityScore: 0.6,
      }));

      const metrics = tracker.getPatternMetrics(patternId);

      expect(metrics).toBeDefined();
      expect(metrics!.successCount).toBe(2);
      expect(metrics!.failureCount).toBe(1);
      expect(metrics!.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('should return null for unknown pattern', () => {
      const metrics = tracker.getPatternMetrics('unknown-pattern');
      expect(metrics).toBeNull();
    });
  });

  describe('getRecentOutcomes', () => {
    it('should return the most recent outcomes', async () => {
      for (let i = 0; i < 10; i++) {
        await tracker.track(createOutcome({
          id: `recent-${i}`,
          testId: `test-${i}`,
          executionTimeMs: 50 + i * 10,
          timestamp: new Date(Date.now() + i * 1000),
        }));
      }

      const recent = tracker.getRecentOutcomes(5);

      expect(recent).toHaveLength(5);
      expect(recent[0].testId).toBe('test-5');
      expect(recent[4].testId).toBe('test-9');
    });
  });

  describe('export/import', () => {
    it('should export and import outcomes', async () => {
      await tracker.track(createOutcome({
        id: 'export-1', testId: 'export-test',
      }));

      const exported = tracker.exportOutcomes();
      expect(exported).toHaveLength(1);

      // Create new tracker and import
      const newTracker = createTestOutcomeTracker();
      newTracker.importOutcomes(exported);

      const stats = newTracker.getStats();
      expect(stats.totalTests).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all tracked data', async () => {
      await tracker.track(createOutcome({
        id: 'clear-1', testId: 'clear-test',
      }));

      tracker.clear();
      const stats = tracker.getStats();

      expect(stats.totalTests).toBe(0);
    });
  });

  describe('getTrackerStats', () => {
    it('should return tracker statistics', async () => {
      await tracker.track(createOutcome({
        id: 'tracker-1', testId: 'test-1', patternId: 'p1',
      }));
      await tracker.track(createOutcome({
        id: 'tracker-2', testId: 'test-2', patternId: 'p2',
      }));

      const trackerStats = tracker.getTrackerStats();

      expect(trackerStats.totalOutcomes).toBe(2);
      expect(trackerStats.patternsTracked).toBe(2);
      expect(trackerStats.hasReasoningBank).toBe(false);
    });
  });
});
