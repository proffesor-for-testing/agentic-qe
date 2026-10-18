/**
 * #1106: searchAllKeys widened its request until it got a short page, with no
 * iteration guard. A backend that never returns a short page looped forever.
 */
import { describe, it, expect, vi } from 'vitest';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import { MAX_KEY_SCAN_REQUESTS, searchAllKeys } from '../../../../src/shared/utils/namespaced-search';

function backend(search: (pattern: string, limit: number) => string[]): MemoryBackend & { search: ReturnType<typeof vi.fn> } {
  return { search: vi.fn(async (pattern: string, limit: number) => search(pattern, limit)) } as never;
}

describe('#1106 searchAllKeys iteration guard', () => {
  it('ends with an error, not an endless loop, when every page is full', async () => {
    // A full page every time. Only its length is read before the guard trips,
    // so a length-only stand-in avoids allocating 2^31 keys.
    const memory = backend((_p, limit) => ({ length: limit }) as unknown as string[]);

    await expect(searchAllKeys(memory, 'k:*', { pageSize: 1 })).rejects.toThrow(/never returned a short page/);
    expect(memory.search).toHaveBeenCalledTimes(MAX_KEY_SCAN_REQUESTS);
  });

  it('returns every key from a backend that ignores the limit', async () => {
    const all = Array.from({ length: 7 }, (_, i) => `k:${i}`);
    const memory = backend(() => all);

    expect(await searchAllKeys(memory, 'k:*', { pageSize: 2 })).toEqual([...all].sort());
    expect(memory.search).toHaveBeenCalledTimes(3); // limits 2, 4, 8
  });

  it('still widens until a short page for a well-behaved backend', async () => {
    const all = Array.from({ length: 5 }, (_, i) => `k:${i}`);
    const memory = backend((_p, limit) => all.slice(0, limit));

    expect(await searchAllKeys(memory, 'k:*', { pageSize: 1 })).toEqual(all);
    expect(memory.search.mock.calls.map((c) => c[1])).toEqual([1, 2, 4, 8]);
  });
});
