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

import { Result, ok, err, DomainName } from '../shared/types/index.js';
import type { WorkflowContext } from './workflow-types.js';
import { toErrorMessage } from '../shared/error-utils.js';

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
    // Dynamic import to avoid hard dependency — the module may not be initialised
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getUnifiedMemory } = require('../kernel/unified-memory.js');
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
            const row = db.prepare(
              `SELECT after_lines FROM coverage_sessions ORDER BY created_at DESC LIMIT 1`,
            ).get() as { after_lines: number } | undefined;
            currentCoverage = row?.after_lines ?? 0;
          }

          // Test pass rate from recent test_outcomes
          if (currentTestsPassingRate === null) {
            const row = db.prepare(
              `SELECT COUNT(*) as total,
                      SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed
               FROM test_outcomes
               WHERE created_at > datetime('now', '-7 days')`,
            ).get() as { total: number; passed: number } | undefined;
            currentTestsPassingRate =
              row && row.total > 0 ? (row.passed / row.total) * 100 : 0;
          }

          // Bug count: failed non-flaky tests in the last 7 days
          if (currentBugs === null) {
            const row = db.prepare(
              `SELECT COUNT(*) as bugs FROM test_outcomes
               WHERE passed = 0 AND flaky = 0
               AND created_at > datetime('now', '-7 days')`,
            ).get() as { bugs: number } | undefined;
            currentBugs = row?.bugs ?? 0;
          }
        } catch {
          // Graceful degradation — fall through to defaults
        }
      }
    }

    // Apply defaults for anything still null
    currentCoverage = currentCoverage ?? 0;
    currentTestsPassingRate = currentTestsPassingRate ?? 0;
    currentBugs = currentBugs ?? 0;

    const coveragePassed = currentCoverage >= coverageMin;
    const testsPassed = currentTestsPassingRate >= testsPassingMin;
    const bugsPassed = currentBugs <= maxBugs;
    const passed = coveragePassed && testsPassed && bugsPassed;

    // Score is a normalized 0-1 value
    const coverageScore = Math.min(currentCoverage / coverageMin, 1);
    const testsScore = Math.min(currentTestsPassingRate / testsPassingMin, 1);
    const bugsScore = maxBugs > 0 ? Math.max(0, 1 - currentBugs / maxBugs) : (currentBugs === 0 ? 1 : 0);
    const score = (coverageScore + testsScore + bugsScore) / 3;

    return ok({
      passed,
      score: Math.round(score * 100) / 100,
      source: typeof input.currentCoverage === 'number' ? 'input' : 'database',
      details: {
        coverage: { current: currentCoverage, threshold: coverageMin, passed: coveragePassed },
        testsPassing: { current: currentTestsPassingRate, threshold: testsPassingMin, passed: testsPassed },
        bugs: { current: currentBugs, threshold: maxBugs, passed: bugsPassed },
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
          const row = db.prepare(
            `SELECT after_lines FROM coverage_sessions ORDER BY created_at DESC LIMIT 1`,
          ).get() as { after_lines: number } | undefined;
          currentCoverage = row?.after_lines ?? 0;
        } catch {
          currentCoverage = 0;
        }
      } else {
        currentCoverage = 0;
      }
    }

    const passed = currentCoverage >= minCoverage;
    const gap = passed ? 0 : Math.round((minCoverage - currentCoverage) * 100) / 100;

    return ok({
      currentCoverage,
      passed,
      gap,
      minCoverage,
      source,
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
