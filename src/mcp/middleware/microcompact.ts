/**
 * Agentic QE v3 - Microcompact Engine (IMP-01)
 *
 * Tracks MCP tool results over time and evicts stale entries to reduce
 * context-window pressure. Registers as a postToolResult middleware on the
 * IMP-00 middleware chain.
 *
 * Eviction rules (applied in order on each compact() call):
 *   1. Results older than `maxAgeMs` are cleared — unless they are among
 *      the most recent `keepLastN` results.
 *   2. If total estimated tokens still exceed `contextBudget * contextPressureThreshold`,
 *      the oldest non-protected results are cleared until the budget is satisfied.
 *
 * Cleared entries have their content replaced with a sentinel string so
 * downstream consumers can detect compacted slots.
 */

import type { ToolMiddleware, ToolCallContext } from './middleware-chain';

// ============================================================================
// Public Interfaces
// ============================================================================

export interface MicrocompactOptions {
  maxAgeMs?: number;                  // default: 3_600_000 (60 min)
  keepLastN?: number;                 // default: 5
  contextPressureThreshold?: number;  // default: 0.8 (fraction of budget)
  contextBudget?: number;             // default: 100_000 tokens
  sentinel?: string;                  // default: '[Old tool result content cleared]'
}

export interface ToolResultEntry {
  toolName: string;
  result: unknown;
  timestamp: number;
  estimatedTokens: number;
  cleared: boolean;
}

export interface MicrocompactResult {
  clearedCount: number;
  tokensSaved: number;
  totalResults: number;
  totalTokens: number;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_MAX_AGE_MS = 3_600_000;          // 60 minutes
const DEFAULT_KEEP_LAST_N = 5;
const DEFAULT_CONTEXT_PRESSURE_THRESHOLD = 0.8;
const DEFAULT_CONTEXT_BUDGET = 100_000;        // tokens
const DEFAULT_SENTINEL = '[Old tool result content cleared]';

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Padded heuristic for token estimation: ceil(chars / 3).
 * Intentionally conservative — overestimates slightly to give headroom.
 */
export function estimateTokensPadded(content: unknown): number {
  const serialized = typeof content === 'string'
    ? content
    : JSON.stringify(content);
  return Math.ceil(serialized.length / 3);
}

// ============================================================================
// MicrocompactEngine
// ============================================================================

export class MicrocompactEngine {
  private entries: ToolResultEntry[] = [];
  private readonly maxAgeMs: number;
  private readonly keepLastN: number;
  private readonly pressureThreshold: number;
  private readonly contextBudget: number;
  private readonly sentinel: string;

  constructor(options: MicrocompactOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.keepLastN = options.keepLastN ?? DEFAULT_KEEP_LAST_N;
    this.pressureThreshold = options.contextPressureThreshold ?? DEFAULT_CONTEXT_PRESSURE_THRESHOLD;
    this.contextBudget = options.contextBudget ?? DEFAULT_CONTEXT_BUDGET;
    this.sentinel = options.sentinel ?? DEFAULT_SENTINEL;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Register a new tool result for tracking. */
  addResult(toolName: string, result: unknown): void {
    this.entries.push({
      toolName,
      result,
      timestamp: Date.now(),
      estimatedTokens: estimateTokensPadded(result),
      cleared: false,
    });
  }

  /**
   * Run the two-pass eviction algorithm and return a summary.
   *
   * Pass 1 — age-based: clear anything older than `maxAgeMs`, except the
   *          most recent `keepLastN` entries (regardless of age).
   * Pass 2 — pressure-based: if total tokens still exceed the threshold,
   *          clear the oldest non-protected entries one-by-one until under budget.
   */
  compact(): MicrocompactResult {
    const now = Date.now();
    let clearedCount = 0;
    let tokensSaved = 0;

    const sentinelTokens = estimateTokensPadded(this.sentinel);

    // Identify the protected tail (last N entries by insertion order).
    const protectedStartIndex = Math.max(0, this.entries.length - this.keepLastN);

    // --- Pass 1: age-based eviction ---
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.cleared) continue;
      if (i >= protectedStartIndex) continue; // protected

      const age = now - entry.timestamp;
      if (age > this.maxAgeMs) {
        const saved = entry.estimatedTokens - sentinelTokens;
        entry.result = this.sentinel;
        entry.cleared = true;
        entry.estimatedTokens = sentinelTokens;
        clearedCount++;
        tokensSaved += Math.max(0, saved);
      }
    }

    // --- Pass 2: context-pressure eviction ---
    const tokenCeiling = this.contextBudget * this.pressureThreshold;
    let totalTokens = this.entries.reduce((sum, e) => sum + e.estimatedTokens, 0);

    if (totalTokens > tokenCeiling) {
      for (let i = 0; i < this.entries.length; i++) {
        if (totalTokens <= tokenCeiling) break;

        const entry = this.entries[i];
        if (entry.cleared) continue;
        if (i >= protectedStartIndex) continue; // still protected

        const saved = entry.estimatedTokens - sentinelTokens;
        totalTokens -= Math.max(0, saved);
        entry.result = this.sentinel;
        entry.cleared = true;
        entry.estimatedTokens = sentinelTokens;
        clearedCount++;
        tokensSaved += Math.max(0, saved);
      }
    }

    // Recompute total tokens for the summary.
    totalTokens = this.entries.reduce((sum, e) => sum + e.estimatedTokens, 0);

    return {
      clearedCount,
      tokensSaved,
      totalResults: this.entries.length,
      totalTokens,
    };
  }

  /** Return current tracking statistics. */
  getStats(): { totalResults: number; clearedCount: number; totalTokens: number } {
    const clearedCount = this.entries.filter(e => e.cleared).length;
    const totalTokens = this.entries.reduce((sum, e) => sum + e.estimatedTokens, 0);
    return {
      totalResults: this.entries.length,
      clearedCount,
      totalTokens,
    };
  }

  /** Expose estimateTokensPadded as a static method for external callers. */
  static estimateTokensPadded(content: unknown): number {
    return estimateTokensPadded(content);
  }

  /** Read-only access to the internal entries (useful for testing). */
  getEntries(): ReadonlyArray<ToolResultEntry> {
    return this.entries;
  }
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Result of createMicrocompactMiddleware — returns both the middleware
 * and the engine so callers can share the engine with other subsystems
 * (e.g., the compaction pipeline's Tier 1).
 */
export interface MicrocompactMiddlewareResult {
  middleware: ToolMiddleware;
  engine: MicrocompactEngine;
}

/**
 * Create a ToolMiddleware that plugs the MicrocompactEngine into the
 * IMP-00 middleware chain.
 *
 * The middleware:
 *   - Records every tool result via `addResult()`
 *   - Runs `compact()` to evict stale historical entries
 *   - Returns the current result unchanged (compaction targets history)
 *
 * Priority 100 — runs after most other post-hooks.
 *
 * Returns both the middleware and the underlying engine so the engine
 * can be shared with the compaction pipeline (IMP-08 Tier 1).
 */
export function createMicrocompactMiddleware(
  options?: MicrocompactOptions,
): MicrocompactMiddlewareResult {
  const engine = new MicrocompactEngine(options);

  const middleware: ToolMiddleware = {
    name: 'microcompact',
    priority: 100,

    async postToolResult(_context: ToolCallContext, result: unknown): Promise<unknown> {
      engine.addResult(_context.toolName, result);
      engine.compact();
      return result;
    },
  };

  return { middleware, engine };
}
