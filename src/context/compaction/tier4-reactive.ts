/**
 * Agentic QE v3 - Tier 4: Reactive Compaction (IMP-08)
 *
 * Last-resort compaction triggered by 413 errors or context overflow
 * detection. Aggressively peels the oldest conversation rounds until
 * the estimated token count drops below the recovery target.
 *
 * This tier is destructive — it drops messages entirely (no summary).
 * It exists to recover from situations where the context window is
 * critically full and the session would otherwise fail.
 */

import { estimateTokensPadded } from '../../mcp/middleware/microcompact';
import type { ConversationMessage } from './tier2-session-summary';

// ============================================================================
// Types
// ============================================================================

export interface Tier4Options {
  /** Target remaining tokens after reactive compaction (default: 30_000) */
  recoveryTarget?: number;
  /** Minimum messages to always preserve at the tail (default: 4) */
  minPreservedMessages?: number;
}

export interface Tier4Result {
  tier: 4;
  /** Messages surviving after compaction */
  survivingMessages: ConversationMessage[];
  /** Surviving token count */
  survivingTokens: number;
  /** Messages dropped */
  droppedCount: number;
  /** Tokens freed */
  tokensSaved: number;
  /** The trigger that caused reactive compaction */
  trigger: 'status_413' | 'context_overflow' | 'manual';
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_RECOVERY_TARGET = 30_000;
const DEFAULT_MIN_PRESERVED = 4;

// ============================================================================
// Tier4Reactive
// ============================================================================

export class Tier4Reactive {
  private readonly recoveryTarget: number;
  private readonly minPreserved: number;

  constructor(options: Tier4Options = {}) {
    this.recoveryTarget = options.recoveryTarget ?? DEFAULT_RECOVERY_TARGET;
    this.minPreserved = options.minPreservedMessages ?? DEFAULT_MIN_PRESERVED;
  }

  /**
   * Aggressively peel oldest messages until under the recovery target.
   *
   * Algorithm:
   *   1. Compute total tokens.
   *   2. If already under target, return early.
   *   3. Walk forward from the oldest message, dropping messages until
   *      remaining tokens are at or below recoveryTarget.
   *   4. Never drop below minPreservedMessages from the tail.
   *   5. When dropping a tool_result, also drop its paired tool_use (and vice versa).
   */
  compact(
    messages: ConversationMessage[],
    trigger: Tier4Result['trigger'] = 'context_overflow',
  ): Tier4Result {
    if (messages.length === 0) {
      return {
        tier: 4,
        survivingMessages: [],
        survivingTokens: 0,
        droppedCount: 0,
        tokensSaved: 0,
        trigger,
      };
    }

    // Annotate tokens
    const annotated = messages.map(m => ({
      ...m,
      estimatedTokens: m.estimatedTokens ?? estimateTokensPadded(m.content),
    }));

    const totalTokens = annotated.reduce((s, m) => s + m.estimatedTokens!, 0);

    // Already under target?
    if (totalTokens <= this.recoveryTarget) {
      return {
        tier: 4,
        survivingMessages: messages,
        survivingTokens: totalTokens,
        droppedCount: 0,
        tokensSaved: 0,
        trigger,
      };
    }

    // Build pair map: toolUseId -> indices of both tool_use and tool_result
    const pairMap = new Map<string, number[]>();
    for (let i = 0; i < annotated.length; i++) {
      const m = annotated[i];
      if (m.toolUseId) {
        const existing = pairMap.get(m.toolUseId) ?? [];
        existing.push(i);
        pairMap.set(m.toolUseId, existing);
      }
    }

    // Mark messages for dropping
    const dropped = new Set<number>();
    let remainingTokens = totalTokens;

    // The tail we must preserve
    const preserveFrom = Math.max(0, annotated.length - this.minPreserved);

    for (let i = 0; i < annotated.length; i++) {
      if (remainingTokens <= this.recoveryTarget) break;
      if (i >= preserveFrom) break; // Don't touch the preserved tail
      if (dropped.has(i)) continue;

      // Drop this message
      dropped.add(i);
      remainingTokens -= annotated[i].estimatedTokens!;

      // If part of a pair, drop the partner too
      if (annotated[i].toolUseId) {
        const partners = pairMap.get(annotated[i].toolUseId!) ?? [];
        for (const partnerIdx of partners) {
          if (!dropped.has(partnerIdx) && partnerIdx < preserveFrom) {
            dropped.add(partnerIdx);
            remainingTokens -= annotated[partnerIdx].estimatedTokens!;
          }
        }
      }
    }

    const surviving = annotated.filter((_, i) => !dropped.has(i));
    const survivingTokens = surviving.reduce((s, m) => s + m.estimatedTokens!, 0);

    return {
      tier: 4,
      survivingMessages: surviving,
      survivingTokens,
      droppedCount: dropped.size,
      tokensSaved: totalTokens - survivingTokens,
      trigger,
    };
  }

  /**
   * Convenience: check if a given HTTP status or error message indicates
   * a context overflow that should trigger reactive compaction.
   */
  static isContextOverflow(statusOrMessage: number | string): boolean {
    if (typeof statusOrMessage === 'number') {
      return statusOrMessage === 413;
    }
    const lower = statusOrMessage.toLowerCase();
    return lower.includes('context_length_exceeded')
      || lower.includes('maximum context length')
      || lower.includes('too many tokens')
      || lower.includes('413');
  }
}
