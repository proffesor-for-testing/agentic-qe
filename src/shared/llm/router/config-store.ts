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
  openai: ['OPENAI_API_KEY'],
  ollama: [], // ollama is local; no key required
  openrouter: ['OPENROUTER_API_KEY'],
  gemini: ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  'azure-openai': ['AZURE_OPENAI_API_KEY'],
  bedrock: ['AWS_ACCESS_KEY_ID'], // bedrock auth is more complex; presence is a hint
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
  'openai',
  'ollama',
  'openrouter',
  'gemini',
  'azure-openai',
  'bedrock',
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
 */
function stripApiKeys(config: Partial<RouterConfig>): Partial<RouterConfig> {
  if (!config.providers) {
    return JSON.parse(JSON.stringify(config));
  }
  const cloned = JSON.parse(JSON.stringify(config)) as Partial<RouterConfig>;
  if (cloned.providers) {
    for (const provider of Object.keys(cloned.providers) as ExtendedProviderType[]) {
      const entry = cloned.providers[provider];
      if (entry && 'apiKey' in entry) {
        delete (entry as unknown as Record<string, unknown>).apiKey;
      }
    }
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
 */
export function applyEnvProviderDetection(
  config: RouterConfig,
  env: NodeJS.ProcessEnv = process.env
): RouterConfig {
  const available = detectAvailableProvidersFromEnv(env);
  const merged: RouterConfig = {
    ...config,
    providers: { ...(config.providers ?? {}) },
  };
  for (const provider of available) {
    const keys = PROVIDER_ENV_KEYS[provider];
    if (keys.length === 0) continue; // local provider, leave default
    const current = merged.providers![provider] ?? { enabled: false };
    if (!current.enabled) {
      merged.providers![provider] = { ...current, enabled: true };
    }
  }
  return merged;
}

/**
 * The full load path: defaults <- disk <- env detection <- override.
 * This is what the kernel and CLI both call. Returns a fully-resolved
 * RouterConfig ready to hand to HybridRouter.
 */
export function loadRouterConfig(
  options: {
    projectRoot?: string;
    override?: Partial<RouterConfig>;
    env?: NodeJS.ProcessEnv;
  } = {}
): RouterConfig {
  const onDisk = loadRouterConfigFile(options.projectRoot);
  const merged = mergeRouterConfig(DEFAULT_ROUTER_CONFIG, onDisk);
  const withEnv = applyEnvProviderDetection(merged, options.env);
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
