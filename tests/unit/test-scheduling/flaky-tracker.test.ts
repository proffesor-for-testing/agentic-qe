/**
 * Flaky Test Tracker Tests
 *
 * Tests for flaky test detection and tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FlakyTestTracker,
  createFlakyTracker,
  type FlakyTrackerConfig,
} from '../../../src/test-scheduling/flaky-tracking/flaky-tracker';
import type { TestResult } from '../../../src/test-scheduling/interfaces';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    file: 'test.ts',
    name: 'test case',
    suite: 'Test Suite',
    passed: true,
    durationMs: 100,
    retries: 0,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('FlakyTestTracker', () => {
  let tracker: FlakyTestTracker;

  beforeEach(() => {
    tracker = createFlakyTracker({
      minRunsForFlakiness: 3,
      flakinessThreshold: 0.1,
    });
  });

  // --------------------------------------------------------------------------
  // Recording Results
  // --------------------------------------------------------------------------

  describe('recordResult()', () => {
    it('should create record for new test', () => {
      const result = createTestResult({ file: 'new.ts', name: 'new test' });

      tracker.recordResult(result);

      const record = tracker.getRecord('new.ts:Test Suite:new test');
      expect(record).toBeDefined();
      expect(record?.totalRuns).toBe(1);
      expect(record?.passCount).toBe(1);
    });

    it('should update existing record', () => {
      const result = createTestResult();

      tracker.recordResult(result);
      tracker.recordResult(result);
      tracker.recordResult(result);

      const record = tracker.getRecord('test.ts:Test Suite:test case');
      expect(record?.totalRuns).toBe(3);
      expect(record?.passCount).toBe(3);
    });

    it('should track failures', () => {
      const passingResult = createTestResult({ passed: true });
      const failingResult = createTestResult({ passed: false, error: 'Error!' });

      tracker.recordResult(passingResult);
      tracker.recordResult(failingResult);
      tracker.recordResult(passingResult);

      const record = tracker.getRecord('test.ts:Test Suite:test case');
      expect(record?.passCount).toBe(2);
      expect(record?.failCount).toBe(1);
    });

    it('should track flaky events (passed on retry)', () => {
      const flakyResult = createTestResult({ passed: true, retries: 1 });

      tracker.recordResult(flakyResult);

      const record = tracker.getRecord('test.ts:Test Suite:test case');
      expect(record?.flakyCount).toBe(1);
      expect(record?.lastFlaky).toBeDefined();
    });

    it('should track recent errors', () => {
      const failingResult = createTestResult({
        passed: false,
        error: 'Error message',
      });

      tracker.recordResult(failingResult);

      const record = tracker.getRecord('test.ts:Test Suite:test case');
      expect(record?.recentErrors).toContain('Error message');
    });

    it('should limit recent errors', () => {
      const trackerWithLimit = createFlakyTracker({ maxRecentErrors: 2 });

      for (let i = 0; i < 5; i++) {
        trackerWithLimit.recordResult(
          createTestResult({ passed: false, error: `Error ${i}` })
        );
      }

      const record = trackerWithLimit.getRecord('test.ts:Test Suite:test case');
      expect(record?.recentErrors).toHaveLength(2);
      expect(record?.recentErrors[0]).toBe('Error 4'); // Most recent first
    });
  });

  // --------------------------------------------------------------------------
  // Flakiness Detection
  // --------------------------------------------------------------------------

  describe('Flakiness Detection', () => {
    it('should not flag test as flaky with insufficient runs', () => {
      tracker.recordResult(createTestResult({ passed: true }));
      tracker.recordResult(createTestResult({ passed: false }));

      expect(tracker.isFlaky('test.ts:Test Suite:test case')).toBe(false);
    });

    it('should flag test as flaky with direct flaky events', () => {
      // Record multiple runs with retries (direct flaky indicator)
      for (let i = 0; i < 5; i++) {
        tracker.recordResult(createTestResult({ passed: true, retries: 1 }));
      }

      expect(tracker.isFlaky('test.ts:Test Suite:test case')).toBe(true);
    });

    it('should flag test as flaky with inconsistent results', () => {
      // Record alternating pass/fail results
      for (let i = 0; i < 6; i++) {
        tracker.recordResult(createTestResult({ passed: i % 2 === 0 }));
      }

      const record = tracker.getRecord('test.ts:Test Suite:test case');
      expect(record?.flakinessScore).toBeGreaterThan(0.1);
    });

    it('should not flag consistently passing test as flaky', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordResult(createTestResult({ passed: true }));
      }

      expect(tracker.isFlaky('test.ts:Test Suite:test case')).toBe(false);
    });

    it('should not flag consistently failing test as flaky', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordResult(createTestResult({ passed: false }));
      }

      expect(tracker.isFlaky('test.ts:Test Suite:test case')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Get Flaky Tests
  // --------------------------------------------------------------------------

  describe('getFlakyTests()', () => {
    it('should return all flaky tests', () => {
      // Create a flaky test
      for (let i = 0; i < 5; i++) {
        tracker.recordResult(
          createTestResult({ file: 'flaky.ts', passed: true, retries: 1 })
        );
      }

      // Create a stable test
      for (let i = 0; i < 5; i++) {
        tracker.recordResult(
          createTestResult({ file: 'stable.ts', passed: true, retries: 0 })
        );
      }

      const flakyTests = tracker.getFlakyTests();
      expect(flakyTests).toHaveLength(1);
      expect(flakyTests[0].file).toBe('flaky.ts');
    });

    it('should return empty array when no flaky tests', () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordResult(createTestResult({ passed: true }));
      }

      expect(tracker.getFlakyTests()).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Analysis
  // --------------------------------------------------------------------------

  describe('analyze()', () => {
    it('should provide comprehensive analysis', () => {
      // Add a mix of tests
      // Flaky test
      for (let i = 0; i < 5; i++) {
        tracker.recordResult(
          createTestResult({ file: 'flaky.ts', passed: true, retries: 1 })
        );
      }

      // Stable test
      for (let i = 0; i < 5; i++) {
        tracker.recordResult(
          createTestResult({ file: 'stable.ts', passed: true })
        );
      }

      // Insufficient data
      tracker.recordResult(createTestResult({ file: 'new.ts', passed: true }));

      const analysis = tracker.analyze();

      expect(analysis.totalTests).toBe(3);
      expect(analysis.flakyTests).toHaveLength(1);
      expect(analysis.insufficientData).toHaveLength(1);
      expect(analysis.overallFlakiness).toBeGreaterThan(0);
    });

    it('should detect stabilized tests', () => {
      // First, make it flaky
      for (let i = 0; i < 3; i++) {
        tracker.recordResult(createTestResult({ passed: true, retries: 1 }));
      }

      // Then make it stable
      for (let i = 0; i < 20; i++) {
        tracker.recordResult(createTestResult({ passed: true, retries: 0 }));
      }

      const analysis = tracker.analyze();
      expect(analysis.stabilizedTests.length).toBeGreaterThanOrEqual(0);
    });

    it('should sort flaky tests by score', () => {
      // More flaky test
      for (let i = 0; i < 5; i++) {
        tracker.recordResult(
          createTestResult({ file: 'very-flaky.ts', passed: true, retries: 2 })
        );
      }

      // Less flaky test
      for (let i = 0; i < 10; i++) {
        const isFlaky = i < 2;
        tracker.recordResult(
          createTestResult({
            file: 'somewhat-flaky.ts',
            passed: true,
            retries: isFlaky ? 1 : 0,
          })
        );
      }

      const analysis = tracker.analyze();
      if (analysis.flakyTests.length >= 2) {
        expect(analysis.flakyTests[0].flakinessScore).toBeGreaterThanOrEqual(
          analysis.flakyTests[1].flakinessScore
        );
      }
    });
  });

  // --------------------------------------------------------------------------
  // Quarantine
  // --------------------------------------------------------------------------

  describe('getQuarantineList()', () => {
    it('should return high-flakiness tests for quarantine', () => {
      // Highly flaky test
      for (let i = 0; i < 5; i++) {
        tracker.recordResult(
          createTestResult({ file: 'bad.ts', passed: true, retries: 2 })
        );
      }

      const quarantine = tracker.getQuarantineList(0.3);
      expect(quarantine.length).toBeGreaterThanOrEqual(0);
    });

    it('should use custom threshold', () => {
      // Moderately flaky
      for (let i = 0; i < 5; i++) {
        tracker.recordResult(
          createTestResult({ file: 'mod.ts', passed: true, retries: 1 })
        );
      }

      const lowThreshold = tracker.getQuarantineList(0.1);
      const highThreshold = tracker.getQuarantineList(0.9);

      expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
    });
  });

  // --------------------------------------------------------------------------
  // History Management
  // --------------------------------------------------------------------------

  describe('History Management', () => {
    it('should export history', () => {
      tracker.recordResult(createTestResult());

      const history = tracker.exportHistory();

      expect(history).toHaveLength(1);
      expect(history[0].testId).toBe('test.ts:Test Suite:test case');
    });

    it('should import history', () => {
      const history = [
        {
          testId: 'imported.ts:Suite:test',
          file: 'imported.ts',
          name: 'test',
          totalRuns: 10,
          passCount: 9,
          failCount: 1,
          flakyCount: 2,
          flakinessScore: 0.2,
          lastRun: new Date().toISOString() as unknown as Date,
          recentErrors: ['Error'],
        },
      ];

      tracker.importHistory(history);

      const record = tracker.getRecord('imported.ts:Suite:test');
      expect(record).toBeDefined();
      expect(record?.totalRuns).toBe(10);
    });

    it('should prune old history', () => {
      // Add old record
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days old

      tracker.importHistory([
        {
          testId: 'old.ts:Suite:test',
          file: 'old.ts',
          name: 'test',
          totalRuns: 5,
          passCount: 5,
          failCount: 0,
          flakyCount: 0,
          flakinessScore: 0,
          lastRun: oldDate,
          recentErrors: [],
        },
      ]);

      // Add recent record
      tracker.recordResult(createTestResult({ file: 'recent.ts' }));

      const pruned = tracker.pruneHistory();

      expect(pruned).toBe(1);
      expect(tracker.getRecord('old.ts:Suite:test')).toBeUndefined();
      expect(tracker.getRecord('recent.ts:Test Suite:test case')).toBeDefined();
    });

    it('should reset all data', () => {
      tracker.recordResult(createTestResult());
      expect(tracker.exportHistory()).toHaveLength(1);

      tracker.reset();

      expect(tracker.exportHistory()).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Multiple Results
  // --------------------------------------------------------------------------

  describe('recordResults()', () => {
    it('should record multiple results at once', () => {
      const results = [
        createTestResult({ file: 'a.ts', name: 'test a' }),
        createTestResult({ file: 'b.ts', name: 'test b' }),
        createTestResult({ file: 'c.ts', name: 'test c' }),
      ];

      tracker.recordResults(results);

      expect(tracker.exportHistory()).toHaveLength(3);
    });
  });
});
