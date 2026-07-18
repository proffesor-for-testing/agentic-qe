/**
 * Agentic QE v3 - LLM Router Config Store (ADR-043)
 *
 * Persistent storage and environment-aware merging for HybridRouter
 * configuration. Lives next to the project's .agentic-qe/ data dir so
 * each project can carry its own routing policy without leaking secrets.
 *
 * Precedence (highest wins):
 *   1. Explicit override passed to loadRouterConfig()
 *   2. Environment variables (provider API keys, AQE_LLM_* settings)
 *   3. .agentic-qe/llm-config.json (project file)
 *   4. DEFAULT_ROUTER_CONFIG from types.ts
 *
 * Provider enablement: a provider whose API key is present in the
 * environment is force-enabled (overriding any disk value of `enabled:
 * false`). A provider whose key is absent is left in its disk/default
 * state — we don't disable it implicitly, because users may set keys
 * later via `aqe llm config --set`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot } from '../../../kernel/unified-memory.js';
import type { RouterConfig, ExtendedProviderType } from './types.js';
import { DEFAULT_ROUTER_CONFIG, ALL_PROVIDER_TYPES } from './types.js';

/** Filename under .agentic-qe/ */
export const ROUTER_CONFIG_FILENAME = 'llm-config.json';

/**
 * Env var names per provider — multiple aliases supported where the
 * upstream provider accepts more than one name. First non-empty wins.
 *
 * Empty array means "local provider, no key required". The set of
 * runtime-constructible providers is narrower than ExtendedProviderType
 * (e.g. onnx is in the type system but ProviderManager doesn't yet
 * have a case for it) — see RUNTIME_CONSTRUCTIBLE_PROVIDERS below.
 */
const PROVIDER_ENV_KEYS: Record<ExtendedProviderType, readonly string[]> = {
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  // ADR-123: claude-code authenticates via the user's Claude Code OAuth login
  // (subscription), NOT an env key. Empty array = "no key required"; actual
  // availability is gated on the `claude` binary being on PATH (see the
  // provider's isAvailable()).
  'claude-code': [],
  openai: ['OPENAI_API_KEY'],
  ollama: [], // ollama is local; no key required
  openrouter: ['OPENROUTER_API_KEY'],
  gemini: ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  'azure-openai': ['AZURE_OPENAI_API_KEY'],
  bedrock: ['AWS_ACCESS_KEY_ID'], // bedrock auth is more complex; presence is a hint
  cognitum: ['COGNITUM_API_KEY'], // ADR-123: metered-capped gateway
  onnx: [], // local
};

/**
 * Providers that ProviderManager.createProvider() can actually
 * instantiate today. Anything not in this set is dropped from the
 * "available" set even if its env keys are present, so we don't emit
 * a "Failed to create X provider" warning at every kernel boot.
 *
 * Keep this in sync with src/shared/llm/provider-manager.ts:createProvider().
 */
const RUNTIME_CONSTRUCTIBLE_PROVIDERS: ReadonlySet<ExtendedProviderType> = new Set([
  'claude',
  'claude-code',
  'openai',
  'ollama',
  'openrouter',
  'gemini',
  'azure-openai',
  'bedrock',
  'cognitum',
]);

/**
 * Return the resolved config-file path for a project.
 * Caller may override projectRoot for tests; defaults to findProjectRoot().
 */
export function getRouterConfigPath(projectRoot?: string): string {
  const root = projectRoot ?? findProjectRoot();
  return path.join(root, '.agentic-qe', ROUTER_CONFIG_FILENAME);
}

/**
 * Detect which providers have a non-empty API key in the current env.
 * Ollama and ONNX always count as detected (they're local).
 */
export function detectAvailableProvidersFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Set<ExtendedProviderType> {
  const available = new Set<ExtendedProviderType>();
  for (const provider of ALL_PROVIDER_TYPES) {
    if (!RUNTIME_CONSTRUCTIBLE_PROVIDERS.has(provider)) {
      // ProviderManager has no case for this provider yet (e.g. onnx).
      // Pretending it's available leads to "Failed to create" noise.
      continue;
    }
    const keys = PROVIDER_ENV_KEYS[provider];
    if (keys.length === 0) {
      // local providers — always available if their binary is, but at
      // config-merge time we treat them as "potentially available"
      available.add(provider);
      continue;
    }
    if (keys.some((k) => (env[k] ?? '').trim().length > 0)) {
      available.add(provider);
    }
  }
  return available;
}

/**
 * Load the project-level router config from disk. Returns the parsed
 * partial config, or {} if the file doesn't exist or is unreadable.
 * Malformed JSON throws — we don't silently corrupt user config.
 */
export function loadRouterConfigFile(projectRoot?: string): Partial<RouterConfig> {
  const filePath = getRouterConfigPath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid ${ROUTER_CONFIG_FILENAME}: expected object, got ${typeof parsed}`);
  }
  return parsed as Partial<RouterConfig>;
}

/**
 * Save the project-level router config to disk. Creates the .agentic-qe
 * directory if missing. Writes atomically via a temp-file + rename so a
 * crashed write can't leave a half-written config behind.
 *
 * IMPORTANT: this file is project-local and may end up checked into the
 * repo. Callers MUST NOT pass API keys in `config.providers[*].apiKey`
 * — keys belong in env vars. We strip apiKey fields defensively.
 */
export function saveRouterConfigFile(
  config: Partial<RouterConfig>,
  projectRoot?: string
): void {
  const filePath = getRouterConfigPath(projectRoot);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sanitized = stripApiKeys(config);
  const json = JSON.stringify(sanitized, null, 2) + '\n';

  const tmp = filePath + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, json, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

/**
 * Strip apiKey fields from provider configs to prevent accidental
 * commits of secrets. Returns a deep clone — input is untouched.
 *
 * Emits a console warning when any apiKey is stripped, so silent
 * strips don't surprise callers. The kernel/CLI consume from env
 * vars (ANTHROPIC_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, etc.),
 * never from disk config — see config-store doc header for the
 * precedence rule.
 */
function stripApiKeys(config: Partial<RouterConfig>): Partial<RouterConfig> {
  if (!config.providers) {
    return JSON.parse(JSON.stringify(config));
  }
  const cloned = JSON.parse(JSON.stringify(config)) as Partial<RouterConfig>;
  const strippedProviders: string[] = [];
  if (cloned.providers) {
    for (const provider of Object.keys(cloned.providers) as ExtendedProviderType[]) {
      const entry = cloned.providers[provider];
      if (entry && 'apiKey' in entry && (entry as any).apiKey) {
        delete (entry as unknown as Record<string, unknown>).apiKey;
        strippedProviders.push(provider);
      }
    }
  }
  if (strippedProviders.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[router-config] Refused to persist apiKey for: ${strippedProviders.join(', ')}. ` +
      `API keys belong in environment variables (e.g. ANTHROPIC_API_KEY, GEMINI_API_KEY, ` +
      `OPENAI_API_KEY, OPENROUTER_API_KEY), NOT in .agentic-qe/llm-config.json which may ` +
      `be checked into source control.`
    );
  }
  return cloned;
}

/**
 * Merge a partial config onto a base. Provider entries are shallow-merged
 * (so a partial provider override doesn't wipe the default model). The
 * top-level scalars use last-wins.
 */
export function mergeRouterConfig(
  base: RouterConfig,
  override: Partial<RouterConfig>
): RouterConfig {
  const merged: RouterConfig = {
    ...base,
    ...override,
    providers: { ...(base.providers ?? {}) },
  };

  if (override.providers) {
    for (const [provider, cfg] of Object.entries(override.providers)) {
      if (!cfg) continue;
      const key = provider as ExtendedProviderType;
      merged.providers![key] = {
        ...(base.providers?.[key] ?? {}),
        ...cfg,
      };
    }
  }

  return merged;
}

/**
 * Apply env-detection on top of a merged config: providers whose API
 * keys are present in env are force-enabled (so a user who sets
 * GOOGLE_API_KEY doesn't also have to remember to flip gemini.enabled
 * to true). Providers without keys are left at their existing setting.
 *
 * ADR-123 AMENDMENT to ADR-043's addendum: env presence force-enables a
 * provider ONLY when the user has not *explicitly* disabled it on disk. An
 * explicit `enabled: false` in `.agentic-qe/llm-config.json` now wins over
 * key presence — the previous behavior (env always overrides disk) meant
 * merely exporting `ANTHROPIC_API_KEY` silently opted a user into paid API
 * billing even after they had turned the provider off (issue #557). A
 * provider left unset on disk is still force-enabled when its key is present
 * (the convenient default). To disable a provider that has a key in env, set
 * `enabled: false` for it on disk, unset the env key, or use the env-only
 * kill-switch `AQE_LLM_ROUTER_DISABLED=1` (disables the whole router).
 *
 * @param explicitlyDisabled providers the user set to `enabled: false` in the
 *   raw on-disk config; these are never force-enabled by env detection.
 */
export function applyEnvProviderDetection(
  config: RouterConfig,
  env: NodeJS.ProcessEnv = process.env,
  explicitlyDisabled: ReadonlySet<ExtendedProviderType> = new Set()
): RouterConfig {
  const available = detectAvailableProvidersFromEnv(env);
  const merged: RouterConfig = {
    ...config,
    providers: { ...(config.providers ?? {}) },
  };
  for (const provider of available) {
    const keys = PROVIDER_ENV_KEYS[provider];
    if (keys.length === 0) continue; // local provider, leave default
    if (explicitlyDisabled.has(provider)) continue; // ADR-123: honor explicit off
    const current = merged.providers![provider] ?? { enabled: false };
    if (!current.enabled) {
      merged.providers![provider] = { ...current, enabled: true };
    }
  }
  return merged;
}

/**
 * Collect providers the user *explicitly* set to `enabled: false` in the raw
 * on-disk config (as opposed to a default `false`). Used so env detection
 * doesn't resurrect a provider the user deliberately turned off (ADR-123).
 */
export function collectExplicitlyDisabled(
  onDisk: Partial<RouterConfig>
): Set<ExtendedProviderType> {
  const disabled = new Set<ExtendedProviderType>();
  if (!onDisk.providers) return disabled;
  for (const [provider, cfg] of Object.entries(onDisk.providers)) {
    if (cfg && (cfg as { enabled?: boolean }).enabled === false) {
      disabled.add(provider as ExtendedProviderType);
    }
  }
  return disabled;
}

/**
 * ADR-123: highest-precedence provider selector. `AQE_LLM_PROVIDER=<type>`
 * (e.g. `claude-code`, `cognitum`, `openai`) overrides `defaultProvider` and
 * force-enables that provider, so a user can switch the execution provider for
 * a single run without editing `llm-config.json`. `anthropic` is accepted as
 * an alias for `claude`. Unknown values are ignored (a warning is logged).
 */
export function resolveProviderOverrideFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ExtendedProviderType | undefined {
  const raw = (env.AQE_LLM_PROVIDER ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  const normalized = raw === 'anthropic' ? 'claude' : raw;
  if ((ALL_PROVIDER_TYPES as readonly string[]).includes(normalized)) {
    return normalized as ExtendedProviderType;
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[router-config] Ignoring AQE_LLM_PROVIDER="${raw}": not a known provider. ` +
    `Valid values: ${ALL_PROVIDER_TYPES.join(', ')}.`
  );
  return undefined;
}

/**
 * The full load path: defaults <- disk <- env detection <- AQE_LLM_PROVIDER
 * override <- explicit override. This is what the kernel and CLI both call.
 * Returns a fully-resolved RouterConfig ready to hand to HybridRouter.
 */
export function loadRouterConfig(
  options: {
    projectRoot?: string;
    override?: Partial<RouterConfig>;
    env?: NodeJS.ProcessEnv;
  } = {}
): RouterConfig {
  const env = options.env ?? process.env;
  const onDisk = loadRouterConfigFile(options.projectRoot);
  const merged = mergeRouterConfig(DEFAULT_ROUTER_CONFIG, onDisk);
  // ADR-123: an explicit `enabled: false` on disk is never resurrected by env.
  const explicitlyDisabled = collectExplicitlyDisabled(onDisk);
  let withEnv = applyEnvProviderDetection(merged, env, explicitlyDisabled);

  // ADR-123: AQE_LLM_PROVIDER pins the default provider and enables it.
  const providerOverride = resolveProviderOverrideFromEnv(env);
  if (providerOverride) {
    withEnv = {
      ...withEnv,
      defaultProvider: providerOverride,
      providers: {
        ...withEnv.providers,
        [providerOverride]: {
          ...(withEnv.providers?.[providerOverride] ?? {}),
          enabled: true,
        },
      },
    };
  }

  return options.override ? mergeRouterConfig(withEnv, options.override) : withEnv;
}

/**
 * Quick check used by the kernel to decide whether to construct a
 * router at all. Returns true if at least one non-local provider has
 * a key in env, OR the disk config explicitly enables a provider.
 */
export function shouldEnableRouter(
  options: { projectRoot?: string; env?: NodeJS.ProcessEnv } = {}
): boolean {
  const env = options.env ?? process.env;
  for (const provider of ALL_PROVIDER_TYPES) {
    const keys = PROVIDER_ENV_KEYS[provider];
    if (keys.length === 0) continue;
    if (keys.some((k) => (env[k] ?? '').trim().length > 0)) {
      return true;
    }
  }
  // No env keys — fall back to disk config.
  const onDisk = loadRouterConfigFile(options.projectRoot);
  if (onDisk.providers) {
    for (const cfg of Object.values(onDisk.providers)) {
      if (cfg?.enabled) return true;
    }
  }
  return false;
}
