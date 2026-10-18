/**
 * #1060: DreamEngine compute-then-commit, against a real fixture database.
 *
 * Covers cancellation, close() mid-dream, the one-dream-per-engine rule,
 * dream({ commit: false }) + commitDreamResult(), SpeculativeDreamer on a
 * real engine and the abandoned-cycle sweep on initialize.
 *
 * Fixture: a fresh unified-persistence SQLite file under the OS temp dir.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import {
  createDreamEngine,
  DreamAlreadyRunningError,
  SpeculativeDreamer,
  type DreamEngine,
  type DreamConfig,
} from '../../../../src/learning/dream/index.js';
import {
  resetUnifiedPersistence,
  initializeUnifiedPersistence,
  getUnifiedPersistence,
} from '../../../../src/kernel/unified-persistence.js';
import type { WitnessChain } from '../../../../src/audit/witness-chain.js';
import { closeRegisteredStores } from '../../../../src/kernel/process-lifecycle.js';

const DIR = path.join(os.tmpdir(), `aqe-dream-1060-${process.pid}`);
const DB_PATH = path.join(DIR, 'memory.db');

function removeDb(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

let db: DatabaseType;
let engine: DreamEngine;

async function newEngine(config: Partial<DreamConfig> = {}): Promise<DreamEngine> {
  const created = createDreamEngine({ minConceptsRequired: 3, maxDurationMs: 5000, ...config });
  await created.initialize();
  return created;
}

async function seedConcepts(target: DreamEngine): Promise<void> {
  await target.loadPatternsAsConcepts(
    Array.from({ length: 12 }, (_, i) => ({
      id: `p-${i}`,
      name: `pattern ${i}`,
      description: `synthetic pattern ${i} for the #1060 engine tests`,
      domain: i % 2 === 0 ? 'test-generation' : 'coverage-analysis',
      confidence: 0.8,
      successRate: 0.9,
    })),
  );
}

const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const cycles = () => db.prepare('SELECT status, error FROM dream_cycles ORDER BY start_time').all();
const activations = () => db.prepare('SELECT id, activation_level, last_activated FROM concept_nodes ORDER BY id').all();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  resetUnifiedPersistence();
  fs.mkdirSync(DIR, { recursive: true });
  removeDb();
  await initializeUnifiedPersistence({ dbPath: DB_PATH });
  db = getUnifiedPersistence().getDatabase();
  engine = await newEngine();
  await seedConcepts(engine);
});

afterEach(async () => {
  await engine.close();
  resetUnifiedPersistence();
  removeDb();
});

describe('#1060 DreamEngine cancellation', () => {
  it('cancelDream() stops the activation loop at once and writes nothing of the dream', async () => {
    const before = activations();
    const dreaming = engine.dream(5000);
    await sleep(400);

    const cancelledAt = Date.now();
    await engine.cancelDream();
    await expect(dreaming).rejects.toThrow('Dream cycle cancelled');

    expect(Date.now() - cancelledAt).toBeLessThan(500);
    expect(cycles()).toEqual([{ status: 'interrupted', error: 'Dream cycle cancelled' }]);
    expect(count('dream_insights')).toBe(0);
    expect(activations()).toEqual(before);
  });

  it('close() mid-dream stops the dream, records it interrupted and lets go of the database', async () => {
    const before = activations();
    const dreaming = engine.dream(5000);
    const outcome = dreaming.then(() => 'completed', (error: Error) => error.message);
    await sleep(400);

    const closedAt = Date.now();
    await engine.close();

    expect(Date.now() - closedAt).toBeLessThan(1000);
    // Before #1060 this surfaced as "Cannot set properties of null".
    expect(await outcome).toBe('Dream cycle cancelled');
    expect(cycles()).toEqual([{
      status: 'interrupted',
      error: 'Interrupted: engine closed or process shut down during the dream cycle',
    }]);
    expect(count('dream_insights')).toBe(0);
    expect(activations()).toEqual(before);
  });
});

describe('#1060 close or shutdown right after dream() (no await in between)', () => {
  const INTERRUPTED = {
    status: 'interrupted',
    error: 'Interrupted: engine closed or process shut down during the dream cycle',
  };

  it('close() called immediately after dream() stops it at once and records it interrupted', async () => {
    const before = activations();
    const dreaming = engine.dream(3000);
    const outcome = dreaming.then(() => 'completed', (error: Error) => error.message);

    const closedAt = Date.now();
    await engine.close();
    const closeMs = Date.now() - closedAt;
    const settled = await outcome;
    const settleMs = Date.now() - closedAt;

    // The review repro: close() waited its full 2 s and the loop ran 3 s.
    expect(closeMs).toBeLessThan(1000);
    expect(settleMs).toBeLessThan(1000);
    expect(settled).toBe('Dream cycle cancelled');
    expect(cycles()).toEqual([INTERRUPTED]);
    expect(count('dream_insights')).toBe(0);
    expect(activations()).toEqual(before);
  });

  it('a shutdown immediately after dream() records the cycle interrupted before the database closes', async () => {
    const dreaming = engine.dream(3000);
    const outcome = dreaming.then(() => 'completed', (error: Error) => error.message);

    const shutdownAt = Date.now();
    closeRegisteredStores(); // what MCP stdin EOF / SIGTERM runs; closes the shared DB too
    expect(await outcome).not.toBe('completed');
    expect(Date.now() - shutdownAt).toBeLessThan(1000);

    const reopened = new Database(DB_PATH, { readonly: true });
    try {
      expect(reopened.prepare('SELECT status, error FROM dream_cycles').all()).toEqual([INTERRUPTED]);
      expect((reopened.prepare('SELECT COUNT(*) AS n FROM dream_insights').get() as { n: number }).n).toBe(0);
    } finally {
      reopened.close();
    }
  });
});

describe('#1060 one dream per engine', () => {
  it('refuses a second dream while one runs, and the first one completes', async () => {
    const first = engine.dream(800);
    await sleep(100);

    await expect(engine.dream(200)).rejects.toBeInstanceOf(DreamAlreadyRunningError);

    const result = await first;
    expect(result.cycle.status).toBe('completed');
    expect(cycles()).toEqual([{ status: 'completed', error: null }]);
  });

  it('allows a new dream once the previous one has finished', async () => {
    await engine.dream(200);
    await engine.dream(200);
    expect(cycles()).toEqual([
      { status: 'completed', error: null },
      { status: 'completed', error: null },
    ]);
  });
});

describe('#1060 compute, then commit', () => {
  it('commits activations, insights and the cycle row together and reports the commit time', async () => {
    const appended: string[] = [];
    engine.witnessChain = { append: (action: string) => { appended.push(action); } } as unknown as WitnessChain;
    const before = activations();

    const result = await engine.dream(500);

    expect(result.commitDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.pending).toBeUndefined();
    expect(cycles()).toEqual([{ status: 'completed', error: null }]);
    expect(count('dream_insights')).toBe(result.insights.length);
    expect(activations()).not.toEqual(before);
    expect(db.inTransaction).toBe(false);
    expect(appended).toEqual(['DREAM_COMMIT']);
  });

  it('dream({ commit: false }) writes nothing; commitDreamResult() writes it once', async () => {
    const before = activations();

    const result = await engine.dream(500, { commit: false });

    expect(result.pending).toBeDefined();
    expect(count('dream_cycles')).toBe(0);
    expect(count('dream_insights')).toBe(0);
    expect(activations()).toEqual(before);

    const commitMs = engine.commitDreamResult(result);
    expect(commitMs).toBeGreaterThanOrEqual(0);
    expect(cycles()).toEqual([{ status: 'completed', error: null }]);
    expect(count('dream_insights')).toBe(result.insights.length);
    expect(() => engine.commitDreamResult(result)).toThrow('nothing pending');
  });

  it('records a failed dream as failed and writes nothing else of it', async () => {
    const sparse = await newEngine({ minConceptsRequired: 1000 });
    try {
      await expect(sparse.dream(200)).rejects.toThrow('Insufficient concepts');
      expect(cycles()).toEqual([{ status: 'failed', error: expect.stringContaining('Insufficient concepts') }]);
      expect(count('dream_insights')).toBe(0);
    } finally {
      await sparse.close();
    }
  });
});

describe('#1060 SpeculativeDreamer on a real engine', () => {
  it('commits only the winning strategy and holds no transaction between strategies', async () => {
    const dreamer = new SpeculativeDreamer(engine);
    const inTransaction: boolean[] = [];
    const watch = setInterval(() => inTransaction.push(db.inTransaction), 20);

    try {
      const result = await dreamer.dream(
        [
          { name: 'wide', activationConfig: { spreadFactor: 0.7, noiseLevel: 0.15 } },
          { name: 'narrow', activationConfig: { spreadFactor: 0.3, noiseLevel: 0.02 } },
        ],
        { durationMs: 300 },
      );

      expect(result.strategies).toHaveLength(2);
      expect(result.winner).not.toBeNull();
      expect(result.strategies.filter((s) => s.selected)).toHaveLength(1);
      expect(cycles()).toEqual([{ status: 'completed', error: null }]);
      expect(count('dream_insights')).toBe(result.winner!.result!.insights.length);
      expect(inTransaction.length).toBeGreaterThan(0);
      expect(inTransaction.every((open) => !open)).toBe(true);
    } finally {
      clearInterval(watch);
    }
  });
});

describe('#1060 SpeculativeDreamer cancellation', () => {
  it('after cancelDream() runs no further strategy and commits nothing', async () => {
    const before = activations();
    const dreamer = new SpeculativeDreamer(engine);
    const dreamSpy = vi.spyOn(engine, 'dream');
    const running = dreamer.dream(
      [
        { name: 'a', activationConfig: { spreadFactor: 0.5 } },
        { name: 'b', activationConfig: { spreadFactor: 0.6 } },
        { name: 'c', activationConfig: { spreadFactor: 0.7 } },
      ],
      { durationMs: 1000 },
    );
    // Review repro: cancel during strategy b, after a completed.
    await sleep(1300);
    await engine.cancelDream();
    const result = await running;

    expect(result.cancelled).toBe(true);
    expect(result.winner).toBeNull();
    expect(result.strategies.map((s) => s.strategy.name)).toEqual(['a', 'b']);
    expect(dreamSpy).toHaveBeenCalledTimes(2);
    expect(count('dream_cycles')).toBe(0);
    expect(count('dream_insights')).toBe(0);
    expect(activations()).toEqual(before);
  });

  it('a cancel between strategies also stops the run', async () => {
    const dreamer = new SpeculativeDreamer(engine);
    const realDream = engine.dream.bind(engine);
    vi.spyOn(engine, 'dream').mockImplementation(async (...args) => {
      const result = await realDream(...args);
      await engine.cancelDream(); // lands after strategy a finished, before b starts
      return result;
    });

    const result = await dreamer.dream(
      [
        { name: 'a', activationConfig: { spreadFactor: 0.5 } },
        { name: 'b', activationConfig: { spreadFactor: 0.6 } },
      ],
      { durationMs: 200 },
    );

    expect(result.cancelled).toBe(true);
    expect(result.winner).toBeNull();
    expect(result.strategies.map((s) => s.strategy.name)).toEqual(['a']);
    expect(count('dream_cycles')).toBe(0);
  });
});

describe('#1060 abandoned-cycle sweep on initialize', () => {
  it('marks cycles left running by a dead process interrupted, keeps recent ones, deletes nothing', async () => {
    const insert = db.prepare("INSERT INTO dream_cycles (id, start_time, status) VALUES (?, ?, 'running')");
    insert.run('dead', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    insert.run('maybe-alive', new Date(Date.now() - 30_000).toISOString());

    const second = await newEngine();
    try {
      expect(db.prepare('SELECT id, status, error FROM dream_cycles ORDER BY id').all()).toEqual([
        { id: 'dead', status: 'interrupted', error: 'abandoned: process exited' },
        { id: 'maybe-alive', status: 'running', error: null },
      ]);
    } finally {
      await second.close();
    }
  });
});

vi.setConfig({ testTimeout: 20_000 });
