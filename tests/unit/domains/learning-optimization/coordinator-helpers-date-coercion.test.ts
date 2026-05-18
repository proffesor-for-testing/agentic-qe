/**
 * Regression: #493 follow-up — Date coercion in getExperiencesForDomain.
 *
 * `getExperiencesForDomain` (coordinator-helpers.ts:28) and the identical
 * private copy on the coordinator class (coordinator.ts:1665) both read
 * Experience records from kv and filter with `timeRange.contains(experience.timestamp)`.
 *
 * Pre-fix, `experience.timestamp` arrives as an ISO string after JSON.parse.
 * `TimeRange.contains` does `date >= start && date <= end`; `string >= Date`
 * coerces both sides via valueOf — Date becomes a number, string becomes
 * NaN, comparison is always false. **Every experience is silently filtered
 * out.** No throw, just empty results — exactly the failure mode the team
 * already documented at learning-coordinator.ts:898-904 (#491 Bug 3).
 *
 * Fix: rehydrateDates at the kv-read seam before the contains check.
 *
 * This test pins the contract on the standalone helper. The class-method
 * copy in coordinator.ts is structurally identical; if it regresses, the
 * fact that this test passes while integration breaks should be the
 * smoking gun pointing at the duplicate code path.
 */

import { describe, it, expect, vi } from 'vitest';
import { getExperiencesForDomain } from '../../../../src/domains/learning-optimization/coordinator-helpers';
import { TimeRange } from '../../../../src/shared/value-objects';
import type { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import type { Experience } from '../../../../src/domains/learning-optimization/interfaces';
import type { AgentId } from '../../../../src/shared/types';

function makeKvMemory(seed: Record<string, unknown>): MemoryBackend {
  const storage = new Map<string, unknown>(Object.entries(seed));
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockImplementation(async (key: string, value: unknown, _options?: StoreOptions) => {
      storage.set(key, value);
    }),
    get: vi.fn().mockImplementation(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),
    delete: vi.fn().mockImplementation(async (key: string) => storage.delete(key)),
    has: vi.fn().mockImplementation(async (key: string) => storage.has(key)),
    search: vi.fn().mockImplementation(async (pattern: string, _limit?: number) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(storage.keys()).filter((k) => regex.test(k));
    }),
    vectorSearch: vi.fn().mockResolvedValue([] as VectorSearchResult[]),
    storeVector: vi.fn().mockResolvedValue(undefined),
  };
}

describe('getExperiencesForDomain — kv-Date rehydration (#493 follow-up)', () => {
  it('returns in-window experiences when timestamp came from kv as an ISO string', async () => {
    const agentId: AgentId = {
      value: 'agent-1',
      domain: 'test-generation',
      type: 'generator',
    };

    const now = Date.now();
    const inWindowIso = new Date(now - 60 * 60 * 1000).toISOString(); // 1h ago
    const outOfWindowIso = new Date(now - 48 * 60 * 60 * 1000).toISOString(); // 48h ago

    const buildExp = (id: string, ts: string): Experience => ({
      id,
      agentId,
      domain: 'test-generation',
      action: 'generate-test',
      state: { context: {}, metrics: {} },
      result: { success: true, outcome: {}, duration: 100 },
      reward: 0.7,
      timestamp: ts as unknown as Date,
    });

    const seed: Record<string, unknown> = {
      'learning:experience:index:domain:test-generation:e-in': 'e-in',
      'learning:experience:index:domain:test-generation:e-out': 'e-out',
      'learning:experience:e-in': buildExp('e-in', inWindowIso),
      'learning:experience:e-out': buildExp('e-out', outOfWindowIso),
    };

    const memory = makeKvMemory(seed);
    const window = TimeRange.create(
      new Date(now - 24 * 60 * 60 * 1000),
      new Date(now),
    );

    const result = await getExperiencesForDomain(memory, 'test-generation', window);

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Pre-fix: result.value would be `[]` because `timeRange.contains`
    // silently filtered both experiences out.
    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.id).toBe('e-in');
    // Timestamp arrives downstream as a real Date.
    expect(result.value[0]!.timestamp).toBeInstanceOf(Date);
  });

  it('returns an empty result for a domain with no experiences (clean fresh-install case)', async () => {
    const result = await getExperiencesForDomain(
      makeKvMemory({}),
      'test-generation',
      TimeRange.create(new Date(Date.now() - 24 * 60 * 60 * 1000), new Date()),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual([]);
  });
});
