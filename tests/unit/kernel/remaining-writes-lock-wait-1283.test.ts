/**
 * #1283 (remaining part): writes on the shared memory.db connection that the
 * MCP server reaches and that still waited for a locked database
 * synchronously, for the whole busy_timeout, freezing the event loop:
 * the HybridMemoryBackend cleanup timer, the opt-in proof-gate snapshot,
 * SONA's usage update, Fisher save and request-count checkpoint, the
 * agentic-flow metrics tracker, TrajectoryTracker.recordStep, test
 * generation's pattern-usage update and the router/asymmetric-learning
 * witness appends. Each test locks a real memory.db from a second connection
 * and checks that the event loop keeps running and that the write lands once
 * the lock is released.
 * Fixture: a fresh memory.db under the OS temp dir, with the MCP server's
 * lock wait cap set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory, resetUnifiedMemory, type UnifiedMemoryManager } from '../../../src/kernel/unified-memory.js';
import { resetUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';
import { setLockWaitCap } from '../../../src/shared/sqlite-lock-wait.js';
import { HybridMemoryBackend } from '../../../src/kernel/hybrid-backend.js';
import { createPersistentSONAEngine, type PersistentSONAEngine } from '../../../src/integrations/ruvector/sona-persistence.js';
import { MetricsTracker } from '../../../src/integrations/agentic-flow/metrics/metrics-tracker.js';
import { TrajectoryTracker } from '../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import { AsymmetricLearningEngine } from '../../../src/learning/asymmetric-learning.js';
import { createWitnessChain } from '../../../src/audit/witness-chain.js';
import { TestGenerationCoordinator } from '../../../src/domains/test-generation/coordinator.js';
import type { GeneratedTests } from '../../../src/domains/test-generation/interfaces.js';
import { createCoordinatorTestContext, resetTestContext } from '../domains/coordinator-test-utils';

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
  if (!holder) lock();
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-remaining-lock-1283-'));
  dbPath = path.join(dir, '.agentic-qe', 'memory.db');
  vi.stubEnv('AQE_PROJECT_ROOT', dir);
  vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
  resetUnifiedPersistence();
  resetUnifiedMemory();
  setLockWaitCap(CAP_MS);
});

afterEach(() => {
  unlock();
  resetUnifiedPersistence();
  resetUnifiedMemory();
  setLockWaitCap(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('kernel background writes (#1283)', () => {
  it('HybridMemoryBackend cleanup: the TTL delete does not block and still removes the expired row', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    db.prepare("INSERT INTO kv_store (key, namespace, value, expires_at) VALUES ('old', 'ns', '1', ?)").run(Date.now() - 1000);
    const backend = new HybridMemoryBackend();
    // Drive the timer body directly on this manager. kvCleanupExpired is
    // already queued; stub it so the lock meets the backend's own delete.
    (backend as unknown as { unifiedMemory: UnifiedMemoryManager }).unifiedMemory = um;
    vi.spyOn(um, 'kvCleanupExpired').mockResolvedValue(0);

    const { gap, result } = await underLock(um, () =>
      (backend as unknown as { cleanup(): Promise<void> }).cleanup());

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(db, "SELECT COUNT(*) AS n FROM kv_store WHERE key = 'old'")).toBe(0);
  });

  it('proof gate: the chain snapshot after a kv write does not block and is persisted', async () => {
    const um = await openMemory();
    um.enableProofGate();
    const db = um.getDatabase();
    // Another process takes the lock right after the kv write commits, before
    // the chain snapshot is written.
    const gate = (um as unknown as { proofGate: { admit: (r: unknown) => unknown } }).proofGate;
    const admit = gate.admit.bind(gate);
    vi.spyOn(gate, 'admit').mockImplementation((r) => {
      const out = admit(r);
      lock();
      const held = holder;
      setTimeout(() => { if (holder === held) unlock(); }, HOLD_MS);
      return out;
    });

    const { gap, result } = await underLock(um, () => { unlock(); return um.kvSet('k1', { a: 1 }); });

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    const row = db.prepare("SELECT value FROM kv_store WHERE namespace = '__proofgate__'").get() as { value: string } | undefined;
    expect(row).toBeDefined();
    expect(um.getProofChainLength()).toBe(1);
  });
});

describe('SONA writes inside tool calls (#1283)', () => {
  let engine: PersistentSONAEngine | undefined;
  afterEach(async () => {
    await engine?.close().catch(() => undefined);
    engine = undefined;
  });

  const state = { id: 'state', features: new Array(384).fill(0.25) };

  async function engineWithPersistedPattern(um: UnifiedMemoryManager) {
    engine = await createPersistentSONAEngine({ domain: 'test-generation', autoSaveInterval: 10 });
    const pattern = engine.createPattern(state, { type: 'test-action', value: 'run-tests' },
      { reward: 0.8, success: true, quality: 0.9 }, 'test-generation', 'test-generation');
    await new Promise((r) => setTimeout(r, 30));
    await (engine as unknown as { flushInFlight: Promise<void> | null }).flushInFlight;
    expect(count(um.getDatabase(), 'SELECT COUNT(*) AS n FROM sona_patterns WHERE id = ?', pattern.id)).toBe(1);
    return pattern;
  }

  it('adaptPattern: the usage update does not block and is counted', async () => {
    const um = await openMemory();
    const pattern = await engineWithPersistedPattern(um);
    const before = (um.getDatabase().prepare('SELECT usage_count AS n FROM sona_patterns WHERE id = ?').get(pattern.id) as { n: number }).n;
    // The in-memory @ruvector/sona match needs trained clusters; stub only
    // that lookup so the persisted usage update is what meets the lock.
    const base = (engine as unknown as { baseEngine: { adaptPattern: (...a: unknown[]) => Promise<unknown> } }).baseEngine;
    vi.spyOn(base, 'adaptPattern').mockResolvedValue({
      success: true, pattern, adaptationTimeMs: 0, similarity: 1, reasoning: 'stub',
    });

    const { gap, result } = await underLock(um, () => engine!.adaptPattern(state, 'test-generation', 'test-generation'));

    expect(value(result).success).toBe(true);
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), 'SELECT usage_count AS n FROM sona_patterns WHERE id = ?', pattern.id)).toBe(before + 1);
  });

  it('Fisher persistence after consolidation does not block, is saved, and close() waits for it', async () => {
    const um = await openMemory();
    engine = await createPersistentSONAEngine({ domain: 'test-generation' });
    const persist = (engine as unknown as { baseEngine: { fisherPersistFn: ((...a: unknown[]) => void) | null } })
      .baseEngine.fisherPersistFn;
    expect(persist).toBeTypeOf('function');
    const vec = new Float32Array([0.1, 0.2, 0.3]);
    const meta = { taskBoundaries: 1, consolidationCycles: 2, requestCount: 3, ewcLambda: 1000 };

    const { gap, result } = await underLock(um, () => persist!('test-generation', vec, vec, vec, meta));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM sona_fisher_matrices WHERE domain = 'test-generation' AND consolidation_cycles = 2")).toBe(1);

    // A save still queued when close() starts lands before the engine lets go of the connection.
    lock();
    const held = holder;
    setTimeout(() => { if (holder === held) unlock(); }, 300);
    persist!('test-generation', vec, vec, vec, { ...meta, consolidationCycles: 5 });
    await engine.close();
    engine = undefined;
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM sona_fisher_matrices WHERE consolidation_cycles = 5")).toBe(1);
  });

  it('close(): the request-count checkpoint does not block and is saved', async () => {
    const um = await openMemory();
    engine = await createPersistentSONAEngine({ domain: 'test-generation' });
    const closing = engine;
    engine = undefined;

    const { gap, result } = await underLock(um, () => closing.close());

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM kv_store WHERE namespace = 'sona' AND key = 'request-count:test-generation'")).toBe(1);
  });
});

describe('agentic-flow metrics tracker (#1283)', () => {
  it('recordOutcome does not block and stores the outcome', async () => {
    const um = await openMemory();
    const tracker = new MetricsTracker({ dbPath, autoCleanup: false });
    await tracker.initialize();

    const { gap, result } = await underLock(um, () => tracker.recordOutcome('booster', 'task-1', true, 5));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM metrics_outcomes WHERE task_id = 'task-1'")).toBe(1);
    await tracker.dispose();
  });

  it('cleanup (timer) does not block and enforces maxOutcomes', async () => {
    const um = await openMemory();
    const tracker = new MetricsTracker({ dbPath, autoCleanup: false, maxOutcomes: 2 });
    await tracker.initialize();
    for (let i = 0; i < 4; i++) await tracker.recordOutcome('booster', `t-${i}`, true, 1);

    const { gap, result } = await underLock(um, () => tracker.cleanup());

    expect(value(result)).toBe(2);
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), 'SELECT COUNT(*) AS n FROM metrics_outcomes')).toBe(2);
    await tracker.dispose();
  });
});

describe('trajectory steps and pattern usage (#1283)', () => {
  it('TrajectoryTracker.recordStep does not block and keeps distinct step indexes', async () => {
    const um = await openMemory();
    const tracker = new TrajectoryTracker();
    await tracker.initialize();
    const id = await tracker.startTrajectory('generate tests', { domain: 'test-generation' });

    const { gap, result } = await underLock(um, () => Promise.all([
      tracker.recordStep(id, 'analyze', { outcome: 'success' }),
      tracker.recordStep(id, 'generate', { outcome: 'success' }),
    ]));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    const rows = um.getDatabase().prepare(
      'SELECT step_order, action FROM trajectory_steps WHERE trajectory_id = ? ORDER BY step_order',
    ).all(id);
    expect(rows).toEqual([{ step_order: 0, action: 'analyze' }, { step_order: 1, action: 'generate' }]);
  });

  it('test generation (learnFromGeneration): the pattern-usage update does not block and counts every use', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    for (const id of ['p1', 'p2']) {
      db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name)
        VALUES (?, 'test-template', 'test-generation', 'test-generation', ?)`).run(id, id);
    }
    const ctx = createCoordinatorTestContext();
    const coordinator = new TestGenerationCoordinator(ctx.eventBus, ctx.memory, ctx.agentCoordinator, {
      enablePatternLearning: false, enableQESONA: false, enableFlashAttention: false,
      enableDecisionTransformer: false, enableCoherenceGate: false, enableMinCutAwareness: false,
      enableConsensus: false,
    });
    const tests: GeneratedTests = { tests: [], coverageEstimate: 80, patternsUsed: ['p1', 'p2'], patternIds: ['p1', 'p2'] };
    try {
      const { gap, result } = await underLock(um, () =>
        (coordinator as unknown as { learnFromGeneration(t: GeneratedTests): Promise<void> }).learnFromGeneration(tests));

      expect(result.status).toBe('fulfilled');
      expect(gap).toBeLessThan(MAX_GAP_MS);
      expect(count(db, "SELECT SUM(usage_count) AS n FROM qe_patterns WHERE id IN ('p1', 'p2')")).toBe(2);
      expect(count(db, "SELECT COUNT(*) AS n FROM qe_pattern_usage WHERE pattern_id IN ('p1', 'p2')")).toBe(2);
    } finally {
      await coordinator.dispose();
      resetTestContext(ctx);
    }
  });
});

describe('witness appends (#1283)', () => {
  it('AsymmetricLearningEngine: the HEBBIAN_PENALTY append does not block and lands after the lock', async () => {
    const um = await openMemory();
    const chain = createWitnessChain(um.getDatabase());
    await chain.initialize();
    const engine = new AsymmetricLearningEngine();
    engine.witnessChain = chain;

    const { gap, result } = await underLock(um, () => engine.computeConfidenceUpdate(0.8, 'failure', 'test-generation'));

    expect(value(result)).toBeLessThan(0.8);
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM witness_chain WHERE action_type = 'HEBBIAN_PENALTY'")).toBe(1);
  });
});
