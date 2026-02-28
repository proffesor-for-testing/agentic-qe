/**
 * Semaphore Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { Semaphore } from '../../../../src/shared/concurrency/semaphore';

describe('Semaphore', () => {
  it('allows up to N concurrent operations', async () => {
    const sem = new Semaphore(2);
    const running: number[] = [];
    const maxConcurrent: number[] = [];

    const task = async (id: number) => {
      await sem.acquire();
      running.push(id);
      maxConcurrent.push(running.length);
      await new Promise((r) => setTimeout(r, 50));
      running.splice(running.indexOf(id), 1);
      sem.release();
    };

    await Promise.all([task(1), task(2), task(3), task(4)]);

    expect(Math.max(...maxConcurrent)).toBeLessThanOrEqual(2);
  });

  it('withPermit auto-releases on success', async () => {
    const sem = new Semaphore(1);
    const result = await sem.withPermit(async () => 42);
    expect(result).toBe(42);

    // Should be able to acquire again immediately
    let acquired = false;
    await sem.withPermit(async () => { acquired = true; });
    expect(acquired).toBe(true);
  });

  it('withPermit auto-releases on error', async () => {
    const sem = new Semaphore(1);

    await expect(
      sem.withPermit(async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');

    // Should be able to acquire again after error
    let acquired = false;
    await sem.withPermit(async () => { acquired = true; });
    expect(acquired).toBe(true);
  });

  it('queues tasks when permits exhausted', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    const task1 = sem.withPermit(async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
    });

    const task2 = sem.withPermit(async () => {
      order.push(2);
    });

    await Promise.all([task1, task2]);
    expect(order).toEqual([1, 2]);
  });
});
