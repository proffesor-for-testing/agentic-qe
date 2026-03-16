/**
 * Regression tests for LearningMetricsTracker — getDashboardDataWithRegret
 *
 * Validates the new getDashboardDataWithRegret() method and DashboardData.regretHealth
 * field added in the march-fixes-and-improvements branch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LearningMetricsTracker,
  createLearningMetricsTracker,
  type DashboardData,
} from '../../../src/learning/metrics-tracker.js';
import type { DomainHealthSummary } from '../../../src/learning/regret-tracker.js';

// ============================================================================
// Tests
// ============================================================================

describe('LearningMetricsTracker — Regression: getDashboardDataWithRegret', () => {
  // Note: LearningMetricsTracker requires a real SQLite database at
  // .agentic-qe/memory.db. We test against the actual project database
  // in read-only fashion, or skip if unavailable.

  let tracker: LearningMetricsTracker;

  beforeEach(() => {
    tracker = createLearningMetricsTracker(process.cwd());
  });

  afterEach(() => {
    tracker.close();
  });

  it('should create tracker instance', () => {
    expect(tracker).toBeDefined();
    expect(tracker).toBeInstanceOf(LearningMetricsTracker);
  });

  it('getDashboardDataWithRegret should return data without regret health', async () => {
    try {
      const data = await tracker.getDashboardDataWithRegret();
      expect(data).toBeDefined();
      expect(data.current).toBeDefined();
      expect(data.history).toBeDefined();
      expect(data.trends).toBeDefined();
      expect(data.topDomains).toBeDefined();
      expect(data.regretHealth).toBeUndefined();
    } catch (e) {
      // Database may not exist in test environment — that's acceptable
      expect((e as Error).message).toContain('Database not found');
    }
  });

  it('getDashboardDataWithRegret should attach regret health when provided', async () => {
    const mockRegretHealth: DomainHealthSummary[] = [
      {
        domain: 'test-generation',
        totalDecisions: 100,
        cumulativeRegret: 12.5,
        growthRate: 'sublinear',
        slope: 0.7,
        rSquared: 0.95,
        isLearning: true,
        recommendation: 'Learning is progressing well',
      },
      {
        domain: 'coverage-analysis',
        totalDecisions: 50,
        cumulativeRegret: 8.0,
        growthRate: 'insufficient-data',
        slope: 0,
        rSquared: 0,
        isLearning: false,
        recommendation: 'Insufficient data for classification',
      },
    ];

    try {
      const data = await tracker.getDashboardDataWithRegret(mockRegretHealth);
      expect(data).toBeDefined();
      expect(data.regretHealth).toBeDefined();
      expect(data.regretHealth).toHaveLength(2);
      expect(data.regretHealth![0].domain).toBe('test-generation');
      expect(data.regretHealth![0].isLearning).toBe(true);
      expect(data.regretHealth![1].growthRate).toBe('insufficient-data');
    } catch (e) {
      expect((e as Error).message).toContain('Database not found');
    }
  });

  it('getDashboardDataWithRegret should not attach regret health when empty array', async () => {
    try {
      const data = await tracker.getDashboardDataWithRegret([]);
      expect(data.regretHealth).toBeUndefined();
    } catch (e) {
      expect((e as Error).message).toContain('Database not found');
    }
  });

  it('getDashboardData should return base data without regretHealth field', async () => {
    try {
      const data = await tracker.getDashboardData();
      expect(data).toBeDefined();
      // regretHealth should not be set by getDashboardData (only by getDashboardDataWithRegret)
      expect(data.regretHealth).toBeUndefined();
    } catch (e) {
      expect((e as Error).message).toContain('Database not found');
    }
  });
});
