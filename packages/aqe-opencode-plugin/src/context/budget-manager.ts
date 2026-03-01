/**
 * Context Window Budget Manager
 *
 * Tracks and manages token usage within OpenCode's context window constraints.
 * OpenCode protects ~40k tokens for tool outputs, so we default to 35k
 * (leaving 5k headroom) for AQE guidance injection and tool result tracking.
 *
 * Token estimation uses the chars/4 heuristic, which is reasonable for English
 * text and code. For production use, replace with a proper tokenizer.
 *
 * @module context/budget-manager
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Budget report for debugging and monitoring.
 */
export interface BudgetReport {
  /** Total tokens used so far */
  used: number;
  /** Remaining token budget */
  remaining: number;
  /** Maximum token budget */
  max: number;
  /** Utilization percentage (0-100) */
  utilizationPercent: number;
  /** Token usage breakdown by tool name */
  toolBreakdown: Record<string, number>;
  /** Number of tool outputs tracked */
  toolCallCount: number;
  /** Whether the budget is exhausted */
  isExhausted: boolean;
}

/**
 * Options for compressing guidance text to fit within a token budget.
 */
export interface CompressionOptions {
  /** Preserve the first N lines regardless of budget (default: 2) */
  preserveHeaderLines?: number;
  /** Suffix to append when text is truncated (default: '\n[...truncated for context budget]') */
  truncationSuffix?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default max tokens — 35k leaves 5k headroom under OpenCode's 40k protection */
const DEFAULT_MAX_TOKENS = 35_000;

/** Approximate chars per token for English text/code */
const CHARS_PER_TOKEN = 4;

/** Default truncation suffix */
const DEFAULT_TRUNCATION_SUFFIX = '\n[...truncated for context budget]';

// ---------------------------------------------------------------------------
// Budget Manager
// ---------------------------------------------------------------------------

/**
 * Manages the token budget for AQE operations within an OpenCode session.
 *
 * Usage:
 * ```typescript
 * const budget = new ContextBudgetManager(35000);
 *
 * // Check before injecting guidance
 * const guidance = buildGuidance();
 * const tokens = budget.estimateTokens(guidance);
 * if (budget.hasGuidanceBudget(tokens)) {
 *   injectGuidance(guidance);
 * } else {
 *   injectGuidance(budget.compressGuidance(guidance, budget.remainingBudget()));
 * }
 *
 * // Track tool outputs
 * budget.trackToolOutput('test_generate_enhanced', budget.estimateTokens(toolOutput));
 *
 * // Check remaining budget
 * console.log(budget.getReport());
 * ```
 */
export class ContextBudgetManager {
  private readonly maxTokens: number;
  private usedTokens: number = 0;
  private readonly toolUsage: Map<string, number> = new Map();
  private toolCallCount: number = 0;

  constructor(maxTokens: number = DEFAULT_MAX_TOKENS) {
    if (maxTokens <= 0) {
      throw new Error(`maxTokens must be positive, got ${maxTokens}`);
    }
    this.maxTokens = maxTokens;
  }

  /**
   * Estimate token count for a string using the chars/4 heuristic.
   * This is a rough estimate suitable for budget planning. For exact counts,
   * use a proper tokenizer for the target model.
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Check if there is enough remaining budget for guidance injection.
   */
  hasGuidanceBudget(guidanceTokens: number): boolean {
    return this.remainingBudget() >= guidanceTokens;
  }

  /**
   * Track token usage from a tool result.
   * Call this after each tool output to keep the budget accurate.
   */
  trackToolOutput(toolName: string, outputTokens: number): void {
    if (outputTokens < 0) {
      throw new Error(`outputTokens must be non-negative, got ${outputTokens}`);
    }
    this.usedTokens += outputTokens;
    this.toolCallCount++;

    const existing = this.toolUsage.get(toolName) ?? 0;
    this.toolUsage.set(toolName, existing + outputTokens);
  }

  /**
   * Get the remaining token budget.
   * Returns 0 if budget is exhausted (never negative).
   */
  remainingBudget(): number {
    return Math.max(0, this.maxTokens - this.usedTokens);
  }

  /**
   * Compress guidance text to fit within a maximum token budget.
   *
   * Strategy:
   * 1. If text fits within budget, return as-is
   * 2. Preserve header lines (first N lines)
   * 3. Truncate remaining text to fit budget
   * 4. Append truncation suffix
   */
  compressGuidance(guidance: string, maxTokens: number, options?: CompressionOptions): string {
    const estimatedTokens = this.estimateTokens(guidance);
    if (estimatedTokens <= maxTokens) {
      return guidance;
    }

    const preserveHeaderLines = options?.preserveHeaderLines ?? 2;
    const truncationSuffix = options?.truncationSuffix ?? DEFAULT_TRUNCATION_SUFFIX;
    const suffixTokens = this.estimateTokens(truncationSuffix);

    if (maxTokens <= suffixTokens) {
      // Not enough budget even for the suffix
      return '';
    }

    const lines = guidance.split('\n');
    const headerLines = lines.slice(0, preserveHeaderLines);
    const headerText = headerLines.join('\n');
    const headerTokens = this.estimateTokens(headerText);

    if (headerTokens + suffixTokens >= maxTokens) {
      // Header alone exceeds budget — truncate at character level
      const maxChars = (maxTokens - suffixTokens) * CHARS_PER_TOKEN;
      return guidance.slice(0, Math.max(0, maxChars)) + truncationSuffix;
    }

    // Fill remaining budget with body lines
    const bodyBudget = maxTokens - headerTokens - suffixTokens;
    const bodyLines = lines.slice(preserveHeaderLines);
    let bodyTokens = 0;
    const includedBodyLines: string[] = [];

    for (const line of bodyLines) {
      const lineTokens = this.estimateTokens(line + '\n');
      if (bodyTokens + lineTokens > bodyBudget) {
        break;
      }
      bodyTokens += lineTokens;
      includedBodyLines.push(line);
    }

    const result = [
      headerText,
      ...includedBodyLines,
    ].join('\n');

    // Only add suffix if we actually truncated
    if (includedBodyLines.length < bodyLines.length) {
      return result + truncationSuffix;
    }

    return result;
  }

  /**
   * Get a budget report for debugging and monitoring.
   */
  getReport(): BudgetReport {
    const remaining = this.remainingBudget();
    const utilizationPercent = this.maxTokens > 0
      ? Math.round((this.usedTokens / this.maxTokens) * 100)
      : 0;

    const toolBreakdown: Record<string, number> = {};
    for (const [tool, tokens] of this.toolUsage) {
      toolBreakdown[tool] = tokens;
    }

    return {
      used: this.usedTokens,
      remaining,
      max: this.maxTokens,
      utilizationPercent,
      toolBreakdown,
      toolCallCount: this.toolCallCount,
      isExhausted: remaining === 0,
    };
  }

  /**
   * Reset the budget manager (e.g., at the start of a new session).
   */
  reset(): void {
    this.usedTokens = 0;
    this.toolUsage.clear();
    this.toolCallCount = 0;
  }
}
