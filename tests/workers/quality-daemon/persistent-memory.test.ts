/**
 * Tests for the PersistentWorkerMemory adapter (IMP-10, Finding 2 resolution).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PersistentWorkerMemory, type KVBackend } from '../../../src/workers/quality-daemon/persistent-memory';

function createMockBackend(): KVBackend & { _store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    _store: store,
    async kvGet<T>(key: string, namespace?: string): Promise<T | undefined> {
      return store.get(`${namespace}:${key}`) as T | undefined;
    },
    async kvSet(key: string, value: unknown, namespace?: string): Promise<void> {
      store.set(`${namespace}:${key}`, value);
    },
    async kvSearch(pattern: string, namespace?: string): Promise<string[]> {
      const sqlPattern = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(sqlPattern);
      return Array.from(store.keys())
        .filter((k) => k.startsWith(`${namespace}:`))
        .map((k) => k.slice(`${namespace}:`.length))
        .filter((k) => regex.test(k));
    },
  };
}

describe('PersistentWorkerMemory', () => {
  let backend: ReturnType<typeof createMockBackend>;
  let memory: PersistentWorkerMemory;

  beforeEach(() => {
    backend = createMockBackend();
    memory = new PersistentWorkerMemory(backend);
  });

  it('stores and retrieves values via KV backend', async () => {
    await memory.set('test-key', { foo: 'bar' });
    const result = await memory.get<{ foo: string }>('test-key');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('returns undefined for missing keys', async () => {
    const result = await memory.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('uses quality-daemon namespace for all operations', async () => {
    await memory.set('my-key', 42);
    // Verify the backend stores under the quality-daemon namespace
    expect(backend._store.has('quality-daemon:my-key')).toBe(true);
  });

  it('search returns matching keys', async () => {
    await memory.set('coverage:snapshot', { line: 80 });
    await memory.set('coverage:delta', { drop: 5 });
    await memory.set('suggestions:list', []);

    const results = await memory.search('coverage:*');
    expect(results).toContain('coverage:snapshot');
    expect(results).toContain('coverage:delta');
    expect(results).not.toContain('suggestions:list');
  });

  it('overwrites existing values', async () => {
    await memory.set('counter', 1);
    await memory.set('counter', 2);
    const result = await memory.get<number>('counter');
    expect(result).toBe(2);
  });
});
