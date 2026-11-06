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
 * Every step is idempotent. A step that fails is reported and skipped; its
 * module creates the schema itself later, as before. Modules are imported
 * lazily so the kernel does not depend on them at load time.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { isBusyError } from '../learning/dream/dream-lock-retry.js';
import { toErrorMessage } from '../shared/error-utils.js';
import { ensurePatternFtsInSync } from './pattern-fts-self-heal.js';

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
}

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
    load: async () => (db) => ensurePatternFtsInSync(db, { logPrefix: '[UnifiedMemory]' }),
  },
  {
    name: 'sqlite-pattern-store',
    load: async () => {
      const m = await import('../learning/sqlite-persistence.js');
      return (db) => {
        m.deduplicateQePatterns(db);
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
    load: async () => (await import('../shared/llm/spend-ledger.js')).ensureSpendLedgerSchema,
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
 * Run every step's DDL on `db` as one queued write (see the file comment).
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

  return queuedWrite(() => {
    // Built afresh per attempt: the queue may run this again after a busy BEGIN.
    const report: StartupSchemaReport = { applied: [], failed: [] };
    const all = db.transaction(() => {
      for (const { name, fn, error } of loaded) {
        if (!fn) {
          report.failed.push({ step: name, error: error ?? 'not loaded' });
          continue;
        }
        try {
          // A savepoint per step: one failing module rolls back only its own DDL.
          db.transaction(() => { fn(db); })();
          report.applied.push(name);
        } catch (stepError) {
          if (isBusyError(stepError)) throw stepError; // retry the whole write
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
