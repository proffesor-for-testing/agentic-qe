/**
 * Agentic QE v3 - Compaction Pipeline Orchestrator (IMP-08)
 *
 * Orchestrates the 4-tier context compaction stack:
 *   Tier 1: Microcompact (IMP-01) — age/pressure eviction, zero API
 *   Tier 2: QE Session Summary — structured local summary, zero API
 *   Tier 3: LLM Compact — 9-section summary, one API call
 *   Tier 4: Reactive — aggressive message peeling on 413/overflow
 *
 * The pipeline auto-triggers based on ContextBudgetTracker state transitions
 * and can also be invoked manually. Registers as middleware on the IMP-00
 * middleware chain (priority 200, after microcompact at 100).
 */

import type { ToolMiddleware, ToolCallContext } from '../../mcp/middleware/middleware-chain';
import { ContextBudgetTracker, type BudgetTransition, type BudgetSnapshot } from './context-budget';
import { Tier1Microcompact, type Tier1Result } from './tier1-microcompact';
import { Tier2SessionSummary, type ConversationMessage, type Tier2Result } from './tier2-session-summary';
import { Tier3LLMCompact, type Tier3Result, type LLMCompactCaller } from './tier3-llm-compact';
import { Tier4Reactive, type Tier4Result } from './tier4-reactive';
import { MicrocompactEngine, estimateTokensPadded } from '../../mcp/middleware/microcompact';

// ============================================================================
// Re-exports
// ============================================================================

export { ContextBudgetTracker, type BudgetTransition, type BudgetSnapshot, type BudgetState } from './context-budget';
export type { ContextBudgetOptions } from './context-budget';
export { Tier1Microcompact, type Tier1Result } from './tier1-microcompact';
export { Tier2SessionSummary, type ConversationMessage, type Tier2Result, type SessionSummaryOptions } from './tier2-session-summary';
export { Tier3LLMCompact, type Tier3Result, type LLMCompactCaller, type Tier3Options } from './tier3-llm-compact';
export { Tier4Reactive, type Tier4Result, type Tier4Options } from './tier4-reactive';

// ============================================================================
// Types
// ============================================================================

export interface CompactionPipelineOptions {
  /** Total context budget in tokens (default: 100_000) */
  totalBudget?: number;
  /** LLM caller for Tier 3 (optional — falls back to extractive) */
  llmCaller?: LLMCompactCaller;
  /** Max files to restore after compaction (default: 5) */
  maxFileRestorations?: number;
  /** Token budget for file restorations (default: 50_000) */
  fileRestorationBudget?: number;
  /** Shared MicrocompactEngine from IMP-01 middleware (Tier 1 reuses it) */
  sharedMicrocompactEngine?: MicrocompactEngine;
}

export type CompactionTierResult = Tier1Result | Tier2Result | Tier3Result | Tier4Result;

export interface CompactionRunResult {
  tiersExecuted: number[];
  totalTokensSaved: number;
  tierResults: CompactionTierResult[];
  budgetAfter: BudgetSnapshot;
}

// ============================================================================
// CompactionPipeline
// ============================================================================

export class CompactionPipeline {
  private readonly budget: ContextBudgetTracker;
  private readonly tier1: Tier1Microcompact;
  private readonly tier2: Tier2SessionSummary;
  private readonly tier3: Tier3LLMCompact;
  private readonly tier4: Tier4Reactive;

  private readonly maxFileRestorations: number;
  private readonly fileRestorationBudget: number;

  /** Conversation history tracked for Tier 2-4 compaction */
  private conversationHistory: ConversationMessage[] = [];

  /** Recently accessed file paths for post-compact restoration */
  private recentFiles: string[] = [];

  /** Whether a compaction is currently in progress (prevents re-entrancy) */
  private compacting = false;

  constructor(options: CompactionPipelineOptions = {}) {
    this.budget = new ContextBudgetTracker({
      totalBudget: options.totalBudget,
    });
    this.tier1 = options.sharedMicrocompactEngine
      ? Tier1Microcompact.fromEngine(options.sharedMicrocompactEngine)
      : new Tier1Microcompact();
    this.tier2 = new Tier2SessionSummary();
    this.tier3 = new Tier3LLMCompact({ llmCall: options.llmCaller });
    this.tier4 = new Tier4Reactive();
    this.maxFileRestorations = options.maxFileRestorations ?? 5;
    this.fileRestorationBudget = options.fileRestorationBudget ?? 50_000;

    // Auto-trigger compaction on budget state transitions
    this.budget.on('transition', (transition: BudgetTransition) => {
      this.handleBudgetTransition(transition);
    });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Record a conversation message for tracking. */
  addMessage(message: ConversationMessage): void {
    this.conversationHistory.push(message);
    const tokens = message.estimatedTokens ?? estimateTokensPadded(message.content);
    this.budget.addTokens(tokens);
  }

  /** Record a recently accessed file path. */
  recordFileAccess(filePath: string): void {
    // Deduplicate, keep most recent at the end
    this.recentFiles = this.recentFiles.filter(f => f !== filePath);
    this.recentFiles.push(filePath);
    // Trim to max
    if (this.recentFiles.length > this.maxFileRestorations * 2) {
      this.recentFiles = this.recentFiles.slice(-this.maxFileRestorations * 2);
    }
  }

  /** Get the list of files that should be restored after compaction. */
  getFilesForRestoration(): string[] {
    return this.recentFiles.slice(-this.maxFileRestorations);
  }

  /** Get the current budget snapshot. */
  getBudgetSnapshot(): BudgetSnapshot {
    return this.budget.getSnapshot();
  }

  /** Get the budget tracker for direct access. */
  getBudgetTracker(): ContextBudgetTracker {
    return this.budget;
  }

  /**
   * Manually run compaction up to the specified tier.
   * Returns results from all tiers that executed.
   */
  async runCompaction(maxTier: 1 | 2 | 3 | 4 = 4): Promise<CompactionRunResult> {
    if (this.compacting) {
      return {
        tiersExecuted: [],
        totalTokensSaved: 0,
        tierResults: [],
        budgetAfter: this.budget.getSnapshot(),
      };
    }

    this.compacting = true;
    const tierResults: CompactionTierResult[] = [];
    let totalTokensSaved = 0;
    const tiersExecuted: number[] = [];

    try {
      // Tier 1: Always run microcompact
      const t1 = this.tier1.compact();
      tierResults.push(t1);
      tiersExecuted.push(1);
      totalTokensSaved += t1.tokensSaved;

      if (maxTier >= 2 && this.conversationHistory.length > 0) {
        // Tier 2: Session summary
        const t2 = this.tier2.compact(this.conversationHistory);
        tierResults.push(t2);
        tiersExecuted.push(2);
        totalTokensSaved += t2.tokensSaved;

        // Replace conversation history with preserved messages
        if (t2.removedMessageCount > 0) {
          this.conversationHistory = [...t2.preservedMessages];
          this.budget.releaseTokens(t2.tokensSaved);
        }
      }

      if (maxTier >= 3 && this.budget.shouldAutoCompact()) {
        // Tier 3: LLM compact
        const t3 = await this.tier3.compact(this.conversationHistory);
        tierResults.push(t3);
        tiersExecuted.push(3);
        totalTokensSaved += t3.tokensSaved;

        if (t3.tokensSaved > 0) {
          // Replace history with summary-as-message
          this.conversationHistory = [{
            role: 'assistant',
            content: t3.summary,
            timestamp: Date.now(),
            estimatedTokens: t3.summaryTokens,
          }];
          this.budget.releaseTokens(t3.tokensSaved);
        }
      }

      if (maxTier >= 4 && this.budget.isBlocking()) {
        // Tier 4: Reactive — last resort
        const t4 = this.tier4.compact(this.conversationHistory, 'context_overflow');
        tierResults.push(t4);
        tiersExecuted.push(4);
        totalTokensSaved += t4.tokensSaved;

        if (t4.droppedCount > 0) {
          this.conversationHistory = [...t4.survivingMessages];
          this.budget.releaseTokens(t4.tokensSaved);
        }
      }
    } finally {
      this.compacting = false;
    }

    return {
      tiersExecuted,
      totalTokensSaved,
      tierResults,
      budgetAfter: this.budget.getSnapshot(),
    };
  }

  /**
   * Handle a 413 error or context overflow.
   * Triggers Tier 4 reactive compaction immediately.
   */
  async handleOverflow(trigger: 'status_413' | 'context_overflow' = 'status_413'): Promise<Tier4Result> {
    const result = this.tier4.compact(this.conversationHistory, trigger);

    if (result.droppedCount > 0) {
      this.conversationHistory = [...result.survivingMessages];
      this.budget.releaseTokens(result.tokensSaved);
    }

    return result;
  }

  /** Get compaction statistics for the session_cache_stats tool. */
  getStats(): {
    conversationMessages: number;
    budget: BudgetSnapshot;
    recentFiles: string[];
    isCompacting: boolean;
  } {
    return {
      conversationMessages: this.conversationHistory.length,
      budget: this.budget.getSnapshot(),
      recentFiles: this.getFilesForRestoration(),
      isCompacting: this.compacting,
    };
  }

  // --------------------------------------------------------------------------
  // Middleware Factory
  // --------------------------------------------------------------------------

  /**
   * Create a ToolMiddleware that plugs this pipeline into the IMP-00 chain.
   * Priority 200 — runs after microcompact (100) in post-hooks.
   * Disabled via AQE_COMPACTION_DISABLED=true.
   */
  createMiddleware(): ToolMiddleware {
    const compactionDisabled = process.env.AQE_COMPACTION_DISABLED === 'true';

    return {
      name: 'compaction-pipeline',
      priority: 200,

      postToolResult: async (context: ToolCallContext, result: unknown): Promise<unknown> => {
        if (compactionDisabled) return result;
        // Estimate tokens from FULL content for accurate budget tracking,
        // but store truncated content for conversation history (summarization).
        const fullParamsStr = JSON.stringify(context.params);
        const fullResultStr = typeof result === 'string' ? result : JSON.stringify(result);
        const toolUseId = `${context.toolName}-${context.timestamp}`;

        // Track the tool call
        this.addMessage({
          role: 'tool_use',
          content: fullParamsStr.slice(0, 500),
          toolName: context.toolName,
          timestamp: context.timestamp,
          toolUseId,
          // Use full content for token estimation
          estimatedTokens: estimateTokensPadded(fullParamsStr),
        });

        // Track the result
        this.addMessage({
          role: 'tool_result',
          content: fullResultStr.slice(0, 1000),
          toolName: context.toolName,
          timestamp: Date.now(),
          toolUseId,
          estimatedTokens: estimateTokensPadded(fullResultStr),
        });

        // Track file accesses from tool params
        const params = context.params;
        if (typeof params.file_path === 'string') {
          this.recordFileAccess(params.file_path);
        }
        if (typeof params.path === 'string') {
          this.recordFileAccess(params.path);
        }

        return result;
      },
    };
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private handleBudgetTransition(transition: BudgetTransition): void {
    // Auto-trigger compaction based on state
    if (transition.to === 'pressure') {
      // Tier 1 only — proactive microcompact
      void this.runCompaction(1);
    } else if (transition.to === 'auto-compact') {
      // Tiers 1-3
      void this.runCompaction(3);
    } else if (transition.to === 'blocking') {
      // All tiers including reactive
      void this.runCompaction(4);
    }
  }
}
