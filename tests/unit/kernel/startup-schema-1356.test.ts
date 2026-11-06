/**
 * #1356 (Option A): the MCP server creates every module's tables once, in
 * UnifiedMemoryManager.initialize(), as one queued write, instead of in each
 * module's constructor during a tool call. Before, on a fresh database a
 * module's first DDL needed the write lock and, with another process holding
 * it, blocked the event loop for the whole busy_timeout.
 *
 * Fixture: a fresh memory.db under the OS temp dir; the MCP server's lock wait
 * cap is set unless a test says otherwise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory, resetUnifiedMemory, type UnifiedMemoryManager } from '../../../src/kernel/unified-memory.js';
import { resetUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';
import { isLockedMessage, retryOnceWhenLocked, setLockWaitCap } from '../../../src/shared/sqlite-lock-wait.js';
import { retryWhileBusy } from '../../../src/learning/dream/dream-lock-retry.js';
import { applyStartupSchema, startupSchemaPending, STARTUP_SCHEMA_RETRY, STARTUP_SCHEMA_STEPS, type StartupSchemaStep } from '../../../src/kernel/startup-schema.js';
import { QE_PATTERNS_FTS_TRIGGERS } from '../../../src/kernel/pattern-fts-self-heal.js';
import { ensureTrajectoryTrackerSchema } from '../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import { ensureExperienceReplaySchema } from '../../../src/integrations/agentic-flow/reasoning-bank/experience-replay.js';
import { ensurePatternEvolutionSchema } from '../../../src/integrations/agentic-flow/reasoning-bank/pattern-evolution.js';
import { ensureMetricsOutcomesSchema } from '../../../src/integrations/agentic-flow/metrics/metrics-tracker.js';
import { ensureLearningSnapshotsSchema } from '../../../src/learning/metrics-tracker.js';
import { ensureSonaSchema } from '../../../src/integrations/ruvector/sona-persistence.js';
import { ensurePatternDeltasSchema } from '../../../src/integrations/ruvector/delta-tracker.js';
import { HypergraphSchemaManager } from '../../../src/integrations/ruvector/hypergraph-schema.js';
import { ensureSpendLedgerSchema, SqliteSpendLedger } from '../../../src/shared/llm/spend-ledger.js';
import { ensureWitnessChainSchema } from '../../../src/audit/witness-chain.js';
import { ensureWitnessReceiptsSchema } from '../../../src/governance/witness-chain.js';
import { ensureCoExecutionSchema } from '../../../src/routing/co-execution-repository.js';
import { PatternNullStore } from '../../../src/learning/pattern-null-store.js';
import { RvfDualWriter } from '../../../src/integrations/ruvector/rvf-dual-writer.js';
import { ensureCapturedExperiencesSchema } from '../../../src/learning/experience-capture-middleware.js';
import {
  deduplicateQePatterns,
  ensurePatternEmbeddingSpaceSchema,
  ensurePatternReuseSchema,
} from '../../../src/learning/sqlite-persistence.js';

const CAP_MS = 50;
const BUSY_TIMEOUT_MS = 2000;
const HOLD_MS = 600;
/** A synchronous DDL would block for BUSY_TIMEOUT_MS; a queued one for at most CAP_MS per attempt. */
const MAX_GAP_MS = 400;

/** Tables only the module schema functions create (not the unified-memory migrations). */
const MODULE_TABLES = [
  'trajectory_steps', 'captured_experiences', 'experience_applications', 'experience_consolidation_log',
  'pattern_versions', 'pattern_evolution_events', 'pattern_relationships', 'metrics_outcomes',
  'learning_daily_snapshots', 'sona_fisher_matrices', 'pattern_deltas', 'llm_spend',
  'witness_chain_archive', 'witness_chain_receipts', 'qe_pattern_reuse', 'qe_agent_co_execution',
];

/** Every module's own schema function: what its constructor/initialize runs. */
const MODULE_DDL: Array<[string, (db: DatabaseType) => unknown]> = [
  ['TrajectoryTracker', ensureTrajectoryTrackerSchema],
  ['experience capture', ensureCapturedExperiencesSchema],
  ['ExperienceReplay', ensureExperienceReplaySchema],
  ['PatternEvolution', ensurePatternEvolutionSchema],
  ['MetricsTracker', ensureMetricsOutcomesSchema],
  ['LearningMetricsTracker', ensureLearningSnapshotsSchema],
  ['PersistentSONAEngine', ensureSonaSchema],
  ['DeltaTracker', ensurePatternDeltasSchema],
  ['HypergraphSchemaManager', (db) => new HypergraphSchemaManager().ensureSchema(db)],
  ['SqliteSpendLedger', (db) => new SqliteSpendLedger(db)],
  ['WitnessChain', ensureWitnessChainSchema],
  ['witness receipts', ensureWitnessReceiptsSchema],
  ['CoExecutionRepository', ensureCoExecutionSchema],
  ['PatternNullStore', (db) => new PatternNullStore(db)],
  ['RvfDualWriter', (db) => new RvfDualWriter(db, { rvfPath: path.join(dir, 'patterns.rvf') })],
  ['SQLitePatternStore', (db) => { deduplicateQePatterns(db); ensurePatternEmbeddingSpaceSchema(db); ensurePatternReuseSchema(db); }],
];

let dir: string;
let dbPath: string;
let holder: DatabaseType | null = null;

function lockFor(ms: number): void {
  const held = new Database(dbPath);
  held.pragma('busy_timeout = 0');
  held.exec('BEGIN IMMEDIATE');
  holder = held;
  setTimeout(() => { if (holder === held) unlock(); }, ms);
}

function unlock(): void {
  if (!holder) return;
  holder.exec('ROLLBACK');
  holder.close();
  holder = null;
}

async function openMemory(busyTimeout = BUSY_TIMEOUT_MS): Promise<UnifiedMemoryManager> {
  const um = getUnifiedMemory({ dbPath, busyTimeout });
  await um.initialize();
  return um;
}

/** Every schema object plus every table's columns: equal snapshots mean no DDL ran. */
function schemaSnapshot(db: DatabaseType): string {
  const objects = db.prepare(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
  ).all() as Array<{ type: string; name: string }>;
  const columns = objects.filter((o) => o.type === 'table').map((t) => [
    t.name, db.prepare(`SELECT name, type, dflt_value FROM pragma_table_info('${t.name}')`).all(),
  ]);
  return JSON.stringify({ objects, columns });
}

function tables(db: DatabaseType): Set<string> {
  return new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
    .map((r) => r.name));
}

function columnsOf(db: DatabaseType, table: string): string[] {
  return (db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as Array<{ name: string }>).map((c) => c.name);
}

/** Track the longest event-loop stall while `work` runs. */
async function measure<T>(work: () => Promise<T> | T) {
  let last = Date.now();
  let gap = 0;
  const tick = setInterval(() => { const now = Date.now(); gap = Math.max(gap, now - last); last = now; }, 10);
  const [result] = await Promise.allSettled([Promise.resolve().then(work)]);
  gap = Math.max(gap, Date.now() - last);
  clearInterval(tick);
  return { gap, result };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-startup-schema-1356-'));
  dbPath = path.join(dir, '.agentic-qe', 'memory.db');
  vi.stubEnv('AQE_PROJECT_ROOT', dir);
  vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
  resetUnifiedPersistence();
  resetUnifiedMemory();
  setLockWaitCap(CAP_MS);
});

const RETRY_DELAYS = [...STARTUP_SCHEMA_RETRY.delaysMs];

afterEach(() => {
  STARTUP_SCHEMA_RETRY.delaysMs = [...RETRY_DELAYS];
  unlock();
  resetUnifiedPersistence();
  resetUnifiedMemory();
  setLockWaitCap(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('startup schema step (#1356)', () => {
  it('initialize() creates every module table under the MCP lock cap', async () => {
    const um = await openMemory();
    const present = tables(um.getDatabase());
    expect(MODULE_TABLES.filter((t) => !present.has(t))).toEqual([]);
    expect(columnsOf(um.getDatabase(), 'qe_trajectories')).toEqual(expect.arrayContaining(['embedding', 'feedback', 'related_patterns']));
    expect(columnsOf(um.getDatabase(), 'captured_experiences')).toEqual(expect.arrayContaining(['embedding_space_id', 'reuse_failure_count']));
    expect(columnsOf(um.getDatabase(), 'llm_spend')).toContain('agent_type');
    expect(columnsOf(um.getDatabase(), 'qe_pattern_embeddings')).toContain('space_id');
  });

  it('every step applies when there is work, and a second run finds nothing to do', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    const before = schemaSnapshot(db);
    db.exec('DROP TABLE pattern_deltas'); // one step has work again

    const report = await applyStartupSchema(db, (fn) => um.writeWhenUnlocked(fn));
    const again = await applyStartupSchema(db, (fn) => um.writeWhenUnlocked(fn));

    expect(report.failed).toEqual([]);
    expect(report.applied).toEqual(STARTUP_SCHEMA_STEPS.map((s) => s.name));
    expect(schemaSnapshot(db)).toBe(before);
    expect(again).toEqual({ applied: [], failed: [], upToDate: true });
  });

  it("after it, each module's own schema function is a no-op", async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    const before = schemaSnapshot(db);

    for (const [, ddl] of MODULE_DDL) ddl(db);

    expect(schemaSnapshot(db)).toBe(before);
  });

  it('CLI/SDK (no lock cap): initialize() leaves module tables to the modules', async () => {
    setLockWaitCap(null);
    const um = await openMemory();
    const present = tables(um.getDatabase());
    expect(present.has('trajectory_steps')).toBe(false);
    expect(present.has('qe_patterns')).toBe(true); // the unified migrations still run
  });

  it('a failing step is reported and skipped; the others still apply', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    const steps = [
      { name: 'broken', load: async () => () => { throw new Error('boom'); } },
      { name: 'not-loadable', load: async () => { throw new Error('no module'); } },
      { name: 'ok', load: async () => (d: DatabaseType) => d.exec('CREATE TABLE IF NOT EXISTS startup_probe (id INTEGER)') },
    ];

    const report = await applyStartupSchema(db, (fn) => um.writeWhenUnlocked(fn), steps);

    expect(report.applied).toEqual(['ok']);
    expect(report.failed.map((f) => f.step).sort()).toEqual(['broken', 'not-loadable']);
    expect(tables(db).has('startup_probe')).toBe(true);
  });

  it("a step that fails after its own DDL loses only that DDL (savepoint), and no transaction is left open", async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    const ddl = (table: string): StartupSchemaStep['load'] => async () => (d) => d.exec(`CREATE TABLE IF NOT EXISTS ${table} (id INTEGER)`);
    const steps: StartupSchemaStep[] = [
      { name: 'first', load: ddl('sp_first') },
      { name: 'half-done', load: async () => (d) => { d.exec('CREATE TABLE sp_half (id INTEGER)'); throw new Error('after DDL'); } },
      { name: 'last', load: ddl('sp_last') },
    ];

    const report = await applyStartupSchema(db, (fn) => um.writeWhenUnlocked(fn), steps);

    expect(report.applied).toEqual(['first', 'last']);
    expect(report.failed.map((f) => f.step)).toEqual(['half-done']);
    expect(tables(db).has('sp_half')).toBe(false);
    expect(tables(db).has('sp_first')).toBe(true);
    expect(tables(db).has('sp_last')).toBe(true);
    expect(db.inTransaction).toBe(false);
  });

  it('a capped initialize() restores a dropped qe_patterns_fts trigger', async () => {
    const um = await openMemory();
    const trigger = QE_PATTERNS_FTS_TRIGGERS[0];
    um.getDatabase().exec(`DROP TRIGGER ${trigger}`);
    resetUnifiedMemory();

    const db = (await openMemory()).getDatabase();

    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(trigger)).toBeDefined();
  });

  it('a capped initialize() rebuilds a drifted qe_patterns_fts index (rows, not schema)', async () => {
    const um = await openMemory();
    const db0 = um.getDatabase();
    db0.prepare("INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name) VALUES ('p1', 't', 'test-generation', 'test-generation', 'drift probe')").run();
    db0.exec("INSERT INTO qe_patterns_fts(qe_patterns_fts) VALUES('delete-all')"); // the index lost its rows
    const indexed = (d: DatabaseType) => (d.prepare('SELECT count(*) AS n FROM qe_patterns_fts_docsize').get() as { n: number }).n;
    expect(indexed(db0)).toBe(0);
    resetUnifiedMemory();

    const db = (await openMemory()).getDatabase();

    expect(indexed(db)).toBe(1);
  });
});

describe('up-to-date database (#1356)', () => {
  it('a warm database needs no write: under a held lock the startup step takes no lock and does not wait', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    lockFor(3000);
    const queuedWrite = vi.fn((fn: () => unknown) => um.writeWhenUnlocked(fn));

    const started = Date.now();
    const report = await applyStartupSchema(db, queuedWrite as never);

    expect(queuedWrite).not.toHaveBeenCalled();
    expect(report.upToDate).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('a warm database under a held lock: initialize() answers at once', async () => {
    await openMemory();
    resetUnifiedMemory();
    lockFor(3000);

    const started = Date.now();
    const { gap, result } = await measure(() => openMemory());

    expect(result.status).toBe('fulfilled');
    expect(Date.now() - started).toBeLessThan(800);
    expect(gap).toBeLessThan(MAX_GAP_MS);
  });

  it('a database missing one table or one column does take the write', async () => {
    for (const damage of ['DROP TABLE trajectory_steps', 'ALTER TABLE qe_trajectories DROP COLUMN related_patterns']) {
      const um = await openMemory();
      const db = um.getDatabase();
      db.exec(damage);
      const queuedWrite = vi.fn((fn: () => unknown) => um.writeWhenUnlocked(fn));

      const report = await applyStartupSchema(db, queuedWrite as never);

      expect(queuedWrite).toHaveBeenCalledTimes(1);
      expect(report.upToDate).toBeUndefined();
      expect(tables(db).has('trajectory_steps')).toBe(true);
      expect(columnsOf(db, 'qe_trajectories')).toContain('related_patterns');
      resetUnifiedMemory();
    }
  });

  it('many duplicate patterns: dedup keeps every row, the step stays pending (as main retries on every open)', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    db.exec('DROP INDEX idx_patterns_unique_name_domain_type');
    const insert = db.prepare("INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name) VALUES (?, 't', 'd', 'd', 'same')");
    for (const id of ['a', 'b', 'c']) insert.run(id); // 2 of 3 rows would go: over the 10% safety limit

    const report = await applyStartupSchema(db, (fn) => um.writeWhenUnlocked(fn));

    expect((db.prepare('SELECT count(*) AS n FROM qe_patterns').get() as { n: number }).n).toBe(3);
    expect(report.failed.map((f) => f.step)).toContain('sqlite-pattern-store');
    expect(startupSchemaPending(db, [deduplicateQePatterns])).toBe(true);
  });

  it('the write takes the lock at BEGIN (IMMEDIATE): no step runs on the real database while it is locked', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    let realCalls = 0;
    const steps: StartupSchemaStep[] = [{
      name: 'probe',
      load: async () => (d) => {
        if (d === db) realCalls++;
        d.exec('CREATE TABLE IF NOT EXISTS immediate_probe (id INTEGER)');
      },
    }];
    lockFor(HOLD_MS);

    const report = await applyStartupSchema(db, (fn) => um.writeWhenUnlocked(fn), steps);

    expect(report.applied).toEqual(['probe']);
    expect(realCalls).toBe(1); // only the attempt that got the lock
    expect(tables(db).has('immediate_probe')).toBe(true);
  });
});

describe('first use under a held lock (#1356)', () => {
  it("module DDL does not wait for the lock once the startup step ran", async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    lockFor(HOLD_MS);

    const { gap, result } = await measure(() => { for (const [, ddl] of MODULE_DDL) ddl(db); });

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
  });

  it('control: without the startup step the same DDL blocks on the lock', async () => {
    setLockWaitCap(null);
    const um = await openMemory();
    const db = um.getDatabase();
    lockFor(HOLD_MS);

    const { gap, result } = await measure(() => ensureTrajectoryTrackerSchema(db));

    // The release timer cannot fire while the DDL blocks, so it waits the whole busy_timeout and fails.
    expect(result.status).toBe('rejected');
    expect(gap).toBeGreaterThanOrEqual(BUSY_TIMEOUT_MS - 100);
  });

  it('a fresh database locked by another process: initialize() does not block and creates everything once released', async () => {
    freshDatabaseLockedFor(HOLD_MS);

    const { gap, result } = await measure(() => openMemory());

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    const present = tables(getUnifiedMemory().getDatabase());
    expect(MODULE_TABLES.filter((t) => !present.has(t))).toEqual([]);
  });
});

describe('locked for the whole retry budget (#1356)', () => {
  it('initialize() still succeeds without blocking, and the modules create their tables later', async () => {
    STARTUP_SCHEMA_RETRY.delaysMs = []; // no background retry: the modules' own DDL is the fallback
    setLockWaitCap(null);
    await openMemory(); // an existing, migrated database without module tables
    resetUnifiedMemory();
    setLockWaitCap(CAP_MS);
    lockFor(BUSY_TIMEOUT_MS + 1000); // longer than the startup write's retry budget

    const { gap, result } = await measure(() => openMemory());

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
    const db = getUnifiedMemory().getDatabase();
    expect(tables(db).has('trajectory_steps')).toBe(false); // the step was deferred
    unlock();
    ensureTrajectoryTrackerSchema(db); // the module's own fallback
    expect(tables(db).has('trajectory_steps')).toBe(true);
  }, 15_000);

  it('a deferred startup write is retried in the background once the lock is free', async () => {
    STARTUP_SCHEMA_RETRY.delaysMs = [300];
    setLockWaitCap(null);
    await openMemory();
    resetUnifiedMemory();
    setLockWaitCap(CAP_MS);
    lockFor(BUSY_TIMEOUT_MS + 1000);

    await openMemory();
    const db = getUnifiedMemory().getDatabase();
    expect(tables(db).has('trajectory_steps')).toBe(false);
    unlock();

    const deadline = Date.now() + 5000;
    while (!tables(db).has('trajectory_steps') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    expect(tables(db).has('trajectory_steps')).toBe(true);
  }, 15_000);
});

/** Another process created the (WAL) database and holds its write lock for `ms`. */
function freshDatabaseLockedFor(ms: number): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const creator = new Database(dbPath);
  creator.pragma('journal_mode = WAL');
  creator.exec('CREATE TABLE other_process (id INTEGER)');
  creator.close();
  lockFor(ms);
}

describe('migration patience (#1356)', () => {
  const busy = () => Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
  const clocked = (useWholeBudget: boolean) => {
    let clock = 0;
    const attempts: number[] = [];
    const done = retryWhileBusy(new Database(':memory:'), () => { attempts.push(clock); throw busy(); }, {
      budgetMs: 2900, useWholeBudget, now: () => clock, sleep: async (ms) => { clock += ms; },
    }).catch((error: Error) => error.message);
    return done.then((message) => ({ message, attempts }));
  };

  it('useWholeBudget makes a last attempt at the deadline instead of giving up a backoff early', async () => {
    const early = await clocked(false);
    const whole = await clocked(true);

    expect(early.message).toBe('database is locked');
    expect(early.attempts.at(-1)).toBe(2575); // 25+50+...+800+1000 ms of backoff; one more 1 s would cross 2900
    expect(whole.message).toBe('database is locked');
    expect(whole.attempts.at(-1)).toBe(2900);
  });

  it('initialize() waits out a lock held for most of the busy_timeout, as the synchronous migration did', async () => {
    // With a 2900 ms budget the default retry gives up at about 1.9 s; the
    // lock is released at 2.4 s, so only the whole-budget retry succeeds.
    freshDatabaseLockedFor(2400);

    const { gap, result } = await measure(() => openMemory(2900));

    expect(result.status).toBe('fulfilled');
    expect(gap).toBeLessThan(MAX_GAP_MS);
  }, 15_000);
});

describe('lock held past the busy_timeout at startup (#1356)', () => {
  it('retryOnceWhenLocked retries only a locked failure, and only once', async () => {
    const results = [{ ok: false, error: 'database is locked' }, { ok: true, error: '' }];
    let calls = 0;
    const locked = (r: { ok: boolean; error: string }) => !r.ok && isLockedMessage(r.error);

    expect(await retryOnceWhenLocked(async () => results[calls++], locked)).toEqual({ ok: true, error: '' });
    expect(calls).toBe(2);

    calls = 0;
    const other = await retryOnceWhenLocked(async () => { calls++; return { ok: false, error: 'boom' }; }, locked);
    expect(other.error).toBe('boom');
    expect(calls).toBe(1);

    calls = 0;
    await retryOnceWhenLocked(async () => { calls++; return { ok: false, error: 'SQLITE_BUSY' }; }, locked);
    expect(calls).toBe(2);
  });

  it('the first initialize() fails without stalling; the retry waits the rest of the lock out', async () => {
    freshDatabaseLockedFor(BUSY_TIMEOUT_MS + 1000);

    const first = await measure(() => openMemory());
    const second = await measure(() => openMemory());

    expect(first.result.status).toBe('rejected');
    expect(String((first.result as PromiseRejectedResult).reason)).toMatch(/database is locked/);
    expect(first.gap).toBeLessThan(MAX_GAP_MS);
    expect(second.result.status).toBe('fulfilled');
    expect(second.gap).toBeLessThan(MAX_GAP_MS);
  }, 15_000);
});

describe('upgrade (#1356)', () => {
  it('a database missing module tables and a column gets them back at the next start', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    db.exec('DROP TABLE trajectory_steps');
    db.exec('DROP INDEX idx_llm_spend_agent');
    db.exec('ALTER TABLE llm_spend DROP COLUMN agent_type');
    db.exec('DROP TABLE qe_pattern_nulls'); // past the v10 migration that creates it
    resetUnifiedMemory();

    const reopened = await openMemory();

    expect(tables(reopened.getDatabase()).has('trajectory_steps')).toBe(true);
    expect(tables(reopened.getDatabase()).has('qe_pattern_nulls')).toBe(true);
    expect(columnsOf(reopened.getDatabase(), 'llm_spend')).toContain('agent_type');
  });
});
