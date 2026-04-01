/**
 * Agentic QE v3 - Tier 1: Microcompact Bridge (IMP-08)
 *
 * Thin integration layer that bridges the IMP-01 MicrocompactEngine into
 * the 4-tier compaction pipeline. Tier 1 is zero-API-call: it evicts stale
 * tool results based on age and context pressure.
 *
 * This module does NOT duplicate IMP-01 logic — it delegates to the existing
 * MicrocompactEngine and translates its results into the CompactionResult
 * format used by the pipeline.
 */

import {
  MicrocompactEngine,
  type MicrocompactOptions,
  type MicrocompactResult,
} from '../../mcp/middleware/microcompact';

// ============================================================================
// Types
// ============================================================================

export interface Tier1Result {
  tier: 1;
  tokensSaved: number;
  clearedCount: number;
  totalTokens: number;
  totalResults: number;
}

// ============================================================================
// Tier1Microcompact
// ============================================================================

export class Tier1Microcompact {
  private readonly engine: MicrocompactEngine;

  constructor(options?: MicrocompactOptions) {
    this.engine = new MicrocompactEngine(options);
  }

  /**
   * Construct from an existing MicrocompactEngine instance
   * (e.g., the one already registered as middleware via IMP-01).
   */
  static fromEngine(engine: MicrocompactEngine): Tier1Microcompact {
    const tier = new Tier1Microcompact();
    // Replace internal engine with the shared one
    (tier as unknown as { engine: MicrocompactEngine }).engine = engine;
    return tier;
  }

  /** Run microcompact eviction and return a pipeline-compatible result. */
  compact(): Tier1Result {
    const result: MicrocompactResult = this.engine.compact();
    return {
      tier: 1,
      tokensSaved: result.tokensSaved,
      clearedCount: result.clearedCount,
      totalTokens: result.totalTokens,
      totalResults: result.totalResults,
    };
  }

  /** Expose the underlying engine for callers that need direct access. */
  getEngine(): MicrocompactEngine {
    return this.engine;
  }
}
