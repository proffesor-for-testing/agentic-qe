/**
 * Healing Telemetry — Structured outcome recording for self-healing.
 *
 * Records every healing attempt in a SQLite table. This serves two purposes:
 *   1. Telemetry: humans can query what failed, what healed, success rates
 *   2. Confidence adjustment: pattern confidence updated from real outcomes
 *
 * The table is append-only. No data is ever deleted. Confidence updates
 * are computed from real outcome data, not hardcoded values.
 *
 * Note: isHNSWActivated() and HNSW_ACTIVATION_THRESHOLD are retained for
 * future semantic search upgrade. Current search is text-scoring (keyword overlap).
 */

// ============================================================================
// Types
// ============================================================================

export interface HealingOutcome {
  runId: string;
  stageId: string;
  playbookName?: string;
  patternMatched?: string;
  decision: 'retry' | 'continue' | 'abort';
  success: boolean;
  probeStatus?: number;
  probeShipments?: number;
  probeInvoices?: number;
  durationMs?: number;
  pollsNeeded?: number;
  apiUsed?: string;
  errorSummary?: string;
}

export interface HealingStats {
  totalOutcomes: number;
  distinctPlaybooks: number;
  overallSuccessRate: number;
  hnswActivated: boolean;
}

export interface HealingTelemetry {
  recordOutcome(outcome: HealingOutcome): void;
  getStats(): HealingStats;
  updateConfidenceFromOutcomes(): void;
  isHNSWActivated(): boolean;
  /** Get all healing outcomes for a specific run (for debug dumps). */
  getRunOutcomes(runId: string): HealingOutcome[];
}

// ============================================================================
// Constants
// ============================================================================

/** HNSW pattern search activates as fallback after this many recorded outcomes. */
export const HNSW_ACTIVATION_THRESHOLD = 20;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Initialize healing telemetry backed by SQLite.
 * Creates the healing_outcomes table if it doesn't exist.
 *
 * Accepts either a Database instance (shared connection) or a string path (legacy).
 * Prefer passing a Database instance to avoid duplicate connections.
 */
export async function initHealingTelemetry(
  dbOrPath: import('better-sqlite3').Database | string,
): Promise<HealingTelemetry | null> {
  try {
    let db: import('better-sqlite3').Database;
    if (typeof dbOrPath === 'string') {
      const Database = (await import('better-sqlite3')).default;
      db = new Database(dbOrPath);
    } else {
      db = dbOrPath;
    }

    // Create outcomes table (append-only telemetry)
    db.exec(`
      CREATE TABLE IF NOT EXISTS healing_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        stage_id TEXT NOT NULL,
        playbook_name TEXT,
        pattern_matched TEXT,
        decision TEXT NOT NULL,
        success INTEGER NOT NULL,
        probe_status REAL,
        probe_shipments INTEGER,
        probe_invoices INTEGER,
        duration_ms INTEGER,
        polls_needed INTEGER,
        api_used TEXT,
        error_summary TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Prepared statements
    const insertStmt = db.prepare(`
      INSERT INTO healing_outcomes (
        run_id, stage_id, playbook_name, pattern_matched, decision,
        success, probe_status, probe_shipments, probe_invoices,
        duration_ms, polls_needed, api_used, error_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const statsStmt = db.prepare(`
      SELECT
        COUNT(*) as total_outcomes,
        COUNT(DISTINCT playbook_name) as distinct_playbooks,
        CASE WHEN COUNT(*) > 0
          THEN CAST(SUM(success) AS REAL) / COUNT(*)
          ELSE 0.0
        END as success_rate
      FROM healing_outcomes
    `);

    const confidenceUpdateStmt = db.prepare(`
      UPDATE sterling_patterns
      SET confidence = (
        SELECT CAST(SUM(ho.success) AS REAL) / COUNT(*)
        FROM healing_outcomes ho
        WHERE ho.pattern_matched = sterling_patterns.name
        AND ho.created_at > datetime('now', '-90 days')
      ),
      updated_at = datetime('now')
      WHERE name IN (
        SELECT DISTINCT pattern_matched
        FROM healing_outcomes
        WHERE pattern_matched IS NOT NULL
        AND created_at > datetime('now', '-90 days')
      )
    `);

    const runOutcomesStmt = db.prepare(`
      SELECT run_id, stage_id, playbook_name, pattern_matched, decision,
             success, probe_status, probe_shipments, probe_invoices,
             duration_ms, polls_needed, api_used, error_summary
      FROM healing_outcomes
      WHERE run_id = ?
      ORDER BY id ASC
    `);

    // Cache stats per run (one query at startup, not per healing attempt)
    let cachedStats: HealingStats | null = null;

    function getStats(): HealingStats {
      if (cachedStats) return cachedStats;
      try {
        const row = statsStmt.get() as {
          total_outcomes: number;
          distinct_playbooks: number;
          success_rate: number;
        };
        cachedStats = {
          totalOutcomes: row.total_outcomes,
          distinctPlaybooks: row.distinct_playbooks,
          overallSuccessRate: row.success_rate,
          hnswActivated: row.total_outcomes >= HNSW_ACTIVATION_THRESHOLD,
        };
        return cachedStats;
      } catch {
        return {
          totalOutcomes: 0,
          distinctPlaybooks: 0,
          overallSuccessRate: 0,
          hnswActivated: false,
        };
      }
    }

    return {
      recordOutcome(outcome: HealingOutcome): void {
        try {
          insertStmt.run(
            outcome.runId,
            outcome.stageId,
            outcome.playbookName ?? null,
            outcome.patternMatched ?? null,
            outcome.decision,
            outcome.success ? 1 : 0,
            outcome.probeStatus ?? null,
            outcome.probeShipments ?? null,
            outcome.probeInvoices ?? null,
            outcome.durationMs ?? null,
            outcome.pollsNeeded ?? null,
            outcome.apiUsed ?? null,
            outcome.errorSummary ?? null,
          );
          // Invalidate cache after recording
          cachedStats = null;
        } catch {
          // Telemetry is best-effort — never fail healing on recording errors
        }
      },

      getStats,

      updateConfidenceFromOutcomes(): void {
        try {
          confidenceUpdateStmt.run();
        } catch {
          // Best-effort
        }
      },

      isHNSWActivated(): boolean {
        return getStats().hnswActivated;
      },

      getRunOutcomes(runId: string): HealingOutcome[] {
        try {
          const rows = runOutcomesStmt.all(runId) as Array<{
            run_id: string; stage_id: string; playbook_name: string | null;
            pattern_matched: string | null; decision: string; success: number;
            probe_status: number | null; probe_shipments: number | null;
            probe_invoices: number | null; duration_ms: number | null;
            polls_needed: number | null; api_used: string | null;
            error_summary: string | null;
          }>;
          return rows.map((r) => ({
            runId: r.run_id,
            stageId: r.stage_id,
            playbookName: r.playbook_name ?? undefined,
            patternMatched: r.pattern_matched ?? undefined,
            decision: r.decision as HealingOutcome['decision'],
            success: r.success === 1,
            probeStatus: r.probe_status ?? undefined,
            probeShipments: r.probe_shipments ?? undefined,
            probeInvoices: r.probe_invoices ?? undefined,
            durationMs: r.duration_ms ?? undefined,
            pollsNeeded: r.polls_needed ?? undefined,
            apiUsed: r.api_used ?? undefined,
            errorSummary: r.error_summary ?? undefined,
          }));
        } catch {
          return [];
        }
      },
    };
  } catch {
    // SQLite not available — telemetry disabled
    return null;
  }
}
