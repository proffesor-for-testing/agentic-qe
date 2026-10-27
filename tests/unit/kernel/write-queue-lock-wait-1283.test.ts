/**
 * #1283: writes that only hold the raw shared memory.db connection now go
 * through the connection's write queue (src/shared/sqlite-write-queue.ts),
 * which UnifiedMemoryManager registers while it is open. Before, each one
 * waited for a locked database synchronously, for the whole busy_timeout, and
 * froze the MCP server's event loop.
 * Fixture: a fresh memory.db under the OS temp dir, locked by a second
 * better-sqlite3 connection in this process, with the MCP server's lock wait
 * cap set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory, resetUnifiedMemory, type UnifiedMemoryManager } from '../../../src/kernel/unified-memory.js';
import { setLockWaitCap } from '../../../src/shared/sqlite-lock-wait.js';
import { hasWriteQueue, writeWhenUnlockedOn } from '../../../src/shared/sqlite-write-queue.js';
import { createWitnessChain } from '../../../src/audit/witness-chain.js';
import {
  createPersistentWitnessChain,
  createWitnessChainSQLitePersistence,
} from '../../../src/governance/witness-chain.js';
import { DeltaTracker } from '../../../src/integrations/ruvector/delta-tracker.js';
import { PatternNullStore } from '../../../src/learning/pattern-null-store.js';
import { CoExecutionRepository } from '../../../src/routing/co-execution-repository.js';
import { SqliteSpendLedger } from '../../../src/shared/llm/spend-ledger.js';
import { MinCutPersistence } from '../../../src/coordination/mincut/mincut-persistence.js';

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

/** Lock, run `work`, release after HOLD_MS; report the longest event-loop stall once every queued write settled. */
async function underLock<T>(um: UnifiedMemoryManager, work: () => Promise<T> | T) {
  lock();
  const held = holder;
  setTimeout(() => { if (holder === held) unlock(); }, HOLD_MS); // never releases a later test's lock
  let last = Date.now();
  let gap = 0;
  const tick = setInterval(() => { const now = Date.now(); gap = Math.max(gap, now - last); last = now; }, 10);
  const [result] = await Promise.allSettled([Promise.resolve().then(work)]);
  await um.writeWhenUnlocked(() => undefined); // FIFO: settles after every earlier write
  gap = Math.max(gap, Date.now() - last);
  clearInterval(tick);
  return { gap, result };
}

function value<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}

async function openMemory(): Promise<UnifiedMemoryManager> {
  const um = getUnifiedMemory({ dbPath, busyTimeout: BUSY_TIMEOUT_MS });
  await um.initialize();
  return um;
}

function count(db: DatabaseType, sql: string, ...args: unknown[]): number {
  return (db.prepare(sql).get(...args) as { n: number }).n;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-write-queue-1283-'));
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

describe('write queue registry (#1283)', () => {
  it('routes the shared connection while it is open, and stops when it closes', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    expect(hasWriteQueue(db)).toBe(true);

    const { gap, result } = await underLock(um, () =>
      writeWhenUnlockedOn(db, () => db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES ('q', 'ns', '1')").run()));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(db, "SELECT COUNT(*) AS n FROM kv_store WHERE key = 'q'")).toBe(1);
    um.close();
    expect(hasWriteQueue(db)).toBe(false);
  });

  it('runs a write on any other connection at once and reports its error', async () => {
    const other = new Database(':memory:');
    try {
      other.exec('CREATE TABLE t (v INTEGER)');
      const pending = writeWhenUnlockedOn(other, () => other.prepare('INSERT INTO t VALUES (1)').run());
      expect(count(other, 'SELECT COUNT(*) AS n FROM t')).toBe(1);
      await pending;
      await expect(writeWhenUnlockedOn(other, () => other.exec('INSERT INTO missing VALUES (1)'))).rejects.toThrow(/no such table/);
    } finally {
      other.close();
    }
  });
});

describe('fire-and-forget writers on a locked database (#1283)', () => {
  it('audit witness chain: appendWhenUnlocked does not block and keeps the chain linked', async () => {
    const um = await openMemory();
    const chain = createWitnessChain(um.getDatabase());
    await chain.initialize();
    chain.append('PATTERN_CREATE', { n: 0 }, 'test');

    const { gap, result } = await underLock(um, () => Promise.all([
      chain.appendWhenUnlocked('PATTERN_CREATE', { n: 1 }, 'test'),
      chain.appendWhenUnlocked('PATTERN_UPDATE', { n: 2 }, 'test'),
    ]));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(chain.verify().valid).toBe(true);
  });

  it('governance witness chain: appendWitness returns at once and the receipt is persisted after the lock', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    const chain = createPersistentWitnessChain(createWitnessChainSQLitePersistence(db));

    const { gap, result } = await underLock(um, () =>
      chain.appendWitness({ type: 'quality-gate', decision: 'PASS', context: { gate: 'g' } }));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(db, 'SELECT COUNT(*) AS n FROM witness_chain_receipts')).toBe(1);
  });

  it('DeltaTracker: queued deltas do not block and get consecutive versions', async () => {
    const um = await openMemory();
    const tracker = new DeltaTracker(um.getDatabase());
    tracker.initialize();

    const { gap, result } = await underLock(um, async () => {
      await tracker.createGenesisWhenUnlocked('p1', { confidence: 0.5 });
      return Promise.all([
        tracker.recordDeltaWhenUnlocked('p1', { confidence: 0.5 }, { confidence: 0.6 }),
        tracker.recordDeltaWhenUnlocked('p1', { confidence: 0.6 }, { confidence: 0.7 }),
      ]);
    });

    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(value(result).map((e) => e.version)).toEqual([1, 2]);
  });

  it('PatternNullStore: recordNullWhenUnlocked does not block and stores the null', async () => {
    const um = await openMemory();
    um.getDatabase().prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name)
      VALUES ('p1', 'test-template', 'test-generation', 'test-generation', 'p1')`).run();
    const store = new PatternNullStore(um.getDatabase());

    const { gap, result } = await underLock(um, () =>
      store.recordNullWhenUnlocked({ patternId: 'p1', contextFingerprint: 'd:a', failureMode: 'failed' }));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(store.getNullSummaries(['p1']).get('p1')).toBeDefined();
  });

  it('co-execution: recording a swarm does not block and the pairs land after the lock', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    const repo = new CoExecutionRepository();
    repo.initialize(db);

    const { gap } = await underLock(um, () => {
      repo.recordSwarmCoExecution(['a', 'b', 'c'], 'test-generation', true, 'task');
      repo.recordCoExecution({ agentA: 'd', agentB: 'e', domain: 'test-generation', success: true });
    });

    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(db, 'SELECT COUNT(*) AS n FROM qe_agent_co_execution')).toBe(4);
  });

  it('MinCut weak vertices and alerts do not block and land once', async () => {
    const um = await openMemory();
    const persistence = new MinCutPersistence(um);
    await persistence.initialize();
    const weak = {
      vertexId: 'v1', vertex: { id: 'v1', type: 'agent', domain: 'test-generation' }, weightedDegree: 1,
      riskScore: 0.9, reason: 'isolated', suggestions: [],
    };

    const { gap, result } = await underLock(um, async () => {
      const ids = await persistence.saveWeakVertices([weak] as never);
      await persistence.saveAlert({
        id: 'a1', severity: 'warning', message: 'low mincut', minCutValue: 1, threshold: 2,
        affectedVertices: ['v1'], remediations: [], acknowledged: false, timestamp: new Date(),
      } as never);
      return ids;
    });

    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(value(result)).toHaveLength(1);
    const db = um.getDatabase();
    expect(count(db, 'SELECT COUNT(*) AS n FROM mincut_weak_vertices')).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM mincut_alerts')).toBe(1);
  });
});

describe('spend ledger on a locked database (#1283)', () => {
  it('record() does not block, the budget read counts the queued charge, and nothing is counted twice', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    const ledger = new SqliteSpendLedger(db);
    const entry = {
      provider: 'p', model: 'm', costUsd: 0.25, costSource: 'local-estimate' as const,
      promptTokens: 1, completionTokens: 1, requestId: 'r1', agent: 'qe-test-architect',
    };
    let spentWhileLocked = -1;
    let byAgentWhileLocked: Record<string, number> = {};

    const { gap } = await underLock(um, () => {
      ledger.record(entry);
      spentWhileLocked = ledger.spentSince(60_000);
      byAgentWhileLocked = ledger.spentByAgentSince(60_000);
    });

    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(spentWhileLocked).toBeCloseTo(0.25);
    expect(byAgentWhileLocked['qe-test-architect']).toBeCloseTo(0.25);
    expect(count(db, 'SELECT COUNT(*) AS n FROM llm_spend')).toBe(1);
    expect(ledger.spentSince(60_000)).toBeCloseTo(0.25);
  });

  it('records at once when unlocked, so an immediate budget read sees the charge exactly once', async () => {
    const um = await openMemory();
    const ledger = new SqliteSpendLedger(um.getDatabase());
    ledger.record({
      provider: 'p', model: 'm', costUsd: 0.5, costSource: 'local-estimate',
      promptTokens: 1, completionTokens: 1, requestId: 'r2',
    });
    expect(ledger.spentSince(60_000)).toBeCloseTo(0.5);
  });
});
