/**
 * onSessionPromptBefore Hook
 *
 * Pre-LLM processing mapped from AQE's UserPromptSubmit hooks:
 * - Complexity analysis: estimate prompt complexity (0-100)
 * - Model routing hints: suggest higher-tier model for complex tasks
 * - ReasoningBank pattern matching: query memory for relevant patterns
 * - Guidance injection: prepend relevant guidance within token budget
 *
 * Target latency: <100ms
 *
 * @module hooks/on-session-prompt-before
 */

import type { SessionPromptContext, PromptModification } from '../types/opencode.js';
import type { AQEPluginConfig } from '../config.js';
import type { SessionManager, PatternMatch } from '../lifecycle.js';

// =============================================================================
// Complexity Analysis
// =============================================================================

interface ComplexityResult {
  score: number;       // 0-100
  factors: string[];   // What contributed to the score
}

function analyzeComplexity(prompt: string): ComplexityResult {
  let score = 0;
  const factors: string[] = [];

  // Length-based (longer prompts tend to be more complex)
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 200) {
    score += 20;
    factors.push('long-prompt');
  } else if (wordCount > 100) {
    score += 10;
    factors.push('medium-prompt');
  }

  // Technical complexity signals
  const complexPatterns: Array<[RegExp, number, string]> = [
    [/architect|design|refactor|migrate/i, 15, 'architecture'],
    [/security|vulnerab|cve|exploit|auth/i, 15, 'security'],
    [/performance|optimiz|bottleneck|profil/i, 10, 'performance'],
    [/concurrent|parallel|async|race\s*condition/i, 15, 'concurrency'],
    [/database|schema|migration|sql/i, 10, 'database'],
    [/test.*generat|coverage.*gap|mutation.*test/i, 10, 'testing'],
    [/debug|fix.*bug|regression|root\s*cause/i, 10, 'debugging'],
    [/deploy|ci\/cd|pipeline|release/i, 10, 'devops'],
    [/multi.*file|across.*codebase|entire.*project/i, 10, 'scope'],
  ];

  for (const [pattern, weight, factor] of complexPatterns) {
    if (pattern.test(prompt)) {
      score += weight;
      factors.push(factor);
    }
  }

  // Multiple code blocks indicate complex request
  const codeBlockCount = (prompt.match(/```/g) || []).length / 2;
  if (codeBlockCount > 2) {
    score += 10;
    factors.push('multiple-code-blocks');
  }

  // Question count (multiple questions = more complex)
  const questionCount = (prompt.match(/\?/g) || []).length;
  if (questionCount > 3) {
    score += 10;
    factors.push('multi-question');
  }

  return {
    score: Math.min(score, 100),
    factors,
  };
}

// =============================================================================
// Guidance Formatting
// =============================================================================

/**
 * Estimate token count from text. Uses the rough heuristic
 * of ~4 characters per token (conservative for English).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatGuidance(
  patterns: PatternMatch[],
  complexity: ComplexityResult,
  config: AQEPluginConfig
): string {
  const parts: string[] = [];
  let tokenBudget = config.guidance.maxTokens;

  // Model routing hint
  if (config.guidance.enableRouting && complexity.score > 70) {
    const hint = `[TASK_MODEL_RECOMMENDATION] Complexity: ${complexity.score}/100 ` +
      `(${complexity.factors.join(', ')}). Consider using a higher-tier model for this task.`;
    const hintTokens = estimateTokens(hint);
    if (hintTokens <= tokenBudget) {
      parts.push(hint);
      tokenBudget -= hintTokens;
    }
  }

  // Pattern guidance
  if (patterns.length > 0) {
    const header = '## AQE Pattern Guidance\n' +
      'The following patterns from previous sessions may be relevant:\n';
    const headerTokens = estimateTokens(header);
    if (headerTokens <= tokenBudget) {
      parts.push(header);
      tokenBudget -= headerTokens;
    }

    for (const pattern of patterns) {
      const entry = `- **${pattern.domain}** (confidence: ${(pattern.confidence * 100).toFixed(0)}%, ` +
        `success rate: ${(pattern.successRate * 100).toFixed(0)}%): ${pattern.content}`;
      const entryTokens = estimateTokens(entry);

      if (entryTokens > tokenBudget) break;

      parts.push(entry);
      tokenBudget -= entryTokens;
    }
  }

  return parts.join('\n\n');
}

// =============================================================================
// Hook Factory
// =============================================================================

export function createOnSessionPromptBefore(
  config: AQEPluginConfig,
  session: SessionManager
) {
  return async function onSessionPromptBefore(
    ctx: SessionPromptContext
  ): Promise<void | PromptModification> {
    if (!config.enabled || !config.hooks.onSessionPromptBefore) return;

    await session.ensureInitialized();

    // 1. Complexity analysis
    const complexity = analyzeComplexity(ctx.prompt);

    // 2. ReasoningBank pattern matching
    let patterns: PatternMatch[] = [];
    const memory = session.getMemory();
    if (memory) {
      try {
        // Query across configured domains
        const allMatches: PatternMatch[] = [];
        for (const domain of config.domains) {
          const matches = await memory.queryPatterns(domain, ctx.prompt, 3);
          allMatches.push(...matches);
        }

        // Filter by minimum confidence and sort by relevance
        patterns = allMatches
          .filter((p) => p.confidence >= config.guidance.minPatternConfidence)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 5);
      } catch (err) {
        console.error('[AQE Plugin] Pattern query error:', err);
      }
    }

    // 3. If no guidance to inject, return early
    if (complexity.score <= 70 && patterns.length === 0) {
      return;
    }

    // 4. Format and inject guidance
    const guidance = formatGuidance(patterns, complexity, config);
    if (!guidance) return;

    // Track injection
    if (patterns.length > 0) {
      session.recordPatternInjected();
    }

    return {
      modifiedPrompt: guidance + '\n\n---\n\n' + ctx.prompt,
    };
  };
}
