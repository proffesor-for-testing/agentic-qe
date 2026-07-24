/**
 * Regression tests for the MCP result mapping of coverage provenance (#569).
 *
 * Found by the qe-devils-advocate session review, AFTER the main #569 fix had
 * been committed. The handler was producing honest provenance, but
 * `coverageAnalyzeConfig.mapToResult` was laundering it back into confident
 * numbers on two paths:
 *
 *   1. A producer that supplies NO provenance fields (the coverage-analysis
 *      domain plugin returns a nested-`summary` CoverageReport) hit
 *      `data.branchDataCollected !== false` — `undefined !== false` is true —
 *      and so surfaced issue #569's exact reported symptom: 100% branch
 *      coverage alongside 0% function coverage, labelled `measured`.
 *   2. `measured` was derived as `!estimated`, which is wrong: there is a third
 *      state where nothing was collected. An empty project reported
 *      `lineCoverage: 0, measured: true` — "we measured 0%" when the truth was
 *      "we measured nothing".
 *
 * The rule under test (ADR-126): an ABSENT provenance flag means "unknown",
 * never "collected", and `null` must never be coerced to `0`.
 */
import { describe, it, expect } from 'vitest';

// Side-effect import: domain-handler-configs participates in a circular import
// with domain-handlers, so the barrel must be initialized first.
import '../../../../src/mcp/handlers/domain-handlers';
import { coverageAnalyzeConfig } from '../../../../src/mcp/handlers/domain-handler-configs';

type Mapped = ReturnType<typeof coverageAnalyzeConfig.mapToResult>;

const map = (data: Record<string, unknown>): Mapped =>
  coverageAnalyzeConfig.mapToResult('task-1', data, 12, []);

describe('#569 — mapToResult must not launder missing provenance into numbers', () => {
  describe('a producer with no provenance fields at all', () => {
    // Exactly the CoverageReport shape the coverage-analysis domain plugin
    // returns, carrying the impossible pair from the original bug report.
    const domainShaped = {
      summary: { line: 78.3, branch: 100, function: 0, statement: 78.3, files: 9 },
      gaps: [{ file: 'src/jwks.rs', lines: [335, 336], severity: 'medium' }],
    };

    it('does not report 100% branch coverage that nothing collected', () => {
      expect(map(domainShaped).branchCoverage).toBeNull();
    });

    it('does not report 0% function coverage that nothing collected', () => {
      expect(map(domainShaped).functionCoverage).toBeNull();
    });

    it('does not claim the result was measured', () => {
      const result = map(domainShaped);
      expect(result.measured).toBe(false);
      expect(result.branchDataCollected).toBe(false);
      expect(result.functionDataCollected).toBe(false);
    });

    it('does not attach measurement-grade confidence to its gaps', () => {
      const gaps = map(domainShaped).gaps ?? [];
      expect(gaps).toHaveLength(1);
      expect(gaps[0].confidence).toBeLessThan(0.5);
    });
  });

  describe('the honest "nothing was collected" result', () => {
    // Exactly what coverage-handlers.ts returns when there is no report, no
    // instrumentation, and nothing to estimate from.
    const noData = {
      lineCoverage: null, branchCoverage: null, functionCoverage: null,
      statementCoverage: null, totalFiles: 0, coverageByFile: [], gaps: [],
      estimated: false, measured: false, coverageMethod: 'none',
      warning: 'No coverage data found and could not run tests automatically.',
    };

    it('keeps "unknown" as null instead of coercing it to 0%', () => {
      const result = map(noData);
      expect(result.lineCoverage).toBeNull();
      expect(result.statementCoverage).toBeNull();
      expect(result.branchCoverage).toBeNull();
      expect(result.functionCoverage).toBeNull();
    });

    it('does not claim a measurement happened', () => {
      // `measured` is NOT the complement of `estimated`.
      expect(map(noData).measured).toBe(false);
      expect(map(noData).estimated).toBe(false);
    });
  });

  describe('a genuinely measured result still reports normally', () => {
    // Guard against over-correction: real provenance must survive intact.
    const measuredData = {
      lineCoverage: 69.2, branchCoverage: 55.5, functionCoverage: 72.8,
      statementCoverage: 69.2, totalFiles: 8, coverageByFile: [], gaps: [],
      estimated: false, measured: true, coverageMethod: 'cargo-llvm-cov',
      branchDataCollected: true, functionDataCollected: true,
    };

    it('passes measured figures through unchanged', () => {
      const result = map(measuredData);
      expect(result.lineCoverage).toBe(69.2);
      expect(result.branchCoverage).toBe(55.5);
      expect(result.functionCoverage).toBe(72.8);
      expect(result.measured).toBe(true);
      expect(result.coverageMethod).toBe('cargo-llvm-cov');
    });

    it('grades risk off a measured number', () => {
      expect((map(measuredData).aiInsights as Record<string, unknown>).riskAssessment)
        .toBe('high'); // 69.2 < 70
    });

    it('reports 0% as a real measured zero, not as unknown', () => {
      const zero = map({ ...measuredData, lineCoverage: 0 });
      expect(zero.lineCoverage).toBe(0);
      expect(zero.measured).toBe(true);
    });
  });

  describe('risk grading never runs on a null figure', () => {
    it('reports unknown risk rather than silently grading null as low', () => {
      // `null < 70` is false in JS, so an unguarded comparison would have
      // graded "no data" as 'low' risk — the most dangerous possible default.
      const insights = map({
        lineCoverage: null, totalFiles: 3, gaps: [],
        estimated: false, measured: false, coverageMethod: 'none',
      }).aiInsights as Record<string, unknown>;

      expect(insights.riskAssessment).toBe('unknown');
      expect(insights.confidence).toBe(0);
    });
  });
});
