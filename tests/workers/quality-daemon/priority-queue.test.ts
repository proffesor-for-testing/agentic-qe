/**
 * Tests for the QE Quality Daemon Priority Queue (IMP-10).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PriorityQueue, type QueueItem, type DaemonTaskPayload } from '../../../src/workers/quality-daemon/priority-queue';

describe('PriorityQueue', () => {
  let queue: PriorityQueue;

  beforeEach(() => {
    queue = new PriorityQueue();
  });

  // -------------------------------------------------------------------------
  // enqueue / dequeue
  // -------------------------------------------------------------------------

  it('dequeues "now" items before "next" and "later"', () => {
    queue.enqueue(makeItem('later-1', 'later'));
    queue.enqueue(makeItem('next-1', 'next'));
    queue.enqueue(makeItem('now-1', 'now'));

    expect(queue.dequeue()!.id).toBe('now-1');
    expect(queue.dequeue()!.id).toBe('next-1');
    expect(queue.dequeue()!.id).toBe('later-1');
  });

  it('maintains FIFO order within a priority level', () => {
    queue.enqueue(makeItem('a', 'next'));
    queue.enqueue(makeItem('b', 'next'));
    queue.enqueue(makeItem('c', 'next'));

    expect(queue.dequeue()!.id).toBe('a');
    expect(queue.dequeue()!.id).toBe('b');
    expect(queue.dequeue()!.id).toBe('c');
  });

  it('returns undefined when empty', () => {
    expect(queue.dequeue()).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // TTL expiry
  // -------------------------------------------------------------------------

  it('skips expired items on dequeue', () => {
    queue.enqueue({
      id: 'expired',
      priority: 'now',
      payload: { type: 'nightly', tasks: [] } as DaemonTaskPayload,
      createdAt: Date.now() - 10000,
      source: 'test',
      ttlMs: 1000, // expired 9s ago
    });
    queue.enqueue(makeItem('fresh', 'now'));

    expect(queue.dequeue()!.id).toBe('fresh');
  });

  it('does not expire items without ttlMs', () => {
    queue.enqueue({
      id: 'no-ttl',
      priority: 'now',
      payload: { type: 'nightly', tasks: [] } as DaemonTaskPayload,
      createdAt: Date.now() - 999999,
      source: 'test',
    });

    expect(queue.dequeue()!.id).toBe('no-ttl');
  });

  // -------------------------------------------------------------------------
  // pruneExpired
  // -------------------------------------------------------------------------

  it('prunes expired items across all queues', () => {
    queue.enqueue(makeExpired('a', 'now'));
    queue.enqueue(makeExpired('b', 'next'));
    queue.enqueue(makeItem('c', 'later'));

    const pruned = queue.pruneExpired();
    expect(pruned).toBe(2);
    expect(queue.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // drainPriority
  // -------------------------------------------------------------------------

  it('drains all items at a specific priority', () => {
    queue.enqueue(makeItem('a', 'now'));
    queue.enqueue(makeItem('b', 'now'));
    queue.enqueue(makeItem('c', 'next'));

    const drained = queue.drainPriority('now');
    expect(drained).toHaveLength(2);
    expect(queue.depths.now).toBe(0);
    expect(queue.depths.next).toBe(1);
  });

  // -------------------------------------------------------------------------
  // peek
  // -------------------------------------------------------------------------

  it('peeks without removing', () => {
    queue.enqueue(makeItem('a', 'now'));
    expect(queue.peek()!.id).toBe('a');
    expect(queue.size).toBe(1);
  });

  it('peek skips expired items', () => {
    queue.enqueue(makeExpired('old', 'now'));
    queue.enqueue(makeItem('fresh', 'next'));
    expect(queue.peek()!.id).toBe('fresh');
  });

  // -------------------------------------------------------------------------
  // size / depths / isEmpty / clear
  // -------------------------------------------------------------------------

  it('tracks size across all priorities', () => {
    expect(queue.isEmpty).toBe(true);
    queue.enqueue(makeItem('a', 'now'));
    queue.enqueue(makeItem('b', 'next'));
    queue.enqueue(makeItem('c', 'later'));
    expect(queue.size).toBe(3);
    expect(queue.isEmpty).toBe(false);
  });

  it('reports per-priority depths', () => {
    queue.enqueue(makeItem('a', 'now'));
    queue.enqueue(makeItem('b', 'now'));
    queue.enqueue(makeItem('c', 'later'));
    expect(queue.depths).toEqual({ now: 2, next: 0, later: 1 });
  });

  it('clear removes all items', () => {
    queue.enqueue(makeItem('a', 'now'));
    queue.enqueue(makeItem('b', 'next'));
    queue.clear();
    expect(queue.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // bounded size
  // -------------------------------------------------------------------------

  it('rejects items when at max capacity', () => {
    const small = new PriorityQueue(2);
    expect(small.enqueue(makeItem('a', 'now'))).toBe(true);
    expect(small.enqueue(makeItem('b', 'now'))).toBe(true);
    expect(small.enqueue(makeItem('c', 'now'))).toBe(false);
    expect(small.size).toBe(2);
  });
});

// ============================================================================
// Helpers
// ============================================================================

function makeItem(id: string, priority: 'now' | 'next' | 'later'): QueueItem<DaemonTaskPayload> {
  return {
    id,
    priority,
    payload: { type: 'nightly', tasks: [] } as DaemonTaskPayload,
    createdAt: Date.now(),
    source: 'test',
  };
}

function makeExpired(id: string, priority: 'now' | 'next' | 'later'): QueueItem<DaemonTaskPayload> {
  return {
    id,
    priority,
    payload: { type: 'nightly', tasks: [] } as DaemonTaskPayload,
    createdAt: Date.now() - 60000,
    source: 'test',
    ttlMs: 1000,
  };
}
