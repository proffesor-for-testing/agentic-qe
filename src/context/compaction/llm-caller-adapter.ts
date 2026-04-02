/**
 * Agentic QE v3 - LLM Caller Adapter for Tier 3 Compaction (IMP-08)
 *
 * Lightweight adapter that creates an LLMCompactCaller from an Anthropic
 * API key. Uses Haiku-class model for cost efficiency. Falls back
 * gracefully when no API key is available.
 */

import type { LLMCompactCaller } from './tier3-llm-compact';

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an LLMCompactCaller if an Anthropic API key is available.
 * Returns undefined if no key is found (Tier 3 will use extractive fallback).
 */
export function createLLMCompactCaller(): LLMCompactCaller | undefined {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;

  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const model = 'claude-haiku-4-5-20251001'; // Cost-effective for summarization

  return {
    async call(systemPrompt: string, userPrompt: string): Promise<string> {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(
          `LLM compact call failed (${response.status}): ${errorData.error?.message ?? 'unknown'}`,
        );
      }

      const data = await response.json() as {
        content: Array<{ type: string; text?: string }>;
      };

      const textBlock = data.content.find(b => b.type === 'text');
      return textBlock?.text ?? '';
    },
  };
}
