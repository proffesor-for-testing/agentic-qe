/**
 * Agentic QE v3 — Billing mode resolution (ADR-123)
 *
 * Maps a provider type to how it bills, and provides the human-facing startup
 * notice text. Kept separate from the provider classes so callers (router,
 * kernel, `aqe health`) can resolve a billing mode without constructing a
 * provider, and so a provider that doesn't set `billingMode` still resolves.
 */

import type { BillingMode, LLMProvider, LLMProviderType } from './interfaces';

/** Default billing mode per provider type. */
const BILLING_MODE_BY_TYPE: Record<LLMProviderType, BillingMode> = {
  claude: 'metered-api',
  'claude-code': 'subscription',
  codex: 'subscription',
  openai: 'metered-api',
  openrouter: 'metered-api',
  gemini: 'metered-api',
  'azure-openai': 'metered-api',
  bedrock: 'metered-api',
  cognitum: 'metered-capped',
  ollama: 'local',
};

/**
 * Resolve a provider's billing mode: the instance's own `billingMode` wins,
 * else the per-type default, else `metered-api` (the safe, cap-requiring
 * assumption for an unknown provider).
 */
export function resolveBillingMode(
  provider: Pick<LLMProvider, 'type' | 'billingMode'>
): BillingMode {
  return provider.billingMode ?? BILLING_MODE_BY_TYPE[provider.type] ?? 'metered-api';
}

/** Resolve a billing mode from a bare provider type. */
export function billingModeForType(type: LLMProviderType): BillingMode {
  return BILLING_MODE_BY_TYPE[type] ?? 'metered-api';
}

/**
 * One-line notice shown at startup / in `aqe health` describing how the
 * active provider bills, so a user is never surprised (issue #557). Returns
 * `undefined` for `local` (nothing to warn about).
 */
export function billingNotice(
  provider: LLMProviderType,
  mode: BillingMode
): string | undefined {
  switch (mode) {
    case 'metered-api':
      return (
        `⚠️  LLM provider "${provider}" bills a pay-per-token API key (not your Claude ` +
        `subscription) and has no server-side spend cap. Set a budget with ` +
        `--max-budget-usd / AQE_MAX_BUDGET_USD, or use AQE_LLM_PROVIDER=claude-code ` +
        `to run on your Claude Code subscription instead.`
      );
    case 'metered-capped':
      return (
        `ℹ️  LLM provider "${provider}" bills per-token but enforces a server-side ` +
        `hard spend cap; it will pause at the cap rather than overspend.`
      );
    case 'subscription': {
      const sub = provider === 'codex' ? 'ChatGPT' : 'Claude Code';
      return (
        `ℹ️  LLM provider "${provider}" runs on your ${sub} subscription ` +
        `(shared plan usage). Worst case is hitting your plan's rate limit and pausing — ` +
        `no per-token API charges.`
      );
    }
    case 'local':
      return undefined;
  }
}
