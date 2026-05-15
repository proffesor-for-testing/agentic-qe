/**
 * Issue #488 B.2 — `learning:loop-health` observability
 *
 * Tests for the loop-health recorder used by the bridge and the learning
 * worker. The recorder must never throw (it's observability — failing to
 * record health should not kill the component being observed), but it
 * also must NOT silently drop legitimate updates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOOP_HEALTH_KEY,
  type LoopHealth,
  type LoopHealthMemory,
  getLoopHealth,
  isComponentStale,
  recordLoopHealth,
} from '../../../src/learning/loop-health';

function makeMemory(): LoopHealthMemory & { _store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    _store: store,
    async get<T>(key: string) {
      return store.has(key) ? (store.get(key) as T) : undefined;
    },
    async set<T>(key: string, value: T) {
      store.set(key, value);
    },
  };
}

describe('recordLoopHealth (#488 B.2)', () => {
  let memory: ReturnType<typeof makeMemory>;

  beforeEach(() => {
    memory = makeMemory();
  });

  it('creates a fresh loop-health record on the first call', async () => {
    await recordLoopHealth(memory, 'bridge', { success: true });

    const health = await getLoopHealth(memory);
    expect(health).toBeDefined();
    expect(health!.bootedAt).toBeTruthy();
    expect(health!.components.bridge).toBeDefined();
    expect(health!.components.bridge!.ticksSinceBoot).toBe(1);
    expect(health!.components.bridge!.successesSinceBoot).toBe(1);
    expect(health!.components.bridge!.lastSuccessAt).toBeTruthy();
    expect(health!.overallLastSuccess).toBe(health!.components.bridge!.lastSuccessAt);
  });

  it('increments ticksSinceBoot on every call (success or failure)', async () => {
    await recordLoopHealth(memory, 'bridge', { success: true });
    await recordLoopHealth(memory, 'bridge', { success: false, error: new Error('boom') });
    await recordLoopHealth(memory, 'bridge', { success: true });

    const health = await getLoopHealth(memory);
    expect(health!.components.bridge!.ticksSinceBoot).toBe(3);
    expect(health!.components.bridge!.successesSinceBoot).toBe(2);
  });

  it('records lastError on failure and CLEARS it on the next success', async () => {
    await recordLoopHealth(memory, 'bridge', {
      success: false,
      error: new Error('SQLite locked'),
    });

    let health = await getLoopHealth(memory);
    expect(health!.components.bridge!.lastError).toBeDefined();
    expect(health!.components.bridge!.lastError!.message).toBe('SQLite locked');

    await recordLoopHealth(memory, 'bridge', { success: true });

    health = await getLoopHealth(memory);
    expect(health!.components.bridge!.lastError).toBeUndefined();
  });

  it('tracks multiple components independently', async () => {
    await recordLoopHealth(memory, 'bridge', { success: true });
    await recordLoopHealth(memory, 'learningWorker', { success: true });
    await recordLoopHealth(memory, 'bridge', { success: true });

    const health = await getLoopHealth(memory);
    expect(health!.components.bridge!.ticksSinceBoot).toBe(2);
    expect(health!.components.learningWorker!.ticksSinceBoot).toBe(1);
    expect(health!.components.dreamScheduler).toBeUndefined();
  });

  it('overallLastSuccess is the max(lastSuccessAt) across components', async () => {
    // Record bridge success, wait a bit, then record worker success.
    // worker is more recent → overallLastSuccess must equal worker's.
    await recordLoopHealth(memory, 'bridge', { success: true });
    await new Promise((r) => setTimeout(r, 10));
    await recordLoopHealth(memory, 'learningWorker', { success: true });

    const health = await getLoopHealth(memory);
    expect(health!.overallLastSuccess).toBe(health!.components.learningWorker!.lastSuccessAt);
  });

  it('overallLastSuccess stays empty when no component has ever succeeded', async () => {
    await recordLoopHealth(memory, 'bridge', {
      success: false,
      error: new Error('never working'),
    });

    const health = await getLoopHealth(memory);
    expect(health!.components.bridge!.lastSuccessAt).toBe('');
    expect(health!.overallLastSuccess).toBe('');
  });

  it('does NOT throw when the memory backend itself fails', async () => {
    const brokenMemory: LoopHealthMemory = {
      async get<T>(): Promise<T | undefined> {
        throw new Error('memory backend down');
      },
      async set<T>(): Promise<void> {
        throw new Error('memory backend down');
      },
    };

    // The whole point of this guard: observability must never kill the
    // component it's observing. The bridge already does best-effort drain;
    // a loop-health write failure must not bubble up and crash it.
    await expect(
      recordLoopHealth(brokenMemory, 'bridge', { success: true }),
    ).resolves.toBeUndefined();
  });

  it('getLoopHealth returns undefined when no record exists', async () => {
    const health = await getLoopHealth(memory);
    expect(health).toBeUndefined();
  });

  it('persists under the well-known key', async () => {
    await recordLoopHealth(memory, 'bridge', { success: true });
    expect(memory._store.has(LOOP_HEALTH_KEY)).toBe(true);
    expect(LOOP_HEALTH_KEY).toBe('learning:loop-health');
  });
});

describe('isComponentStale', () => {
  const now = new Date('2026-05-15T12:00:00.000Z');

  it('treats undefined / never-ran components as stale', () => {
    expect(isComponentStale(undefined, 60_000, now)).toBe(true);
    expect(
      isComponentStale(
        { lastSuccessAt: '', ticksSinceBoot: 0, successesSinceBoot: 0 },
        60_000,
        now,
      ),
    ).toBe(true);
  });

  it('returns true when last success exceeds the threshold', () => {
    const tenMinAgo = new Date(now.getTime() - 10 * 60_000).toISOString();
    expect(
      isComponentStale(
        { lastSuccessAt: tenMinAgo, ticksSinceBoot: 1, successesSinceBoot: 1 },
        5 * 60_000,
        now,
      ),
    ).toBe(true);
  });

  it('returns false when last success is within the threshold', () => {
    const oneMinAgo = new Date(now.getTime() - 60_000).toISOString();
    expect(
      isComponentStale(
        { lastSuccessAt: oneMinAgo, ticksSinceBoot: 1, successesSinceBoot: 1 },
        5 * 60_000,
        now,
      ),
    ).toBe(false);
  });
});
