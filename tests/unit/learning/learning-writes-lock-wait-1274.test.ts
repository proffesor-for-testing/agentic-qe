/**
 * #1274: learning-side writes on the shared memory.db connection (trajectory
 * completion, experience capture, pattern consolidation, pattern store
 * cleanup) waited for a locked database synchronously, for the connection's
 * whole busy_timeout, and froze the MCP server's event loop. They now go
 * through UnifiedMemoryManager.writeWhenUnlocked.
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
import { TrajectoryTracker } from '../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import { PatternEvolution } from '../../../src/integrations/agentic-flow/reasoning-bank/pattern-evolution.js';
import { PatternStore } from '../../../src/learning/pattern-store.js';
import { ExperienceReplay } from '../../../src/integrations/agentic-flow/reasoning-bank/experience-replay.js';
import type { Trajectory } from '../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import { scoreUnjudgedTrajectories } from '../../../src/mcp/handlers/trajectory-judge.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';
import * as capture from '../../../src/learning/experience-capture-middleware.js';

// No ONNX model load in a unit test: the captured experience's embedding is optional.
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
async function underLock<T>(um: UnifiedMemoryManager, work: () => Promise<T>) {
  lock();
  setTimeout(unlock, HOLD_MS);
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

function insertPattern(db: DatabaseType, id: string, quality: number): void {
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, quality_score, usage_count, successful_uses)
    VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, ?, 1, 1)`).run(id, `pattern ${id}`, quality);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-learning-lock-1274-'));
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

describe('learning writes on a locked database (#1274)', () => {
  it('TrajectoryTracker.endTrajectory (task-completion events) does not block and records the end', async () => {
    const um = await openMemory();
    const tracker = new TrajectoryTracker();
    await tracker.initialize();
    const id = await tracker.startTrajectory('generate tests', { agent: 'qe-test-architect', domain: 'test-generation' });

    const { gap, result } = await underLock(um, () => tracker.endTrajectory(id, true));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    const row = um.getDatabase().prepare('SELECT ended_at, success FROM qe_trajectories WHERE id = ?').get(id) as
      { ended_at: string | null; success: number };
    expect(row.ended_at).not.toBeNull();
    expect(row.success).toBe(1);
  });

  it('experience capture does not block and the captured experience is stored', async () => {
    const um = await openMemory();
    await capture.initializeExperienceCapture(); // first use in this file: binds to `um`
    const id = capture.startExperience('generate tests', 'qe-test-architect', 'test-generation');

    const { gap, result } = await underLock(um, () => capture.completeExperience(id, true, { ok: true }));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(um.getDatabase().prepare('SELECT success FROM captured_experiences WHERE id = ?').get(id)).toEqual({ success: 1 });
    capture.stopCleanupTimer();
  });

  it('PatternEvolution.mergePatterns (hourly consolidation timer) does not block and archives the weaker pattern', async () => {
    const um = await openMemory();
    insertPattern(um.getDatabase(), 'p-strong', 0.9);
    insertPattern(um.getDatabase(), 'p-weak', 0.2);
    const evolution = new PatternEvolution();
    await evolution.initialize();

    const { gap, result } = await underLock(um, () => evolution.mergePatterns('p-strong', 'p-weak'));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect((result as PromiseFulfilledResult<string | null>).value).toBe('p-strong');
    expect(um.getDatabase().prepare("SELECT tier FROM qe_patterns WHERE id = 'p-weak'").get()).toEqual({ tier: 'archived' });
  });

  it('PatternStore.delete (hourly cleanup timer) queues its SQLite write instead of blocking', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    insertPattern(db, 'p-old', 0.1);
    const store = new PatternStore({} as MemoryBackend, { autoCleanup: false });
    await store.initialize();
    // SQLite delegate on the shared connection, as QEReasoningBank wires it.
    const sqliteStore = {
      writeWhenUnlocked: <T>(fn: () => T) => um.writeWhenUnlocked(fn),
      deletePattern: (id: string) => db.prepare('DELETE FROM qe_patterns WHERE id = ?').run(id),
    };
    (store as unknown as { sqliteStore: unknown }).sqliteStore = sqliteStore;
    (store as unknown as { indexPattern(p: unknown): void }).indexPattern({
      id: 'p-old', name: 'old', domain: 'test-generation', qeDomain: 'test-generation', patternType: 'test-template',
      tier: 'short-term', qualityScore: 0.1, confidence: 0.1, usageCount: 0, context: { tags: [] },
    });

    const { gap, result } = await underLock(um, () => store.delete('p-old'));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    expect(db.prepare("SELECT COUNT(*) AS n FROM qe_patterns WHERE id = 'p-old'").get()).toEqual({ n: 0 });
  });

  it('ExperienceReplay.storeExperience (trajectory completion) does not block and stores the experience', async () => {
    const um = await openMemory();
    const replay = new ExperienceReplay();
    await replay.initialize();
    const trajectory = {
      id: 'traj-1', task: 'generate tests', agent: 'qe-test-architect', domain: 'test-generation',
      steps: [], outcome: 'success', startedAt: new Date(), endedAt: new Date(),
      metrics: { totalDurationMs: 10, successfulSteps: 1, failedSteps: 0, averageQuality: 0.9, efficiencyScore: 0.9, tokensUsed: 0 },
    } as unknown as Trajectory;

    const { gap, result } = await underLock(um, () => replay.storeExperience(trajectory, 'unit tests first'));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    const id = (result as PromiseFulfilledResult<{ id: string } | null>).value!.id;
    expect(um.getDatabase().prepare('SELECT agent FROM captured_experiences WHERE id = ?').get(id))
      .toEqual({ agent: 'unit tests first' });
  });

  it('trajectory judge writes its verdict without blocking', async () => {
    const um = await openMemory();
    const tracker = new TrajectoryTracker();
    await tracker.initialize(); // adds the feedback column
    const id = await tracker.startTrajectory('generate tests', { agent: 'qe-test-architect', domain: 'test-generation' });
    await tracker.endTrajectory(id, true);
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ text: '{"quality": 0.8, "reasoning": "ok"}' }] }),
    })));

    try {
      const { gap, result } = await underLock(um, () => scoreUnjudgedTrajectories());

      expect(result.status).toBe('fulfilled');
      expect(gap).toBeLessThan(MAX_GAP_MS);
      const row = um.getDatabase().prepare('SELECT feedback FROM qe_trajectories WHERE id = ?').get(id) as { feedback: string };
      expect(JSON.parse(row.feedback).quality).toBe(0.8);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
