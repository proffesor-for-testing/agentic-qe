/**
 * #1356: writes the MCP server made on a second connection to memory.db. The
 * write queue only covers the shared connection, so on their own connection
 * these waited for a locked database synchronously, for the busy_timeout,
 * freezing the event loop: the hypergraph engine (code-intelligence
 * coordinator and the hypergraph MCP handler), LearningMetricsTracker and
 * saveEmbedderIdentity. They now use the shared connection when it is open on
 * the same file, queue their writes, and never close it.
 *
 * Each lock test locks a real memory.db from a second connection and checks
 * that the event loop keeps running and that the write lands once the lock is
 * released. Fixture: a fresh memory.db under the OS temp dir, with the MCP
 * server's lock wait cap set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory, resetUnifiedMemory, type UnifiedMemoryManager } from '../../../src/kernel/unified-memory.js';
import { resetUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';
import { setLockWaitCap } from '../../../src/shared/sqlite-lock-wait.js';
import { queuedConnectionFor } from '../../../src/shared/sqlite-write-queue.js';
import { LearningMetricsTracker } from '../../../src/learning/metrics-tracker.js';
import {
  loadEmbedderIdentity,
  resetEmbedderIdentityStore,
  saveEmbedderIdentity,
} from '../../../src/learning/embedder-identity-store.js';
import { createHypergraphEngine, type CodeIndexResult } from '../../../src/integrations/ruvector/hypergraph-engine.js';
import { handleHypergraphQuery } from '../../../src/mcp/handlers/hypergraph-handler.js';
import { CodeIntelligenceCoordinator } from '../../../src/domains/code-intelligence/coordinator.js';
import type { AgentCoordinator, EventBus, MemoryBackend } from '../../../src/kernel/interfaces.js';

const CAP_MS = 50;
const BUSY_TIMEOUT_MS = 3000;
const HOLD_MS = 600;
/** A synchronous write would block for BUSY_TIMEOUT_MS; a queued one for at most CAP_MS per attempt. */
const MAX_GAP_MS = 400;

let dir: string;
let dbPath: string;
let holder: DatabaseType | null = null;

/** Hold the write lock from a second connection; released by a timer after `ms`. */
function lockFor(ms: number): void {
  const held = new Database(dbPath);
  held.pragma('busy_timeout = 0');
  held.exec('BEGIN IMMEDIATE');
  holder = held;
  setTimeout(() => { if (holder === held) unlock(); }, ms); // never releases a later test's lock
}

function unlock(): void {
  if (!holder) return;
  holder.exec('ROLLBACK');
  holder.close();
  holder = null;
}

/** Lock, run `work`; report the longest event-loop stall once every queued write settled. */
async function underLock<T>(um: UnifiedMemoryManager, work: () => Promise<T> | T) {
  lockFor(HOLD_MS);
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

const INDEX: CodeIndexResult = {
  files: [
    { path: '/proj/src/math.ts', entities: [{ type: 'function', name: 'add', lineStart: 1, lineEnd: 3 }], imports: [] },
    { path: '/proj/src/math.test.ts', entities: [], imports: ['./math'] },
  ],
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-shared-conn-1356-'));
  dbPath = path.join(dir, '.agentic-qe', 'memory.db');
  vi.stubEnv('AQE_PROJECT_ROOT', dir);
  vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
  vi.stubEnv('AQE_MEMORY_PATH', '');
  resetUnifiedPersistence();
  resetUnifiedMemory();
  resetEmbedderIdentityStore();
  setLockWaitCap(CAP_MS);
});

afterEach(() => {
  unlock();
  resetEmbedderIdentityStore();
  resetUnifiedPersistence();
  resetUnifiedMemory();
  setLockWaitCap(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('queuedConnectionFor (#1356)', () => {
  it('returns the shared connection for its file only, and nothing once it is closed', async () => {
    const um = await openMemory();
    expect(queuedConnectionFor(dbPath)).toBe(um.getDatabase());
    expect(queuedConnectionFor(path.join(dir, '.agentic-qe', '..', '.agentic-qe', 'memory.db'))).toBe(um.getDatabase());
    expect(queuedConnectionFor(path.join(dir, 'other.db'))).toBeUndefined();
    expect(queuedConnectionFor(':memory:')).toBeUndefined();
    resetUnifiedMemory();
    expect(queuedConnectionFor(dbPath)).toBeUndefined();
  });
});

describe('LearningMetricsTracker (#1356)', () => {
  it('saveSnapshot(): uses the shared connection, does not block, and the snapshot lands', async () => {
    const um = await openMemory();
    const tracker = new LearningMetricsTracker(dir);
    await tracker.initialize();
    expect((tracker as unknown as { db: DatabaseType }).db).toBe(um.getDatabase());

    const { gap, result } = await underLock(um, () => tracker.saveSnapshot());

    value(result);
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), 'SELECT COUNT(*) AS n FROM learning_daily_snapshots')).toBe(1);
    tracker.close();
    expect(um.getDatabase().open).toBe(true); // not the tracker's to close
  });
});

describe('saveEmbedderIdentity (#1356)', () => {
  it('uses the shared connection, does not block, and the identity lands', async () => {
    const um = await openMemory();
    const identity = { dim: 384, fingerprint: 'fp-1356', endpoint: 'http://127.0.0.1:9/embed' };

    const { gap, result } = await underLock(um, () => saveEmbedderIdentity(identity));

    value(result);
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM kv_store WHERE namespace = '_system' AND key = ?",
      `embedder_identity:${identity.endpoint}`)).toBe(1);
    expect(loadEmbedderIdentity(identity.endpoint)?.fingerprint).toBe('fp-1356');
    resetEmbedderIdentityStore();
    expect(um.getDatabase().open).toBe(true); // not the store's to close
  });
});

describe('HypergraphEngine on the shared connection (#1356)', () => {
  it('buildFromIndexResult(): does not block, lands once the lock is released, and counts each row once', async () => {
    const um = await openMemory();
    const engine = await createHypergraphEngine({ db: um.getDatabase(), enableVectorSearch: false });

    const { gap, result } = await underLock(um, () => engine.buildFromIndexResult(INDEX));

    const built = value(result);
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(built.errors).toEqual([]);
    expect(built.nodesCreated).toBe(3); // two files and one function, despite the retries
    expect(count(um.getDatabase(), 'SELECT COUNT(*) AS n FROM hypergraph_nodes')).toBe(3);
  });

  it('synthesizeTestCoverage() and addNode(): do not block and land once the lock is released', async () => {
    const um = await openMemory();
    const engine = await createHypergraphEngine({ db: um.getDatabase(), enableVectorSearch: false });
    await engine.buildFromIndexResult(INDEX);

    const { gap, result } = await underLock(um, async () => {
      const synth = await engine.synthesizeTestCoverage();
      const nodeId = await engine.addNode({ type: 'function', name: 'extra', filePath: '/proj/src/extra.ts' });
      return { synth, nodeId };
    });

    const { synth, nodeId } = value(result);
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(synth).toEqual({ testsTagged: 1, coversCreated: 1 });
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM hypergraph_edges WHERE type = 'covers'")).toBe(1);
    expect(count(um.getDatabase(), 'SELECT COUNT(*) AS n FROM hypergraph_nodes WHERE id = ?', nodeId)).toBe(1);
  });

  it('hypergraph_query: reuses the shared connection and leaves it open', async () => {
    const um = await openMemory();

    const res = await handleHypergraphQuery({ query: 'stats' });

    expect(res.success).toBe(true);
    expect(um.getDatabase().open).toBe(true);
    expect(queuedConnectionFor(dbPath)).toBe(um.getDatabase());
  });

  it('code-intelligence coordinator: reuses the shared connection and dispose() leaves it open', async () => {
    const um = await openMemory();
    const eventBus = { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })), unsubscribe: vi.fn() } as unknown as EventBus;
    const memory = {
      initialize: vi.fn(), dispose: vi.fn(), set: vi.fn(), get: vi.fn(), delete: vi.fn(), has: vi.fn(),
      search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), storeVector: vi.fn(),
    } as unknown as MemoryBackend;
    const agents = { spawn: vi.fn(), stop: vi.fn(), status: vi.fn(), canSpawn: vi.fn(() => true) } as unknown as AgentCoordinator;
    const coordinator = new CodeIntelligenceCoordinator(eventBus, memory, agents, {
      enableHypergraph: true,
      enableGNN: false,
      enableSONA: false,
      enableMetricCollector: false,
      publishEvents: false,
    });

    await coordinator.initialize();
    expect((coordinator as unknown as { hypergraphDb: DatabaseType }).hypergraphDb).toBe(um.getDatabase());
    await coordinator.dispose();

    expect(um.getDatabase().open).toBe(true);
  });
});
