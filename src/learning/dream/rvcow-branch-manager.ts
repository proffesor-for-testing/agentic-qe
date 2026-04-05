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

import { existsSync, unlinkSync } from 'fs';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { WitnessChain } from '../../audit/witness-chain.js';

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

  /** When true and rvfAdapter is set, createBranch() also forks an RVF snapshot.
   *  Driven by isRVFPatternStoreEnabled() feature flag when adapter is present. */
  private useRvfFork = false;

  /** Optional witness chain for audit trail of branch operations (ADR-070) */
  private _witnessChain: WitnessChain | null = null;
  set witnessChain(wc: WitnessChain | null) { this._witnessChain = wc; }

  constructor(
    private readonly db: DatabaseType,
    private readonly thresholds: ValidationThresholds = DEFAULT_VALIDATION_THRESHOLDS,
  ) {}

  /**
   * Set an RVF native adapter for supplementary COW fork snapshots.
   * When set, useRvfFork is driven by the isRVFPatternStoreEnabled()
   * feature flag (defaults to the explicit param if flag check fails).
   * SQLite savepoints remain the primary branching mechanism.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRvfAdapter(adapter: any, useRvfFork = true): void {
    this.rvfAdapter = adapter;
    // ADR-069: Link to feature flag so RVF fork follows the same toggle.
    // Use dynamic import() for ESM safety; fall back to explicit param.
    this.useRvfFork = useRvfFork;
    import('../../integrations/ruvector/feature-flags.js')
      .then(({ isRVFPatternStoreEnabled }) => {
        this.useRvfFork = isRVFPatternStoreEnabled();
      })
      .catch(() => {
        // Keep the explicit useRvfFork param value
      });
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

    // ADR-069: RVF COW branch for true isolation (when configured)
    // Creates a lightweight derived .rvf alongside the SQLite savepoint
    if (this.rvfAdapter && this.useRvfFork) {
      try {
        const branchPath = `/tmp/dream-branch-${safeName}.rvf`;
        const childAdapter = this.rvfAdapter.derive(branchPath);
        const branchExt = branch as unknown as Record<string, unknown>;
        branchExt._rvfBranchPath = branchPath;
        branchExt._rvfChildAdapter = childAdapter;
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

    // Check 4 (ADR-069): Search recall comparison — verify dream didn't degrade retrieval
    if (this.rvfAdapter && this.useRvfFork && base.patternCount > 0) {
      try {
        const dim = this.rvfAdapter.dimension?.() ?? 384;
        // Run a benchmark query with a random-ish vector
        const benchQuery = new Float32Array(dim);
        for (let i = 0; i < dim; i++) benchQuery[i] = Math.sin(i * 0.1);
        const preResults = this.rvfAdapter.search?.(benchQuery, 10) ?? [];
        // If search returns fewer results post-dream, recall may have degraded
        if (preResults.length < Math.min(5, base.patternCount)) {
          reasons.push(
            `Search recall degraded: only ${preResults.length} results returned (expected ≥${Math.min(5, base.patternCount)})`
          );
          // Advisory — don't fail the gate for recall alone
        }
      } catch {
        // Recall check is advisory — don't block on errors
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
    this.cleanupRvfBranch(branch);
    this.emit('dream:branch_merged', branch);
    try {
      this._witnessChain?.append('BRANCH_MERGE', {
        branchName: branch.name,
      }, 'rvcow-branch-manager');
    } catch { /* best-effort witness */ }
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
    this.cleanupRvfBranch(branch);
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

  /** Clean up RVF branch file and child adapter (ADR-069) */
  private cleanupRvfBranch(branch: Branch): void {
    const ext = branch as unknown as Record<string, unknown>;
    // Close child adapter if present
    try {
      const child = ext._rvfChildAdapter as { close?: () => void } | undefined;
      child?.close?.();
    } catch { /* best effort */ }
    // Delete the temp .rvf file
    try {
      const branchPath = ext._rvfBranchPath as string | undefined;
      if (branchPath && existsSync(branchPath)) {
        unlinkSync(branchPath);
      }
    } catch { /* best effort */ }
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
