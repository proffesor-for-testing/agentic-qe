/**
 * Run History — Persist RunResult + config across sessions.
 *
 * Two SQLite tables:
 *   - run_history: full RunResult per run (stages_json for post-mortem)
 *   - run_config: operational config snapshot per run
 *
 * Key feature: analyzeRecurringFailures() queries last N runs,
 * groups failed checks by name, and maps them to Sterling output
 * template fields via STERLING_FIELD_MAP.
 */

import type { RunResult, StageResult } from '../../integrations/orchestration/action-types';
import type BetterSqlite3 from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

export interface RunConfigSnapshot {
  nodeVersion: string;
  envVarsPresent: string[];
  cliArgs: string;
  xapiEnabled: boolean;
  layersUsed: string;
  success: boolean;
}

export interface RecurringFailure {
  checkName: string;
  /** 0-1, failing in >50% of runs = recurring */
  failRate: number;
  failedInRuns: number;
  totalRuns: number;
  /** Sterling output template field path. null when unmapped. */
  sterlingField: string | null;
  stageId: string;
}

export interface RunHistoryStore {
  persistRun(runId: string, orderId: string, result: RunResult, cliArgs?: string): void;
  persistRunConfig(runId: string, config: RunConfigSnapshot): void;
  analyzeRecurringFailures(minRuns?: number): RecurringFailure[];
  getLastSuccessfulConfig(): RunConfigSnapshot | null;
  getRunCount(): number;
}

// ============================================================================
// Sterling Field Map — Single Source of Truth
// ============================================================================

/**
 * Maps check names (from tc01-steps.ts → StepCheck.name) to Sterling
 * output template field paths. Used by Rule 1.5 in agentic-healer.ts
 * and by analyzeRecurringFailures() for cross-run diagnosis.
 */
export const STERLING_FIELD_MAP: Record<string, string> = {
  'ShipTo FirstName present': 'PersonInfoShipTo.FirstName',
  'ShipTo LastName present': 'PersonInfoShipTo.LastName',
  'ShipTo City present': 'PersonInfoShipTo.City',
  'ShipTo Country present': 'PersonInfoShipTo.Country',
  'Has order lines': 'OrderLines.OrderLine',
  'Line ItemID present': 'OrderLine.ItemID',
  'Line UOM present': 'OrderLine.UnitOfMeasure',
  'Line OrderedQty present': 'OrderLine.OrderedQty',
  'Line has price info': 'OrderLine.LinePriceInfo',
  'ShipNode assigned': 'Order.ShipNode / OrderLine.ShipNode',
  'DateInvoiced present': 'OrderInvoice.DateInvoiced',
};

/** Set of check names that are field-presence checks (for Rule 1.5). */
export const FIELD_PRESENCE_CHECKS = new Set(Object.keys(STERLING_FIELD_MAP));

// ============================================================================
// Implementation
// ============================================================================

/**
 * Initialize run history store backed by SQLite.
 * Accepts an existing Database instance to avoid opening duplicate connections.
 */
export function initRunHistory(db: BetterSqlite3.Database): RunHistoryStore {
  // Create tables (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS run_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL,
      overall_success INTEGER NOT NULL,
      passed INTEGER,
      failed INTEGER,
      skipped INTEGER,
      total_checks INTEGER,
      total_duration_ms INTEGER,
      stages_json TEXT NOT NULL,
      cli_args TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS run_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      node_version TEXT,
      env_vars_present TEXT,
      cli_args TEXT,
      xapi_enabled INTEGER,
      layers_used TEXT,
      success INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Prepared statements
  const insertRunStmt = db.prepare(`
    INSERT OR REPLACE INTO run_history
      (run_id, order_id, overall_success, passed, failed, skipped, total_checks, total_duration_ms, stages_json, cli_args)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertConfigStmt = db.prepare(`
    INSERT INTO run_config
      (run_id, node_version, env_vars_present, cli_args, xapi_enabled, layers_used, success)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const lastSuccessConfigStmt = db.prepare(`
    SELECT node_version, env_vars_present, cli_args, xapi_enabled, layers_used, success
    FROM run_config
    WHERE success = 1
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const countStmt = db.prepare(`SELECT COUNT(*) as cnt FROM run_history`);

  const recentRunsStmt = db.prepare(`
    SELECT stages_json FROM run_history
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return {
    persistRun(runId, orderId, result, cliArgs) {
      try {
        insertRunStmt.run(
          runId, orderId,
          result.overallSuccess ? 1 : 0,
          result.passed, result.failed, result.skipped,
          result.totalChecks, result.totalDurationMs,
          JSON.stringify(result.stages),
          cliArgs ?? null,
        );
      } catch {
        // Best-effort — never fail the run on persistence errors
      }
    },

    persistRunConfig(runId, config) {
      try {
        insertConfigStmt.run(
          runId,
          config.nodeVersion,
          JSON.stringify(config.envVarsPresent),
          config.cliArgs,
          config.xapiEnabled ? 1 : 0,
          config.layersUsed,
          config.success ? 1 : 0,
        );
      } catch {
        // Best-effort
      }
    },

    analyzeRecurringFailures(minRuns = 2): RecurringFailure[] {
      try {
        const rows = recentRunsStmt.all(10) as Array<{ stages_json: string }>;
        if (rows.length < minRuns) return [];

        // Track: checkName → { failedInRuns, stageId }
        const failMap = new Map<string, { failedInRuns: number; stageId: string }>();

        for (const row of rows) {
          const stages: StageResult[] = JSON.parse(row.stages_json);
          // Track unique check failures per run (not per stage)
          const failedInThisRun = new Set<string>();

          for (const stage of stages) {
            for (const step of stage.verification.steps) {
              for (const check of step.result.checks) {
                if (!check.passed && !failedInThisRun.has(check.name)) {
                  failedInThisRun.add(check.name);
                  const existing = failMap.get(check.name);
                  if (existing) {
                    existing.failedInRuns++;
                  } else {
                    failMap.set(check.name, { failedInRuns: 1, stageId: stage.stageId });
                  }
                }
              }
            }
          }
        }

        // Return checks failing in >50% of runs
        const totalRuns = rows.length;
        return Array.from(failMap.entries())
          .filter(([, v]) => v.failedInRuns / totalRuns > 0.5)
          .map(([checkName, v]) => ({
            checkName,
            failRate: v.failedInRuns / totalRuns,
            failedInRuns: v.failedInRuns,
            totalRuns,
            sterlingField: STERLING_FIELD_MAP[checkName] ?? null,
            stageId: v.stageId,
          }))
          .sort((a, b) => b.failRate - a.failRate);
      } catch {
        return [];
      }
    },

    getLastSuccessfulConfig(): RunConfigSnapshot | null {
      try {
        const row = lastSuccessConfigStmt.get() as {
          node_version: string;
          env_vars_present: string;
          cli_args: string;
          xapi_enabled: number;
          layers_used: string;
          success: number;
        } | undefined;
        if (!row) return null;

        return {
          nodeVersion: row.node_version,
          envVarsPresent: JSON.parse(row.env_vars_present),
          cliArgs: row.cli_args,
          xapiEnabled: row.xapi_enabled === 1,
          layersUsed: row.layers_used,
          success: row.success === 1,
        };
      } catch {
        return null;
      }
    },

    getRunCount(): number {
      try {
        const row = countStmt.get() as { cnt: number };
        return row.cnt;
      } catch {
        return 0;
      }
    },
  };
}
