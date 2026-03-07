/**
 * Version Comparator for A/B Testing Between Skill Versions
 * ADR-056: Skill validation system - version comparison support
 *
 * Enables side-by-side comparison of two skill versions using statistical
 * methods (Cohen's d effect size, confidence scoring) to determine whether
 * a proposed skill version is a meaningful improvement over the current one.
 *
 * Inspired by the Claude Blog skill-creator's comparator agent feature.
 *
 * @module validation/version-comparator
 */

import { randomUUID } from 'crypto';
import type {
  SkillValidationOutcome,
  TestCaseResult,
} from '../learning/skill-validation-learner.js';
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('version-comparator');

// ============================================================================
// Types
// ============================================================================

export interface VersionComparisonConfig {
  /** Minimum test cases to consider comparison valid */
  minTestCases: number;
  /** Significance threshold for declaring a winner */
  significanceThreshold: number;
  /** Whether to run both versions in parallel */
  parallel: boolean;
}

export interface SkillVersion {
  /** Version identifier (e.g., 'v1.2.0', 'current', 'proposed') */
  versionId: string;
  /** Skill name */
  skillName: string;
  /** Path to the SKILL.md file for this version */
  skillPath: string;
  /** Optional: eval suite path override */
  evalPath?: string;
  /** Metadata about this version */
  metadata?: Record<string, unknown>;
}

export interface VersionComparisonResult {
  /** Unique comparison run ID */
  comparisonId: string;
  /** Timestamp of comparison */
  timestamp: Date;
  /** Version A details and results */
  versionA: VersionResult;
  /** Version B details and results */
  versionB: VersionResult;
  /** Statistical comparison */
  comparison: ComparisonStats;
  /** Overall winner (null if no significant difference) */
  winner: 'A' | 'B' | null;
  /** Human-readable summary */
  summary: string;
  /** Detailed per-test-case comparison */
  testCaseComparisons: TestCaseComparison[];
}

export interface VersionResult {
  version: SkillVersion;
  passRate: number;
  avgScore: number;
  avgReasoningQuality: number;
  avgExecutionTimeMs: number;
  totalTokens: number;
  testCaseResults: TestCaseResult[];
}

export interface ComparisonStats {
  passRateDiff: number;
  scoreDiff: number;
  reasoningQualityDiff: number;
  executionTimeDiff: number;
  isSignificant: boolean;
  effectSize: number;
  confidence: number;
}

export interface TestCaseComparison {
  testId: string;
  versionAResult: TestCaseResult;
  versionBResult: TestCaseResult;
  scoreDiff: number;
  winner: 'A' | 'B' | 'tie';
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: VersionComparisonConfig = {
  minTestCases: 5,
  significanceThreshold: 0.05,
  parallel: true,
};

const SCORE_TIE_EPSILON = 1e-6;

// ============================================================================
// VersionComparator
// ============================================================================

export class VersionComparator {
  private readonly config: VersionComparisonConfig;

  constructor(config: Partial<VersionComparisonConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compare two skill versions using pre-computed validation outcomes.
   */
  compare(
    versionA: SkillVersion,
    versionB: SkillVersion,
    outcomes: { a: SkillValidationOutcome; b: SkillValidationOutcome },
  ): VersionComparisonResult {
    logger.info('Comparing skill versions from outcomes', {
      skillName: versionA.skillName,
      versionA: versionA.versionId,
      versionB: versionB.versionId,
    });

    return this.compareFromResults(
      versionA,
      outcomes.a.testCaseResults,
      versionB,
      outcomes.b.testCaseResults,
    );
  }

  /**
   * Compare two skill versions from raw test case results.
   */
  compareFromResults(
    versionA: SkillVersion,
    resultsA: TestCaseResult[],
    versionB: SkillVersion,
    resultsB: TestCaseResult[],
  ): VersionComparisonResult {
    const comparisonId = `cmp-${randomUUID().slice(0, 12)}`;
    const timestamp = new Date();

    logger.info('Comparing skill versions from results', {
      comparisonId,
      versionA: versionA.versionId,
      versionB: versionB.versionId,
      testCasesA: resultsA.length,
      testCasesB: resultsB.length,
    });

    const versionAResult = this.buildVersionResult(versionA, resultsA);
    const versionBResult = this.buildVersionResult(versionB, resultsB);
    const testCaseComparisons = this.buildTestCaseComparisons(resultsA, resultsB);
    const comparison = this.buildComparisonStats(versionAResult, versionBResult, resultsA, resultsB);
    const winner = this.determineWinner(comparison, resultsA, resultsB);

    const result: VersionComparisonResult = {
      comparisonId,
      timestamp,
      versionA: versionAResult,
      versionB: versionBResult,
      comparison,
      winner,
      summary: '',
      testCaseComparisons,
    };

    result.summary = this.generateSummary(result);

    logger.info('Comparison complete', {
      comparisonId,
      winner,
      effectSize: comparison.effectSize,
      isSignificant: comparison.isSignificant,
    });

    return result;
  }

  /**
   * Calculate Cohen's d effect size between two score arrays.
   * Returns 0 if both arrays are empty or have zero pooled variance.
   */
  calculateEffectSize(scoresA: number[], scoresB: number[]): number {
    if (scoresA.length === 0 && scoresB.length === 0) {
      return 0;
    }

    const meanA = mean(scoresA);
    const meanB = mean(scoresB);
    const pooledStd = pooledStdDev(scoresA, scoresB);

    if (pooledStd === 0) {
      return 0;
    }

    return (meanB - meanA) / pooledStd;
  }

  /**
   * Calculate confidence in the comparison based on sample size and variance.
   * Higher sample sizes and lower variance produce higher confidence.
   */
  calculateConfidence(resultsA: TestCaseResult[], resultsB: TestCaseResult[]): number {
    const n = Math.min(resultsA.length, resultsB.length);
    if (n === 0) {
      return 0;
    }

    // Sample size factor: asymptotic approach to 1, reaching ~0.9 at n=50
    const sizeFactor = 1 - Math.exp(-n / 20);

    // Variance factor: lower combined variance = higher confidence
    const scoresA = resultsA.map(r => r.reasoningQuality);
    const scoresB = resultsB.map(r => r.reasoningQuality);
    const combinedVariance = (variance(scoresA) + variance(scoresB)) / 2;
    const varianceFactor = 1 / (1 + combinedVariance * 4);

    // Balance factor: penalize unequal sample sizes
    const balanceFactor = Math.min(resultsA.length, resultsB.length) /
      Math.max(resultsA.length, resultsB.length);

    const confidence = sizeFactor * varianceFactor * balanceFactor;
    return clamp(confidence, 0, 1);
  }

  /**
   * Generate a human-readable summary of the comparison.
   */
  generateSummary(result: VersionComparisonResult): string {
    const { versionA, versionB, comparison, winner } = result;
    const nameA = versionA.version.versionId;
    const nameB = versionB.version.versionId;

    const lines: string[] = [];

    if (winner === null) {
      lines.push(
        `No significant difference between ${nameA} and ${nameB}.`,
      );
    } else {
      const winnerName = winner === 'A' ? nameA : nameB;
      const effectLabel = effectSizeLabel(Math.abs(comparison.effectSize));
      lines.push(
        `${winnerName} is the winner with a ${effectLabel} effect size (d=${comparison.effectSize.toFixed(3)}).`,
      );
    }

    lines.push(
      `Pass rate: ${nameA}=${pct(versionA.passRate)} vs ${nameB}=${pct(versionB.passRate)} (diff: ${signedPct(comparison.passRateDiff)}).`,
    );
    lines.push(
      `Avg reasoning quality: ${nameA}=${versionA.avgReasoningQuality.toFixed(3)} vs ${nameB}=${versionB.avgReasoningQuality.toFixed(3)} (diff: ${signed(comparison.reasoningQualityDiff)}).`,
    );
    lines.push(
      `Confidence: ${pct(comparison.confidence)}.`,
    );

    return lines.join(' ');
  }

  /**
   * Generate a Markdown-formatted report of the comparison.
   */
  formatReport(result: VersionComparisonResult): string {
    const { versionA, versionB, comparison, winner, testCaseComparisons } = result;
    const nameA = versionA.version.versionId;
    const nameB = versionB.version.versionId;

    const lines: string[] = [];
    lines.push(`# Skill Version Comparison Report`);
    lines.push('');
    lines.push(`**Comparison ID:** ${result.comparisonId}`);
    lines.push(`**Skill:** ${versionA.version.skillName}`);
    lines.push(`**Date:** ${result.timestamp.toISOString()}`);
    lines.push(`**Winner:** ${winner ?? 'No significant difference'}`);
    lines.push('');

    // Summary
    lines.push(`## Summary`);
    lines.push('');
    lines.push(result.summary);
    lines.push('');

    // Metrics table
    lines.push(`## Metrics`);
    lines.push('');
    lines.push(`| Metric | ${nameA} | ${nameB} | Diff |`);
    lines.push(`|--------|---------|---------|------|`);
    lines.push(`| Pass Rate | ${pct(versionA.passRate)} | ${pct(versionB.passRate)} | ${signedPct(comparison.passRateDiff)} |`);
    lines.push(`| Avg Score | ${versionA.avgScore.toFixed(3)} | ${versionB.avgScore.toFixed(3)} | ${signed(comparison.scoreDiff)} |`);
    lines.push(`| Reasoning Quality | ${versionA.avgReasoningQuality.toFixed(3)} | ${versionB.avgReasoningQuality.toFixed(3)} | ${signed(comparison.reasoningQualityDiff)} |`);
    lines.push(`| Avg Execution (ms) | ${versionA.avgExecutionTimeMs.toFixed(0)} | ${versionB.avgExecutionTimeMs.toFixed(0)} | ${comparison.executionTimeDiff.toFixed(0)} |`);
    lines.push(`| Total Tokens | ${versionA.totalTokens} | ${versionB.totalTokens} | ${versionB.totalTokens - versionA.totalTokens} |`);
    lines.push('');

    // Statistics
    lines.push(`## Statistics`);
    lines.push('');
    lines.push(`| Statistic | Value |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Effect Size (Cohen's d) | ${comparison.effectSize.toFixed(4)} |`);
    lines.push(`| Significant | ${comparison.isSignificant ? 'Yes' : 'No'} |`);
    lines.push(`| Confidence | ${pct(comparison.confidence)} |`);
    lines.push('');

    // Per-test comparison
    if (testCaseComparisons.length > 0) {
      lines.push(`## Per-Test Comparison`);
      lines.push('');
      lines.push(`| Test ID | ${nameA} Score | ${nameB} Score | Diff | Winner |`);
      lines.push(`|---------|--------------|--------------|------|--------|`);
      for (const tc of testCaseComparisons) {
        lines.push(
          `| ${tc.testId} | ${tc.versionAResult.reasoningQuality.toFixed(3)} | ${tc.versionBResult.reasoningQuality.toFixed(3)} | ${signed(tc.scoreDiff)} | ${tc.winner} |`,
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private buildVersionResult(version: SkillVersion, results: TestCaseResult[]): VersionResult {
    const passed = results.filter(r => r.passed).length;
    const passRate = results.length > 0 ? passed / results.length : 0;
    const avgScore = mean(results.map(r => r.reasoningQuality));
    const avgReasoningQuality = avgScore;
    const executionTimes = results
      .map(r => r.executionTimeMs ?? 0)
      .filter(t => t > 0);
    const avgExecutionTimeMs = executionTimes.length > 0 ? mean(executionTimes) : 0;

    return {
      version,
      passRate,
      avgScore,
      avgReasoningQuality,
      avgExecutionTimeMs,
      totalTokens: 0,
      testCaseResults: results,
    };
  }

  private buildTestCaseComparisons(
    resultsA: TestCaseResult[],
    resultsB: TestCaseResult[],
  ): TestCaseComparison[] {
    const mapB = new Map(resultsB.map(r => [r.testId, r]));
    const comparisons: TestCaseComparison[] = [];

    for (const rA of resultsA) {
      const rB = mapB.get(rA.testId);
      if (!rB) {
        continue;
      }

      const scoreDiff = rB.reasoningQuality - rA.reasoningQuality;
      let winner: 'A' | 'B' | 'tie';
      if (Math.abs(scoreDiff) < SCORE_TIE_EPSILON) {
        winner = 'tie';
      } else {
        winner = scoreDiff > 0 ? 'B' : 'A';
      }

      comparisons.push({
        testId: rA.testId,
        versionAResult: rA,
        versionBResult: rB,
        scoreDiff,
        winner,
      });
    }

    return comparisons;
  }

  private buildComparisonStats(
    versionAResult: VersionResult,
    versionBResult: VersionResult,
    resultsA: TestCaseResult[],
    resultsB: TestCaseResult[],
  ): ComparisonStats {
    const scoresA = resultsA.map(r => r.reasoningQuality);
    const scoresB = resultsB.map(r => r.reasoningQuality);

    const effectSize = this.calculateEffectSize(scoresA, scoresB);
    const confidence = this.calculateConfidence(resultsA, resultsB);
    const sampleSufficient = Math.min(resultsA.length, resultsB.length) >= this.config.minTestCases;
    const isSignificant = sampleSufficient && Math.abs(effectSize) > this.config.significanceThreshold;

    return {
      passRateDiff: versionBResult.passRate - versionAResult.passRate,
      scoreDiff: versionBResult.avgScore - versionAResult.avgScore,
      reasoningQualityDiff: versionBResult.avgReasoningQuality - versionAResult.avgReasoningQuality,
      executionTimeDiff: versionBResult.avgExecutionTimeMs - versionAResult.avgExecutionTimeMs,
      isSignificant,
      effectSize,
      confidence,
    };
  }

  private determineWinner(
    comparison: ComparisonStats,
    resultsA: TestCaseResult[],
    resultsB: TestCaseResult[],
  ): 'A' | 'B' | null {
    if (!comparison.isSignificant) {
      return null;
    }

    if (Math.min(resultsA.length, resultsB.length) < this.config.minTestCases) {
      return null;
    }

    if (comparison.scoreDiff > 0) {
      return 'B';
    } else if (comparison.scoreDiff < 0) {
      return 'A';
    }

    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createVersionComparator(
  config?: Partial<VersionComparisonConfig>,
): VersionComparator {
  return new VersionComparator(config);
}

// ============================================================================
// Statistical helpers
// ============================================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

function pooledStdDev(a: number[], b: number[]): number {
  const nA = a.length;
  const nB = b.length;
  if (nA + nB < 2) return 0;

  const varA = variance(a);
  const varB = variance(b);

  const pooledVar = ((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2);
  return Math.sqrt(pooledVar);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function effectSizeLabel(d: number): string {
  if (d < 0.2) return 'negligible';
  if (d < 0.5) return 'small';
  if (d < 0.8) return 'medium';
  return 'large';
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signedPct = (v: number) => { const s = pct(v); return v > 0 ? `+${s}` : s; };
const signed = (v: number) => { const s = v.toFixed(3); return v > 0 ? `+${s}` : s; };
