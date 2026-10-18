/**
 * SpeculativeDreamer - Competing Dream Strategies, Best One Committed
 * ADR-069 (reworked for #1060)
 *
 * Runs 2-3 dream strategies, each with different parameters (decay rates,
 * spread factors, noise levels), scores their results and commits only the
 * best one. All others are dropped.
 *
 * This implements the "adversarial dream" concept from the Six Thinking
 * Hats analysis, where diverse strategies compete and the best wins.
 *
 * #1060: each strategy runs as `DreamEngine.dream(…, { commit: false })`,
 * which computes the dream in memory and writes nothing. The winner is then
 * written with `DreamEngine.commitDreamResult()`, the same single synchronous
 * transaction a normal dream commits with. No SAVEPOINT is held across an
 * `await`, so foreground writes on the shared connection are never rolled
 * back with a losing strategy. (Before #1060 each strategy ran inside an RVCOW
 * savepoint on the shared connection, and the winner was re-executed.)
 *
 * @module learning/dream/speculative-dreamer
 */

import type { ActivationConfig } from './spreading-activation.js';
import type { DreamEngine, DreamCycleResult } from './dream-engine.js';
import { toErrorMessage } from '../../shared/error-utils.js';

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
 * Result of a single speculative dream strategy.
 */
export interface StrategyResult {
  /** The strategy that was executed */
  strategy: DreamStrategy;

  /** The strategy's dream result (null if the dream failed) */
  result: DreamCycleResult | null;

  /** Score used to pick the winner (higher is better; -Infinity on failure) */
  score: number;

  /** Why the dream failed, if it did */
  error?: string;

  /** Whether this strategy was selected and committed */
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

  /** The committed strategy (or null if every strategy failed) */
  winner: StrategyResult | null;

  /** Total wall-clock time */
  totalDurationMs: number;

  /** How long the winner's commit transaction took, in ms */
  commitDurationMs?: number;
}

/** Options for SpeculativeDreamer.dream(). */
export interface SpeculativeDreamOptions {
  /** Duration of each strategy's dream (default: the engine's maxDurationMs) */
  durationMs?: number;
}

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
 * Runs multiple dream strategies against one DreamEngine and commits the best.
 *
 * Strategies run one at a time (an engine runs one dream at a time). Each
 * computes its dream in memory without writing; only the winner is committed.
 *
 * @example
 * ```typescript
 * const dreamer = new SpeculativeDreamer(engine);
 * const result = await dreamer.dream(BUILT_IN_STRATEGIES, { durationMs: 5000 });
 * if (result.winner) {
 *   console.log(`Best strategy: ${result.winner.strategy.name}`);
 * }
 * ```
 */
export class SpeculativeDreamer {
  constructor(private readonly engine: DreamEngine) {}

  /**
   * Run each strategy without committing, then commit the best-scoring one.
   *
   * @param strategies - 1-5 strategies to compete
   * @param options - Per-strategy dream duration
   * @returns Result with winner and all strategy details
   */
  async dream(
    strategies: DreamStrategy[],
    options: SpeculativeDreamOptions = {},
  ): Promise<SpeculativeDreamResult> {
    if (strategies.length < 1) {
      throw new Error('At least one strategy is required');
    }
    if (strategies.length > 5) {
      throw new Error('Maximum 5 strategies allowed to limit resource usage');
    }

    const totalStart = Date.now();
    const results: StrategyResult[] = [];
    for (const strategy of strategies) {
      results.push(await this.executeStrategy(strategy, options.durationMs));
    }

    let winner: StrategyResult | null = null;
    for (const candidate of results) {
      if (candidate.result && (!winner || candidate.score > winner.score)) winner = candidate;
    }

    let commitDurationMs: number | undefined;
    if (winner?.result) {
      try {
        commitDurationMs = this.engine.commitDreamResult(winner.result);
        winner.selected = true;
      } catch (error) {
        winner.error = toErrorMessage(error);
        winner = null;
      }
    }

    return {
      strategies: results,
      winner,
      totalDurationMs: Date.now() - totalStart,
      commitDurationMs,
    };
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /** Run one strategy without committing anything. */
  private async executeStrategy(
    strategy: DreamStrategy,
    durationMs: number | undefined,
  ): Promise<StrategyResult> {
    const start = Date.now();
    try {
      const result = await this.engine.dream(durationMs, {
        activationConfig: strategy.activationConfig,
        commit: false,
      });
      return {
        strategy,
        result,
        score: this.scoreResult(result),
        selected: false,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        strategy,
        result: null,
        score: Number.NEGATIVE_INFINITY,
        error: toErrorMessage(error),
        selected: false,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Score a strategy's dream. Higher = better: insights weighted by their
   * confidence and novelty, then the novel associations found.
   */
  private scoreResult(result: DreamCycleResult): number {
    const insightScore = result.insights.reduce(
      (sum, insight) => sum + insight.confidenceScore * insight.noveltyScore,
      0,
    );
    return insightScore + result.cycle.associationsFound * 0.01;
  }
}
