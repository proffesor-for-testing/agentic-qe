/**
 * Agentic QE v3 — LLM Spend Ledger (ADR-123)
 *
 * Issue #557: AQE declared budget caps (`maxCostPerHour/Day`,
 * `COST_LIMIT_EXCEEDED`, `CostTracker.wouldExceedLimit`) but enforced none of
 * them, and `CostTracker` is per-process in-memory — so a fleet of N agent
 * processes each sees $0 cumulative spend and no cap can hold across them.
 *
 * This module persists every LLM charge to the unified `.agentic-qe/memory.db`
 * (ADR: one DB, one schema — the `llm_spend` table is additive, never a new
 * file) so a budget check reads the *shared* rolling-window spend across every
 * process. When the unified DB is unavailable (e.g. a standalone eval script
 * with no kernel), it degrades to an in-memory ledger that still enforces
 * within the current process — never worse than today's behavior.
 *
 * better-sqlite3 is fully synchronous, so record/query are sync; multiple
 * connections (one per process) to a WAL-mode DB is exactly the supported
 * cross-process pattern.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import type { CostSource } from './interfaces';

/** A single persisted charge. */
export interface SpendEntry {
  provider: string;
  model: string;
  costUsd: number;
  costSource: CostSource;
  promptTokens: number;
  completionTokens: number;
  requestId: string;
  /**
   * ADR-124 M2.3: the QE agent type/name this charge is attributed to (e.g.
   * 'qe-security-scanner'). Optional — null when the call site has no agent
   * context. Enables per-agent cost attribution across the fleet.
   */
  agent?: string;
}

/** Cross-process spend ledger. */
export interface SpendLedger {
  /** Persist a charge. Never throws for the caller — failures degrade silently. */
  record(entry: SpendEntry): void;
  /** Total USD charged within the last `windowMs` (rolling window ending now). */
  spentSince(windowMs: number, nowMs?: number): number;
  /**
   * ADR-124 M2.3: USD charged within the last `windowMs`, broken down by agent
   * type. Charges with no agent are grouped under '(unattributed)'.
   */
  spentByAgentSince(windowMs: number, nowMs?: number): Record<string, number>;
}

/** Bucket used for charges recorded without an agent context. */
export const UNATTRIBUTED_AGENT = '(unattributed)';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS llm_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  cost_usd REAL NOT NULL,
  cost_source TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  request_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_llm_spend_ts ON llm_spend(ts);
`;

/**
 * SQLite-backed ledger. Cross-process because every process opens its own
 * connection to the same WAL-mode `memory.db`.
 */
export class SqliteSpendLedger implements SpendLedger {
  private readonly db: DatabaseType;
  /**
   * Whether the `agent_type` column exists. If the additive migration couldn't
   * run (e.g. transient lock), this stays false and record() INSERTs WITHOUT the
   * column — so spend is still recorded and the ADR-123 budget cap still holds.
   * A qe-court review (ADR-124) caught the original bug: a swallowed migration
   * made every INSERT reference a missing column, throw, get caught, and silently
   * drop ALL spend — bypassing the budget cap (the #557 class).
   */
  private hasAgentColumn = false;

  constructor(db: DatabaseType) {
    this.db = db;
    // Additive schema only — CREATE TABLE/INDEX IF NOT EXISTS never drops data.
    this.db.exec(CREATE_TABLE_SQL);
    // ADR-124 M2.3: additive `agent_type` column for per-agent attribution.
    // ALTER TABLE ADD COLUMN is non-destructive (existing rows get NULL); guarded
    // so re-opening an already-migrated DB is a no-op. Never drops or rewrites.
    try {
      const cols = this.db.prepare(`PRAGMA table_info(llm_spend)`).all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === 'agent_type')) {
        this.db.exec(`ALTER TABLE llm_spend ADD COLUMN agent_type TEXT`);
      }
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_llm_spend_agent ON llm_spend(agent_type)`);
      this.hasAgentColumn = true;
    } catch {
      // Attribution is best-effort; never block ledger use on the migration.
      // hasAgentColumn stays false → record() degrades to un-attributed INSERTs.
    }
  }

  record(entry: SpendEntry): void {
    try {
      if (this.hasAgentColumn) {
        this.db
          .prepare(
            `INSERT INTO llm_spend
               (ts, provider, model, cost_usd, cost_source, prompt_tokens, completion_tokens, request_id, agent_type)
             VALUES (@ts, @provider, @model, @cost_usd, @cost_source, @prompt_tokens, @completion_tokens, @request_id, @agent_type)`
          )
          .run({
            ts: Date.now(),
            provider: entry.provider,
            model: entry.model,
            cost_usd: entry.costUsd,
            cost_source: entry.costSource,
            prompt_tokens: entry.promptTokens,
            completion_tokens: entry.completionTokens,
            request_id: entry.requestId,
            agent_type: entry.agent ?? null,
          });
      } else {
        // Column absent (migration couldn't run) — still record spend so the
        // budget cap holds; just without per-agent attribution.
        this.db
          .prepare(
            `INSERT INTO llm_spend
               (ts, provider, model, cost_usd, cost_source, prompt_tokens, completion_tokens, request_id)
             VALUES (@ts, @provider, @model, @cost_usd, @cost_source, @prompt_tokens, @completion_tokens, @request_id)`
          )
          .run({
            ts: Date.now(),
            provider: entry.provider,
            model: entry.model,
            cost_usd: entry.costUsd,
            cost_source: entry.costSource,
            prompt_tokens: entry.promptTokens,
            completion_tokens: entry.completionTokens,
            request_id: entry.requestId,
          });
      }
    } catch {
      // A ledger write must never break a generation call.
    }
  }

  spentSince(windowMs: number, nowMs: number = Date.now()): number {
    try {
      const row = this.db
        .prepare(
          `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM llm_spend WHERE ts >= ?`
        )
        .get(nowMs - windowMs) as { total: number } | undefined;
      return row?.total ?? 0;
    } catch {
      return 0;
    }
  }

  spentByAgentSince(windowMs: number, nowMs: number = Date.now()): Record<string, number> {
    try {
      const rows = this.db
        .prepare(
          `SELECT COALESCE(agent_type, ?) AS agent, COALESCE(SUM(cost_usd), 0) AS total
             FROM llm_spend WHERE ts >= ? GROUP BY COALESCE(agent_type, ?)`
        )
        .all(UNATTRIBUTED_AGENT, nowMs - windowMs, UNATTRIBUTED_AGENT) as Array<{ agent: string; total: number }>;
      const out: Record<string, number> = {};
      for (const r of rows) out[r.agent] = r.total;
      return out;
    } catch {
      return {};
    }
  }
}

/**
 * In-process fallback ledger. Used when no unified DB is available. Enforces
 * within the current process only — no worse than the pre-ADR-123 behavior.
 */
export class InMemorySpendLedger implements SpendLedger {
  private readonly entries: Array<{ ts: number; costUsd: number; agent: string }> = [];

  record(entry: SpendEntry): void {
    this.entries.push({ ts: Date.now(), costUsd: entry.costUsd, agent: entry.agent ?? UNATTRIBUTED_AGENT });
  }

  spentSince(windowMs: number, nowMs: number = Date.now()): number {
    const cutoff = nowMs - windowMs;
    let total = 0;
    for (const e of this.entries) {
      if (e.ts >= cutoff) total += e.costUsd;
    }
    return total;
  }

  spentByAgentSince(windowMs: number, nowMs: number = Date.now()): Record<string, number> {
    const cutoff = nowMs - windowMs;
    const out: Record<string, number> = {};
    for (const e of this.entries) {
      if (e.ts >= cutoff) out[e.agent] = (out[e.agent] ?? 0) + e.costUsd;
    }
    return out;
  }
}

/**
 * Build the default ledger. Prefers the unified `memory.db` (cross-process);
 * falls back to an in-memory ledger if the kernel DB can't be reached. Uses a
 * dynamic import so the LLM layer stays statically decoupled from the kernel.
 */
export async function createDefaultSpendLedger(): Promise<SpendLedger> {
  try {
    const mod = await import('../../kernel/unified-memory.js');
    const mem = mod.getUnifiedMemory();
    if (!mem.isInitialized()) {
      await mem.initialize();
    }
    return new SqliteSpendLedger(mem.getDatabase());
  } catch {
    return new InMemorySpendLedger();
  }
}
