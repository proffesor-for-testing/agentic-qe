/**
 * Agentic QE v3 — Real LLM executor for the eval runner (issue #557 follow-up).
 *
 * `aqe eval run` historically defaulted to MockLLMExecutor (canned, keyword-
 * matched responses), so LLM-mode eval suites scored fabricated output. This
 * executor makes REAL model calls through the shared LLM layer, so eval
 * inherits the ADR-123 guardrails automatically: enforced budget caps, the
 * `AQE_LLM_PROVIDER` selector (including the claude-code subscription), the
 * billing notice, and the cross-process spend ledger.
 */

import type { LLMExecutor } from './parallel-eval-runner';
import { ProviderManager } from '../shared/llm/provider-manager';
import type { ProviderManagerConfig, LLMProviderType } from '../shared/llm/interfaces';
import { billingModeForType } from '../shared/llm/billing-modes';
import {
  loadRouterConfig,
  detectAvailableProvidersFromEnv,
} from '../shared/llm/router/config-store';
import { ClaudeCodeProvider } from '../shared/llm/providers/claude-code';
import { OllamaProvider } from '../shared/llm/providers/ollama';

/** Real executor: delegates to ProviderManager.generate (budget-gated). */
export class ProviderLLMExecutor implements LLMExecutor {
  constructor(
    private readonly manager: ProviderManager,
    readonly providerType: LLMProviderType
  ) {}

  async execute(
    prompt: string,
    model: string,
    options?: { timeout?: number }
  ): Promise<{ output: string; tokensUsed: number; durationMs: number }> {
    const response = await this.manager.generate(prompt, {
      model,
      timeoutMs: options?.timeout,
      preferredProvider: this.providerType,
    });
    return {
      output: response.content,
      tokensUsed: response.usage.totalTokens,
      durationMs: response.latencyMs,
    };
  }
}

export interface EvalExecutorResolution {
  /** The real executor, or undefined when no provider is configured. */
  executor?: ProviderLLMExecutor;
  /** The provider chosen (for display), when resolved. */
  providerType?: LLMProviderType;
  /** Billing mode of the chosen provider (for the pre-run notice). */
  billingMode?: string;
  /** Manager to dispose when done (caller owns lifecycle). */
  manager?: ProviderManager;
  /** Why no executor could be built (for a clear CLI error). */
  reason?: string;
}

/**
 * Non-billing readiness check: is this provider usable WITHOUT making a paid
 * probe call? API providers need a key in env; claude-code needs the CLI on
 * PATH; local providers (ollama) are treated as available when selected.
 */
async function isConfiguredCheaply(
  type: LLMProviderType,
  env: NodeJS.ProcessEnv
): Promise<boolean> {
  if (type === 'claude-code') {
    // Free, local: just runs `claude --version`.
    return new ClaudeCodeProvider().isAvailable();
  }
  if (type === 'ollama') {
    // Local + free probe: only "configured" if the server actually answers,
    // so a machine with no Ollama running falls through to the hard error
    // (issue #557 choice: never silently pick a dead provider).
    return new OllamaProvider().isAvailable();
  }
  // API providers: key presence only — never a billing probe.
  return detectAvailableProvidersFromEnv(env).has(type);
}

/**
 * Resolve a real eval executor from the current environment/config. Honors
 * `AQE_LLM_PROVIDER`. Returns `{ reason }` (no executor) when nothing is
 * configured, so the CLI can hard-error instead of silently mocking.
 */
export async function resolveEvalExecutor(
  env: NodeJS.ProcessEnv = process.env
): Promise<EvalExecutorResolution> {
  const config = loadRouterConfig({ env });

  // Candidate order: the resolved default provider first, then any other
  // enabled provider, so an AQE_LLM_PROVIDER override wins.
  const enabled = Object.entries(config.providers ?? {})
    .filter(([, cfg]) => cfg?.enabled)
    .map(([type]) => type as LLMProviderType);
  const candidates: LLMProviderType[] = [
    config.defaultProvider as LLMProviderType,
    ...enabled.filter((t) => t !== config.defaultProvider),
  ];

  for (const type of candidates) {
    if (await isConfiguredCheaply(type, env)) {
      const pmConfig: Partial<ProviderManagerConfig> = {
        primary: type,
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: { [type]: config.providers?.[type] as never },
        global: { enableCostTracking: true },
      };
      const manager = new ProviderManager(pmConfig);
      await manager.initialize();
      return {
        executor: new ProviderLLMExecutor(manager, type),
        providerType: type,
        billingMode: billingModeForType(type),
        manager,
      };
    }
  }

  return {
    reason:
      'No LLM provider is configured for real eval runs. Set a provider key ' +
      '(e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY, COGNITUM_API_KEY), or run on your ' +
      'Claude subscription with AQE_LLM_PROVIDER=claude-code, or pass --mock to use ' +
      'canned responses (offline testing only — results are not real).',
  };
}
