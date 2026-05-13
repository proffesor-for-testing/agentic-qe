/**
 * Regression: issue #461
 *
 * Multiple Claude Code hooks fire concurrently. When dream eligibility
 * conditions are met, every parallel process sees the same stale
 * `dreamState.lastDreamTime`, races past the time/experience trigger, and
 * tries to start its own ~10-second dream cycle. They all hit the WAL writer
 * at roughly the same moment and 35% fail with `database is locked` —
 * `busy_timeout` only serializes sequential contention, not simultaneous
 * writers.
 *
 * `checkAndTriggerDream` now peeks at `dream_cycles` before opening the
 * engine: if a row with status='running' AND start_time > now-60s exists,
 * it bails out with reason='already-running'. This test mocks the unified
 * memory layer and asserts both branches (guard fires, guard misses).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  dreamMock,
  applyInsightMock,
  initializeMock,
  closeMock,
  loadPatternsAsConceptsMock,
  prepareMock,
} = vi.hoisted(() => ({
  dreamMock: vi.fn(),
  applyInsightMock: vi.fn(),
  initializeMock: vi.fn(),
  closeMock: vi.fn(),
  loadPatternsAsConceptsMock: vi.fn(),
  prepareMock: vi.fn(),
}));

vi.mock('../../../../src/learning/dream/index.js', () => ({
  createDreamEngine: vi.fn(() => ({
    initialize: initializeMock,
    loadPatternsAsConcepts: loadPatternsAsConceptsMock,
    dream: dreamMock,
    applyInsight: applyInsightMock,
    close: closeMock,
  })),
}));

vi.mock('../../../../src/learning/qe-reasoning-bank.js', () => ({
  createQEReasoningBank: vi.fn(() => ({
    initialize: async () => undefined,
    searchPatterns: async () => ({ success: true, value: [] }),
  })),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  findProjectRoot: () => process.cwd(),
  getUnifiedMemory: () => ({
    isInitialized: () => true,
    initialize: async () => undefined,
    getDatabase: () => ({
      prepare: prepareMock,
    }),
  }),
}));

import { checkAndTriggerDream } from '../../../../src/cli/commands/hooks-handlers/hooks-dream-learning.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';

function createFakeMemory(lastDreamMsAgo: number, experienceCount: number): MemoryBackend {
  const store = new Map<string, unknown>();
  store.set('dream-scheduler:hook-state', {
    lastDreamTime: new Date(Date.now() - lastDreamMsAgo).toISOString(),
    experienceCount,
    sessionStartTime: new Date(Date.now() - 7_200_000).toISOString(),
    totalDreamsThisSession: 0,
  });
  return {
    initialize: async () => undefined,
    dispose: async () => undefined,
    get: async <T>(key: string) => store.get(key) as T | undefined,
    set: async (key, value) => {
      store.set(key, value);
    },
    delete: async (key) => store.delete(key),
    has: async (key) => store.has(key),
    search: async () => [],
    vectorSearch: async () => [],
    storeVector: async () => undefined,
    count: async () => 0,
    hasCodeIntelligenceIndex: async () => false,
  } as unknown as MemoryBackend;
}

describe('checkAndTriggerDream skips when a recent cycle is still running (#461)', () => {
  beforeEach(() => {
    dreamMock.mockReset();
    applyInsightMock.mockReset();
    initializeMock.mockReset();
    closeMock.mockReset();
    loadPatternsAsConceptsMock.mockReset();
    prepareMock.mockReset();

    initializeMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);
    loadPatternsAsConceptsMock.mockResolvedValue(undefined);
    dreamMock.mockResolvedValue({
      cycle: {},
      insights: [],
      activationStats: { totalIterations: 1, peakActivation: 1, nodesActivated: 1 },
      patternsCreated: 0,
    });
  });

  it('returns reason="already-running" when a recent running cycle exists', async () => {
    // dream_cycles guard query returns n=1
    prepareMock.mockReturnValueOnce({
      get: () => ({ n: 1 }),
    });

    const memory = createFakeMemory(2 * 3600_000, 25);
    const result = await checkAndTriggerDream(memory);

    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('already-running');
    // Dream engine must NOT have been opened/run
    expect(initializeMock).not.toHaveBeenCalled();
    expect(dreamMock).not.toHaveBeenCalled();
  });

  it('proceeds normally when no recent running cycle exists', async () => {
    // dream_cycles guard query returns n=0
    prepareMock.mockReturnValueOnce({
      get: () => ({ n: 0 }),
    });

    const memory = createFakeMemory(2 * 3600_000, 25);
    const result = await checkAndTriggerDream(memory);

    expect(result.triggered).toBe(true);
    expect(result.reason).toBe('time-interval');
    expect(dreamMock).toHaveBeenCalledTimes(1);
  });

  it('fails open: if the guard query throws, the dream still runs', async () => {
    prepareMock.mockImplementationOnce(() => {
      throw new Error('dream_cycles table not yet created');
    });

    const memory = createFakeMemory(2 * 3600_000, 25);
    const result = await checkAndTriggerDream(memory);

    expect(result.triggered).toBe(true);
    expect(dreamMock).toHaveBeenCalledTimes(1);
  });
});
