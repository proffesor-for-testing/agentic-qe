import { afterEach, describe, it, expect, vi } from 'vitest';
import { SessionOperationCache } from '../../../src/optimization/session-cache.js';
afterEach(() => vi.useRealTimers());
describe('session operation replacement capacity', () => {
  it('refreshes an existing operation without evicting a different cached result', () => {
    vi.useFakeTimers();
    const cache = new SessionOperationCache({
      persistToDb: false,
      maxEntries: 2,
    });
    cache.set('oldest', 'd', 'a', { value: 'older' }, 100);
    vi.advanceTimersByTime(1);
    cache.set('refresh', 'd', 'a', { value: 'old' }, 100);
    vi.advanceTimersByTime(1);
    cache.set('refresh', 'd', 'a', { value: 'new' }, 200);
    expect(cache.get('oldest')?.result).toEqual({ value: 'older' });
    expect(cache.get('refresh')?.result).toEqual({ value: 'new' });
    expect(cache.getStats().size).toBe(2);
  });
  it('still evicts the oldest operation when admitting a new key at capacity', () => {
    vi.useFakeTimers();
    const cache = new SessionOperationCache({
      persistToDb: false,
      maxEntries: 2,
    });
    cache.set('oldest', 'd', 'a', {}, 100);
    vi.advanceTimersByTime(1);
    cache.set('newer', 'd', 'a', {}, 100);
    cache.set('third', 'd', 'a', {}, 100);
    expect(cache.get('oldest')).toBeNull();
    expect(cache.get('newer')).not.toBeNull();
    expect(cache.get('third')).not.toBeNull();
    expect(cache.getStats().size).toBe(2);
  });
});
