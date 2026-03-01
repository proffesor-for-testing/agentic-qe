/**
 * SpeculativeDreamer - Parallel Dream Strategies with Branch Selection
 * ADR-069: RVCOW Dream Cycle Branching
 *
 * Runs 2-3 dream strategies in parallel RVCOW branches, each with
 * different parameters (decay rates, spread factors, noise levels).
 * After all strategies complete, compares validation scores and merges
 * the best-performing branch. All other branches are discarded.
 *
 * This implements the "adversarial dream" concept from the Six Thinking
 * Hats analysis, where diverse strategies compete and the best wins.
 *
 * @module v3/learning/dream/speculative-dreamer
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import type { ActivationConfig } from './spreading-activation.js';
import {
  RVCOWBranchManager,
  type Branch,
  type QualityBaseline,
  type ValidationResult,
  type ValidationThresholds,
  DEFAULT_VALIDATION_THRESHOLDS,
} from './rvcow-branch-manager.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A named dream strategy with custom activation parameters.
 */
export interface DreamStrategy {
  /** Human-readable strategy name */
  name: string;

  /** Custom activation config overrides */
  activationConfig: Partial<ActivationConfig>;

  /** Optional description of the strategy's approach */
  description?: string;
}

/**
 * Result of a single speculative dream branch.
 */
export interface StrategyResult {
  /** The strategy that was executed */
  strategy: DreamStrategy;

  /** The branch used */
  branch: Branch;

  /** Validation result against baseline */
  validation: ValidationResult;

  /** Whether this strategy was selected as the winner */
  selected: boolean;

  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Result of the full speculative dreaming process.
 */
export interface SpeculativeDreamResult {
  /** All strategy results, including winner and losers */
  strategies: StrategyResult[];

  /** The winning strategy (or null if all failed validation) */
  winner: StrategyResult | null;

  /** Total wall-clock time */
  totalDurationMs: number;
}

/**
 * Callback that executes a dream cycle with the given activation config.
 * The implementation should use the provided config overrides when running
 * spreading activation. It returns the number of insights generated.
 */
export type DreamExecutor = (
  activationConfigOverrides: Partial<ActivationConfig>,
) => Promise<number>;

// ============================================================================
// Built-in Strategies
// ============================================================================

/**
 * Predefined dream strategies with different parameter profiles.
 */
export const BUILT_IN_STRATEGIES: DreamStrategy[] = [
  {
    name: 'aggressive-exploration',
    description: 'High noise, fast decay -- explores widely but forgets quickly',
    activationConfig: {
      decayRate: 0.2,
      spreadFactor: 0.7,
      noiseLevel: 0.15,
      maxIterations: 30,
    },
  },
  {
    name: 'conservative-consolidation',
    description: 'Low noise, slow decay -- strengthens existing associations',
    activationConfig: {
      decayRate: 0.05,
      spreadFactor: 0.3,
      noiseLevel: 0.02,
      maxIterations: 15,
    },
  },
  {
    name: 'balanced-discovery',
    description: 'Moderate parameters -- balanced between exploration and consolidation',
    activationConfig: {
      decayRate: 0.1,
      spreadFactor: 0.5,
      noiseLevel: 0.05,
      maxIterations: 20,
    },
  },
];

// ============================================================================
// SpeculativeDreamer
// ============================================================================

/**
 * Runs multiple dream strategies in separate RVCOW branches and selects the best.
 *
 * Because SQLite savepoints are sequential (not truly parallel), strategies
 * are executed one at a time but each in its own savepoint. The branch manager
 * ensures that failed strategies leave no trace in the database.
 *
 * @example
 * ```typescript
 * const dreamer = new SpeculativeDreamer(db);
 * const result = await dreamer.dream(
 *   BUILT_IN_STRATEGIES,
 *   async (configOverrides) => {
 *     // Run dream with configOverrides applied
 *     return insightCount;
 *   }
 * );
 * if (result.winner) {
 *   console.log(`Best strategy: ${result.winner.strategy.name}`);
 * }
 * ```
 */
export class SpeculativeDreamer {
  private readonly branchManager: RVCOWBranchManager;

  constructor(
    private readonly db: DatabaseType,
    thresholds?: ValidationThresholds,
  ) {
    this.branchManager = new RVCOWBranchManager(db, thresholds ?? DEFAULT_VALIDATION_THRESHOLDS);
  }

  /**
   * Run multiple dream strategies sequentially in separate RVCOW branches,
   * then merge the best-performing one and discard the rest.
   *
   * Strategy execution flow:
   * 1. Capture baseline before any strategy runs
   * 2. For each strategy:
   *    a. Create branch (SAVEPOINT)
   *    b. Execute dream with strategy params
   *    c. Validate branch against baseline
   *    d. Discard branch (ROLLBACK) -- we keep results in memory only
   * 3. Replay the winning strategy in a final branch and merge it
   *
   * Note: Because we must discard each branch before starting the next
   * (SQLite savepoint semantics), the winning strategy is re-executed
   * in step 3. This is acceptable because dream cycles are deterministic
   * given the same input state and parameters.
   *
   * @param strategies - 2-3 strategies to compete
   * @param executor - Callback that runs the dream with given config
   * @returns Result with winner and all strategy details
   */
  async dream(
    strategies: DreamStrategy[],
    executor: DreamExecutor,
  ): Promise<SpeculativeDreamResult> {
    if (strategies.length < 1) {
      throw new Error('At least one strategy is required');
    }
    if (strategies.length > 5) {
      throw new Error('Maximum 5 strategies allowed to limit resource usage');
    }

    const totalStart = Date.now();
    const baseline = this.branchManager.captureBaseline();
    const results: StrategyResult[] = [];

    // Execute each strategy in its own branch, collect validation results
    for (const strategy of strategies) {
      const result = await this.executeStrategy(strategy, baseline, executor);
      results.push(result);
    }

    // Find the best passing strategy
    const passingResults = results.filter(r => r.validation.passed);
    let winner: StrategyResult | null = null;

    if (passingResults.length > 0) {
      // Score strategies: prefer higher confidence delta, then more patterns
      winner = passingResults.reduce((best, current) => {
        const bestScore = this.scoreValidation(best.validation);
        const currentScore = this.scoreValidation(current.validation);
        return currentScore > bestScore ? current : best;
      });

      // Re-execute the winning strategy and merge it
      const finalBranch = this.branchManager.createBranch(
        `dream-final-${winner.strategy.name}-${Date.now()}`
      );

      try {
        await executor(winner.strategy.activationConfig);
        this.branchManager.mergeBranch(finalBranch);
        winner.selected = true;
      } catch {
        // If re-execution fails, discard and report no winner
        this.branchManager.discardBranch(finalBranch);
        winner.selected = false;
        winner = null;
      }
    }

    return {
      strategies: results,
      winner,
      totalDurationMs: Date.now() - totalStart,
    };
  }

  /**
   * Get the underlying branch manager (for event subscription).
   */
  getBranchManager(): RVCOWBranchManager {
    return this.branchManager;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Execute a single strategy in a branch, validate, then discard.
   * We discard because we need to try all strategies from the same baseline.
   */
  private async executeStrategy(
    strategy: DreamStrategy,
    baseline: QualityBaseline,
    executor: DreamExecutor,
  ): Promise<StrategyResult> {
    const branchName = `dream-spec-${strategy.name}-${Date.now()}`;
    const branch = this.branchManager.createBranch(branchName);
    const start = Date.now();

    try {
      await executor(strategy.activationConfig);
      const validation = this.branchManager.validateBranch(branch, baseline);

      // Discard so next strategy starts from same baseline
      this.branchManager.discardBranch(branch);

      return {
        strategy,
        branch,
        validation,
        selected: false,
        durationMs: Date.now() - start,
      };
    } catch {
      // Dream execution failed -- discard and mark as failed
      this.branchManager.discardBranch(branch);

      return {
        strategy,
        branch,
        validation: {
          passed: false,
          reason: 'Dream execution threw an error',
          patternCountDelta: 0,
          avgConfidenceDelta: 0,
          highConfidenceLost: 0,
          postDreamMetrics: baseline,
        },
        selected: false,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Score a validation result for comparison.
   * Higher score = better dream result.
   */
  private scoreValidation(v: ValidationResult): number {
    // Weighted scoring: confidence improvement matters most,
    // then pattern growth, penalize high-confidence loss
    return (
      v.avgConfidenceDelta * 100 +
      v.patternCountDelta * 0.1 -
      v.highConfidenceLost * 5
    );
  }
}
