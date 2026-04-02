/**
 * Tests for the QE Quality Daemon Nightly Consolidation (IMP-10).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PriorityQueue } from '../../../src/workers/quality-daemon/priority-queue';
import { NightlyConsolidation, type DaemonStats } from '../../../src/workers/quality-daemon/nightly-consolidation';
import type { WorkerMemory } from '../../../src/workers/interfaces';

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

const defaultStats: DaemonStats = {
  coverageHealth: 85,
  ciHealth: 90,
  commitsAnalyzed: 12,
  suggestionsGenerated: 5,
  notificationsSent: 3,
  queueDepthAvg: 2,
  uptimeSeconds: 3600,
};

describe('NightlyConsolidation', () => {
  let queue: PriorityQueue;
  let consolidation: NightlyConsolidation;
  let memory: WorkerMemory;

  beforeEach(() => {
    queue = new PriorityQueue();
    consolidation = new NightlyConsolidation(queue, { nightlyHour: 0 });
    memory = createMockMemory();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // shouldRun
  // -------------------------------------------------------------------------

  it('should run when past nightly hour and not yet run today', () => {
    vi.setSystemTime(new Date('2026-04-01T03:00:00'));
    expect(consolidation.shouldRun()).toBe(true);
  });

  it('should not run if already ran today', async () => {
    vi.setSystemTime(new Date('2026-04-01T03:00:00'));
    await consolidation.execute(memory, defaultStats);
    expect(consolidation.shouldRun()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // scheduleIfDue
  // -------------------------------------------------------------------------

  it('enqueues a "later" nightly item when due', () => {
    vi.setSystemTime(new Date('2026-04-01T03:00:00'));
    const result = consolidation.scheduleIfDue();
    expect(result).toBe(true);
    expect(queue.size).toBe(1);
    const item = queue.dequeue()!;
    expect(item.priority).toBe('later');
    expect(item.source).toBe('nightly-consolidation');
  });

  it('does not enqueue when not due (before nightly hour)', () => {
    // nightlyHour is 0, but set time before midnight (previous day 23:00)
    const lateNight = new NightlyConsolidation(queue, { nightlyHour: 23 });
    vi.setSystemTime(new Date('2026-04-01T10:00:00')); // 10 AM, before hour 23
    const result = lateNight.scheduleIfDue();
    expect(result).toBe(false);
    expect(queue.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  it('executes consolidation and generates report', async () => {
    vi.setSystemTime(new Date('2026-04-01T03:00:00'));

    const result = await consolidation.execute(memory, defaultStats);

    expect(result.reportGenerated).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.patternsConsolidated).toBeGreaterThanOrEqual(0);
    expect(result.entriesPruned).toBeGreaterThanOrEqual(0);
  });

  it('stores report in memory with date key', async () => {
    vi.setSystemTime(new Date('2026-04-01T03:00:00'));
    await consolidation.execute(memory, defaultStats);

    const report = await memory.get<{ date: string }>('quality-daemon:nightly:report:2026-04-01');
    expect(report).toBeDefined();
    expect(report!.date).toBe('2026-04-01');
  });

  it('prunes entries older than maxEntryAge', async () => {
    vi.setSystemTime(new Date('2026-04-01T03:00:00'));

    // Store an old entry
    await memory.set('quality-daemon:old-entry', {
      timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days old
    });

    const result = await consolidation.execute(memory, defaultStats);
    expect(result.entriesPruned).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // getLastResult
  // -------------------------------------------------------------------------

  it('getLastResult returns undefined before first run', async () => {
    const result = await consolidation.getLastResult(memory);
    expect(result).toBeUndefined();
  });

  it('getLastResult returns result after execution', async () => {
    vi.setSystemTime(new Date('2026-04-01T03:00:00'));
    await consolidation.execute(memory, defaultStats);

    const result = await consolidation.getLastResult(memory);
    expect(result).toBeDefined();
    expect(result!.reportGenerated).toBe(true);
  });
});
