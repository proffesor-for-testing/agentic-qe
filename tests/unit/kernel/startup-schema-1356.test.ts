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
import { setLockWaitCap } from '../../../src/shared/sqlite-lock-wait.js';
import { retryWhileBusy } from '../../../src/learning/dream/dream-lock-retry.js';
import { applyStartupSchema, STARTUP_SCHEMA_STEPS } from '../../../src/kernel/startup-schema.js';
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

afterEach(() => {
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

  it('every step applies, and a second run changes nothing', async () => {
    const um = await openMemory();
    const db = um.getDatabase();
    const before = schemaSnapshot(db);

    const report = await applyStartupSchema(db, (fn) => um.writeWhenUnlocked(fn));

    expect(report.failed).toEqual([]);
    expect(report.applied).toEqual(STARTUP_SCHEMA_STEPS.map((s) => s.name));
    expect(schemaSnapshot(db)).toBe(before);
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
    expect(report.failed.map((f) => f.step)).toEqual(['broken', 'not-loadable']);
    expect(tables(db).has('startup_probe')).toBe(true);
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
