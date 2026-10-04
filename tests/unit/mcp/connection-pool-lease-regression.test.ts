import { describe, it, expect, vi, afterEach } from 'vitest';
import { createConnectionPool } from '../../../src/mcp/connection-pool.js';
afterEach(() => vi.useRealTimers());
describe('connection pool lease exclusivity', () => {
  it('never returns a newly created busy connection to a second borrower', async () => {
    const pool = createConnectionPool({
      minConnections: 0,
      maxConnections: 1,
      healthCheckIntervalMs: 0,
    });
    await pool.initialize();
    const first = pool.acquire();
    expect(first).not.toBeNull();
    expect(pool.acquire()).toBeNull();
    pool.release(first!.id);
    expect(pool.acquire()?.id).toBe(first!.id);
    await pool.shutdown();
  });
  it('does not prune a busy connection solely because its lease is old', async () => {
    vi.useFakeTimers();
    const pool = createConnectionPool({
      minConnections: 0,
      maxConnections: 1,
      idleTimeoutMs: 10,
      healthCheckIntervalMs: 0,
    });
    await pool.initialize();
    const first = pool.acquire()!;
    vi.advanceTimersByTime(11);
    expect(pool.prune()).toBe(0);
    expect(pool.getStats().activeConnections).toBe(1);
    expect(pool.acquire()).toBeNull();
    pool.release(first.id);
    vi.advanceTimersByTime(11);
    expect(pool.prune()).toBe(1);
    await pool.shutdown();
  });
});
