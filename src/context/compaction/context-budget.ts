/**
 * Agentic QE v3 - Context Budget Tracker (IMP-08)
 *
 * Tracks estimated token usage across a session and transitions through
 * 5 operational states based on remaining budget. Emits events on state
 * transitions so the CompactionPipeline can auto-trigger appropriate tiers.
 *
 * States (by remaining tokens):
 *   Normal      > 25_000   -- No action needed
 *   Warning     <= 25_000  -- Advisory only
 *   Pressure    <= 18_000  -- Tier 1 (microcompact) runs proactively
 *   AutoCompact <= 13_000  -- Tier 2/3 auto-triggered
 *   Blocking    <= 3_000   -- Tier 4 reactive, blocks new tool calls
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export type BudgetState = 'normal' | 'warning' | 'pressure' | 'auto-compact' | 'blocking';

export interface BudgetTransition {
  from: BudgetState;
  to: BudgetState;
  remainingTokens: number;
  totalBudget: number;
  timestamp: number;
}

export interface BudgetSnapshot {
  state: BudgetState;
  usedTokens: number;
  remainingTokens: number;
  totalBudget: number;
  utilizationPercent: number;
}

export interface ContextBudgetOptions {
  /** Total context window budget in tokens (default: 100_000) */
  totalBudget?: number;
  /** Threshold for Warning state (default: 25_000 remaining) */
  warningThreshold?: number;
  /** Threshold for Pressure state (default: 18_000 remaining) */
  pressureThreshold?: number;
  /** Threshold for AutoCompact state (default: 13_000 remaining) */
  autoCompactThreshold?: number;
  /** Threshold for Blocking state (default: 3_000 remaining) */
  blockingThreshold?: number;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_TOTAL_BUDGET = 100_000;
const DEFAULT_WARNING_THRESHOLD = 25_000;
const DEFAULT_PRESSURE_THRESHOLD = 18_000;
const DEFAULT_AUTO_COMPACT_THRESHOLD = 13_000;
const DEFAULT_BLOCKING_THRESHOLD = 3_000;

// ============================================================================
// ContextBudgetTracker
// ============================================================================

export class ContextBudgetTracker extends EventEmitter {
  private readonly totalBudget: number;
  private readonly warningThreshold: number;
  private readonly pressureThreshold: number;
  private readonly autoCompactThreshold: number;
  private readonly blockingThreshold: number;

  private usedTokens = 0;
  private currentState: BudgetState = 'normal';

  constructor(options: ContextBudgetOptions = {}) {
    super();
    this.totalBudget = options.totalBudget ?? DEFAULT_TOTAL_BUDGET;
    this.warningThreshold = options.warningThreshold ?? DEFAULT_WARNING_THRESHOLD;
    this.pressureThreshold = options.pressureThreshold ?? DEFAULT_PRESSURE_THRESHOLD;
    this.autoCompactThreshold = options.autoCompactThreshold ?? DEFAULT_AUTO_COMPACT_THRESHOLD;
    this.blockingThreshold = options.blockingThreshold ?? DEFAULT_BLOCKING_THRESHOLD;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Add tokens to the usage counter and re-evaluate state. */
  addTokens(count: number): void {
    this.usedTokens += count;
    this.evaluate();
  }

  /** Remove tokens (e.g., after compaction freed space). */
  releaseTokens(count: number): void {
    this.usedTokens = Math.max(0, this.usedTokens - count);
    this.evaluate();
  }

  /** Set the absolute token count (e.g., after a full recount). */
  setUsedTokens(count: number): void {
    this.usedTokens = Math.max(0, count);
    this.evaluate();
  }

  /** Current state. */
  getState(): BudgetState {
    return this.currentState;
  }

  /** Full snapshot of the budget. */
  getSnapshot(): BudgetSnapshot {
    const remaining = Math.max(0, this.totalBudget - this.usedTokens);
    return {
      state: this.currentState,
      usedTokens: this.usedTokens,
      remainingTokens: remaining,
      totalBudget: this.totalBudget,
      utilizationPercent: Math.round((this.usedTokens / this.totalBudget) * 100),
    };
  }

  /** Whether the budget is in a state that should block new tool calls. */
  isBlocking(): boolean {
    return this.currentState === 'blocking';
  }

  /** Whether compaction should auto-trigger. */
  shouldAutoCompact(): boolean {
    return this.currentState === 'auto-compact' || this.currentState === 'blocking';
  }

  /** Whether proactive microcompact should run. */
  shouldProactiveCompact(): boolean {
    return this.currentState === 'pressure'
      || this.currentState === 'auto-compact'
      || this.currentState === 'blocking';
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private evaluate(): void {
    const remaining = Math.max(0, this.totalBudget - this.usedTokens);
    const newState = this.computeState(remaining);

    if (newState !== this.currentState) {
      const transition: BudgetTransition = {
        from: this.currentState,
        to: newState,
        remainingTokens: remaining,
        totalBudget: this.totalBudget,
        timestamp: Date.now(),
      };
      this.currentState = newState;
      this.emit('transition', transition);
    }
  }

  private computeState(remaining: number): BudgetState {
    if (remaining <= this.blockingThreshold) return 'blocking';
    if (remaining <= this.autoCompactThreshold) return 'auto-compact';
    if (remaining <= this.pressureThreshold) return 'pressure';
    if (remaining <= this.warningThreshold) return 'warning';
    return 'normal';
  }
}
