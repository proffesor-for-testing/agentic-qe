/**
 * #1283: the MCP server's in-process worker daemon and the SONA deferred-save
 * timer wrote to the shared memory.db connection synchronously. While another
 * process held the write lock, each write froze the event loop for the whole
 * busy_timeout. These writes now go through the connection's write queue.
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
import { resetUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';
import { setLockWaitCap } from '../../../src/shared/sqlite-lock-wait.js';
import { HeartbeatSchedulerWorker } from '../../../src/workers/workers/heartbeat-scheduler.js';
import { LearningConsolidationWorker } from '../../../src/workers/workers/learning-consolidation.js';
import { ExperienceConsolidator } from '../../../src/learning/experience-consolidation.js';
import { createPersistentSONAEngine, type PersistentSONAEngine } from '../../../src/integrations/ruvector/sona-persistence.js';
import type { WorkerContext } from '../../../src/workers/interfaces.js';
import { ExperienceReplay } from '../../../src/integrations/agentic-flow/reasoning-bank/experience-replay.js';

// No ONNX model load in a unit test: pattern embeddings are optional.
vi.mock('../../../src/learning/real-embeddings.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>()),
  computeRealEmbedding: async () => null,
}));

const CAP_MS = 50;
const BUSY_TIMEOUT_MS = 3000;
const HOLD_MS = 600;
/** A synchronous write would block for BUSY_TIMEOUT_MS; a queued one for at most CAP_MS per attempt. */
const MAX_GAP_MS = 400;

let dir: string;
let dbPath: string;
let holder: DatabaseType | null = null;

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

async function openMemory(): Promise<UnifiedMemoryManager> {
  const um = getUnifiedMemory({ dbPath, busyTimeout: BUSY_TIMEOUT_MS });
  await um.initialize();
  return um;
}

function context(): WorkerContext {
  return {
    eventBus: { publish: vi.fn().mockResolvedValue(undefined) },
    memory: { get: vi.fn().mockResolvedValue(undefined), set: vi.fn().mockResolvedValue(undefined), search: vi.fn().mockResolvedValue([]) },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    domains: { getDomainAPI: vi.fn().mockReturnValue(undefined), getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }) },
    signal: new AbortController().signal,
  } as unknown as WorkerContext;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-daemon-lock-1283-'));
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
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('worker daemon writes on a locked database (#1283)', () => {
  it('heartbeat: deprecation and confidence decay do not block, and the stale pattern is deprecated', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, confidence, created_at, last_used_at)
      VALUES ('stale', 'test-template', 'test-generation', 'test-generation', 'stale', 0.6,
              datetime('now', '-400 days'), datetime('now', '-400 days'))`).run();
    const worker = new HeartbeatSchedulerWorker();

    const { gap, result } = await underLock(um, () => worker.execute(context()));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(db.prepare("SELECT deprecated_at IS NOT NULL AS d FROM qe_patterns WHERE id = 'stale'").get()).toEqual({ d: 1 });
  });

  it('learning consolidation: new patterns from experience candidates do not block', async () => {
    const um = await openMemory();
    const worker = new LearningConsolidationWorker();
    const create = (worker as unknown as {
      createPatternsFromCandidates(c: unknown[]): Promise<number>;
    }).createPatternsFromCandidates.bind(worker);

    const { gap, result } = await underLock(um, () => create([{
      name: 'mined', domain: 'test-generation', patternType: 'test-template', confidence: 0.8,
      sourceExperiences: 4, avgReward: 0.9, successRate: 1, actions: ['generate'], templateContent: 'x',
    }]));

    expect(result).toEqual({ status: 'fulfilled', value: 1 });
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(um.getDatabase().prepare("SELECT COUNT(*) AS n FROM qe_patterns WHERE name = 'mined'").get()).toEqual({ n: 1 });
  });

  it('experience consolidation: archiving does not block and the valueless experience is archived', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    await new ExperienceReplay().initialize(); // creates the experience tables, as at MCP startup
    db.prepare(`INSERT INTO captured_experiences (id, task, agent, domain, success, quality, started_at, completed_at)
      VALUES ('old', 't', 'a', 'test-generation', 0, 0.05, datetime('now', '-60 days'), datetime('now', '-60 days'))`).run();
    const consolidator = new ExperienceConsolidator();
    await consolidator.initialize(db);

    const { gap, result } = await underLock(um, () => consolidator.consolidateDomain('test-generation'));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(db.prepare("SELECT consolidated_into FROM captured_experiences WHERE id = 'old'").get())
      .toEqual({ consolidated_into: 'archived' });
  });
});

describe('SONA deferred-save timer on a locked database (#1283)', () => {
  let engine: PersistentSONAEngine | undefined;
  afterEach(async () => {
    await engine?.close().catch(() => undefined);
    engine = undefined;
  });

  it('writes the batched pattern without blocking the event loop', async () => {
    const um = await openMemory();
    engine = await createPersistentSONAEngine({ domain: 'test-generation', autoSaveInterval: 20 });
    const internals = engine as unknown as { flushInFlight: Promise<void> | null };

    const { gap, result } = await underLock(um, async () => {
      const pattern = engine!.createPattern(
        { id: 'state', features: new Array(384).fill(0.25) },
        { type: 'test-action', value: 'run-tests' },
        { reward: 0.8, success: true, quality: 0.9 }, 'test-generation', 'test-generation',
      );
      await new Promise((r) => setTimeout(r, 50)); // the save timer fires during the lock
      await internals.flushInFlight;
      return pattern;
    });

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect((await engine.getAllPersistedPatterns()).map((p) => p.id))
      .toEqual([(result as PromiseFulfilledResult<{ id: string }>).value.id]);
  });
});
