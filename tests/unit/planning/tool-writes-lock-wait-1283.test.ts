/**
 * #1283: writes made inside awaited MCP tool calls (test-outcome and coverage
 * feedback, GOAP planning and execution, trajectory start, pattern versions
 * and outcomes, the embedding cache) waited for a locked memory.db
 * synchronously, for the whole busy_timeout, and froze the MCP server's event
 * loop. They now go through the shared connection's write queue; the
 * read-modify-write ones run as one queued unit.
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
import { TestOutcomeTracker } from '../../../src/feedback/test-outcome-tracker.js';
import { CoverageLearner } from '../../../src/feedback/coverage-learner.js';
import { GOAPPlanner } from '../../../src/planning/goap-planner.js';
import { MockAgentSpawner, PlanExecutor } from '../../../src/planning/plan-executor.js';
import { TrajectoryTracker } from '../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import { PatternEvolution } from '../../../src/integrations/agentic-flow/reasoning-bank/pattern-evolution.js';
import { EmbeddingCache } from '../../../src/integrations/embeddings/cache/EmbeddingCache.js';
import { createRealQEReasoningBank } from '../../../src/learning/real-qe-reasoning-bank.js';

// No ONNX model load in a unit test.
vi.mock('../../../src/learning/real-embeddings.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>()),
  computeRealEmbedding: async () => { throw new Error('no embedding runtime in this test'); },
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-tool-lock-1283-'));
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

describe('feedback writes inside tool calls (#1283)', () => {
  it('TestOutcomeTracker.track does not block and persists the outcome', async () => {
    const um = await openMemory();
    const tracker = new TestOutcomeTracker();
    await tracker.initialize();

    const { gap, result } = await underLock(um, () => tracker.track({
      id: 'o1', testId: 't1', testName: 'adds', generatedBy: 'qe-test-architect', framework: 'vitest',
      language: 'typescript', domain: 'test-generation', passed: true,
      coverage: { lines: 80, branches: 70, functions: 90 }, executionTimeMs: 5, flaky: false,
      maintainabilityScore: 0.8, timestamp: new Date(),
    } as never));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM test_outcomes WHERE id = 'o1'")).toBe(1);
  });

  it('CoverageLearner.learnFromSession does not block and persists the session', async () => {
    const um = await openMemory();
    const learner = new CoverageLearner();
    await learner.initialize();

    const { gap, result } = await underLock(um, () => learner.learnFromSession({
      id: 's1', targetPath: 'src/a.ts', agentId: 'qe-coverage-specialist', technique: 'gap-analysis',
      beforeCoverage: { lines: 50, branches: 40, functions: 60 }, afterCoverage: { lines: 70, branches: 60, functions: 80 },
      testsGenerated: 3, testsPassed: 3, gapsTargeted: [], durationMs: 10,
      startedAt: new Date(), completedAt: new Date(),
    } as never));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM coverage_sessions WHERE id = 's1'")).toBe(1);
  });
});

describe('GOAP writes inside tool calls (#1283)', () => {
  it('addGoal and concurrent updateActionStats do not block and lose no update', async () => {
    const um = await openMemory();
    const planner = new GOAPPlanner();
    await planner.initialize();
    const actionId = await planner.addAction({
      name: 'run-tests', agentType: 'qe-test-architect', preconditions: {}, effects: {}, cost: 1,
      successRate: 1, category: 'test',
    } as never);

    const { gap, result } = await underLock(um, () => Promise.all([
      planner.addGoal({ name: 'covered', conditions: {}, priority: 1 } as never),
      planner.updateActionStats(actionId, true, 5),
      planner.updateActionStats(actionId, false, 5),
    ]));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    const db = um.getDatabase();
    expect(count(db, "SELECT COUNT(*) AS n FROM goap_goals WHERE name = 'covered'")).toBe(1);
    expect(db.prepare('SELECT execution_count FROM goap_actions WHERE id = ?').get(actionId)).toEqual({ execution_count: 2 });
  });

  it('PlanExecutor records an execution without blocking', async () => {
    const um = await openMemory();
    const planner = new GOAPPlanner();
    await planner.initialize();
    const executor = new PlanExecutor(planner, new MockAgentSpawner({ executionDelay: 0 }));
    await executor.initialize();
    const persist = (executor as unknown as {
      persistExecutionResult(id: string, result: unknown): Promise<void>;
    }).persistExecutionResult.bind(executor);

    const { gap, result } = await underLock(um, () => persist('exec-1', {
      planId: 'plan-1', status: 'completed', totalDurationMs: 5,
      steps: [{ id: 'step-1', action: { id: 'a1' }, status: 'completed', retries: 0, startedAt: new Date() }],
    }));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM goap_execution_steps WHERE execution_id = 'exec-1'")).toBe(1);
  });
});

describe('learning writes inside tool calls (#1283)', () => {
  it('TrajectoryTracker.startTrajectory (task_orchestrate) does not block and stores the trajectory', async () => {
    const um = await openMemory();
    const tracker = new TrajectoryTracker();
    await tracker.initialize();

    const { gap, result } = await underLock(um, () => tracker.startTrajectory('generate tests', { domain: 'test-generation' }));

    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), 'SELECT COUNT(*) AS n FROM qe_trajectories WHERE id = ?', value(result))).toBe(1);
  });

  it('PatternEvolution.trackVersion: concurrent versions do not block and get distinct numbers', async () => {
    const um = await openMemory();
    um.getDatabase().prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name)
      VALUES ('p1', 'test-template', 'test-generation', 'test-generation', 'p1')`).run();
    const evolution = new PatternEvolution();
    await evolution.initialize();
    const embedding = new Array(8).fill(0.1);

    const { gap, result } = await underLock(um, () => Promise.all([
      evolution.trackVersion('p1', embedding, ['a']),
      evolution.trackVersion('p1', embedding, ['b']),
    ]));

    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(value(result).map((v) => v.version)).toEqual([1, 2]);
  });

  it('RealQEReasoningBank.recordPatternOutcome does not block and counts every outcome', async () => {
    const um = await openMemory();
    const bank = createRealQEReasoningBank({});
    await bank.initialize();
    const stored = await bank.storeQEPattern({
      patternType: 'test-template', name: 'outcomes', description: 'd', template: { type: 'code', content: 'x', variables: [] },
    } as never);
    if (!stored.success) throw stored.error;
    const patternId = stored.value;

    const { gap, result } = await underLock(um, () => Promise.all([
      bank.recordPatternOutcome(patternId.id, true, 0.9),
      bank.recordPatternOutcome(patternId.id, false, 0.2),
    ]));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(um.getDatabase().prepare('SELECT usage_count FROM qe_patterns WHERE id = ?').get(patternId.id))
      .toEqual({ usage_count: 2 });
    await bank.dispose();
  });

  it('EmbeddingCache.set does not block and the entry is persisted after the lock', async () => {
    const um = await openMemory();
    const cache = new EmbeddingCache();
    await vi.waitFor(() => expect((cache as unknown as { db: unknown }).db).toBeTruthy());

    const { gap } = await underLock(um, () => cache.set('k1', {
      vector: [0.1, 0.2], dimension: 2, namespace: 'text', text: 'k1', timestamp: Date.now(), quantization: 'none',
    } as never));

    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(count(um.getDatabase(), "SELECT COUNT(*) AS n FROM embeddings WHERE key = 'k1'")).toBe(1);
  });
});
