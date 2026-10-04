import { afterEach, describe, it, expect, vi } from 'vitest';
import { createConnectionPool } from '../../../src/mcp/connection-pool.js';
afterEach(() => vi.useRealTimers());
describe('connection pool initialization lifecycle', () => {
  it('prewarms once and installs one health timer for simultaneous initializers', async () => {
    vi.useFakeTimers();
    const pool = createConnectionPool({
      minConnections: 2,
      maxConnections: 2,
      healthCheckIntervalMs: 1000,
    });
    await Promise.all([
      pool.initialize(),
      pool.initialize(),
      pool.initialize(),
    ]);
    expect(pool.getStats().totalConnections).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
    await pool.shutdown();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not leave a health timer running when shutdown overlaps cold warmup', async () => {
    vi.useFakeTimers();
    const pool = createConnectionPool({
      minConnections: 1,
      healthCheckIntervalMs: 1000,
    });
    const initializing = pool.initialize();
    const shuttingDown = pool.shutdown();
    await Promise.all([initializing, shuttingDown]);
    expect(pool.getStats().totalConnections).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await pool.initialize();
    expect(pool.getStats().totalConnections).toBe(1);
    await pool.shutdown();
    expect(vi.getTimerCount()).toBe(0);
  });
});
