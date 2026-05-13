/**
 * Regression: issue #456
 *
 * checkAndTriggerDream() previously generated insights via dreamEngine.dream()
 * but never called dreamEngine.applyInsight(). DreamScheduler.autoApplyInsights
 * wires this in the daemon path, but the hook-driven path had no equivalent —
 * so every hook-fired dream cycle left applied=0 rows piling up indefinitely
 * (#456 evidence: 378 unapplied / 9 applied).
 *
 * This test mocks the dream engine and the reasoning bank, feeds three
 * insights (high-confidence actionable, low-confidence actionable,
 * non-actionable), and asserts applyInsight() is called exactly once — for the
 * single insight that crosses both gates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  dreamMock,
  applyInsightMock,
  initializeMock,
  closeMock,
  loadPatternsAsConceptsMock,
} = vi.hoisted(() => ({
  dreamMock: vi.fn(),
  applyInsightMock: vi.fn(),
  initializeMock: vi.fn(),
  closeMock: vi.fn(),
  loadPatternsAsConceptsMock: vi.fn(),
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

describe('checkAndTriggerDream auto-applies high-confidence insights (#456)', () => {
  beforeEach(() => {
    dreamMock.mockReset();
    applyInsightMock.mockReset();
    initializeMock.mockReset();
    closeMock.mockReset();
    loadPatternsAsConceptsMock.mockReset();

    initializeMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);
    loadPatternsAsConceptsMock.mockResolvedValue(undefined);
    applyInsightMock.mockImplementation(async (id: string) => ({
      success: true,
      patternId: `dream-pattern-${id}`,
    }));
  });

  it('applies insights that are actionable AND confidenceScore >= 0.5', async () => {
    dreamMock.mockResolvedValue({
      cycle: {},
      insights: [
        { id: 'i-high', actionable: true, confidenceScore: 0.9 },
        { id: 'i-low', actionable: true, confidenceScore: 0.3 },
        { id: 'i-non-actionable', actionable: false, confidenceScore: 0.95 },
        { id: 'i-edge', actionable: true, confidenceScore: 0.5 }, // exactly at threshold
      ],
      activationStats: { totalIterations: 1, peakActivation: 1, nodesActivated: 1 },
      patternsCreated: 0,
    });

    const memory = createFakeMemory(2 * 3600_000, 25); // 2h ago + 25 experiences
    const result = await checkAndTriggerDream(memory);

    expect(result.triggered).toBe(true);
    expect(result.insightsGenerated).toBe(4);
    expect(result.insightsApplied).toBe(2);

    // Only i-high and i-edge satisfy actionable && confidenceScore >= 0.5
    expect(applyInsightMock).toHaveBeenCalledTimes(2);
    const appliedIds = applyInsightMock.mock.calls.map((c) => c[0]).sort();
    expect(appliedIds).toEqual(['i-edge', 'i-high']);
  });

  it('does NOT crash when applyInsight throws — surfaces the count up to the failure', async () => {
    dreamMock.mockResolvedValue({
      cycle: {},
      insights: [
        { id: 'i-1', actionable: true, confidenceScore: 0.8 },
        { id: 'i-2', actionable: true, confidenceScore: 0.8 },
      ],
      activationStats: { totalIterations: 1, peakActivation: 1, nodesActivated: 1 },
      patternsCreated: 0,
    });
    applyInsightMock.mockImplementationOnce(async () => ({
      success: true,
      patternId: 'dream-pattern-i-1',
    }));
    applyInsightMock.mockImplementationOnce(async () => {
      throw new Error('db locked');
    });

    const memory = createFakeMemory(2 * 3600_000, 25);
    const result = await checkAndTriggerDream(memory);

    expect(result.triggered).toBe(true);
    expect(result.insightsApplied).toBe(1);
  });

  it('counts only successful applyInsight results', async () => {
    dreamMock.mockResolvedValue({
      cycle: {},
      insights: [{ id: 'i-1', actionable: true, confidenceScore: 0.9 }],
      activationStats: { totalIterations: 1, peakActivation: 1, nodesActivated: 1 },
      patternsCreated: 0,
    });
    applyInsightMock.mockResolvedValue({ success: false, error: 'already applied' });

    const memory = createFakeMemory(2 * 3600_000, 25);
    const result = await checkAndTriggerDream(memory);

    expect(result.triggered).toBe(true);
    expect(result.insightsApplied).toBe(0);
  });

  it('does not fire when min gap has not elapsed', async () => {
    const memory = createFakeMemory(60_000, 100); // 1min ago — under 5min gap
    const result = await checkAndTriggerDream(memory);
    expect(result.triggered).toBe(false);
    expect(applyInsightMock).not.toHaveBeenCalled();
  });
});
