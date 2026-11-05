/**
 * Deterministic Step Actions (Imp-9)
 *
 * Built-in actions that execute WITHOUT LLM tokens.  Each action maps to a
 * domain + action pair and is automatically wired into the WorkflowOrchestrator
 * as a fallback before domain service delegation.
 *
 * When the caller supplies explicit input values they are used directly.
 * When inputs are omitted, the actions query the unified SQLite database
 * for live metrics — keeping execution fully deterministic (SQL-only).
 */

import { Result, ok, DomainName } from '../shared/types/index.js';
import type { WorkflowContext } from './workflow-types.js';
import { MEASURED_COVERAGE_SESSION_SQL } from '../feedback/coverage-session-provenance.js';
import { EXECUTED_TEST_OUTCOME_SQL } from '../feedback/test-outcome-provenance.js';
import { getUnifiedMemory } from '../kernel/unified-memory.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A deterministic action that runs without any LLM tokens.
 */
export interface DeterministicAction {
  /** Unique action identifier */
  id: string;
  /** Target domain */
  domain: DomainName;
  /** Action name within the domain */
  action: string;
  /** Execute the action with the given input */
  execute(
    input: Record<string, unknown>,
    context: WorkflowContext,
  ): Promise<Result<Record<string, unknown>, Error>>;
}

// ============================================================================
// DB helpers  (fail-safe: return null when DB unavailable)
// ============================================================================

interface DbAccessor {
  prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
}

function tryGetDb(): DbAccessor | null {
  try {
    // #1374: a static import. The package is ESM, so `require` only worked in
    // the esbuild bundles; under tsc output and vitest it threw, and every
    // DB read here silently fell back to "no DB".
    const um = getUnifiedMemory();
    if (!um.isInitialized()) return null;
    return um.getDatabase() as DbAccessor;
  } catch {
    return null;
  }
}

// ============================================================================
// Quality Gate Check
// ============================================================================

const qualityGateCheck: DeterministicAction = {
  id: 'quality-gate-check',
  domain: 'quality-assessment',
  action: 'gate-check',
  async execute(input) {
    const coverageMin = typeof input.coverageMin === 'number' ? input.coverageMin : 80;
    const testsPassingMin = typeof input.testsPassingMin === 'number' ? input.testsPassingMin : 90;
    const maxBugs = typeof input.maxBugs === 'number' ? input.maxBugs : 5;

    // ----- Fetch live data from DB when not supplied by caller -----
    let currentCoverage = typeof input.currentCoverage === 'number' ? input.currentCoverage : null;
    let currentTestsPassingRate = typeof input.currentTestsPassingRate === 'number' ? input.currentTestsPassingRate : null;
    let currentBugs = typeof input.currentBugs === 'number' ? input.currentBugs : null;

    if (currentCoverage === null || currentTestsPassingRate === null || currentBugs === null) {
      const db = tryGetDb();
      if (db) {
        try {
          // Latest coverage from coverage_sessions
          if (currentCoverage === null) {
            // #1014: skip legacy estimate/unmeasured rows without provenance.
            const row = db.prepare(
              `SELECT after_lines FROM coverage_sessions WHERE ${MEASURED_COVERAGE_SESSION_SQL} ORDER BY created_at DESC LIMIT 1`,
            ).get() as { after_lines: number } | undefined;
            // #1027 N6: no measured session → unmeasured (null), never 0%.
            currentCoverage = typeof row?.after_lines === 'number' ? row.after_lines : null;
          }

          // Pass rate and bug count from the last 7 days of EXECUTED tests.
          // #1374: never-run generation rows are not evidence, and no executed
          // row leaves both unmeasured (null), never 0% or "0 bugs".
          if (currentTestsPassingRate === null || currentBugs === null) {
            const row = db.prepare(
              `SELECT COUNT(*) as total,
                      SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed,
                      SUM(CASE WHEN passed = 0 AND flaky = 0 THEN 1 ELSE 0 END) as bugs
               FROM test_outcomes
               WHERE created_at > datetime('now', '-7 days') AND ${EXECUTED_TEST_OUTCOME_SQL}`,
            ).get() as { total: number; passed: number | null; bugs: number | null } | undefined;
            if (row && row.total > 0) {
              if (currentTestsPassingRate === null) currentTestsPassingRate = ((row.passed ?? 0) / row.total) * 100;
              if (currentBugs === null) currentBugs = row.bugs ?? 0;
            }
          }
        } catch {
          // Graceful degradation — anything not read stays unmeasured
        }
      }
    }

    // #1027 N6, #1374: an input with no evidence stays null (unmeasured). It
    // is not compared with its threshold, it fails its check, and it makes
    // the gate fail: no evidence is never a pass, and never "0% < 90%".
    const unmeasured = [
      ...(currentCoverage === null ? ['coverage'] : []),
      ...(currentTestsPassingRate === null ? ['testsPassing'] : []),
      ...(currentBugs === null ? ['bugs'] : []),
    ];

    const coveragePassed = currentCoverage !== null && currentCoverage >= coverageMin;
    const testsPassed = currentTestsPassingRate !== null && currentTestsPassingRate >= testsPassingMin;
    const bugsPassed = currentBugs !== null && currentBugs <= maxBugs;
    const passed = coveragePassed && testsPassed && bugsPassed;

    // Score is a normalized 0-1 value; an unmeasured input scores 0.
    const coverageScore = currentCoverage === null ? 0 : Math.min(currentCoverage / coverageMin, 1);
    const testsScore = currentTestsPassingRate === null ? 0 : Math.min(currentTestsPassingRate / testsPassingMin, 1);
    const bugsScore = currentBugs === null ? 0
      : maxBugs > 0 ? Math.max(0, 1 - currentBugs / maxBugs) : (currentBugs === 0 ? 1 : 0);
    const score = (coverageScore + testsScore + bugsScore) / 3;

    const check = (current: number | null, threshold: number, checkPassed: boolean) => ({
      current, threshold, passed: checkPassed, ...(current === null ? { unmeasured: true } : {}),
    });

    return ok({
      passed,
      score: Math.round(score * 100) / 100,
      source: typeof input.currentCoverage === 'number' ? 'input' : 'database',
      ...(unmeasured.length > 0 ? {
        unmeasured,
        reason: `No execution evidence for ${unmeasured.join(', ')}: unmeasured inputs fail the gate`,
      } : {}),
      details: {
        coverage: check(currentCoverage, coverageMin, coveragePassed),
        testsPassing: check(currentTestsPassingRate, testsPassingMin, testsPassed),
        bugs: check(currentBugs, maxBugs, bugsPassed),
      },
    });
  },
};

// ============================================================================
// Coverage Threshold Check
// ============================================================================

const coverageThresholdCheck: DeterministicAction = {
  id: 'coverage-threshold',
  domain: 'coverage-analysis',
  action: 'threshold-check',
  async execute(input) {
    const minCoverage = typeof input.minCoverage === 'number' ? input.minCoverage : 80;

    // ----- Fetch from DB when not supplied -----
    let currentCoverage = typeof input.currentCoverage === 'number' ? input.currentCoverage : null;
    let source: 'input' | 'database' = 'input';

    if (currentCoverage === null) {
      source = 'database';
      const db = tryGetDb();
      if (db) {
        try {
          // #1014: skip legacy estimate/unmeasured rows without provenance.
          const row = db.prepare(
            `SELECT after_lines FROM coverage_sessions WHERE ${MEASURED_COVERAGE_SESSION_SQL} ORDER BY created_at DESC LIMIT 1`,
          ).get() as { after_lines: number } | undefined;
          // #1027 N6: no measured session → unmeasured (null), never 0%.
          currentCoverage = typeof row?.after_lines === 'number' ? row.after_lines : null;
        } catch {
          currentCoverage = null;
        }
      } else {
        currentCoverage = null;
      }
    }

    // Unmeasured coverage fails the check (no evidence), with no fake gap.
    const passed = currentCoverage !== null && currentCoverage >= minCoverage;
    const gap = currentCoverage === null ? null : passed ? 0 : Math.round((minCoverage - currentCoverage) * 100) / 100;

    return ok({
      currentCoverage,
      passed,
      gap,
      minCoverage,
      source,
      ...(currentCoverage === null ? { unmeasured: true } : {}),
    });
  },
};

// ============================================================================
// Pattern Health Check
// ============================================================================

const patternHealthCheck: DeterministicAction = {
  id: 'pattern-health',
  domain: 'learning-optimization',
  action: 'health-check',
  async execute(input) {
    // ----- Fetch from DB when not supplied -----
    let totalPatterns = typeof input.totalPatterns === 'number' ? input.totalPatterns : null;
    let activePatterns = typeof input.activePatterns === 'number' ? input.activePatterns : null;
    let avgConfidence = typeof input.avgConfidence === 'number' ? input.avgConfidence : null;
    let source: 'input' | 'database' = 'input';

    if (totalPatterns === null || activePatterns === null || avgConfidence === null) {
      source = 'database';
      const db = tryGetDb();
      if (db) {
        try {
          const row = db.prepare(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN deprecated_at IS NULL AND confidence >= 0.3 THEN 1 ELSE 0 END) as active,
                   AVG(confidence) as avg_conf
            FROM qe_patterns
          `).get() as { total: number; active: number; avg_conf: number | null } | undefined;

          totalPatterns = totalPatterns ?? (row?.total ?? 0);
          activePatterns = activePatterns ?? (row?.active ?? 0);
          avgConfidence = avgConfidence ?? (row?.avg_conf ?? 0);
        } catch {
          // Graceful degradation
        }
      }
    }

    // Apply defaults for anything still null
    totalPatterns = totalPatterns ?? 0;
    activePatterns = activePatterns ?? 0;
    avgConfidence = avgConfidence ?? 0;

    // Health score: weighted combination of volume, activity ratio, and confidence
    const volumeScore = Math.min(totalPatterns / 100, 1); // 100 patterns = max volume
    const activityRatio = totalPatterns > 0 ? activePatterns / totalPatterns : 0;
    const healthScore = Math.round(
      (volumeScore * 0.3 + activityRatio * 0.3 + avgConfidence * 0.4) * 100,
    ) / 100;

    return ok({
      totalPatterns,
      activePatterns,
      avgConfidence,
      healthScore,
      source,
    });
  },
};

// ============================================================================
// Routing Accuracy Check
// ============================================================================

const routingAccuracyCheck: DeterministicAction = {
  id: 'routing-accuracy',
  domain: 'learning-optimization',
  action: 'routing-check',
  async execute(input) {
    // ----- Fetch from DB when not supplied -----
    let totalOutcomes = typeof input.totalOutcomes === 'number' ? input.totalOutcomes : null;
    let successfulOutcomes = typeof input.successfulOutcomes === 'number' ? input.successfulOutcomes : null;
    let confidenceCorrelation = typeof input.confidenceCorrelation === 'number' ? input.confidenceCorrelation : null;
    let source: 'input' | 'database' = 'input';

    if (totalOutcomes === null || successfulOutcomes === null) {
      source = 'database';
      const db = tryGetDb();
      if (db) {
        try {
          const row = db.prepare(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
            FROM routing_outcomes
          `).get() as { total: number; successful: number } | undefined;

          totalOutcomes = totalOutcomes ?? (row?.total ?? 0);
          successfulOutcomes = successfulOutcomes ?? (row?.successful ?? 0);
        } catch {
          // Graceful degradation
        }
      }
    }

    // Apply defaults
    totalOutcomes = totalOutcomes ?? 0;
    successfulOutcomes = successfulOutcomes ?? 0;
    confidenceCorrelation = confidenceCorrelation ?? 0;

    const successRate = totalOutcomes > 0
      ? Math.round((successfulOutcomes / totalOutcomes) * 10000) / 100
      : 0;

    return ok({
      successRate,
      totalOutcomes,
      successfulOutcomes,
      confidenceCorrelation,
      source,
    });
  },
};

// ============================================================================
// Registry
// ============================================================================

/** All built-in deterministic actions */
const DETERMINISTIC_ACTIONS: DeterministicAction[] = [
  qualityGateCheck,
  coverageThresholdCheck,
  patternHealthCheck,
  routingAccuracyCheck,
];

/**
 * Look up a deterministic action by domain + action.
 * Returns undefined if no built-in action matches.
 */
export function findDeterministicAction(
  domain: DomainName,
  action: string,
): DeterministicAction | undefined {
  return DETERMINISTIC_ACTIONS.find(
    (a) => a.domain === domain && a.action === action,
  );
}

/**
 * Get all registered deterministic actions.
 */
export function getAllDeterministicActions(): readonly DeterministicAction[] {
  return DETERMINISTIC_ACTIONS;
}
