/**
 * onSessionPromptAfter Hook
 *
 * Post-response processing mapped from AQE's PostToolUse and learning hooks:
 * - Outcome capture: determine success/failure from response
 * - Pattern promotion: increment score for successful pattern usage
 * - Dream queue: add experience for consolidation
 * - Session metrics: update token usage and success rate
 *
 * Target latency: <500ms (async fire-and-forget for heavy work)
 *
 * @module hooks/on-session-prompt-after
 */

import type { SessionPromptContext, SessionResponse } from '../types/opencode.js';
import type { AQEPluginConfig } from '../config.js';
import type { SessionManager, DreamQueueItem } from '../lifecycle.js';

// =============================================================================
// Outcome Detection
// =============================================================================

interface OutcomeAnalysis {
  success: boolean;
  confidence: number;
  signals: string[];
}

function analyzeOutcome(response: SessionResponse): OutcomeAnalysis {
  const signals: string[] = [];
  let successScore = 0;
  let failureScore = 0;

  // Tool call success rate
  const totalTools = response.toolCalls.length;
  if (totalTools > 0) {
    const successfulTools = response.toolCalls.filter((tc) => tc.success).length;
    const toolSuccessRate = successfulTools / totalTools;

    if (toolSuccessRate >= 0.8) {
      successScore += 30;
      signals.push('high-tool-success-rate');
    } else if (toolSuccessRate < 0.5) {
      failureScore += 30;
      signals.push('low-tool-success-rate');
    }
  }

  // Response content signals
  const content = response.content.toLowerCase();

  // Success indicators
  const successPatterns = [
    /successfully|completed|done|fixed|resolved|implemented/,
    /tests?\s+pass/,
    /build\s+succeed/,
    /no\s+errors?\s+found/,
  ];
  for (const pattern of successPatterns) {
    if (pattern.test(content)) {
      successScore += 10;
      signals.push('success-language');
      break;
    }
  }

  // Failure indicators
  const failurePatterns = [
    /error|failed|failure|crash|exception/,
    /cannot|unable|impossible/,
    /tests?\s+fail/,
    /build\s+fail/,
  ];
  for (const pattern of failurePatterns) {
    if (pattern.test(content)) {
      failureScore += 10;
      signals.push('failure-language');
      break;
    }
  }

  const success = successScore > failureScore;
  const totalScore = successScore + failureScore;
  const confidence = totalScore > 0
    ? Math.max(successScore, failureScore) / totalScore
    : 0.5;

  return { success, confidence, signals };
}

// =============================================================================
// Hook Factory
// =============================================================================

export function createOnSessionPromptAfter(
  config: AQEPluginConfig,
  session: SessionManager
) {
  return async function onSessionPromptAfter(
    ctx: SessionPromptContext,
    response: SessionResponse
  ): Promise<void> {
    if (!config.enabled || !config.hooks.onSessionPromptAfter) return;

    // 1. Track session metrics (synchronous)
    session.recordPrompt(response.usage.inputTokens, response.usage.outputTokens);

    // 2. Async outcome processing (fire-and-forget)
    processOutcomeAsync(ctx, response, config, session).catch((err) => {
      console.error('[AQE Plugin] Outcome processing error:', err);
    });
  };
}

// =============================================================================
// Async Outcome Processing
// =============================================================================

async function processOutcomeAsync(
  ctx: SessionPromptContext,
  response: SessionResponse,
  config: AQEPluginConfig,
  session: SessionManager
): Promise<void> {
  // 1. Analyze outcome
  const outcome = analyzeOutcome(response);

  // 2. Pattern promotion: if patterns were injected and outcome is successful
  const memory = session.getMemory();
  if (memory && outcome.success && outcome.confidence > 0.6) {
    try {
      // Retrieve recently injected patterns for this session
      const recentExperiences = await memory.retrieve(
        `opencode/sessions/recent-patterns`,
        'opencode'
      );

      if (recentExperiences && Array.isArray(recentExperiences)) {
        for (const patternId of recentExperiences as string[]) {
          await memory.recordOutcome(patternId, true);
          session.recordPatternPromoted();
        }
      }
    } catch (err) {
      console.error('[AQE Plugin] Pattern promotion error:', err);
    }
  }

  // 3. Add to dream consolidation queue
  const dreamItem: DreamQueueItem = {
    type: 'prompt-outcome',
    data: {
      promptTurn: ctx.turn,
      model: response.model,
      outcome: {
        success: outcome.success,
        confidence: outcome.confidence,
        signals: outcome.signals,
      },
      toolCallCount: response.toolCalls.length,
      toolSuccessCount: response.toolCalls.filter((tc) => tc.success).length,
      tokenUsage: response.usage,
      durationMs: response.durationMs,
    },
    timestamp: Date.now(),
  };
  session.addToDreamQueue(dreamItem);

  // 4. Store session metrics snapshot
  if (memory) {
    try {
      await memory.store(
        `opencode/sessions/turn-${ctx.turn}`,
        {
          outcome,
          metrics: session.getMetrics(),
          timestamp: Date.now(),
        },
        'opencode'
      );
    } catch (err) {
      console.error('[AQE Plugin] Metrics storage error:', err);
    }
  }
}
