/**
 * Agentic QE v3 - Tier 3: LLM-Powered Compaction (IMP-08)
 *
 * When session context exceeds safe thresholds and Tier 2 is insufficient,
 * Tier 3 forks a single LLM call to produce a structured 9-section QE
 * summary. This is the most expensive compaction tier (one API call) but
 * produces the highest-quality summaries.
 *
 * The 9-section format is QE-specific:
 *   1. Primary QE Objective
 *   2. Key Technical Findings
 *   3. Files and Test Artifacts
 *   4. Errors and Fixes Applied
 *   5. Quality Gates Status
 *   6. All User Requests (verbatim intent)
 *   7. Pending QE Tasks
 *   8. Current Analysis State
 *   9. Suggested Next Action
 */

import { estimateTokensPadded } from '../../mcp/middleware/microcompact';
import type { ConversationMessage } from './tier2-session-summary';

// ============================================================================
// Types
// ============================================================================

export interface Tier3Options {
  /** Max tokens reserved for the summary output (default: 20_000) */
  maxSummaryTokens?: number;
  /** LLM caller — injected to decouple from routing layer */
  llmCall?: LLMCompactCaller;
}

/**
 * Abstraction over the LLM call used for compaction.
 * Implementors wire this to their routing layer (e.g., model-route MCP tool).
 */
export interface LLMCompactCaller {
  /**
   * Send a single-turn prompt and get a text response.
   * Should use a cost-effective model (Haiku-class).
   */
  call(systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface Tier3Result {
  tier: 3;
  /** The structured 9-section summary */
  summary: string;
  /** Tokens in the summary */
  summaryTokens: number;
  /** Original message count */
  originalMessageCount: number;
  /** Tokens freed */
  tokensSaved: number;
  /** Whether fallback (no LLM) was used */
  usedFallback: boolean;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_MAX_SUMMARY_TOKENS = 20_000;

const COMPACTION_SYSTEM_PROMPT = `You are a QE session compaction agent. Summarize the conversation into exactly 9 sections.
Be concise but preserve all actionable information. Use bullet points.
Output ONLY the 9 sections with their headers — no preamble, no closing.`;

const COMPACTION_USER_TEMPLATE = `Summarize this QE session into 9 sections:

## 1. Primary QE Objective
## 2. Key Technical Findings
## 3. Files and Test Artifacts
## 4. Errors and Fixes Applied
## 5. Quality Gates Status
## 6. All User Requests
## 7. Pending QE Tasks
## 8. Current Analysis State
## 9. Suggested Next Action

Session transcript:
`;

// ============================================================================
// Tier3LLMCompact
// ============================================================================

export class Tier3LLMCompact {
  private readonly maxSummaryTokens: number;
  private readonly llmCall: LLMCompactCaller | undefined;

  constructor(options: Tier3Options = {}) {
    this.maxSummaryTokens = options.maxSummaryTokens ?? DEFAULT_MAX_SUMMARY_TOKENS;
    this.llmCall = options.llmCall;
  }

  /**
   * Compact a conversation using a single LLM call.
   * Falls back to a local extractive summary if no LLM caller is configured.
   */
  async compact(messages: ConversationMessage[]): Promise<Tier3Result> {
    const originalTokens = messages.reduce(
      (s, m) => s + (m.estimatedTokens ?? estimateTokensPadded(m.content)),
      0,
    );

    if (messages.length === 0) {
      return {
        tier: 3,
        summary: '',
        summaryTokens: 0,
        originalMessageCount: 0,
        tokensSaved: 0,
        usedFallback: false,
      };
    }

    // Build the transcript to send to the LLM
    const transcript = this.buildTranscript(messages);

    let summary: string;
    let usedFallback: boolean;

    if (this.llmCall) {
      try {
        const userPrompt = COMPACTION_USER_TEMPLATE + transcript;
        summary = await this.llmCall.call(COMPACTION_SYSTEM_PROMPT, userPrompt);
        usedFallback = false;
      } catch {
        // LLM call failed — fall back to extractive summary
        summary = this.extractiveFallback(messages);
        usedFallback = true;
      }
    } else {
      // No LLM configured — use extractive fallback
      summary = this.extractiveFallback(messages);
      usedFallback = true;
    }

    // Truncate if over budget
    const summaryTokens = estimateTokensPadded(summary);
    if (summaryTokens > this.maxSummaryTokens) {
      const charLimit = this.maxSummaryTokens * 3;
      summary = summary.slice(0, charLimit) + '\n\n[LLM summary truncated to fit budget]';
    }

    const finalTokens = estimateTokensPadded(summary);

    return {
      tier: 3,
      summary,
      summaryTokens: finalTokens,
      originalMessageCount: messages.length,
      tokensSaved: Math.max(0, originalTokens - finalTokens),
      usedFallback,
    };
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /** Build a compact transcript for the LLM prompt. */
  private buildTranscript(messages: ConversationMessage[]): string {
    // Budget: leave room for system prompt + template + output
    const maxTranscriptChars = (this.maxSummaryTokens * 3) * 2; // 2x output budget for input
    const lines: string[] = [];
    let charCount = 0;

    for (const msg of messages) {
      const prefix = msg.role === 'tool_use'
        ? `[tool:${msg.toolName ?? 'unknown'}]`
        : `[${msg.role}]`;
      const line = `${prefix} ${msg.content.slice(0, 500)}`;

      if (charCount + line.length > maxTranscriptChars) {
        lines.push(`... (${messages.length - lines.length} earlier messages omitted)`);
        break;
      }

      lines.push(line);
      charCount += line.length;
    }

    return lines.join('\n');
  }

  /** Extractive fallback when no LLM is available. */
  private extractiveFallback(messages: ConversationMessage[]): string {
    const sections: string[] = [];

    // Section 1: Objective — first user message
    const firstUser = messages.find(m => m.role === 'user');
    sections.push(`## 1. Primary QE Objective\n${firstUser?.content.slice(0, 300) ?? 'Unknown'}`);

    // Section 2: Findings — assistant messages
    const findings = messages
      .filter(m => m.role === 'assistant')
      .slice(-3)
      .map(m => `- ${m.content.slice(0, 150)}`);
    sections.push(`## 2. Key Technical Findings\n${findings.join('\n') || '- None captured'}`);

    // Section 3: Files — extract paths from tool calls
    const filePaths = new Set<string>();
    for (const m of messages) {
      const pathMatches = m.content.match(/[\w/.-]+\.(ts|js|json|yaml|md)/g);
      if (pathMatches) pathMatches.forEach(p => filePaths.add(p));
    }
    sections.push(`## 3. Files and Test Artifacts\n${[...filePaths].slice(0, 20).map(f => `- ${f}`).join('\n') || '- None'}`);

    // Section 4: Errors
    const errors = messages
      .filter(m => m.content.toLowerCase().includes('error') || m.content.toLowerCase().includes('fail'))
      .slice(-3)
      .map(m => `- ${m.content.slice(0, 100)}`);
    sections.push(`## 4. Errors and Fixes Applied\n${errors.join('\n') || '- None'}`);

    // Sections 5-9: minimal placeholders
    sections.push(`## 5. Quality Gates Status\n- Not assessed (extractive fallback)`);

    const userReqs = messages
      .filter(m => m.role === 'user')
      .map(m => `- ${m.content.slice(0, 200)}`);
    sections.push(`## 6. All User Requests\n${userReqs.join('\n') || '- None'}`);

    sections.push(`## 7. Pending QE Tasks\n- Resume from last action`);
    sections.push(`## 8. Current Analysis State\n- Session compacted at ${new Date().toISOString()}`);
    sections.push(`## 9. Suggested Next Action\n- Review compacted summary and continue`);

    return `# QE Session Summary (Tier 3 — Extractive Fallback)\n\n${sections.join('\n\n')}`;
  }
}
