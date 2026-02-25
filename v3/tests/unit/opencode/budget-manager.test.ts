/**
 * Context Budget Manager Tests
 *
 * Validates the token budget tracking system that prevents context window
 * overflow when injecting AQE guidance into OpenCode prompts.
 *
 * The budget manager:
 * - Estimates tokens as chars/4 (conservative for English)
 * - Tracks cumulative tool output tokens
 * - Rejects guidance injection when over budget
 * - Can compress guidance to fit within limits
 * - Reports budget breakdown by tool
 */

import { describe, it, expect, beforeEach } from 'vitest';

// =============================================================================
// Context Budget Manager Implementation (inline for testing)
// =============================================================================

interface BudgetEntry {
  toolName: string;
  tokens: number;
  timestamp: number;
}

interface BudgetBreakdown {
  total: number;
  remaining: number;
  entries: BudgetEntry[];
  byTool: Record<string, number>;
}

class ContextBudgetManager {
  private entries: BudgetEntry[] = [];
  private readonly maxTokens: number;

  constructor(maxTokens: number) {
    this.maxTokens = maxTokens;
  }

  /**
   * Estimate token count from text. Uses chars/4 heuristic.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Record token usage from a tool output.
   */
  recordToolOutput(toolName: string, output: string): void {
    const tokens = this.estimateTokens(output);
    this.entries.push({
      toolName,
      tokens,
      timestamp: Date.now(),
    });
  }

  /**
   * Get total tokens consumed so far.
   */
  getTotalTokens(): number {
    return this.entries.reduce((sum, e) => sum + e.tokens, 0);
  }

  /**
   * Get remaining token budget.
   */
  getRemainingBudget(): number {
    return Math.max(0, this.maxTokens - this.getTotalTokens());
  }

  /**
   * Check if guidance can be injected within the remaining budget.
   */
  canInjectGuidance(guidanceText: string): boolean {
    const needed = this.estimateTokens(guidanceText);
    return needed <= this.getRemainingBudget();
  }

  /**
   * Compress guidance to fit within remaining budget.
   * Truncates at sentence boundaries when possible.
   */
  compressToFit(guidanceText: string): string {
    const remaining = this.getRemainingBudget();
    if (remaining <= 0) return '';

    const maxChars = remaining * 4; // Reverse the chars/4 estimate

    if (guidanceText.length <= maxChars) return guidanceText;

    // Truncate at the last sentence boundary within budget
    const truncated = guidanceText.slice(0, maxChars);
    const lastPeriod = truncated.lastIndexOf('. ');
    if (lastPeriod > maxChars * 0.5) {
      return truncated.slice(0, lastPeriod + 1);
    }

    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      return truncated.slice(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Get budget breakdown by tool.
   */
  getBreakdown(): BudgetBreakdown {
    const byTool: Record<string, number> = {};
    for (const entry of this.entries) {
      byTool[entry.toolName] = (byTool[entry.toolName] || 0) + entry.tokens;
    }

    return {
      total: this.getTotalTokens(),
      remaining: this.getRemainingBudget(),
      entries: [...this.entries],
      byTool,
    };
  }

  /**
   * Reset the budget tracker.
   */
  reset(): void {
    this.entries = [];
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Context Budget Manager', () => {
  let budget: ContextBudgetManager;

  beforeEach(() => {
    // 2000 token budget (matching the default guidance.maxTokens config)
    budget = new ContextBudgetManager(2000);
  });

  // -------------------------------------------------------------------------
  // Token estimation
  // -------------------------------------------------------------------------

  it('should estimate tokens roughly as chars/4', () => {
    expect(budget.estimateTokens('')).toBe(0);
    expect(budget.estimateTokens('test')).toBe(1);
    expect(budget.estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 -> ceil = 3
    expect(budget.estimateTokens('a'.repeat(100))).toBe(25);
    expect(budget.estimateTokens('a'.repeat(1000))).toBe(250);

    // Verify consistency: more chars = more tokens
    const short = budget.estimateTokens('short');
    const long = budget.estimateTokens('this is a much longer string');
    expect(long).toBeGreaterThan(short);
  });

  // -------------------------------------------------------------------------
  // Cumulative tracking
  // -------------------------------------------------------------------------

  it('should track cumulative tool output tokens', () => {
    budget.recordToolOutput('coverage_analyze', 'a'.repeat(400));  // 100 tokens
    budget.recordToolOutput('quality_assess', 'b'.repeat(200));    // 50 tokens
    budget.recordToolOutput('test_generate', 'c'.repeat(800));     // 200 tokens

    expect(budget.getTotalTokens()).toBe(350);
    expect(budget.getRemainingBudget()).toBe(1650);
  });

  it('should handle empty outputs', () => {
    budget.recordToolOutput('test_tool', '');

    expect(budget.getTotalTokens()).toBe(0);
    expect(budget.getRemainingBudget()).toBe(2000);
  });

  // -------------------------------------------------------------------------
  // Guidance injection gating
  // -------------------------------------------------------------------------

  it('should reject guidance injection when over budget', () => {
    // Consume most of the budget
    budget.recordToolOutput('big_tool', 'x'.repeat(7600)); // 1900 tokens

    // Only 100 tokens remain
    expect(budget.getRemainingBudget()).toBe(100);

    // A small guidance should fit
    expect(budget.canInjectGuidance('a'.repeat(200))).toBe(true); // 50 tokens

    // A large guidance should not
    expect(budget.canInjectGuidance('a'.repeat(800))).toBe(false); // 200 tokens
  });

  it('should reject all guidance when budget is fully consumed', () => {
    budget.recordToolOutput('massive_tool', 'x'.repeat(8000)); // 2000 tokens

    expect(budget.getRemainingBudget()).toBe(0);
    expect(budget.canInjectGuidance('tiny')).toBe(false);
  });

  it('should allow guidance when budget has room', () => {
    // Fresh budget — plenty of room
    expect(budget.canInjectGuidance('a'.repeat(4000))).toBe(true); // 1000 tokens
  });

  // -------------------------------------------------------------------------
  // Guidance compression
  // -------------------------------------------------------------------------

  it('should compress guidance to fit within limits', () => {
    // Consume most budget
    budget.recordToolOutput('big_tool', 'x'.repeat(7200)); // 1800 tokens, 200 remaining

    const longGuidance = 'This is a sentence about patterns. ' +
      'This is another sentence about testing. ' +
      'This is a third sentence about coverage. ' +
      'This is a fourth sentence about security. ' +
      'This is a fifth sentence that goes on and on about many topics.';

    const compressed = budget.compressToFit(longGuidance);

    // Compressed version should be shorter
    expect(compressed.length).toBeLessThanOrEqual(200 * 4); // 200 tokens * 4 chars

    // Should still be non-empty
    expect(compressed.length).toBeGreaterThan(0);
  });

  it('should return empty string when no budget remains', () => {
    budget.recordToolOutput('huge_tool', 'x'.repeat(8000)); // 2000 tokens

    const result = budget.compressToFit('any guidance text');
    expect(result).toBe('');
  });

  it('should return full text when it fits within budget', () => {
    const guidance = 'Short guidance.';
    const result = budget.compressToFit(guidance);
    expect(result).toBe(guidance);
  });

  // -------------------------------------------------------------------------
  // Budget breakdown
  // -------------------------------------------------------------------------

  it('should report budget breakdown by tool', () => {
    budget.recordToolOutput('coverage_analyze', 'a'.repeat(400));
    budget.recordToolOutput('quality_assess', 'b'.repeat(200));
    budget.recordToolOutput('coverage_analyze', 'c'.repeat(400));

    const breakdown = budget.getBreakdown();

    expect(breakdown.total).toBe(250); // (400 + 200 + 400) / 4
    expect(breakdown.remaining).toBe(1750);
    expect(breakdown.byTool['coverage_analyze']).toBe(200); // 800 / 4
    expect(breakdown.byTool['quality_assess']).toBe(50);    // 200 / 4
    expect(breakdown.entries).toHaveLength(3);
  });

  it('should report empty breakdown initially', () => {
    const breakdown = budget.getBreakdown();

    expect(breakdown.total).toBe(0);
    expect(breakdown.remaining).toBe(2000);
    expect(breakdown.entries).toHaveLength(0);
    expect(Object.keys(breakdown.byTool)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  it('should reset budget tracking', () => {
    budget.recordToolOutput('tool1', 'a'.repeat(4000)); // 1000 tokens
    expect(budget.getTotalTokens()).toBe(1000);

    budget.reset();

    expect(budget.getTotalTokens()).toBe(0);
    expect(budget.getRemainingBudget()).toBe(2000);
    expect(budget.getBreakdown().entries).toHaveLength(0);
  });
});
