import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  PriorityQueue,
  type QueueItem,
} from '../../../src/workers/quality-daemon/priority-queue.js';
afterEach(() => vi.useRealTimers());
const item = (
  id: string,
  priority: QueueItem<string>['priority'],
  ttlMs?: number,
): QueueItem<string> => ({
  id,
  priority,
  payload: id,
  createdAt: Date.now(),
  source: 'test',
  ttlMs,
});
describe('expired daemon queue capacity', () => {
  it('admits a quality-gate alert when expired work fills the queue', () => {
    vi.useFakeTimers();
    const queue = new PriorityQueue<string>(2);
    queue.enqueue(item('stale-next', 'next', 10));
    queue.enqueue(item('stale-later', 'later', 10));
    vi.advanceTimersByTime(11);
    expect(queue.enqueue(item('quality-gate', 'now'))).toBe(true);
    expect(queue.size).toBe(1);
    expect(queue.dequeue()?.id).toBe('quality-gate');
  });
  it('preserves unexpired work and its priority/FIFO order while reclaiming only stale slots', () => {
    vi.useFakeTimers();
    const queue = new PriorityQueue<string>(3);
    queue.enqueue(item('first', 'now'));
    queue.enqueue(item('stale', 'later', 10));
    queue.enqueue(item('next', 'next', 100));
    vi.advanceTimersByTime(11);
    expect(queue.enqueue(item('second', 'now'))).toBe(true);
    expect(queue.enqueue(item('overflow', 'now'))).toBe(false);
    expect([
      queue.dequeue()?.id,
      queue.dequeue()?.id,
      queue.dequeue()?.id,
    ]).toEqual(['first', 'second', 'next']);
  });
});
