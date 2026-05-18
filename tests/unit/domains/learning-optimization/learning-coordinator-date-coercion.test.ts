/**
 * Regression: #493 follow-up — Date coercion in
 * LearningCoordinatorService.getReplayBuffer.
 *
 * Pre-fix, `getReplayBuffer` reads kv-stored Experience records and then runs
 * `experiences.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())`
 * at line 746. After JSON round-trip, `experience.timestamp` is an ISO string,
 * and `.getTime()` throws `TypeError: getTime is not a function`. The team
 * already documented this exact hazard for the sibling `mineExperiences`
 * codepath at lines 898-904 (#491 Bug 3) — this test pins the symmetric fix
 * for the replay-buffer codepath.
 */

import { describe, it, expect, vi } from 'vitest';
import { LearningCoordinatorService } from '../../../../src/domains/learning-optimization/services/learning-coordinator';
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

describe('LearningCoordinatorService.getReplayBuffer — kv-Date rehydration (#493 follow-up)', () => {
  it('sorts kv-shape experiences by timestamp descending without throwing', async () => {
    const agentId: AgentId = {
      value: 'agent-7',
      domain: 'test-generation',
      type: 'generator',
    };

    const now = Date.now();
    // Three experiences with ISO-string timestamps — the exact shape JSON.parse
    // produces. Out-of-order so the sort actually exercises the comparator.
    const buildExperience = (id: string, offsetMs: number, reward: number): Experience => ({
      id,
      agentId,
      domain: 'test-generation',
      action: 'generate-test',
      state: { context: {}, metrics: {} },
      result: { success: true, outcome: {}, duration: 100 },
      reward,
      timestamp: new Date(now - offsetMs).toISOString() as unknown as Date,
    });

    const seed: Record<string, unknown> = {
      // Index entries: each holds the experience ID as a value.
      [`learning:experience:index:agent:${agentId.value}:e-mid`]: 'e-mid',
      [`learning:experience:index:agent:${agentId.value}:e-old`]: 'e-old',
      [`learning:experience:index:agent:${agentId.value}:e-new`]: 'e-new',
      // The full experience records.
      'learning:experience:e-mid': buildExperience('e-mid', 2 * 60 * 60 * 1000, 0.6),
      'learning:experience:e-old': buildExperience('e-old', 5 * 60 * 60 * 1000, 0.4),
      'learning:experience:e-new': buildExperience('e-new', 30 * 60 * 1000, 0.9),
    };

    const service = new LearningCoordinatorService({ memory: makeKvMemory(seed) });

    const result = await service.getReplayBuffer(agentId);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toHaveLength(3);
    // Sorted descending — newest first.
    expect(result.value[0]!.id).toBe('e-new');
    expect(result.value[1]!.id).toBe('e-mid');
    expect(result.value[2]!.id).toBe('e-old');
    // Every returned timestamp is a real Date — callers downstream
    // (training loops, metric aggregation) depend on this.
    for (const exp of result.value) {
      expect(exp.timestamp).toBeInstanceOf(Date);
    }
  });

  it('handles an empty replay buffer cleanly (fresh-install case)', async () => {
    const service = new LearningCoordinatorService({ memory: makeKvMemory({}) });

    const result = await service.getReplayBuffer({
      value: 'agent-no-data',
      domain: 'test-generation',
      type: 'generator',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual([]);
  });
});
