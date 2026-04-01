/**
 * Tests for the QE Quality Daemon Coverage Delta Analyzer (IMP-10).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PriorityQueue } from '../../../src/workers/quality-daemon/priority-queue';
import { CoverageDeltaAnalyzer, type CoverageSnapshot } from '../../../src/workers/quality-daemon/coverage-delta';
import type { WorkerMemory } from '../../../src/workers/interfaces';

// Simple in-memory mock for WorkerMemory
function createMockMemory(): WorkerMemory {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
    async search(pattern: string): Promise<string[]> {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(store.keys()).filter((k) => regex.test(k));
    },
  };
}

function makeSnapshot(overrides?: Partial<CoverageSnapshot>): CoverageSnapshot {
  return {
    timestamp: Date.now(),
    overall: { line: 80, branch: 70, function: 85, statement: 82 },
    files: {
      'src/foo.ts': { line: 90, branch: 80, uncoveredLines: [10, 20], totalLines: 100 },
      'src/bar.ts': { line: 60, branch: 50, uncoveredLines: [5, 15, 25, 35], totalLines: 50 },
    },
    ...overrides,
  };
}

describe('CoverageDeltaAnalyzer', () => {
  let queue: PriorityQueue;
  let analyzer: CoverageDeltaAnalyzer;
  let memory: WorkerMemory;

  beforeEach(() => {
    queue = new PriorityQueue();
    analyzer = new CoverageDeltaAnalyzer(queue);
    memory = createMockMemory();
  });

  // -------------------------------------------------------------------------
  // First run (no previous snapshot)
  // -------------------------------------------------------------------------

  it('returns zero delta on first run with no previous snapshot', async () => {
    const snapshot = makeSnapshot();
    const result = await analyzer.analyze(snapshot, memory);

    expect(result.regressionDetected).toBe(false);
    expect(result.overallDelta.line).toBe(0);
    expect(result.affectedFiles).toHaveLength(0);
    expect(result.newGaps).toHaveLength(0);
  });

  it('stores snapshot in memory for next comparison', async () => {
    const snapshot = makeSnapshot();
    await analyzer.analyze(snapshot, memory);

    const stored = await memory.get<CoverageSnapshot>('quality-daemon:coverage:snapshot');
    expect(stored).toBeDefined();
    expect(stored!.overall.line).toBe(80);
  });

  // -------------------------------------------------------------------------
  // Regression detection
  // -------------------------------------------------------------------------

  it('detects regression when line coverage drops by more than threshold', async () => {
    // First run — establish baseline
    const baseline = makeSnapshot({ overall: { line: 80, branch: 70, function: 85, statement: 82 } });
    await analyzer.analyze(baseline, memory);

    // Second run — coverage dropped
    const regressed = makeSnapshot({ overall: { line: 75, branch: 65, function: 85, statement: 82 } });
    const result = await analyzer.analyze(regressed, memory);

    expect(result.regressionDetected).toBe(true);
    expect(result.overallDelta.line).toBe(-5);
    expect(result.overallDelta.branch).toBe(-5);
  });

  it('does not flag regression for minor drops within threshold', async () => {
    const baseline = makeSnapshot({ overall: { line: 80, branch: 70, function: 85, statement: 82 } });
    await analyzer.analyze(baseline, memory);

    const minor = makeSnapshot({ overall: { line: 79, branch: 69, function: 85, statement: 82 } });
    const result = await analyzer.analyze(minor, memory);

    expect(result.regressionDetected).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Gap detection
  // -------------------------------------------------------------------------

  it('identifies files below gap threshold', async () => {
    const baseline = makeSnapshot();
    await analyzer.analyze(baseline, memory);

    const current = makeSnapshot({
      files: {
        'src/foo.ts': { line: 90, branch: 80, uncoveredLines: [10, 20], totalLines: 100 },
        'src/low.ts': { line: 40, branch: 30, uncoveredLines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], totalLines: 20 },
      },
    });
    const result = await analyzer.analyze(current, memory, ['src/low.ts']);

    expect(result.newGaps).toHaveLength(1);
    expect(result.newGaps[0].file).toBe('src/low.ts');
    expect(result.newGaps[0].currentCoverage).toBe(40);
    expect(result.newGaps[0].riskScore).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Queue interaction
  // -------------------------------------------------------------------------

  it('enqueues coverage_delta item when regression detected', async () => {
    const baseline = makeSnapshot({ overall: { line: 80, branch: 70, function: 85, statement: 82 } });
    await analyzer.analyze(baseline, memory);

    const regressed = makeSnapshot({ overall: { line: 70, branch: 60, function: 85, statement: 82 } });
    await analyzer.analyze(regressed, memory);

    expect(queue.size).toBeGreaterThan(0);
    const item = queue.dequeue()!;
    expect(item.source).toBe('coverage-delta');
    expect(item.payload.type).toBe('coverage_delta');
    expect(item.ttlMs).toBe(10 * 60 * 1000);
  });

  it('enqueues with "now" priority when high-risk gaps exist (riskScore > 0.8)', async () => {
    const baseline = makeSnapshot();
    await analyzer.analyze(baseline, memory);

    // File with very low coverage → high risk score
    const regressed = makeSnapshot({
      overall: { line: 70, branch: 60, function: 85, statement: 82 },
      files: {
        'src/critical.ts': {
          line: 15,
          branch: 10,
          uncoveredLines: Array.from({ length: 50 }, (_, i) => i),
          totalLines: 100,
        },
      },
    });
    await analyzer.analyze(regressed, memory, ['src/critical.ts']);

    expect(queue.size).toBeGreaterThan(0);
    const item = queue.dequeue()!;
    expect(item.priority).toBe('now');
  });

  it('enqueues with "next" priority when no high-risk gaps', async () => {
    const baseline = makeSnapshot({ overall: { line: 80, branch: 70, function: 85, statement: 82 } });
    await analyzer.analyze(baseline, memory);

    // Regression but no individual file gap below threshold
    const regressed = makeSnapshot({
      overall: { line: 75, branch: 65, function: 85, statement: 82 },
      files: {
        'src/foo.ts': { line: 90, branch: 80, uncoveredLines: [10], totalLines: 100 },
      },
    });
    await analyzer.analyze(regressed, memory);

    expect(queue.size).toBeGreaterThan(0);
    const item = queue.dequeue()!;
    expect(item.priority).toBe('next');
  });

  // -------------------------------------------------------------------------
  // Risk score clamping
  // -------------------------------------------------------------------------

  it('clamps coverage > 100% to prevent negative risk scores', async () => {
    const baseline = makeSnapshot();
    await analyzer.analyze(baseline, memory);

    const current = makeSnapshot({
      files: {
        'src/overcounted.ts': {
          line: 110, // can happen with some coverage tools
          branch: 95,
          uncoveredLines: [],
          totalLines: 50,
        },
      },
    });
    const result = await analyzer.analyze(current, memory, ['src/overcounted.ts']);
    // Should not produce negative risk or crash
    for (const gap of result.newGaps) {
      expect(gap.riskScore).toBeGreaterThanOrEqual(0);
    }
  });

  // -------------------------------------------------------------------------
  // buildSnapshot
  // -------------------------------------------------------------------------

  it('buildSnapshot returns undefined when no coverage data exists', async () => {
    const result = await analyzer.buildSnapshot(memory);
    expect(result).toBeUndefined();
  });

  it('buildSnapshot constructs snapshot from memory', async () => {
    await memory.set('coverage:latest', {
      line: 85,
      branch: 75,
      function: 90,
      statement: 88,
    });

    const result = await analyzer.buildSnapshot(memory);
    expect(result).toBeDefined();
    expect(result!.overall.line).toBe(85);
  });
});
