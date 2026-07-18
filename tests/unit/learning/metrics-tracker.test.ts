/**
 * Regression tests for LearningMetricsTracker — getDashboardDataWithRegret
 *
 * Validates the new getDashboardDataWithRegret() method and DashboardData.regretHealth
 * field added in the march-fixes-and-improvements branch.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import {
  LearningMetricsTracker,
  createLearningMetricsTracker,
} from '../../../src/learning/metrics-tracker.js';
import type { DomainHealthSummary } from '../../../src/learning/regret-tracker.js';

// ============================================================================
// Tests
// ============================================================================

describe('LearningMetricsTracker — Regression: getDashboardDataWithRegret', () => {
  // These tests run against an ISOLATED temp SQLite database — never the real
  // project `.agentic-qe/memory.db` (that is our live learning DB; a stray
  // write would corrupt it, and reading it caused "database is locked" flakes
  // under the bind-mounted/parallel test runner). The tracker tolerates missing
  // learning tables (it probes sqlite_master first), so an empty DB exercises
  // the real getDashboardData* code paths and returns zeroed metrics.

  let tracker: LearningMetricsTracker;
  let projectRoot: string;

  beforeEach(() => {
    // Temp projectRoot with an empty-but-valid .agentic-qe/memory.db
    projectRoot = mkdtempSync(join(tmpdir(), 'aqe-metrics-tracker-'));
    mkdirSync(join(projectRoot, '.agentic-qe'), { recursive: true });
    // better-sqlite3 creates a valid empty SQLite file the tracker can reopen.
    new Database(join(projectRoot, '.agentic-qe', 'memory.db')).close();

    tracker = createLearningMetricsTracker(projectRoot);
  });

  afterEach(() => {
    tracker.close();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should create tracker instance', () => {
    expect(tracker).toBeDefined();
    expect(tracker).toBeInstanceOf(LearningMetricsTracker);
  });

  it('getDashboardDataWithRegret should return data without regret health', async () => {
    const data = await tracker.getDashboardDataWithRegret();
    expect(data).toBeDefined();
    expect(data.current).toBeDefined();
    expect(data.history).toBeDefined();
    expect(data.trends).toBeDefined();
    expect(data.topDomains).toBeDefined();
    expect(data.regretHealth).toBeUndefined();
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

    const data = await tracker.getDashboardDataWithRegret(mockRegretHealth);
    expect(data).toBeDefined();
    expect(data.regretHealth).toBeDefined();
    expect(data.regretHealth).toHaveLength(2);
    expect(data.regretHealth![0].domain).toBe('test-generation');
    expect(data.regretHealth![0].isLearning).toBe(true);
    expect(data.regretHealth![1].growthRate).toBe('insufficient-data');
  });

  it('getDashboardDataWithRegret should not attach regret health when empty array', async () => {
    const data = await tracker.getDashboardDataWithRegret([]);
    expect(data.regretHealth).toBeUndefined();
  });

  it('getDashboardData should return base data without regretHealth field', async () => {
    const data = await tracker.getDashboardData();
    expect(data).toBeDefined();
    // regretHealth should not be set by getDashboardData (only by getDashboardDataWithRegret)
    expect(data.regretHealth).toBeUndefined();
  });

  it('should throw a clear error when the database file is absent', async () => {
    const missingRoot = mkdtempSync(join(tmpdir(), 'aqe-metrics-tracker-missing-'));
    const t = createLearningMetricsTracker(missingRoot);
    try {
      await expect(t.getDashboardData()).rejects.toThrow('Database not found');
    } finally {
      t.close();
      rmSync(missingRoot, { recursive: true, force: true });
    }
  });
});
