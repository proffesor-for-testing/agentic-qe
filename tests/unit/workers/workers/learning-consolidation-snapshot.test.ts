/**
 * A18 — LearningConsolidationWorker now saves a daily metrics snapshot on
 * every tick, piggybacking on the worker's existing ~30-min cadence instead
 * of requiring the manual `aqe learning dashboard --save-snapshot` flag
 * (`learning_daily_snapshots` previously had 0 rows in a real dev DB with
 * months of activity — nothing but that manual flag ever wrote to it).
 *
 * Mirrors the harness pattern from `learning-consolidation-liveness.test.ts`:
 * stub the inner consolidation phases so no real DB/DreamEngine is needed,
 * then assert on the snapshot side-effect via a mocked metrics-tracker.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearningConsolidationWorker } from '../../../../src/workers/workers/learning-consolidation';
import * as metricsTrackerModule from '../../../../src/learning/metrics-tracker';
import type { WorkerContext, WorkerMemory } from '../../../../src/workers/interfaces';

function makeMemory(): WorkerMemory {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
    async search(pattern: string): Promise<string[]> {
      const prefix = pattern.replace(/\*+$/, '');
      return Array.from(store.keys()).filter((k) => k.startsWith(prefix));
    },
  };
}

function makeContext(memory: WorkerMemory): WorkerContext {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    eventBus: { publish: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() } as unknown as WorkerContext['eventBus'],
    memory,
    logger,
    domains: {
      getDomainAPI: () => undefined,
      getDomainHealth: () => ({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  };
}

describe('A18 — LearningConsolidationWorker daily snapshot on tick', () => {
  let worker: LearningConsolidationWorker;
  let saveSnapshotMock: ReturnType<typeof vi.fn>;
  let closeMock: ReturnType<typeof vi.fn>;
  let createTrackerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    worker = new LearningConsolidationWorker();
    saveSnapshotMock = vi.fn().mockResolvedValue(undefined);
    closeMock = vi.fn();
    createTrackerSpy = vi.spyOn(metricsTrackerModule, 'createLearningMetricsTracker').mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      saveSnapshot: saveSnapshotMock,
      close: closeMock,
    } as unknown as metricsTrackerModule.LearningMetricsTracker);
  });

  function stubHappyPathPhases(): void {
    vi.spyOn(
      worker as unknown as { collectPatterns: () => Promise<unknown[]> },
      'collectPatterns'
    ).mockResolvedValue([]);
    vi.spyOn(
      worker as unknown as { consolidatePatterns: () => Promise<unknown> },
      'consolidatePatterns'
    ).mockResolvedValue({
      patternsAnalyzed: 0, patternsPruned: 0, patternsConsolidated: 0,
      patternsDeprecated: 0, newInsights: 0, crossDomainPatterns: 0,
    });
    vi.spyOn(
      worker as unknown as { runDreamCycle: () => Promise<unknown> },
      'runDreamCycle'
    ).mockResolvedValue({ insights: 0, patternsCreated: 0 });
  }

  it('saves a snapshot and closes the tracker on a successful tick', async () => {
    stubHappyPathPhases();
    const ctx = makeContext(makeMemory());

    await (worker as unknown as { doExecute: (ctx: WorkerContext) => Promise<unknown> }).doExecute(ctx);

    expect(createTrackerSpy).toHaveBeenCalledTimes(1);
    expect(saveSnapshotMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('still saves a snapshot (best-effort) even when the worker body throws', async () => {
    vi.spyOn(
      worker as unknown as { collectPatterns: () => Promise<unknown> },
      'collectPatterns'
    ).mockRejectedValueOnce(new Error('No learning patterns to consolidate yet'));
    const ctx = makeContext(makeMemory());

    await expect(
      (worker as unknown as { doExecute: (ctx: WorkerContext) => Promise<unknown> }).doExecute(ctx)
    ).rejects.toThrow('No learning patterns to consolidate yet');

    // The snapshot runs in the same `finally` as recordLoopHealth — it must
    // fire on the failure path too, not just the happy path.
    expect(saveSnapshotMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('does not shadow the original error when saveSnapshot itself throws', async () => {
    saveSnapshotMock.mockRejectedValueOnce(new Error('disk full'));
    stubHappyPathPhases();
    const ctx = makeContext(makeMemory());

    // Happy-path tick — should resolve normally; the snapshot failure must
    // be swallowed (logged, not thrown), matching recordLoopHealth's contract.
    await expect(
      (worker as unknown as { doExecute: (ctx: WorkerContext) => Promise<unknown> }).doExecute(ctx)
    ).resolves.toBeDefined();

    expect(closeMock).toHaveBeenCalledTimes(1); // still closed even though saveSnapshot rejected
  });
});
