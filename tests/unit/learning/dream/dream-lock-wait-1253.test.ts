/**
 * #1253: a dream waiting on a locked database must not freeze the process.
 * DreamEngine used to set busy_timeout = 60000 on the shared connection, and
 * better-sqlite3 waits synchronously, so the MCP event loop stopped for up to
 * a minute. Dream writes now wait briefly per attempt and retry asynchronously.
 * Fixture: a fresh unified-persistence SQLite file under the OS temp dir.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { createDreamEngine, type DreamEngine } from '../../../../src/learning/dream/index.js';
import {
  DREAM_LOCK_WAIT_MS,
  isBusyError,
  retryWhileBusy,
} from '../../../../src/learning/dream/dream-lock-retry.js';
import {
  getUnifiedPersistence,
  initializeUnifiedPersistence,
  resetUnifiedPersistence,
} from '../../../../src/kernel/unified-persistence.js';

const DIR = path.join(os.tmpdir(), `aqe-dream-1253-${process.pid}`);
const DB_PATH = path.join(DIR, 'memory.db');

let db: DatabaseType;
let engine: DreamEngine;

function removeDb(): void {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
}

const busy = () => Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });

describe('retryWhileBusy (#1253)', () => {
  let mem: DatabaseType;
  beforeEach(() => { mem = new Database(':memory:'); mem.pragma('busy_timeout = 5000'); });
  afterEach(() => mem.close());

  it('retries a busy write and returns its result, restoring busy_timeout', async () => {
    let calls = 0;
    const seen: number[] = [];
    const value = await retryWhileBusy(mem, () => {
      seen.push(mem.pragma('busy_timeout', { simple: true }) as number);
      if (++calls < 3) throw busy();
      return 'ok';
    }, { sleep: async () => undefined });

    expect(value).toBe('ok');
    expect(calls).toBe(3);
    expect(seen).toEqual([DREAM_LOCK_WAIT_MS, DREAM_LOCK_WAIT_MS, DREAM_LOCK_WAIT_MS]);
    expect(mem.pragma('busy_timeout', { simple: true })).toBe(5000);
  });

  it('throws other errors at once', async () => {
    let calls = 0;
    await expect(retryWhileBusy(mem, () => { calls++; throw new Error('no such table'); }))
      .rejects.toThrow('no such table');
    expect(calls).toBe(1);
  });

  it('gives up with the busy error once the budget is spent', async () => {
    let clock = 0;
    await expect(retryWhileBusy(mem, () => { throw busy(); }, {
      budgetMs: 1000,
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
    })).rejects.toThrow('database is locked');
    expect(clock).toBeLessThan(1000);
  });

  it('stops retrying when the caller no longer wants the write', async () => {
    let wanted = true;
    await expect(retryWhileBusy(mem, () => { wanted = false; throw busy(); }, {
      shouldContinue: () => wanted,
      cancelledError: () => new Error('Dream cycle cancelled'),
      sleep: async () => undefined,
    })).rejects.toThrow('Dream cycle cancelled');
  });

  it('recognises SQLite busy and locked errors only', () => {
    expect(isBusyError(busy())).toBe(true);
    expect(isBusyError(Object.assign(new Error('x'), { code: 'SQLITE_LOCKED' }))).toBe(true);
    expect(isBusyError(new Error('UNIQUE constraint failed'))).toBe(false);
  });
});

describe('DreamEngine on a locked database (#1253)', () => {
  beforeEach(async () => {
    resetUnifiedPersistence();
    fs.mkdirSync(DIR, { recursive: true });
    removeDb();
    await initializeUnifiedPersistence({ dbPath: DB_PATH });
    db = getUnifiedPersistence().getDatabase();
    engine = createDreamEngine({ minConceptsRequired: 3, maxDurationMs: 5000 });
    await engine.initialize();
    await engine.loadPatternsAsConcepts(Array.from({ length: 12 }, (_, i) => ({
      id: `p-${i}`, name: `pattern ${i}`, description: `pattern ${i}`,
      domain: 'test-generation', confidence: 0.8, successRate: 0.9,
    })));
  });

  afterEach(async () => {
    await engine.close();
    resetUnifiedPersistence();
    removeDb();
  });

  it('leaves the shared connection busy_timeout alone', () => {
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
  });

  it('keeps the event loop running while another writer holds the lock, then completes', async () => {
    const other = new Database(DB_PATH);
    other.pragma('busy_timeout = 0');
    other.exec('BEGIN EXCLUSIVE');
    // Released from a timer: with a synchronous 60 s wait this timer could not
    // fire until the dream gave up.
    const release = setTimeout(() => other.exec('ROLLBACK'), 1500);

    let last = Date.now();
    let maxGap = 0;
    const tick = setInterval(() => {
      const now = Date.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 20);

    const started = Date.now();
    try {
      const result = await engine.dream(300);
      expect(result.cycle.status).toBe('completed');
    } finally {
      clearInterval(tick);
      clearTimeout(release);
      if (other.inTransaction) other.exec('ROLLBACK');
      other.close();
    }

    expect(Date.now() - started).toBeGreaterThanOrEqual(1400);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(maxGap).toBeLessThan(DREAM_LOCK_WAIT_MS + 400);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM dream_cycles WHERE status = 'completed'`).get() as { n: number }).n).toBe(1);
  }, 30_000);
});
