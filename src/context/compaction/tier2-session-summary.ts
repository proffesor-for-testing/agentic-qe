/**
 * Agentic QE v3 - Tier 2: QE Session Summary (IMP-08)
 *
 * Builds a structured session summary from already-captured context data,
 * without making any API calls. Uses ContextCompiler output (memory,
 * coverage, test results, requirements, defects, git) to produce a
 * condensed representation that preserves QE-relevant state.
 *
 * Key constraints:
 *   - Zero API calls (purely local computation)
 *   - Preserves tool_use / tool_result message pairs (never breaks pairs)
 *   - Retains at least `minRecentTokens` of recent conversation
 *   - Caps summary at `maxSummaryTokens`
 */

import { estimateTokensPadded } from '../../mcp/middleware/microcompact';

// ============================================================================
// Types
// ============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: string;
  toolName?: string;
  timestamp?: number;
  estimatedTokens?: number;
  /** If this is a tool_use, the ID linking it to its tool_result pair */
  toolUseId?: string;
}

export interface SessionSummaryOptions {
  /** Minimum tokens of recent conversation to preserve (default: 10_000) */
  minRecentTokens?: number;
  /** Maximum tokens for the summary output (default: 40_000) */
  maxSummaryTokens?: number;
}

export interface Tier2Result {
  tier: 2;
  /** The condensed summary text */
  summary: string;
  /** Tokens in the summary */
  summaryTokens: number;
  /** Messages preserved verbatim (recent tail) */
  preservedMessages: ConversationMessage[];
  /** Tokens in preserved messages */
  preservedTokens: number;
  /** Total messages before compaction */
  originalMessageCount: number;
  /** Messages removed */
  removedMessageCount: number;
  /** Tokens freed */
  tokensSaved: number;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_MIN_RECENT_TOKENS = 10_000;
const DEFAULT_MAX_SUMMARY_TOKENS = 40_000;

// ============================================================================
// Tier2SessionSummary
// ============================================================================

export class Tier2SessionSummary {
  private readonly minRecentTokens: number;
  private readonly maxSummaryTokens: number;

  constructor(options: SessionSummaryOptions = {}) {
    this.minRecentTokens = options.minRecentTokens ?? DEFAULT_MIN_RECENT_TOKENS;
    this.maxSummaryTokens = options.maxSummaryTokens ?? DEFAULT_MAX_SUMMARY_TOKENS;
  }

  /**
   * Compact a conversation by summarizing old messages and preserving recent ones.
   *
   * Algorithm:
   *   1. Walk backward from the end, accumulating tokens until `minRecentTokens`
   *      is reached. Never split a tool_use/tool_result pair.
   *   2. Everything before the split point is summarized into structured sections.
   *   3. Return summary + preserved tail.
   */
  compact(messages: ConversationMessage[]): Tier2Result {
    if (messages.length === 0) {
      return {
        tier: 2,
        summary: '',
        summaryTokens: 0,
        preservedMessages: [],
        preservedTokens: 0,
        originalMessageCount: 0,
        removedMessageCount: 0,
        tokensSaved: 0,
      };
    }

    // Annotate with token estimates if missing
    const annotated = messages.map(m => ({
      ...m,
      estimatedTokens: m.estimatedTokens ?? estimateTokensPadded(m.content),
    }));

    // Find the split point: walk backward, preserving at least minRecentTokens
    const splitIndex = this.findSplitIndex(annotated);

    const toSummarize = annotated.slice(0, splitIndex);
    const toPreserve = annotated.slice(splitIndex);

    const originalTokens = annotated.reduce((s, m) => s + m.estimatedTokens!, 0);
    const preservedTokens = toPreserve.reduce((s, m) => s + m.estimatedTokens!, 0);

    // Build summary from the older messages
    const summary = this.buildSummary(toSummarize);
    const summaryTokens = Math.min(estimateTokensPadded(summary), this.maxSummaryTokens);

    const tokensSaved = originalTokens - preservedTokens - summaryTokens;

    return {
      tier: 2,
      summary,
      summaryTokens,
      preservedMessages: toPreserve,
      preservedTokens,
      originalMessageCount: messages.length,
      removedMessageCount: toSummarize.length,
      tokensSaved: Math.max(0, tokensSaved),
    };
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /**
   * Walk backward to find the first index where we've accumulated enough
   * recent tokens. Never splits a tool_use/tool_result pair.
   */
  private findSplitIndex(messages: ConversationMessage[]): number {
    let accumulatedTokens = 0;
    let splitIndex = messages.length;

    // Map each toolUseId to the index of its tool_use and tool_result messages
    const toolUseIndex = new Map<string, number>();
    const toolResultIndex = new Map<string, number>();
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.toolUseId) {
        if (m.role === 'tool_use') toolUseIndex.set(m.toolUseId, i);
        if (m.role === 'tool_result') toolResultIndex.set(m.toolUseId, i);
      }
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      accumulatedTokens += msg.estimatedTokens ?? 0;
      splitIndex = i;

      if (accumulatedTokens >= this.minRecentTokens) {
        // Before finalizing the split, check we're not orphaning a pair.

        // Case 1: We landed on a tool_result — pull its tool_use into the preserved set.
        if (msg.role === 'tool_result' && msg.toolUseId) {
          const tuIdx = toolUseIndex.get(msg.toolUseId);
          if (tuIdx !== undefined && tuIdx < i) {
            splitIndex = tuIdx;
          }
        }

        // Case 2: We landed on a tool_use whose tool_result is in the preserved tail.
        // The tool_use is already included, so this is fine — no action needed.

        // Case 3: We landed on a tool_use whose tool_result is BEFORE us (summarized away).
        // This means the result is already gone — the tool_use without its result is
        // useless, so push split one further back to exclude it too.
        if (msg.role === 'tool_use' && msg.toolUseId) {
          const trIdx = toolResultIndex.get(msg.toolUseId);
          if (trIdx !== undefined && trIdx < i) {
            // The result is in the summarized section — exclude this orphaned tool_use
            splitIndex = i + 1;
          }
        }

        break;
      }
    }

    return splitIndex;
  }

  /**
   * Build a structured summary from older messages.
   * Sections mirror QE-specific concerns.
   */
  private buildSummary(messages: ConversationMessage[]): string {
    if (messages.length === 0) return '';

    const sections: string[] = [];

    // Extract user requests
    const userRequests = messages
      .filter(m => m.role === 'user')
      .map(m => m.content.slice(0, 200));
    if (userRequests.length > 0) {
      sections.push(`## User Requests\n${userRequests.map(r => `- ${r}`).join('\n')}`);
    }

    // Extract tool calls and results
    const toolCalls = messages.filter(m => m.role === 'tool_use');
    if (toolCalls.length > 0) {
      const toolSummary = toolCalls.map(t =>
        `- ${t.toolName ?? 'unknown'}: ${t.content.slice(0, 100)}`
      );
      sections.push(`## Tool Calls (${toolCalls.length})\n${toolSummary.join('\n')}`);
    }

    // Extract assistant responses (non-tool)
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    if (assistantMsgs.length > 0) {
      const keyFindings = assistantMsgs
        .map(m => m.content.slice(0, 150))
        .slice(-5); // Keep last 5 findings
      sections.push(`## Key Findings\n${keyFindings.map(f => `- ${f}`).join('\n')}`);
    }

    const summary = `# Session Summary (Tier 2 Compaction)\n\n` +
      `Compacted ${messages.length} messages at ${new Date().toISOString()}\n\n` +
      sections.join('\n\n');

    // Truncate if over budget
    const tokens = estimateTokensPadded(summary);
    if (tokens > this.maxSummaryTokens) {
      const charLimit = this.maxSummaryTokens * 3; // reverse of ceil(chars/3)
      return summary.slice(0, charLimit) + '\n\n[Summary truncated to fit budget]';
    }

    return summary;
  }
}
