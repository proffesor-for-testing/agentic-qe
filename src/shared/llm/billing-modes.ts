/**
 * Agentic QE v3 — Billing mode resolution (ADR-123)
 *
 * Maps a provider type to how it bills, and provides the human-facing startup
 * notice text. Kept separate from the provider classes so callers (router,
 * kernel, `aqe health`) can resolve a billing mode without constructing a
 * provider, and so a provider that doesn't set `billingMode` still resolves.
 */

import type {
  BillingMode,
  BuiltinProviderType,
  LLMProvider,
  LLMProviderType,
} from './interfaces';
import { isBuiltinProviderType } from './interfaces';
import { registeredBillingDeclaration } from './provider-registry.js';

/**
 * Default billing mode per built-in provider type.
 *
 * ADR-127: keyed on `BuiltinProviderType`, not `LLMProviderType`, for two
 * reasons: adding a built-in provider must still fail the build until this map
 * is updated, and a lookup by an open `LLMProviderType` must type as
 * `BillingMode | undefined` so the `?? 'metered-api'` fallback below is
 * actually forced rather than merely present. An external provider registered
 * per ADR-127 has no entry here and therefore falls through to `metered-api` —
 * the conservative, cap-requiring assumption.
 */
const BILLING_MODE_BY_TYPE: Record<BuiltinProviderType, BillingMode> = {
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
 * Look up the built-in default for a provider type, or `undefined` when the
 * type is not one AQE ships (ADR-127: an externally registered provider).
 */
function builtinBillingMode(type: LLMProviderType): BillingMode | undefined {
  return isBuiltinProviderType(type) ? BILLING_MODE_BY_TYPE[type] : undefined;
}

/**
 * Resolve a provider's billing mode: the instance's own `billingMode` wins,
 * else the per-type default, else `metered-api` (the safe, cap-requiring
 * assumption for an unknown provider).
 *
 * ADR-127: an external provider is expected to declare `billingMode` on the
 * instance, which is why the instance's own value is consulted first. When it
 * declares nothing it lands on `metered-api` and therefore requires a budget,
 * rather than being silently treated as free.
 */
export function resolveBillingMode(
  provider: Pick<LLMProvider, 'type' | 'billingMode'>
): BillingMode {
  return provider.billingMode ?? builtinBillingMode(provider.type) ?? 'metered-api';
}

/** Resolve a billing mode from a bare provider type. */
export function billingModeForType(type: LLMProviderType): BillingMode {
  return builtinBillingMode(type) ?? 'metered-api';
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
      // ADR-127: only a built-in may be named as drawing on a specific
      // vendor's plan. An external provider that declares `subscription` is
      // asserting something AQE cannot verify, and naming Claude Code or
      // ChatGPT here would attribute the spend to a vendor that is not
      // serving the work — the exact misrepresentation issue #628 refused to
      // perform. Say what was declared, and say who declared it.
      const declaration = registeredBillingDeclaration(provider);
      if (declaration) {
        const by = declaration.detail
          ? `declared by ${declaration.detail}`
          : `declared by ${declaration.source === 'config' ? 'config' : 'the registering caller'}`;
        return (
          `ℹ️  LLM provider "${provider}" is an external provider that reports ` +
          `subscription billing (${by}) — AQE does not verify this. It draws on ` +
          `that host's own plan, not on your Claude Code or ChatGPT subscription.`
        );
      }
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
