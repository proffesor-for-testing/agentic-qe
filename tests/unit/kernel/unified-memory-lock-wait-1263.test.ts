/**
 * #1263: while another connection holds memory.db's write lock, the MCP server
 * stopped answering every tool call for 10-15 s. better-sqlite3 waits for a
 * lock synchronously for the connection's busy_timeout (5 s), and background
 * kv writes ran back to back on the shared connection. The MCP server now caps
 * the per-statement wait and UnifiedMemory writes retry asynchronously.
 * Fixture: a fresh memory.db under the OS temp dir, locked by a second
 * better-sqlite3 connection in this process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory, resetUnifiedMemory, type UnifiedMemoryManager } from '../../../src/kernel/unified-memory.js';
import { openDatabase } from '../../../src/shared/safe-db.js';
import { capBusyTimeout, getLockWaitCap, setLockWaitCap } from '../../../src/shared/sqlite-lock-wait.js';
import { isBusyError } from '../../../src/learning/dream/dream-lock-retry.js';

const CAP_MS = 50;

let dir: string;
let dbPath: string;
let holder: DatabaseType | null = null;

/** Hold the write lock from a second connection, as another process would. */
function lock(): void {
  holder = new Database(dbPath);
  holder.pragma('busy_timeout = 0');
  holder.exec('BEGIN EXCLUSIVE');
}

function unlock(): void {
  if (!holder) return;
  holder.exec('ROLLBACK');
  holder.close();
  holder = null;
}

/** Longest gap between 10 ms ticks while `work` runs: how long the event loop was blocked. */
async function maxEventLoopGap<T>(work: () => Promise<T>): Promise<{ gap: number; result: PromiseSettledResult<T> }> {
  let last = Date.now();
  let gap = 0;
  const tick = setInterval(() => { const now = Date.now(); gap = Math.max(gap, now - last); last = now; }, 10);
  const [result] = await Promise.allSettled([work()]);
  gap = Math.max(gap, Date.now() - last);
  clearInterval(tick);
  return { gap, result };
}

async function openMemory(busyTimeout: number): Promise<UnifiedMemoryManager> {
  const um = getUnifiedMemory({ dbPath, busyTimeout });
  await um.initialize();
  return um;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-lock-wait-1263-'));
  dbPath = path.join(dir, '.agentic-qe', 'memory.db');
  vi.stubEnv('AQE_PROJECT_ROOT', dir);
  vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
  resetUnifiedMemory();
});

afterEach(() => {
  unlock();
  resetUnifiedMemory();
  setLockWaitCap(null);
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('lock wait cap (#1263)', () => {
  it('limits the per-attempt wait only while a cap is set', () => {
    expect(getLockWaitCap()).toBeNull();
    expect(capBusyTimeout(5000)).toBe(5000);
    setLockWaitCap(CAP_MS);
    expect(capBusyTimeout(5000)).toBe(CAP_MS);
    expect(capBusyTimeout(10)).toBe(10);
  });

  it('rejects a negative or non-finite cap', () => {
    expect(() => setLockWaitCap(-1)).toThrow(RangeError);
    expect(() => setLockWaitCap(Number.NaN)).toThrow(RangeError);
  });

  it('leaves connection busy_timeouts alone, so writes not retried keep their patience', async () => {
    setLockWaitCap(CAP_MS);
    const plain = openDatabase(path.join(dir, 'plain.db'));
    try {
      expect(plain.pragma('busy_timeout', { simple: true })).toBe(5000);
      const um = await openMemory(3000);
      expect(um.getDatabase().pragma('busy_timeout', { simple: true })).toBe(3000);
    } finally {
      plain.close();
    }
  });

  it('restores the connection busy_timeout after a retried write', async () => {
    setLockWaitCap(CAP_MS);
    const um = await openMemory(3000);
    await um.kvSet('k', 1, 'ns');
    expect(um.getDatabase().pragma('busy_timeout', { simple: true })).toBe(3000);
  });
});

describe('UnifiedMemory writes on a locked database under the MCP cap (#1263)', () => {
  beforeEach(() => setLockWaitCap(CAP_MS));

  it('waits for the lock without blocking the event loop, then writes', async () => {
    const um = await openMemory(3000);
    lock();
    setTimeout(unlock, 600);

    const { gap, result } = await maxEventLoopGap(() => um.kvSet('k', { v: 1 }, 'ns'));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(400);
    expect(await um.kvGet('k', 'ns')).toEqual({ v: 1 });
  });

  it('fails with SQLITE_BUSY after the configured busyTimeout and writes nothing', async () => {
    const um = await openMemory(1000);
    lock();

    const started = Date.now();
    const { gap, result } = await maxEventLoopGap(() => um.kvSet('k', 'v', 'ns'));
    const elapsed = Date.now() - started;

    expect(result.status).toBe('rejected');
    expect(isBusyError((result as PromiseRejectedResult).reason)).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(gap).toBeLessThan(400);
    unlock();
    expect(await um.kvGet('k', 'ns')).toBeUndefined();
  });

  it('applies to delete, cleanup and vector writes too', async () => {
    const um = await openMemory(3000);
    await um.kvSet('gone', 1, 'ns');
    lock();
    setTimeout(unlock, 400);

    const { gap, result } = await maxEventLoopGap(async () => {
      expect(await um.kvDelete('gone', 'ns')).toBe(true);
      await um.vectorStore('vec-1', [0.1, 0.2, 0.3], 'ns');
      expect(await um.vectorDelete('vec-1')).toBe(true);
      return um.kvCleanupExpired();
    });

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(400);
  });

  it('reads an expired key as missing without waiting to delete it', async () => {
    const um = await openMemory(3000);
    await um.kvSet('old', 'x', 'ns', 0.001);
    await new Promise((r) => setTimeout(r, 10));
    lock();

    const started = Date.now();
    expect(await um.kvGet('old', 'ns')).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(400);
  });
});

describe('background writers from the #1263 stall (MCP cap)', () => {
  beforeEach(() => setLockWaitCap(CAP_MS));

  it('TrajectoryTracker closes orphaned trajectories without blocking the event loop', async () => {
    const { TrajectoryTracker } = await import('../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js');
    const um = await openMemory(3000);
    const tracker = new TrajectoryTracker();
    await tracker.initialize();
    um.getDatabase().prepare(
      `INSERT INTO qe_trajectories (id, task, agent, domain, started_at) VALUES ('orphan-1263', 't', 'a', 'test-generation', datetime('now', '-2 hours'))`,
    ).run();
    const fresh = new TrajectoryTracker();
    lock();
    setTimeout(unlock, 500);

    const { gap, result } = await maxEventLoopGap(() => fresh.initialize());

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(400);
    const row = um.getDatabase().prepare(`SELECT success, feedback FROM qe_trajectories WHERE id = 'orphan-1263'`).get() as { success: number; feedback: string };
    expect(row.success).toBe(0);
    expect(row.feedback).toMatch(/orphaned/);
  });
});

describe('write ordering while the database is locked (#1263)', () => {
  beforeEach(() => setLockWaitCap(CAP_MS));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // The first write's backoff has grown to ~400 ms when the second is issued;
  // the lock is released just after the second write's first attempt. Without
  // FIFO ordering the second write lands first and the first one overwrites it.
  async function issueSecondLate<T>(first: Promise<unknown>, second: () => Promise<T>): Promise<void> {
    await sleep(650);
    const later = second();
    setTimeout(unlock, 60);
    await Promise.allSettled([first, later]);
  }

  it('lands kvSet(k, v1) then kvSet(k, v2) in call order', async () => {
    const um = await openMemory(3000);
    lock();
    const first = um.kvSet('k', 'v1', 'ns');
    await issueSecondLate(first, () => um.kvSet('k', 'v2', 'ns'));
    expect(await um.kvGet('k', 'ns')).toBe('v2');
  });

  it('lands kvSet then kvDelete in call order', async () => {
    const um = await openMemory(3000);
    lock();
    const first = um.kvSet('k', 'v1', 'ns');
    await issueSecondLate(first, () => um.kvDelete('k', 'ns'));
    expect(await um.kvGet('k', 'ns')).toBeUndefined();
  });

  it('runs the next queued write after one fails', async () => {
    const um = await openMemory(500);
    lock();
    const failing = um.kvSet('a', 1, 'ns');
    const next = um.kvSet('b', 2, 'ns');
    const [failed] = await Promise.allSettled([failing]);
    expect(failed.status).toBe('rejected');
    unlock();
    await next;
    expect(await um.kvGet('b', 'ns')).toBe(2);
    expect(await um.kvGet('a', 'ns')).toBeUndefined();
  });

  it('does not touch the vector index when the vector write fails', async () => {
    const um = await openMemory(300);
    await um.vectorStore('kept', [1, 0, 0], 'ns');
    lock();
    await expect(um.vectorStore('new', [0, 1, 0], 'ns')).rejects.toSatisfy(isBusyError);
    await expect(um.vectorDelete('kept')).rejects.toSatisfy(isBusyError);
    unlock();
    const ids = (await um.vectorSearch([0, 1, 0], 5)).map((r) => r.id);
    expect(ids).toContain('kept');
    expect(ids).not.toContain('new');
  });
});
