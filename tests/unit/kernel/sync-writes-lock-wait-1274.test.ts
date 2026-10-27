/**
 * #1274: after #1263, writes on the shared memory.db connection that were not
 * routed through UnifiedMemoryManager.writeWhenUnlocked still waited for the
 * lock synchronously, for the connection's whole busy_timeout, and froze the
 * MCP server's event loop. fleet_init stalled ~5 s on the session cache's
 * invalidateAll() DELETE, which runs after every state-changing tool call.
 * Fixture: a fresh memory.db under the OS temp dir, locked by a second
 * better-sqlite3 connection in this process, with the MCP server's lock wait
 * cap set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import {
  getUnifiedMemory,
  resetUnifiedMemory,
  writeWhenUnlockedOn,
  type UnifiedMemoryManager,
} from '../../../src/kernel/unified-memory.js';
import { setLockWaitCap } from '../../../src/shared/sqlite-lock-wait.js';
import { SessionOperationCache } from '../../../src/optimization/session-cache.js';
import { RoutingFeedbackCollector } from '../../../src/routing/routing-feedback.js';
import { MinCutPersistence } from '../../../src/coordination/mincut/mincut-persistence.js';
import type { QERoutingDecision } from '../../../src/routing/types.js';

const CAP_MS = 50;
const BUSY_TIMEOUT_MS = 3000;
const HOLD_MS = 600;
/** A synchronous write would block for BUSY_TIMEOUT_MS; a queued one for at most CAP_MS per attempt. */
const MAX_GAP_MS = 400;

let dir: string;
let dbPath: string;
let holder: DatabaseType | null = null;

/** Hold the write lock from a second connection, as another process would. */
function lock(): void {
  holder = new Database(dbPath);
  holder.pragma('busy_timeout = 0');
  holder.exec('BEGIN IMMEDIATE');
}

function unlock(): void {
  if (!holder) return;
  holder.exec('ROLLBACK');
  holder.close();
  holder = null;
}

/** Longest gap between 10 ms ticks while `work` runs: how long the event loop was blocked. */
async function maxEventLoopGap<T>(work: () => Promise<T> | T): Promise<{ gap: number; result: PromiseSettledResult<T> }> {
  let last = Date.now();
  let gap = 0;
  const tick = setInterval(() => { const now = Date.now(); gap = Math.max(gap, now - last); last = now; }, 10);
  const [result] = await Promise.allSettled([Promise.resolve().then(work)]);
  gap = Math.max(gap, Date.now() - last);
  clearInterval(tick);
  return { gap, result };
}

/** Lock, run `work`, release after HOLD_MS, and wait until every queued write has settled. */
async function underLock<T>(um: UnifiedMemoryManager, work: () => Promise<T> | T) {
  lock();
  setTimeout(unlock, HOLD_MS);
  const measured = await maxEventLoopGap(async () => {
    const value = await work();
    await um.writeWhenUnlocked(() => undefined); // FIFO: settles after every earlier write
    return value;
  });
  return measured;
}

async function openMemory(): Promise<UnifiedMemoryManager> {
  const um = getUnifiedMemory({ dbPath, busyTimeout: BUSY_TIMEOUT_MS });
  await um.initialize();
  return um;
}

function decision(recommended: string): QERoutingDecision {
  return {
    recommended,
    confidence: 0.8,
    alternatives: [],
    reasoning: 'test',
    scores: { similarity: 0.8, performance: 0.8, capabilities: 0.8, combined: 0.8 },
    latencyMs: 1,
    timestamp: new Date(),
  };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-lock-wait-1274-'));
  dbPath = path.join(dir, '.agentic-qe', 'memory.db');
  vi.stubEnv('AQE_PROJECT_ROOT', dir);
  vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
  resetUnifiedMemory();
  setLockWaitCap(CAP_MS);
});

afterEach(() => {
  unlock();
  resetUnifiedMemory();
  setLockWaitCap(null);
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('writeWhenUnlockedOn (#1274)', () => {
  it('queues a write on the shared connection instead of blocking the event loop', async () => {
    const um = await openMemory();
    const db = um.getDatabase();

    const { gap, result } = await underLock(um, () =>
      writeWhenUnlockedOn(db, () => db.prepare(
        "INSERT INTO kv_store (key, namespace, value) VALUES ('on', 'ns', '1')").run()));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(db.prepare("SELECT value FROM kv_store WHERE key = 'on'").get()).toEqual({ value: '1' });
  });

  it('runs a write on any other connection at once, and reports its error', async () => {
    await openMemory();
    const other = new Database(':memory:');
    try {
      other.exec('CREATE TABLE t (v INTEGER)');
      const pending = writeWhenUnlockedOn(other, () => other.prepare('INSERT INTO t VALUES (1)').run());
      expect(other.prepare('SELECT COUNT(*) AS n FROM t').get()).toEqual({ n: 1 });
      await pending;
      await expect(writeWhenUnlockedOn(other, () => other.exec('INSERT INTO missing VALUES (1)'))).rejects.toThrow(/no such table/);
    } finally {
      other.close();
    }
  });
});

describe('session cache persistence on a locked database (#1274, fleet_init stall)', () => {
  it('invalidateAll returns without waiting for the lock and deletes the persisted rows once it is released', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES ('session_cache:old', 'session_cache', '{}')").run();
    const cache = new SessionOperationCache({}, () => um);

    const { gap, result } = await underLock(um, () => cache.invalidateAll());

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(db.prepare("SELECT COUNT(*) AS n FROM kv_store WHERE namespace = 'session_cache'").get()).toEqual({ n: 0 });
  });

  it('keeps call order: an entry cached after invalidateAll survives the queued delete', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    const cache = new SessionOperationCache({}, () => um);

    const { gap } = await underLock(um, () => {
      cache.invalidateAll();
      cache.set('fp-new', 'quality-assessment', 'evaluate', { ok: true }, 10);
    });

    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(db.prepare("SELECT key FROM kv_store WHERE namespace = 'session_cache'").all())
      .toEqual([{ key: 'session_cache:fp-new' }]);
  });
});

describe('background writers on a locked database (#1274)', () => {
  it('routing feedback: recordOutcome does not block and the outcome is persisted after the lock is released', async () => {
    const um = await openMemory();
    const collector = new RoutingFeedbackCollector(100);
    await collector.initialize();

    const { gap, result } = await underLock(um, () =>
      collector.recordOutcome({ description: 'generate tests' }, decision('qe-test-architect'), 'qe-test-architect', {
        success: true, qualityScore: 0.9, durationMs: 10,
      }));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    const id = (result as PromiseFulfilledResult<{ id: string }>).value.id;
    expect(um.getDatabase().prepare('SELECT used_agent FROM routing_outcomes WHERE id = ?').get(id))
      .toEqual({ used_agent: 'qe-test-architect' });
  });

  it('MinCut snapshot timer does not block the event loop and the snapshot is saved', async () => {
    const um = await openMemory();
    const persistence = new MinCutPersistence(um);
    await persistence.initialize();

    const { gap, result } = await underLock(um, () => persistence.saveSnapshot({
      timestamp: new Date(),
      vertices: [],
      edges: [],
      stats: { vertexCount: 0, edgeCount: 0, totalWeight: 0, averageDegree: 0, density: 0, isConnected: true, componentCount: 1 },
    } as never));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    const id = (result as PromiseFulfilledResult<string>).value;
    expect(await persistence.getSnapshot(id)).not.toBeNull();
  });
});

describe('routing_outcomes migration on a locked database (#1274)', () => {
  it('rethrows a busy error so a retrying caller migrates on its next attempt', async () => {
    vi.resetModules(); // fresh process-local "migrated" flag
    const { ensureRoutingOutcomesAdr095Columns } = await import('../../../src/routing/routing-outcomes-migration.js');
    dbPath = path.join(dir, 'pre-adr-095.db');
    const db = new Database(dbPath);
    try {
      db.exec('CREATE TABLE routing_outcomes (id TEXT PRIMARY KEY, created_at TEXT)');
      db.pragma('busy_timeout = 0');
      lock();
      expect(() => ensureRoutingOutcomesAdr095Columns(db)).toThrow(/locked|busy/i);
      unlock();
      ensureRoutingOutcomesAdr095Columns(db);
      const columns = (db.prepare("SELECT name FROM pragma_table_info('routing_outcomes')").all() as Array<{ name: string }>)
        .map((c) => c.name);
      expect(columns).toEqual(expect.arrayContaining(['exploration', 'criticality', 'q_weight']));
    } finally {
      db.close();
    }
  });
});
