/**
 * Agentic QE v3 - LLM Router Service (kernel singleton)
 *
 * Thin wrapper around ProviderManager + HybridRouter that:
 *   1. Loads RouterConfig via config-store (defaults <- disk <- env <- override)
 *   2. Builds a ProviderManager whose enabled provider set matches what's
 *      actually available (key in env OR explicitly enabled on disk)
 *   3. Picks `primary` and `fallbacks` from the enabled set in a sensible
 *      order, honoring the user's defaultProvider when possible
 *   4. Constructs the HybridRouter and initializes it once
 *
 * This is what the QEKernelImpl instantiates and exposes as
 * `kernel.llmRouter`. Domain plugins receive it via their factory's
 * 4th argument and pass it down to coordinators/services so the
 * isLLMAnalysisAvailable() branches in 14 services actually fire.
 *
 * Why a service wrapper rather than constructing HybridRouter inline
 * in the kernel: the kernel already has too much going on, and the
 * provider-selection + fallback-ordering logic is non-trivial enough
 * to deserve its own test surface (see llm-router-service.test.ts).
 */

import { ProviderManager } from './provider-manager.js';
import { HybridRouter } from './router/hybrid-router.js';
import type {
  RouterConfig,
  ExtendedProviderType,
} from './router/types.js';
import type { ProviderManagerConfig, LLMProviderType } from './interfaces.js';
import {
  loadRouterConfig,
  shouldEnableRouter,
  detectAvailableProvidersFromEnv,
} from './router/config-store.js';
import {
  setAgentProviderOverrides,
  createOverrideRoutingRules,
} from './router/agent-router-config.js';
import { DEFAULT_QE_ROUTING_RULES } from './router/routing-rules.js';
import { createLogger } from '../../logging/logger-factory.js';

const routerServiceLogger = createLogger('llm/router-service');

/**
 * Issue #568: make `.agentic-qe/llm-config.json`'s `agentOverrides` map actually
 * take effect.
 *
 * Two steps, and both are needed:
 *   1. install the map so `getPreferredModelForAgent()` consults it, and
 *   2. materialize a routing rule per overridden agent and put it *ahead* of the
 *      rules the router would otherwise evaluate.
 *
 * Step 2 is the part that was missing before: `HybridRouter` only ever evaluates
 * `config.rules` (falling back to `DEFAULT_QE_ROUTING_RULES`), and the generated
 * per-agent ruleset was never installed into either — which is why the whole
 * `agent-router-config` mechanism was unreachable from outside a single call
 * stack.
 *
 * No overrides on disk => returns the config untouched.
 */
function applyAgentOverrides(config: RouterConfig): RouterConfig {
  // Pass each provider's own default model so a `{ "provider": "ollama" }`
  // override resolves to a model ollama can serve, not the Claude model id the
  // agent's category default happened to carry.
  const providerDefaultModels: Partial<Record<ExtendedProviderType, string>> = {};
  for (const [provider, cfg] of Object.entries(config.providers ?? {})) {
    if (cfg?.defaultModel) {
      providerDefaultModels[provider as ExtendedProviderType] = cfg.defaultModel;
    }
  }
  setAgentProviderOverrides(config.agentOverrides, providerDefaultModels);

  const overrideRules = createOverrideRoutingRules();
  if (overrideRules.length === 0) {
    return config;
  }

  // Mirror HybridRouter's own fallback so materializing overrides never has the
  // side effect of dropping the default QE rules.
  const baseRules = config.rules.length > 0 ? config.rules : DEFAULT_QE_ROUTING_RULES;
  return { ...config, rules: [...overrideRules, ...baseRules] };
}

/**
 * Options accepted by createLLMRouterService(). All optional — defaults
 * produce a router suitable for kernel boot when at least one provider
 * key is in env.
 */
export interface LLMRouterServiceOptions {
  /** Project root (used to find .agentic-qe/llm-config.json). Defaults to findProjectRoot(). */
  projectRoot?: string;
  /** Explicit config override (highest precedence). */
  override?: Partial<RouterConfig>;
  /** Custom env (for testing). Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /**
   * Inject a pre-built ProviderManager (for tests with mock providers).
   * When supplied, config loading and provider construction is skipped.
   */
  providerManager?: ProviderManager;
}

/**
 * Order in which we pick fallbacks when the user hasn't specified any.
 * Local-first (free), then cheapest cloud, then richer providers. This
 * is a defensive default; users who care should set
 * `routerConfig.fallbackChain` explicitly.
 */
const FALLBACK_PRIORITY: readonly ExtendedProviderType[] = [
  'ollama',
  'onnx',
  'gemini',
  'openrouter',
  'openai',
  'claude',
  'azure-openai',
  'bedrock',
];

/**
 * Result of building a router. Carries the router plus the resolved
 * config (useful for logging at boot) and the set of providers we
 * actually wired up.
 */
export interface BuiltLLMRouter {
  router: HybridRouter;
  resolvedConfig: RouterConfig;
  enabledProviders: ExtendedProviderType[];
}

/**
 * Build (and initialize) a HybridRouter for use as the kernel singleton.
 * Returns null when no providers are available — caller decides whether
 * that's an error or a "router-disabled" boot.
 */
export async function createLLMRouterService(
  options: LLMRouterServiceOptions = {}
): Promise<BuiltLLMRouter | null> {
  // Honor the test-injected ProviderManager path first.
  if (options.providerManager) {
    const config = applyAgentOverrides(loadRouterConfig({
      projectRoot: options.projectRoot,
      override: options.override,
      env: options.env,
    }));
    const router = new HybridRouter(options.providerManager, config);
    await router.initialize();
    return {
      router,
      resolvedConfig: config,
      enabledProviders: providersFromConfig(config),
    };
  }

  // Real path: detect env, load config, build provider manager.
  if (!shouldEnableRouter({ projectRoot: options.projectRoot, env: options.env })) {
    return null;
  }

  const config = applyAgentOverrides(loadRouterConfig({
    projectRoot: options.projectRoot,
    override: options.override,
    env: options.env,
  }));

  const enabled = pickEnabledProviders(config, options.env ?? process.env);
  if (enabled.length === 0) {
    return null;
  }

  // Issue #568: an override naming a provider that isn't enabled would silently
  // fall through to the default chain — the exact "configured it and nothing
  // happened" failure this feature exists to avoid. Say so out loud. We do NOT
  // auto-enable it: that would opt the user into a provider (and possibly paid
  // billing) they never turned on.
  const enabledSet = new Set<ExtendedProviderType>(enabled);
  for (const [agentType, override] of Object.entries(config.agentOverrides ?? {})) {
    if (override.provider && !enabledSet.has(override.provider)) {
      routerServiceLogger.warn(
        `[llm-config] agentOverrides["${agentType}"] routes to provider ` +
        `"${override.provider}", which is not enabled (no API key detected and not ` +
        `enabled in .agentic-qe/llm-config.json). This override will not take effect ` +
        `until that provider is available.`
      );
    }
  }

  const { primary, fallbacks } = pickPrimaryAndFallbacks(config, enabled);

  const providerManagerConfig: Partial<ProviderManagerConfig> = {
    primary: primary as LLMProviderType,
    fallbacks: fallbacks as LLMProviderType[],
    providers: extractProviderConfigs(config, enabled),
    loadBalancing: 'round-robin',
    global: { enableCostTracking: true, enableMetrics: true },
  };

  const providerManager = new ProviderManager(providerManagerConfig);
  const router = new HybridRouter(providerManager, config);
  await router.initialize();

  return {
    router,
    resolvedConfig: config,
    enabledProviders: enabled,
  };
}

/**
 * Determine which providers are actually usable. A provider is enabled if:
 *   - its config has `enabled: true`, AND
 *   - it's either local (ollama, onnx) OR has a detected env key
 *
 * Returns a deduped list in FALLBACK_PRIORITY order with the user's
 * defaultProvider hoisted to the front when present.
 */
export function pickEnabledProviders(
  config: RouterConfig,
  env: NodeJS.ProcessEnv = process.env
): ExtendedProviderType[] {
  const detected = detectAvailableProvidersFromEnv(env);
  const result: ExtendedProviderType[] = [];

  const consider = (p: ExtendedProviderType): void => {
    if (result.includes(p)) return;
    const cfg = config.providers?.[p];
    if (!cfg?.enabled) return;
    if (!detected.has(p)) return;
    result.push(p);
  };

  // User's preferred default first
  consider(config.defaultProvider);
  // Then fallback chain order if user set it
  for (const entry of config.fallbackChain?.entries ?? []) {
    consider(entry.provider);
  }
  // Then our defensive priority
  for (const p of FALLBACK_PRIORITY) {
    consider(p);
  }

  return result;
}

/**
 * Collect the unique provider list from a RouterConfig — used by the
 * test-injected ProviderManager path where we don't run the env-detect
 * filter.
 */
function providersFromConfig(config: RouterConfig): ExtendedProviderType[] {
  const seen = new Set<ExtendedProviderType>([config.defaultProvider]);
  for (const entry of config.fallbackChain?.entries ?? []) {
    seen.add(entry.provider);
  }
  return Array.from(seen);
}

/**
 * Choose the primary provider and fallback chain from the enabled set.
 * Honors config.defaultProvider when it's in the enabled set, otherwise
 * picks the first enabled provider in priority order.
 */
export function pickPrimaryAndFallbacks(
  config: RouterConfig,
  enabled: ExtendedProviderType[]
): { primary: ExtendedProviderType; fallbacks: ExtendedProviderType[] } {
  if (enabled.length === 0) {
    throw new Error('pickPrimaryAndFallbacks: no enabled providers');
  }
  const preferred = enabled.includes(config.defaultProvider)
    ? config.defaultProvider
    : enabled[0];
  const fallbacks = enabled.filter((p) => p !== preferred);
  return { primary: preferred, fallbacks };
}

/**
 * Extract only the provider configs for the enabled set, so
 * ProviderManager doesn't try to construct providers we don't need.
 */
function extractProviderConfigs(
  config: RouterConfig,
  enabled: ExtendedProviderType[]
): ProviderManagerConfig['providers'] {
  const out: ProviderManagerConfig['providers'] = {};
  for (const p of enabled) {
    const cfg = config.providers?.[p];
    if (cfg) {
      (out as Record<string, unknown>)[p] = cfg;
    }
  }
  return out;
}
