/**
 * #1129 (#1142 review): dream loaded patterns with `successRate || 0.5`, so a
 * pattern whose real rate is 0% (now recorded for failing test runs) became
 * 50%, and a pattern never used got an invented 50%. A real 0% stays 0%; an
 * unused pattern has no rate.
 */
import { describe, it, expect, vi } from 'vitest';

const { loadPatternsAsConceptsMock } = vi.hoisted(() => ({ loadPatternsAsConceptsMock: vi.fn() }));

vi.mock('../../../../src/learning/dream/index.js', () => ({
  createDreamEngine: vi.fn(() => ({
    initialize: async () => undefined,
    loadPatternsAsConcepts: loadPatternsAsConceptsMock,
    dream: async () => ({ cycle: {}, insights: [], activationStats: {}, patternsCreated: 0 }),
    applyInsight: async () => ({ success: true }),
    close: async () => undefined,
  })),
}));

vi.mock('../../../../src/learning/qe-reasoning-bank.js', () => ({
  createQEReasoningBank: vi.fn(() => ({
    initialize: async () => undefined,
    searchPatterns: async () => ({
      success: true,
      value: [
        { pattern: { id: 'failing', name: 'f', patternType: 'test-template', qeDomain: 'test-execution', confidence: 0.4, usageCount: 4, successRate: 0 } },
        { pattern: { id: 'unused', name: 'u', patternType: 'test-template', qeDomain: 'test-execution', confidence: 0.5, usageCount: 0, successRate: 0 } },
        { pattern: { id: 'good', name: 'g', patternType: 'test-template', qeDomain: 'test-execution', confidence: 0.8, usageCount: 5, successRate: 0.8 } },
      ],
    }),
  })),
}));

import { checkAndTriggerDream } from '../../../../src/cli/commands/hooks-handlers/hooks-dream-learning.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';

function memory(): MemoryBackend {
  const store = new Map<string, unknown>([['dream-scheduler:hook-state', {
    lastDreamTime: new Date(Date.now() - 7_200_000).toISOString(),
    experienceCount: 25,
    sessionStartTime: new Date(Date.now() - 7_200_000).toISOString(),
    totalDreamsThisSession: 0,
  }]]);
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => { store.set(key, value); },
    delete: async (key: string) => store.delete(key),
    has: async (key: string) => store.has(key),
    search: async () => [],
  } as unknown as MemoryBackend;
}

describe('#1129 dream keeps a real 0% success rate', () => {
  it('passes 0% through and leaves an unused pattern without a rate', async () => {
    await checkAndTriggerDream(memory());

    const loaded = loadPatternsAsConceptsMock.mock.calls[0][0] as Array<{ id: string; successRate?: number }>;
    expect(Object.fromEntries(loaded.map((p) => [p.id, p.successRate]))).toEqual({
      failing: 0, unused: undefined, good: 0.8,
    });
  });
});
