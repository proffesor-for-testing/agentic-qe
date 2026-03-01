/**
 * RVCOWBranchManager - RVCOW Branching for Reversible Dream Cycles
 * ADR-069: RVCOW Dream Cycle Branching
 *
 * Implements Copy-on-Write branching semantics using SQLite savepoints.
 * Each dream cycle operates on an isolated branch (savepoint). After the
 * dream completes, the branch is validated against quality thresholds.
 * If validation passes, the savepoint is released (changes persist).
 * If validation fails, the savepoint is rolled back (changes discarded).
 *
 * This gives us the same semantics as native RVCOW:
 *   - createBranch  -> SAVEPOINT
 *   - mergeBranch   -> RELEASE SAVEPOINT
 *   - discardBranch -> ROLLBACK TO SAVEPOINT
 *
 * @module learning/dream/rvcow-branch-manager
 */

import type { Database as DatabaseType } from 'better-sqlite3';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Represents an active RVCOW branch backed by a SQLite savepoint.
 */
export interface Branch {
  /** Unique branch name (also the savepoint name) */
  name: string;

  /** When the branch was created */
  createdAt: Date;

  /** Current status */
  status: 'active' | 'merged' | 'discarded';

  /** Snapshot of pattern metrics at branch creation time */
  baselineSnapshot: QualityBaseline;
}

/**
 * Quality baseline captured before a dream cycle.
 * Used to validate that the dream did not degrade knowledge quality.
 */
export interface QualityBaseline {
  /** Total number of patterns */
  patternCount: number;

  /** Average confidence across all patterns */
  avgConfidence: number;

  /** Number of high-confidence patterns (confidence >= 0.8) */
  highConfidenceCount: number;

  /** Timestamp of baseline capture */
  capturedAt: Date;
}

/**
 * Result of validating a branch against a quality baseline.
 */
export interface ValidationResult {
  /** Whether the branch passed validation */
  passed: boolean;

  /** Human-readable reason */
  reason: string;

  /** Delta in pattern count (positive = patterns added) */
  patternCountDelta: number;

  /** Delta in average confidence */
  avgConfidenceDelta: number;

  /** Number of high-confidence patterns that were lost */
  highConfidenceLost: number;

  /** Post-dream metrics for comparison */
  postDreamMetrics: QualityBaseline;
}

/**
 * Thresholds for dream branch validation.
 */
export interface ValidationThresholds {
  /** Maximum allowed decrease in pattern count (as fraction). Default: 0.05 (5%) */
  maxPatternCountDrop: number;

  /** Maximum allowed decrease in average confidence. Default: 0.02 */
  maxAvgConfidenceDrop: number;

  /** Maximum fraction of high-confidence patterns that can be lost. Default: 0.05 (5%) */
  maxHighConfidenceLoss: number;
}

/** Default validation thresholds */
export const DEFAULT_VALIDATION_THRESHOLDS: ValidationThresholds = {
  maxPatternCountDrop: 0.05,
  maxAvgConfidenceDrop: 0.02,
  maxHighConfidenceLoss: 0.05,
};

/**
 * Events emitted by the branch manager.
 */
export type BranchEvent =
  | 'dream:branch_created'
  | 'dream:branch_merged'
  | 'dream:branch_discarded';

export type BranchEventListener = (event: BranchEvent, branch: Branch, detail?: ValidationResult) => void;

// ============================================================================
// RVCOWBranchManager
// ============================================================================

/**
 * Manages RVCOW branches for dream cycles using SQLite savepoints.
 *
 * Usage:
 * ```typescript
 * const manager = new RVCOWBranchManager(db);
 * const branch = manager.createBranch('dream-123');
 * // ... run dream logic ...
 * const result = manager.validateBranch(branch, baseline);
 * if (result.passed) {
 *   manager.mergeBranch(branch);
 * } else {
 *   manager.discardBranch(branch);
 * }
 * ```
 */
export class RVCOWBranchManager {
  private activeBranches: Map<string, Branch> = new Map();
  private listeners: BranchEventListener[] = [];

  /** Optional RVF native adapter for COW fork snapshots of dream state */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rvfAdapter?: any;

  /** When true and rvfAdapter is set, createBranch() also forks an RVF snapshot */
  private useRvfFork = false;

  constructor(
    private readonly db: DatabaseType,
    private readonly thresholds: ValidationThresholds = DEFAULT_VALIDATION_THRESHOLDS,
  ) {}

  /**
   * Set an RVF native adapter for supplementary COW fork snapshots.
   * When set with useRvfFork=true, createBranch() will additionally
   * fork a portable .rvf snapshot alongside the SQLite savepoint.
   * SQLite savepoints remain the primary branching mechanism.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRvfAdapter(adapter: any, useRvfFork = true): void {
    this.rvfAdapter = adapter;
    this.useRvfFork = useRvfFork;
  }

  // --------------------------------------------------------------------------
  // Branch Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Create a new RVCOW branch by issuing a SQLite SAVEPOINT.
   * Captures a quality baseline snapshot before the savepoint.
   *
   * @param name - Unique branch name (used as savepoint identifier)
   * @returns The created Branch
   * @throws If a branch with this name already exists
   */
  createBranch(name: string): Branch {
    if (this.activeBranches.has(name)) {
      throw new Error(`Branch '${name}' already exists`);
    }

    // Sanitize name for use as savepoint identifier
    const safeName = this.sanitizeSavepointName(name);

    // Capture baseline before creating savepoint
    const baseline = this.captureBaseline();

    // Create SQLite savepoint
    this.db.exec(`SAVEPOINT "${safeName}"`);

    const branch: Branch = {
      name,
      createdAt: new Date(),
      status: 'active',
      baselineSnapshot: baseline,
    };

    // Supplementary RVF fork for portable brain snapshots (when configured)
    if (this.rvfAdapter && this.useRvfFork) {
      try {
        this.rvfAdapter.fork(`/tmp/dream-branch-${name}.rvf`);
      } catch {
        // RVF fork is best-effort — SQLite savepoint is the primary mechanism
      }
    }

    this.activeBranches.set(name, branch);
    this.emit('dream:branch_created', branch);

    return branch;
  }

  /**
   * Validate a branch by comparing post-dream metrics against the baseline.
   *
   * Checks:
   * 1. Pattern count did not decrease beyond threshold
   * 2. Average confidence did not drop beyond threshold
   * 3. No excessive high-confidence patterns were quarantined/removed
   *
   * @param branch - The branch to validate
   * @param baseline - The quality baseline to validate against (defaults to branch's own baseline)
   * @returns Validation result with pass/fail and metrics
   */
  validateBranch(branch: Branch, baseline?: QualityBaseline): ValidationResult {
    this.ensureBranchActive(branch.name);

    const base = baseline ?? branch.baselineSnapshot;
    const current = this.captureBaseline();

    const patternCountDelta = current.patternCount - base.patternCount;
    const avgConfidenceDelta = current.avgConfidence - base.avgConfidence;
    const highConfidenceLost = base.highConfidenceCount - current.highConfidenceCount;

    const reasons: string[] = [];
    let passed = true;

    // Check 1: Pattern count did not decrease excessively
    if (base.patternCount > 0) {
      const dropFraction = -patternCountDelta / base.patternCount;
      if (dropFraction > this.thresholds.maxPatternCountDrop) {
        passed = false;
        reasons.push(
          `Pattern count dropped by ${(dropFraction * 100).toFixed(1)}% ` +
          `(threshold: ${(this.thresholds.maxPatternCountDrop * 100).toFixed(1)}%)`
        );
      }
    }

    // Check 2: Average confidence did not drop excessively
    if (avgConfidenceDelta < -this.thresholds.maxAvgConfidenceDrop) {
      passed = false;
      reasons.push(
        `Avg confidence dropped by ${(-avgConfidenceDelta).toFixed(4)} ` +
        `(threshold: ${this.thresholds.maxAvgConfidenceDrop})`
      );
    }

    // Check 3: High-confidence patterns not excessively quarantined
    if (base.highConfidenceCount > 0 && highConfidenceLost > 0) {
      const lossFraction = highConfidenceLost / base.highConfidenceCount;
      if (lossFraction > this.thresholds.maxHighConfidenceLoss) {
        passed = false;
        reasons.push(
          `${highConfidenceLost} high-confidence patterns lost ` +
          `(${(lossFraction * 100).toFixed(1)}%, threshold: ${(this.thresholds.maxHighConfidenceLoss * 100).toFixed(1)}%)`
        );
      }
    }

    const reason = passed
      ? 'All quality checks passed'
      : `Validation failed: ${reasons.join('; ')}`;

    return {
      passed,
      reason,
      patternCountDelta,
      avgConfidenceDelta,
      highConfidenceLost: Math.max(0, highConfidenceLost),
      postDreamMetrics: current,
    };
  }

  /**
   * Merge a branch by releasing its savepoint.
   * All changes made within the branch become permanent.
   *
   * @param branch - The branch to merge
   */
  mergeBranch(branch: Branch): void {
    this.ensureBranchActive(branch.name);

    const safeName = this.sanitizeSavepointName(branch.name);
    this.db.exec(`RELEASE SAVEPOINT "${safeName}"`);

    branch.status = 'merged';
    this.activeBranches.delete(branch.name);
    this.emit('dream:branch_merged', branch);
  }

  /**
   * Discard a branch by rolling back to its savepoint.
   * All changes made within the branch are undone.
   *
   * @param branch - The branch to discard
   */
  discardBranch(branch: Branch): void {
    this.ensureBranchActive(branch.name);

    const safeName = this.sanitizeSavepointName(branch.name);
    // ROLLBACK TO keeps the savepoint active, so we release it after
    this.db.exec(`ROLLBACK TO SAVEPOINT "${safeName}"`);
    this.db.exec(`RELEASE SAVEPOINT "${safeName}"`);

    branch.status = 'discarded';
    this.activeBranches.delete(branch.name);
    this.emit('dream:branch_discarded', branch);
  }

  /**
   * List all active branches.
   */
  listBranches(): Branch[] {
    return Array.from(this.activeBranches.values());
  }

  // --------------------------------------------------------------------------
  // Event System
  // --------------------------------------------------------------------------

  /**
   * Register a listener for branch events.
   */
  onEvent(listener: BranchEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a previously registered listener.
   */
  offEvent(listener: BranchEventListener): void {
    const idx = this.listeners.indexOf(listener);
    if (idx >= 0) {
      this.listeners.splice(idx, 1);
    }
  }

  // --------------------------------------------------------------------------
  // Quality Baseline Capture
  // --------------------------------------------------------------------------

  /**
   * Capture a quality baseline from the current state of qe_patterns.
   */
  captureBaseline(): QualityBaseline {
    const countRow = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM qe_patterns'
    ).get() as { cnt: number } | undefined;

    const avgRow = this.db.prepare(
      'SELECT AVG(confidence) as avg_conf FROM qe_patterns'
    ).get() as { avg_conf: number | null } | undefined;

    const highRow = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM qe_patterns WHERE confidence >= 0.8'
    ).get() as { cnt: number } | undefined;

    return {
      patternCount: countRow?.cnt ?? 0,
      avgConfidence: avgRow?.avg_conf ?? 0,
      highConfidenceCount: highRow?.cnt ?? 0,
      capturedAt: new Date(),
    };
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private ensureBranchActive(name: string): void {
    const branch = this.activeBranches.get(name);
    if (!branch) {
      throw new Error(`Branch '${name}' not found or not active`);
    }
    if (branch.status !== 'active') {
      throw new Error(`Branch '${name}' is ${branch.status}, not active`);
    }
  }

  private sanitizeSavepointName(name: string): string {
    // Replace non-alphanumeric characters (except hyphens/underscores) with underscores
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private emit(event: BranchEvent, branch: Branch, detail?: ValidationResult): void {
    for (const listener of this.listeners) {
      try {
        listener(event, branch, detail);
      } catch {
        // Swallow listener errors to avoid breaking the branch lifecycle
      }
    }
  }
}
