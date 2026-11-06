/**
 * Startup schema step for the MCP server (#1356).
 *
 * Many modules create their tables lazily, in a constructor or initialize(),
 * with synchronous better-sqlite3 DDL on the shared memory.db connection. On a
 * fresh database (or after an upgrade that adds a table or column) that DDL
 * needs the write lock; with another process holding it, the call blocked the
 * MCP server's event loop for the whole busy_timeout, inside the first tool
 * call that reached the module.
 *
 * UnifiedMemoryManager.initialize() runs every such module's schema function
 * here once, before the server accepts tool calls, as ONE queued write: a
 * single IMMEDIATE transaction through the connection's write queue, so a
 * locked database is waited for asynchronously (short capped attempts) and
 * the event loop stays free. Each module keeps calling the same exported
 * function, which is then a no-op: `CREATE ... IF NOT EXISTS` on an existing
 * table and a column check take no write lock.
 *
 * Before taking the write lock it checks, read-only, whether any step has
 * work to do (startupSchemaPending): on an up-to-date database, which is the
 * common case, no write is attempted at all, so a lock held by another
 * process is not waited for.
 *
 * Every step is idempotent. A step that fails is reported and skipped; its
 * module creates the schema itself later, as before. If the write is deferred
 * because the database stayed locked, UnifiedMemoryManager retries it in the
 * background a few times (STARTUP_SCHEMA_RETRY); until one succeeds, a module
 * reached first runs its own (blocking) DDL, as before this step existed.
 * Modules are imported lazily so the kernel does not depend on them at load
 * time.
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { toErrorMessage } from '../shared/error-utils.js';
import { ensurePatternFtsInSync, patternFtsNeedsRepair } from './pattern-fts-self-heal.js';

/** One module's schema function, loaded on demand. */
export interface StartupSchemaStep {
  /** Module the DDL belongs to, for reports and logs. */
  readonly name: string;
  readonly load: () => Promise<(db: DatabaseType) => unknown>;
}

/** What the startup step did. */
export interface StartupSchemaReport {
  applied: string[];
  failed: Array<{ step: string; error: string }>;
  /** True when the read-only check found nothing to do and no write was attempted. */
  upToDate?: boolean;
}

/**
 * Background retries after a deferred startup write: one per delay, until one
 * succeeds or the manager is closed. Mutable for tests.
 */
export const STARTUP_SCHEMA_RETRY = { delaysMs: [15_000, 60_000] as number[] };

/** Runs `fn` as a queued write on the connection (UnifiedMemoryManager.writeWhenUnlocked). */
export type QueuedWrite = <T>(fn: () => T) => Promise<T>;

/**
 * The modules whose DDL runs at startup, in dependency order: experience
 * capture before ExperienceReplay (it renames a v2 captured_experiences table
 * aside before anything adds columns to it). Tables the unified-memory
 * migrations already create (qe_patterns, sona_patterns, hypergraph_*,
 * qe_pattern_nulls, witness_chain, ...) still get their module's column
 * checks and extra indexes here.
 */
export const STARTUP_SCHEMA_STEPS: readonly StartupSchemaStep[] = [
  {
    name: 'pattern-fts-self-heal',
    load: async () => (db) => {
      // The self-heal never throws; surface its failure in the report.
      const result = ensurePatternFtsInSync(db, { logPrefix: '[UnifiedMemory]' });
      if (result.status === 'failed') throw new Error(result.error ?? 'FTS self-heal failed');
    },
  },
  {
    name: 'sqlite-pattern-store',
    load: async () => {
      const m = await import('../learning/sqlite-persistence.js');
      return (db) => {
        // Dedup logs and swallows its own errors; report them instead of "applied".
        if (!m.deduplicateQePatterns(db)) throw new Error('qe_patterns deduplication failed (see debug log)');
        m.ensurePatternEmbeddingSpaceSchema(db);
        m.ensurePatternReuseSchema(db);
      };
    },
  },
  {
    name: 'trajectory-tracker',
    load: async () => (await import('../integrations/agentic-flow/reasoning-bank/trajectory-tracker.js')).ensureTrajectoryTrackerSchema,
  },
  {
    name: 'experience-capture',
    load: async () => (await import('../learning/experience-capture-middleware.js')).ensureCapturedExperiencesSchema,
  },
  {
    name: 'experience-replay',
    load: async () => (await import('../integrations/agentic-flow/reasoning-bank/experience-replay.js')).ensureExperienceReplaySchema,
  },
  {
    name: 'pattern-evolution',
    load: async () => (await import('../integrations/agentic-flow/reasoning-bank/pattern-evolution.js')).ensurePatternEvolutionSchema,
  },
  {
    name: 'metrics-tracker',
    load: async () => (await import('../integrations/agentic-flow/metrics/metrics-tracker.js')).ensureMetricsOutcomesSchema,
  },
  {
    name: 'learning-metrics-tracker',
    load: async () => (await import('../learning/metrics-tracker.js')).ensureLearningSnapshotsSchema,
  },
  {
    name: 'sona-persistence',
    load: async () => (await import('../integrations/ruvector/sona-persistence.js')).ensureSonaSchema,
  },
  {
    name: 'delta-tracker',
    load: async () => (await import('../integrations/ruvector/delta-tracker.js')).ensurePatternDeltasSchema,
  },
  {
    name: 'hypergraph-schema',
    load: async () => {
      const { HypergraphSchemaManager } = await import('../integrations/ruvector/hypergraph-schema.js');
      const manager = new HypergraphSchemaManager();
      return (db) => manager.ensureSchema(db);
    },
  },
  {
    name: 'spend-ledger',
    load: async () => {
      const { ensureSpendLedgerSchema } = await import('../shared/llm/spend-ledger.js');
      return (db) => {
        // The agent_type migration is best-effort and swallows its error.
        if (!ensureSpendLedgerSchema(db)) throw new Error('llm_spend agent_type column migration failed');
      };
    },
  },
  {
    // PatternNullStore's constructor DDL. The v10 migration normally creates
    // the table; this covers a database whose version is past it without it.
    name: 'pattern-nulls',
    load: async () => (await import('../migrations/20260611_add_pattern_nulls_table.js')).applyMigration,
  },
  {
    name: 'co-execution',
    load: async () => (await import('../routing/co-execution-repository.js')).ensureCoExecutionSchema,
  },
  {
    name: 'witness-chain',
    load: async () => (await import('../audit/witness-chain.js')).ensureWitnessChainSchema,
  },
  {
    name: 'witness-chain-receipts',
    load: async () => (await import('../governance/witness-chain.js')).ensureWitnessReceiptsSchema,
  },
];

/**
 * The only statements copySchema runs: one CREATE of a table, index, view,
 * trigger or virtual table. Schema text comes from the database file, which
 * anyone who can write it can craft (writable_schema), so nothing else is
 * ever executed from it.
 */
const SCHEMA_OBJECT_SQL = /^\s*CREATE\s+(TABLE|(UNIQUE\s+)?INDEX|VIEW|TRIGGER|VIRTUAL\s+TABLE)\b/i;

/** Every schema object, in a stable order: equal signatures mean equal schemas. */
function schemaSignature(db: DatabaseType): string {
  return JSON.stringify(db.prepare(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
  ).all());
}

/**
 * Recreate `source`'s schema (no rows) in the in-memory `target`. Reads
 * `source` only. Throws, which the caller treats as "pending", on any object
 * whose SQL is not a single allowed CREATE statement: prepare() refuses more
 * than one statement, so a crafted entry such as
 * `CREATE TABLE x(a); ATTACH '/other.db' AS v; DELETE FROM v.t` never runs.
 */
function copySchema(source: DatabaseType, target: DatabaseType): void {
  // Shadow tables (FTS3/4/5, rtree, ...) are created by their virtual table.
  const shadow = new Set((source.prepare('PRAGMA main.table_list').all() as Array<{ name: string; type: string }>)
    .filter((t) => t.type === 'shadow')
    .map((t) => t.name));
  const objects = source.prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
  ).all() as Array<{ type: string; name: string; sql: string }>;
  for (const type of ['table', 'index', 'view', 'trigger']) {
    for (const o of objects) {
      if (o.type !== type || shadow.has(o.name)) continue;
      if (!SCHEMA_OBJECT_SQL.test(o.sql)) throw new Error(`unexpected schema SQL for ${o.name}`);
      target.prepare(o.sql).run();
    }
  }
}

/**
 * Read-only check (#1356): would any step change the schema of `db`? Each
 * step runs against an in-memory copy of `db`'s schema; a changed copy means
 * the real database needs the write. The FTS index drift the self-heal also
 * repairs depends on rows, which the copy lacks, so it is checked directly.
 * Any doubt (a step or the copy throws) counts as pending, so the step runs
 * and reports it, as it would without this check.
 */
export function startupSchemaPending(
  db: DatabaseType,
  fns: ReadonlyArray<(db: DatabaseType) => unknown>,
): boolean {
  if (patternFtsNeedsRepair(db)) return true;
  let scratch: DatabaseType | null = null;
  try {
    scratch = new Database(':memory:');
    // Functions in schema SQL (defaults, views, triggers) stay restricted.
    scratch.pragma('trusted_schema = OFF');
    copySchema(db, scratch);
    const before = schemaSignature(scratch);
    for (const fn of fns) fn(scratch);
    return schemaSignature(scratch) !== before;
  } catch {
    return true;
  } finally {
    scratch?.close();
  }
}

/**
 * Run every step's DDL on `db` as one queued write (see the file comment),
 * or nothing at all when the read-only check finds no step with work to do.
 * Never throws for a failing step; it throws only when the write itself fails,
 * i.e. the database stayed locked for the whole retry budget, in which case
 * nothing was applied and the modules fall back to their own DDL.
 */
export async function applyStartupSchema(
  db: DatabaseType,
  queuedWrite: QueuedWrite,
  steps: readonly StartupSchemaStep[] = STARTUP_SCHEMA_STEPS,
): Promise<StartupSchemaReport> {
  // Load outside the lock: imports are slow and need no database.
  const loaded = await Promise.all(steps.map(async (step) => {
    try {
      return { name: step.name, fn: await step.load(), error: null as string | null };
    } catch (error) {
      return { name: step.name, fn: null, error: toErrorMessage(error) };
    }
  }));
  const notLoaded = loaded
    .filter((l) => !l.fn)
    .map((l) => ({ step: l.name, error: l.error ?? 'not loaded' }));
  const runnable = loaded.filter((l): l is typeof l & { fn: (db: DatabaseType) => unknown } => l.fn !== null);

  if (!startupSchemaPending(db, runnable.map((l) => l.fn))) {
    return { applied: [], failed: notLoaded, upToDate: true };
  }

  return queuedWrite(() => {
    // Built afresh per attempt: the queue may run this again after a busy BEGIN.
    const report: StartupSchemaReport = { applied: [], failed: [...notLoaded] };
    const all = db.transaction(() => {
      for (const { name, fn } of runnable) {
        try {
          // A savepoint per step: one failing module rolls back only its own DDL.
          // The write lock is held since BEGIN IMMEDIATE, so a step cannot
          // meet SQLITE_BUSY here; any error is that step's own failure.
          db.transaction(() => { fn(db); })();
          report.applied.push(name);
        } catch (stepError) {
          report.failed.push({ step: name, error: toErrorMessage(stepError) });
        }
      }
    });
    // IMMEDIATE takes the write lock at BEGIN: a locked database fails here,
    // before any step, and the queue retries asynchronously.
    all.immediate();
    return report;
  });
}
