/**
 * Agentic QE v3 - Coverage Tracker Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Tracks coverage trends over time including:
 * - Line, branch, function, statement coverage
 * - Coverage gaps and hotspots
 * - Coverage trend analysis
 * - Uncovered critical paths
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';
import { measuredCoverageSummary } from '../../domains/quality-assessment/coverage-report-event.js';

const CONFIG: WorkerConfig = {
  id: 'coverage-tracker',
  name: 'Coverage Tracker',
  description: 'Tracks coverage trends over time including gaps, hotspots, and critical paths',
  intervalMs: 10 * 60 * 1000, // 10 minutes
  priority: 'high',
  targetDomains: ['coverage-analysis', 'test-generation'],
  enabled: true,
  timeoutMs: 120000,
  retryCount: 2,
  retryDelayMs: 10000,
};

interface CoverageMetrics {
  line: number;
  /** `null` = not collected (no branch data in the measurement). */
  branch: number | null;
  /** `null` = not collected (no function data in the measurement). */
  function: number | null;
  statement: number;
  timestamp: Date;
  /** Provenance stamp: only measured coverage is ever stored (#1018). */
  measured: true;
}

interface CoverageGap {
  file: string;
  uncoveredLines: number;
  totalLines: number;
  complexity: number;
  riskScore: number;
}

interface CoverageTrend {
  /** `null` = no measured coverage exists: nothing to track (#1018). */
  current: CoverageMetrics | null;
  previous?: CoverageMetrics;
  weeklyAverage?: CoverageMetrics;
}

export class CoverageTrackerWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting coverage tracking analysis');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Collect coverage metrics
    const trend = await this.collectCoverageTrend(context);
    const gaps = await this.identifyCoverageGaps(context);

    // Analyze coverage gaps
    this.analyzeCoverageGaps(gaps, findings, recommendations);

    // #1018: with no measured coverage there is nothing to compare, nothing
    // to store, and no figure to report — never a fake 0% record.
    const current = trend.current;
    if (current) {
      this.analyzeCoverageThresholds(current, findings, recommendations);
      this.analyzeCoverageTrends({ ...trend, current }, findings, recommendations);
      await context.memory.set('coverage:current', current);
    } else {
      findings.push({
        type: 'coverage-unmeasured',
        severity: 'info',
        domain: 'coverage-analysis',
        title: 'Coverage Unmeasured',
        description: 'No measured coverage exists yet (no instrumented coverage:latest). Nothing was ' +
          'tracked; this is not 0% coverage. Run tests with coverage or coverage_analyze_sublinear.',
      });
    }
    await context.memory.set('coverage:gaps', gaps);

    const healthScore = this.calculateHealthScore(current, gaps);

    context.logger.info('Coverage tracking complete', {
      healthScore,
      measured: current !== null,
      findingsCount: findings.length,
      gapsFound: gaps.length,
    });

    const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `${v}%`);
    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: gaps.length + (current ? 4 : 0), // 4 coverage types + gaps
        issuesFound: findings.filter(f => f.severity !== 'info').length,
        healthScore,
        trend: current ? this.determineTrend({ ...trend, current }) : 'stable',
        domainMetrics: {
          coverageMeasured: current ? 'true' : 'false',
          lineCoverage: current ? pct(current.line) : 'unmeasured',
          branchCoverage: current ? pct(current.branch) : 'unmeasured',
          functionCoverage: current ? pct(current.function) : 'unmeasured',
          statementCoverage: current ? pct(current.statement) : 'unmeasured',
          gapsCount: gaps.length,
        },
      },
      findings,
      recommendations
    );
  }

  private async collectCoverageTrend(context: WorkerContext): Promise<CoverageTrend> {
    // A previous record is a baseline only if it was measured (#1018): older
    // versions wrote an all-zero coverage:current when nothing was measured.
    const stored = await context.memory.get<CoverageMetrics>('coverage:current');
    const previous = stored && stored.measured === true && Number.isFinite(stored.line) ? stored : undefined;

    // Real coverage comes from coverage:latest (written by coverage-analyzer,
    // test-executor and the quality-assessment listener). Only a record
    // stamped measured:true with finite figures counts (#1008/#1018); a
    // missing, legacy or estimated record means "unmeasured" — never zeros.
    const latest = measuredCoverageSummary(await context.memory.get<unknown>('coverage:latest'));
    if (!latest) return { current: null, previous };

    const current: CoverageMetrics = {
      line: latest.line,
      branch: latest.branch,
      function: latest.function,
      statement: latest.statement,
      timestamp: new Date(),
      measured: true,
    };

    return { current, previous };
  }

  private async identifyCoverageGaps(context: WorkerContext): Promise<CoverageGap[]> {
    // Search for gap patterns stored by the gap-detector service
    // (written via storeVector with key prefix 'gap-pattern:')
    const gapKeys = await context.memory.search('gap-pattern:*');
    if (gapKeys.length > 0) {
      const gaps: CoverageGap[] = [];
      for (const key of gapKeys) {
        const gap = await context.memory.get<CoverageGap>(key);
        if (gap && typeof gap.riskScore === 'number') {
          gaps.push(gap);
        }
      }
      if (gaps.length > 0) {
        return gaps;
      }
    }

    // No gap data available from coverage analysis yet
    return [];
  }

  private analyzeCoverageThresholds(
    coverage: CoverageMetrics,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const thresholds = {
      line: 80,
      branch: 70,
      function: 80,
      statement: 80,
    };

    if (coverage.line < thresholds.line) {
      findings.push({
        type: 'low-line-coverage',
        severity: coverage.line < 60 ? 'high' : 'medium',
        domain: 'coverage-analysis',
        title: 'Line Coverage Below Threshold',
        description: `Line coverage is ${coverage.line}%, below ${thresholds.line}% target`,
        context: { current: coverage.line, target: thresholds.line },
      });
    }

    if (coverage.branch !== null && coverage.branch < thresholds.branch) {
      findings.push({
        type: 'low-branch-coverage',
        severity: coverage.branch < 50 ? 'high' : 'medium',
        domain: 'coverage-analysis',
        title: 'Branch Coverage Below Threshold',
        description: `Branch coverage is ${coverage.branch}%, below ${thresholds.branch}% target`,
        context: { current: coverage.branch, target: thresholds.branch },
      });

      recommendations.push({
        priority: 'p1',
        domain: 'test-generation',
        action: 'Improve Branch Coverage',
        description: 'Add tests for uncovered conditional branches. Focus on complex decision points.',
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: true,
      });
    }

    if (coverage.function !== null && coverage.function < thresholds.function) {
      findings.push({
        type: 'low-function-coverage',
        severity: 'medium',
        domain: 'coverage-analysis',
        title: 'Function Coverage Below Threshold',
        description: `Function coverage is ${coverage.function}%, below ${thresholds.function}% target`,
        context: { current: coverage.function, target: thresholds.function },
      });
    }
  }

  private analyzeCoverageGaps(
    gaps: CoverageGap[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    // Find high-risk gaps
    const highRiskGaps = gaps.filter((g) => g.riskScore > 0.8);

    for (const gap of highRiskGaps) {
      findings.push({
        type: 'high-risk-coverage-gap',
        severity: 'high',
        domain: 'coverage-analysis',
        title: 'High-Risk Coverage Gap',
        description: `${gap.file} has ${gap.uncoveredLines} uncovered lines with complexity ${gap.complexity}`,
        resource: gap.file,
        context: {
          uncoveredLines: gap.uncoveredLines,
          totalLines: gap.totalLines,
          coveragePercent: ((gap.totalLines - gap.uncoveredLines) / gap.totalLines * 100).toFixed(1),
          complexity: gap.complexity,
          riskScore: gap.riskScore,
        },
      });
    }

    if (highRiskGaps.length > 0) {
      recommendations.push({
        priority: 'p0',
        domain: 'test-generation',
        action: 'Address High-Risk Coverage Gaps',
        description: `${highRiskGaps.length} files have high-risk coverage gaps. Prioritize testing for complex, uncovered code.`,
        estimatedImpact: 'high',
        effort: 'high',
        autoFixable: true,
      });
    }

    // Check for files with very low coverage
    const criticalGaps = gaps.filter((g) => {
      const coverage = (g.totalLines - g.uncoveredLines) / g.totalLines;
      return coverage < 0.5;
    });

    if (criticalGaps.length > 0) {
      findings.push({
        type: 'critical-coverage-gaps',
        severity: 'critical',
        domain: 'coverage-analysis',
        title: 'Critical Coverage Gaps Detected',
        description: `${criticalGaps.length} files have less than 50% coverage`,
        context: {
          files: criticalGaps.map((g) => g.file),
        },
      });
    }
  }

  private analyzeCoverageTrends(
    trend: CoverageTrend & { current: CoverageMetrics },
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    if (!trend.previous) return;

    const lineChange = trend.current.line - trend.previous.line;
    const branchChange = trend.current.branch !== null && trend.previous.branch !== null
      ? trend.current.branch - trend.previous.branch : 0;

    if (lineChange < -2) {
      findings.push({
        type: 'coverage-regression',
        severity: lineChange < -5 ? 'high' : 'medium',
        domain: 'coverage-analysis',
        title: 'Coverage Regression Detected',
        description: `Line coverage dropped by ${Math.abs(lineChange).toFixed(1)}% since last check`,
        context: {
          previous: trend.previous.line,
          current: trend.current.line,
          change: lineChange,
        },
      });

      recommendations.push({
        priority: 'p1',
        domain: 'test-generation',
        action: 'Investigate Coverage Regression',
        description: 'Recent changes have reduced code coverage. Review new code and add missing tests.',
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: false,
      });
    }

    if (branchChange < -3) {
      findings.push({
        type: 'branch-coverage-regression',
        severity: 'medium',
        domain: 'coverage-analysis',
        title: 'Branch Coverage Regression',
        description: `Branch coverage dropped by ${Math.abs(branchChange).toFixed(1)}%`,
        context: {
          previous: trend.previous.branch,
          current: trend.current.branch,
          change: branchChange,
        },
      });
    }
  }

  private calculateHealthScore(coverage: CoverageMetrics | null, gaps: CoverageGap[]): number {
    // Gaps penalty
    const highRiskGaps = gaps.filter((g) => g.riskScore > 0.8).length;
    const gapsScore = Math.max(0, 10 - highRiskGaps * 2);

    // #1018: with no measurement, only the gap component is known; it is
    // scaled to 0-100 rather than mixed with invented 0% coverage.
    if (!coverage) return gapsScore * 10;

    // Weight: line 25%, branch 25%, function 20%, statement 20%, gaps 10%.
    // An uncollected metric is left out and the rest are re-weighted.
    const parts: Array<[number | null, number]> = [
      [coverage.line, 25], [coverage.branch, 25], [coverage.function, 20], [coverage.statement, 20],
    ];
    const present = parts.filter((p): p is [number, number] => p[0] !== null);
    const weight = present.reduce((a, [, w]) => a + w, 0);
    const coverageScore = present.reduce((a, [v, w]) => a + (v / 100) * w, 0) * (90 / weight);

    return Math.round(coverageScore + gapsScore);
  }

  private determineTrend(trend: CoverageTrend & { current: CoverageMetrics }): 'improving' | 'stable' | 'degrading' {
    if (!trend.previous) return 'stable';

    const avg = (c: CoverageMetrics) => {
      const values = [c.line, c.branch, c.function, c.statement].filter((v): v is number => v !== null);
      return values.reduce((a, v) => a + v, 0) / values.length;
    };
    const avgCurrent = avg(trend.current);
    const avgPrevious = avg(trend.previous);

    if (avgCurrent > avgPrevious + 1) return 'improving';
    if (avgCurrent < avgPrevious - 1) return 'degrading';
    return 'stable';
  }
}
