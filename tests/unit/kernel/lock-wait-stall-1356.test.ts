/**
 * #1356: the stall left after #1283. Under an intermittent lock on memory.db,
 * test_generate_enhanced froze the MCP server's event loop for 2.3-2.9 s at
 * its first call. Instrumenting the server pinned it to two synchronous
 * better-sqlite3 calls that waited for the lock for the busy_timeout:
 *
 * - RvfPatternStore.store's qe_patterns INSERT (QEReasoningBank's cross-domain
 *   seeding writes through it at init), and RvfPatternStore.delete;
 * - AQELearningEngine.initialize creating witness_chain_receipts through
 *   createWitnessChainSQLitePersistence.
 *
 * Each test locks a real memory.db from a second connection and checks that
 * the event loop keeps running and that the write lands once the lock is
 * released. Fixture: a fresh memory.db under the OS temp dir, with the MCP
 * server's lock wait cap set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory, resetUnifiedMemory, type UnifiedMemoryManager } from '../../../src/kernel/unified-memory.js';
import { getUnifiedPersistence, resetUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';
import { setLockWaitCap } from '../../../src/shared/sqlite-lock-wait.js';
import { RvfPatternStore } from '../../../src/learning/rvf-pattern-store.js';
import { createSQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';
import type { RvfNativeAdapter } from '../../../src/integrations/ruvector/rvf-native-adapter.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import { setRuVectorFeatureFlags, resetRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';
import { _resetWitnessChainForTests } from '../../../src/audit/witness-chain.js';

// Lock the database the moment the engine reaches the witness-receipts DDL, as
// another process would; the real factory then runs against the held lock.
const ddlHook = vi.hoisted(() => ({ beforeCreate: null as null | (() => void) }));
vi.mock('../../../src/governance/witness-chain.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/governance/witness-chain.js')>();
  return {
    ...actual,
    createWitnessChainSQLitePersistence: (db: Parameters<typeof actual.createWitnessChainSQLitePersistence>[0]) => {
      const hook = ddlHook.beforeCreate;
      ddlHook.beforeCreate = null; // only the first attempt meets the lock
      hook?.();
      return actual.createWitnessChainSQLitePersistence(db);
    },
  };
});

const CAP_MS = 50;
const BUSY_TIMEOUT_MS = 3000;
const HOLD_MS = 600;
/** A synchronous write would block for BUSY_TIMEOUT_MS; a queued one for at most CAP_MS per attempt. */
const MAX_GAP_MS = 400;
/**
 * Engine init does seconds of CPU work around the DDL, which stalls the loop
 * for hundreds of ms on a loaded machine. A synchronous DDL would block for
 * the whole BUSY_TIMEOUT_MS (the release timer cannot fire), so half of it
 * still tells the two apart.
 */
const ENGINE_MAX_GAP_MS = BUSY_TIMEOUT_MS / 2;
const SPACE_ID = 'test-runtime-embedding-space-1356';

let dir: string;
let dbPath: string;
let holder: DatabaseType | null = null;

/** Hold the write lock from a second connection; released by a timer after HOLD_MS. */
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

/**
 * Run `work` (which takes the lock itself); report the longest event-loop
 * stall while `counting()` holds, once every queued write settled.
 */
async function measure<T>(um: UnifiedMemoryManager, work: () => Promise<T> | T, counting: () => boolean = () => true) {
  let last = Date.now();
  let gap = 0;
  const tick = setInterval(() => {
    const now = Date.now();
    if (counting()) gap = Math.max(gap, now - last);
    last = now;
  }, 10);
  const [result] = await Promise.allSettled([Promise.resolve().then(work)]);
  await um.writeWhenUnlocked(() => undefined); // FIFO: settles after every earlier write
  gap = Math.max(gap, Date.now() - last);
  clearInterval(tick);
  return { gap, result };
}

async function openMemory(): Promise<UnifiedMemoryManager> {
  const um = getUnifiedMemory({ dbPath, busyTimeout: BUSY_TIMEOUT_MS });
  await um.initialize();
  return um;
}

function count(db: DatabaseType, sql: string, ...args: unknown[]): number {
  return (db.prepare(sql).get(...args) as { n: number }).n;
}

function adapterStub(): RvfNativeAdapter {
  return {
    ingest: vi.fn((entries: unknown[]) => ({ accepted: entries.length, rejected: 0 })),
    delete: vi.fn(() => 1),
    search: vi.fn(() => []),
    close: vi.fn(),
    isOpen: vi.fn(() => true),
    size: vi.fn(() => 0),
    dimension: vi.fn(() => 384),
  } as unknown as RvfNativeAdapter;
}

function makePattern(name: string): QEPattern {
  return {
    id: `pattern-${name}`,
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name,
    description: 'pattern written under a held lock',
    confidence: 0.8,
    usageCount: 0,
    successRate: 0,
    qualityScore: 0.5,
    context: { tags: ['lock-1356'] },
    template: { type: 'code', content: 'test()', variables: [] },
    tier: 'short-term',
    createdAt: new Date(),
    lastUsedAt: new Date(),
    successfulUses: 0,
    reusable: false,
    reuseCount: 0,
    averageTokenSavings: 0,
  } as QEPattern;
}

/** An RVF pattern store whose SQLite metadata lives on the shared memory.db connection. */
async function openRvfStore(): Promise<RvfPatternStore> {
  const sqlite = createSQLitePatternStore({ useUnified: true });
  await sqlite.initialize();
  const store = new RvfPatternStore(() => adapterStub(), {
    rvfPath: path.join(dir, '.agentic-qe', 'patterns.rvf'),
    base: undefined as never,
    embeddingSpaceId: SPACE_ID,
    skipCloseOnDispose: true,
  });
  store.setSqliteStore(sqlite);
  await store.initialize();
  return store;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-lock-stall-1356-'));
  dbPath = path.join(dir, '.agentic-qe', 'memory.db');
  vi.stubEnv('AQE_PROJECT_ROOT', dir);
  vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
  resetUnifiedPersistence();
  resetUnifiedMemory();
  setLockWaitCap(CAP_MS);
  ddlHook.beforeCreate = null;
});

afterEach(() => {
  unlock();
  ddlHook.beforeCreate = null;
  resetUnifiedPersistence();
  resetUnifiedMemory();
  resetRuVectorFeatureFlags();
  _resetWitnessChainForTests();
  setLockWaitCap(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('RvfPatternStore writes on the shared connection (#1356)', () => {
  it('store(): the qe_patterns insert does not block and lands once the lock is released', async () => {
    const um = await openMemory();
    const store = await openRvfStore();

    const { gap, result } = await measure(um, () => {
      lockFor(HOLD_MS);
      return store.store(makePattern('stored-under-lock'));
    });

    expect(result.status).toBe('fulfilled');
    expect(result.status === 'fulfilled' && result.value.success).toBe(true);
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM qe_patterns WHERE name = 'stored-under-lock'")).toBe(1);
    await store.dispose();
  });

  it('delete(): the qe_patterns delete does not block and removes the row once the lock is released', async () => {
    const um = await openMemory();
    const store = await openRvfStore();
    const stored = await store.store(makePattern('deleted-under-lock'));
    expect(stored.success).toBe(true);
    const id = stored.success ? stored.value : '';

    const { gap, result } = await measure(um, () => {
      lockFor(HOLD_MS);
      return store.delete(id);
    });

    expect(result.status).toBe('fulfilled');
    expect(result.status === 'fulfilled' && result.value.success).toBe(true);
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), 'SELECT COUNT(*) AS n FROM qe_patterns WHERE id = ?', id)).toBe(0);
    await store.dispose();
  });
});

describe('AQELearningEngine witness wiring (#1356)', () => {
  it('initialize(): creating witness_chain_receipts does not block and the table exists once the lock is released', async () => {
    setRuVectorFeatureFlags({ useWitnessChain: true, useRVFPatternStore: false });
    const um = await openMemory();
    await getUnifiedPersistence({ dbPath, busyTimeout: BUSY_TIMEOUT_MS }).initialize();
    const { createAQELearningEngine } = await import('../../../src/learning/aqe-learning-engine.js');
    const { createMockMemoryBackend, createMockEventBus } = await import('../learning/_aqe-engine-test-helpers');
    const engine = createAQELearningEngine(
      createMockMemoryBackend(),
      { projectRoot: dir, enableClaudeFlow: false },
      createMockEventBus(),
    );
    let locked = false;
    ddlHook.beforeCreate = () => { lockFor(HOLD_MS); locked = true; };

    // Count stalls only from the moment the lock is taken.
    const { gap, result } = await measure(um, () => engine.initialize(), () => locked);

    expect(result.status).toBe('fulfilled');
    expect(locked).toBe(true); // the engine reached the DDL under the lock
    expect(gap).toBeLessThan(ENGINE_MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'witness_chain_receipts'")).toBe(1);
    await engine.dispose();
  }, 30_000);
});
