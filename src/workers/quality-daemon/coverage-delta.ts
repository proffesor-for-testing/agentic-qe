/**
 * IMP-10: QE Quality Daemon — Coverage Delta Analysis
 *
 * Compares current coverage with previous snapshot to identify:
 * - Newly uncovered lines in changed files
 * - Coverage regressions
 * - Coverage gaps exceeding configurable thresholds
 *
 * Enqueues test suggestion tasks when gaps exceed threshold.
 */

import type { WorkerMemory } from '../interfaces';
import type { PriorityQueue, CoverageDeltaPayload, QueueItem, DaemonTaskPayload } from './priority-queue';

export interface CoverageSnapshot {
  readonly timestamp: number;
  readonly overall: CoverageMetrics;
  readonly files: Record<string, FileCoverage>;
}

export interface CoverageMetrics {
  readonly line: number;
  readonly branch: number;
  readonly function: number;
  readonly statement: number;
}

export interface FileCoverage {
  readonly line: number;
  readonly branch: number;
  readonly uncoveredLines: number[];
  readonly totalLines: number;
}

export interface CoverageDeltaResult {
  readonly regressionDetected: boolean;
  readonly overallDelta: CoverageMetrics;
  readonly affectedFiles: FileDelta[];
  readonly newGaps: CoverageGap[];
}

export interface FileDelta {
  readonly file: string;
  readonly lineDelta: number;
  readonly branchDelta: number;
  readonly newUncoveredLines: number[];
}

export interface CoverageGap {
  readonly file: string;
  readonly uncoveredLines: number[];
  readonly currentCoverage: number;
  readonly riskScore: number;
}

export interface CoverageDeltaOptions {
  /** Line coverage drop threshold to flag as regression (percentage points) */
  regressionThreshold?: number;
  /** Minimum file coverage to avoid flagging as a gap */
  gapThreshold?: number;
  /** Key prefix in worker memory for snapshots */
  memoryPrefix?: string;
}

const DEFAULTS: Required<CoverageDeltaOptions> = {
  regressionThreshold: 2,
  gapThreshold: 60,
  memoryPrefix: 'quality-daemon:coverage',
};

export class CoverageDeltaAnalyzer {
  private options: Required<CoverageDeltaOptions>;

  constructor(
    private readonly queue: PriorityQueue,
    options?: CoverageDeltaOptions
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Analyze coverage delta between the current and previous snapshot.
   * Stores the current snapshot and enqueues test suggestions if needed.
   */
  async analyze(
    current: CoverageSnapshot,
    memory: WorkerMemory,
    changedFiles?: string[]
  ): Promise<CoverageDeltaResult> {
    const previousRaw = await memory.get<CoverageSnapshot>(
      `${this.options.memoryPrefix}:snapshot`
    );

    // Store current snapshot for next comparison
    await memory.set(`${this.options.memoryPrefix}:snapshot`, current);

    if (!previousRaw) {
      return {
        regressionDetected: false,
        overallDelta: { line: 0, branch: 0, function: 0, statement: 0 },
        affectedFiles: [],
        newGaps: [],
      };
    }

    const previous = previousRaw;

    const overallDelta: CoverageMetrics = {
      line: current.overall.line - previous.overall.line,
      branch: current.overall.branch - previous.overall.branch,
      function: current.overall.function - previous.overall.function,
      statement: current.overall.statement - previous.overall.statement,
    };

    const regressionDetected =
      overallDelta.line < -this.options.regressionThreshold ||
      overallDelta.branch < -this.options.regressionThreshold;

    // Compute per-file deltas
    const filesToCheck = changedFiles ?? Object.keys(current.files);
    const affectedFiles: FileDelta[] = [];
    const newGaps: CoverageGap[] = [];

    for (const file of filesToCheck) {
      const curr = current.files[file];
      const prev = previous.files[file];

      if (!curr) continue;

      const lineDelta = prev ? curr.line - prev.line : 0;
      const branchDelta = prev ? curr.branch - prev.branch : 0;

      const newUncovered = prev
        ? curr.uncoveredLines.filter((l) => !prev.uncoveredLines.includes(l))
        : curr.uncoveredLines;

      if (lineDelta !== 0 || branchDelta !== 0 || newUncovered.length > 0) {
        affectedFiles.push({ file, lineDelta, branchDelta, newUncoveredLines: newUncovered });
      }

      if (curr.line < this.options.gapThreshold) {
        const riskScore = this.computeRiskScore(curr, newUncovered.length);
        newGaps.push({
          file,
          uncoveredLines: curr.uncoveredLines,
          currentCoverage: curr.line,
          riskScore,
        });
      }
    }

    // Enqueue test suggestion if regression or new gaps found
    if (regressionDetected || newGaps.length > 0) {
      this.enqueueTestSuggestion(current, previous, newGaps);
    }

    // Store delta result
    await memory.set(`${this.options.memoryPrefix}:delta`, {
      timestamp: Date.now(),
      overallDelta,
      regressionDetected,
      affectedFileCount: affectedFiles.length,
      gapCount: newGaps.length,
    });

    return { regressionDetected, overallDelta, affectedFiles, newGaps };
  }

  /**
   * Build a CoverageSnapshot from raw lcov/istanbul data stored in memory.
   */
  async buildSnapshot(memory: WorkerMemory): Promise<CoverageSnapshot | undefined> {
    const latest = await memory.get<{
      line: number;
      branch: number;
      function: number;
      statement: number;
      files?: Record<string, FileCoverage>;
    }>('coverage:latest');

    if (!latest) return undefined;

    return {
      timestamp: Date.now(),
      overall: {
        line: latest.line,
        branch: latest.branch,
        function: latest.function,
        statement: latest.statement,
      },
      files: latest.files ?? {},
    };
  }

  // ============================================================================
  // Private
  // ============================================================================

  private computeRiskScore(coverage: FileCoverage, newUncoveredCount: number): number {
    // Higher risk = lower coverage + more new uncovered lines
    // Clamp coverage to [0, 100] to prevent negative risk scores
    const clampedCoverage = Math.min(100, Math.max(0, coverage.line));
    const coverageFactor = 1 - clampedCoverage / 100;
    const uncoveredFactor = Math.min(newUncoveredCount / 50, 1);
    return Math.min(1, coverageFactor * 0.6 + uncoveredFactor * 0.4);
  }

  private enqueueTestSuggestion(
    current: CoverageSnapshot,
    previous: CoverageSnapshot,
    gaps: CoverageGap[]
  ): void {
    const payload: CoverageDeltaPayload = {
      type: 'coverage_delta',
      previousSnapshot: `snapshot-${previous.timestamp}`,
      currentSnapshot: `snapshot-${current.timestamp}`,
    };

    const item: QueueItem<DaemonTaskPayload> = {
      id: `coverage-delta-${Date.now()}`,
      priority: gaps.some((g) => g.riskScore > 0.8) ? 'now' : 'next',
      payload,
      createdAt: Date.now(),
      source: 'coverage-delta',
      ttlMs: 10 * 60 * 1000, // 10 min TTL
    };

    this.queue.enqueue(item);
  }
}
