/**
 * Agentic QE v3 — External provider registry
 * ADR-127: External provider registration (issue #628)
 *
 * The sanctioned extension point for provider identity. A downstream
 * integrator can register an additional provider type so
 * `AQE_LLM_PROVIDER=<their-host>` resolves to a provider they supply, instead
 * of forking `BuiltinProviderType` or projecting their host onto an unrelated
 * vendor identity (which would make `aqe health` misreport who served the work).
 *
 * Two entry points feed this registry:
 *   1. `registerProvider()` — for a consumer that embeds AQE in-process.
 *   2. The `externalProviders` block in `.agentic-qe/llm-config.json` — for the
 *      subprocess case (the `aqe` CLI and MCP server are separate bundles, so
 *      an in-process call cannot reach them). See `external-provider-config.ts`.
 *
 * State is process-global module state, matching ADR-125's
 * `agent-router-config.ts`. Tests must call `resetProviderRegistry()`.
 */

import {
  type BillingMode,
  type LLMProvider,
  type LLMProviderType,
  isBuiltinProviderType,
  createLLMError,
} from './interfaces';

// ============================================================================
// Types
// ============================================================================

/**
 * Builds a provider instance. Receives whatever config the caller registered
 * the provider with (an `externalProviders` entry, or the `config` passed to
 * `registerProvider`). Must return an object satisfying `LLMProvider`.
 */
export type ProviderFactory = (config?: unknown) => LLMProvider;

/** Where a registration came from — surfaced by `aqe health` (ADR-127). */
export type ProviderRegistrationSource =
  | 'api'                    // registerProvider() called in-process
  | 'config';                // externalProviders in .agentic-qe/llm-config.json

export interface ProviderRegistrationOptions {
  /**
   * How this provider bills. ADR-123/ADR-127: this is an *assertion by the
   * registrant*, not something AQE can verify, so it is recorded with its
   * source and surfaced as "declared by". Omitting it resolves to
   * `metered-api` — the conservative, cap-requiring assumption.
   */
  readonly billingMode?: BillingMode;
  /** Human-facing name for CLI output. Defaults to the type string. */
  readonly displayName?: string;
  /** Models this provider accepts. Informational; used by CLI listings. */
  readonly models?: readonly string[];
  /** Opaque config handed back to the factory on each construction. */
  readonly config?: unknown;
  /** Provenance. Defaults to `'api'`. */
  readonly source?: ProviderRegistrationSource;
  /** For `source: 'config'`, the file the declaration came from. */
  readonly sourceDetail?: string;
}

export interface RegisteredProvider extends ProviderRegistrationOptions {
  readonly type: string;
  readonly factory: ProviderFactory;
  readonly source: ProviderRegistrationSource;
}

// ============================================================================
// Registry state
// ============================================================================

const registry = new Map<string, RegisteredProvider>();

/**
 * Reserved identifiers that must never be claimed by an external provider.
 * `anthropic` is normalized to `claude` by `resolveProviderOverrideFromEnv`,
 * so registering it would create a type whose env selector is unreachable.
 */
const RESERVED_TYPES: ReadonlySet<string> = new Set(['anthropic']);

/** A provider type must be a URL/env-safe slug — this is an env var value. */
const VALID_TYPE = /^[a-z0-9][a-z0-9-]{0,62}$/;

// ============================================================================
// Registration
// ============================================================================

/**
 * Validate a candidate provider type. Returns an error message, or `undefined`
 * when the type is acceptable.
 *
 * Exported so config-driven registration can report per-entry problems without
 * throwing (a bad line in a config file must never be fatal — ADR-125's
 * drop-individually discipline).
 */
export function validateProviderType(type: string): string | undefined {
  if (typeof type !== 'string' || type.trim().length === 0) {
    return 'provider type must be a non-empty string';
  }
  if (type !== type.toLowerCase()) {
    return `provider type "${type}" must be lowercase (AQE_LLM_PROVIDER is matched case-insensitively)`;
  }
  if (!VALID_TYPE.test(type)) {
    return `provider type "${type}" must match ${VALID_TYPE.source} (lowercase alphanumeric and dashes)`;
  }
  if (isBuiltinProviderType(type)) {
    return `provider type "${type}" is built in and cannot be overridden`;
  }
  if (RESERVED_TYPES.has(type)) {
    return `provider type "${type}" is reserved`;
  }
  return undefined;
}

/**
 * Register an additional provider type (ADR-127).
 *
 * Throws on an invalid or colliding type — an in-process caller passing a bad
 * type has a bug, and silently ignoring it would strand `AQE_LLM_PROVIDER`
 * pointing at nothing. Config-driven registration uses
 * `tryRegisterProvider()` instead, which reports rather than throws.
 *
 * Re-registering the same type replaces the previous entry.
 *
 * @example
 * ```typescript
 * import { registerProvider } from 'agentic-qe/shared/llm';
 *
 * registerProvider('my-host', () => new MyHostProvider(), {
 *   billingMode: 'subscription',
 *   displayName: 'My Host (subscription)',
 * });
 * // now AQE_LLM_PROVIDER=my-host resolves
 * ```
 */
export function registerProvider(
  type: string,
  factory: ProviderFactory,
  options: ProviderRegistrationOptions = {}
): void {
  const problem = validateProviderType(type);
  if (problem) {
    throw createLLMError(problem, 'INVALID_REGISTRATION', { retryable: false });
  }
  if (typeof factory !== 'function') {
    throw createLLMError(
      `provider "${type}" must be registered with a factory function`,
      'INVALID_REGISTRATION',
      { retryable: false }
    );
  }
  registry.set(type, {
    ...options,
    type,
    factory,
    source: options.source ?? 'api',
  });
}

/**
 * Config-driven registration. Returns an error message instead of throwing, so
 * one malformed `externalProviders` entry drops itself rather than failing
 * router construction for the whole project.
 */
export function tryRegisterProvider(
  type: string,
  factory: ProviderFactory,
  options: ProviderRegistrationOptions = {}
): string | undefined {
  try {
    registerProvider(type, factory, options);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Remove a registration. Returns true if something was removed. */
export function unregisterProvider(type: string): boolean {
  return registry.delete(type);
}

/**
 * Clear all registrations. Tests must call this between cases — the registry
 * is module-global (ADR-125 precedent: `resetAgentProviderOverrides()`).
 */
export function resetProviderRegistry(): void {
  registry.clear();
}

// ============================================================================
// Lookup
// ============================================================================

/** Is this type registered as an external provider? */
export function isRegisteredProvider(type: string): boolean {
  return registry.has(type);
}

/** Get a registration, or `undefined`. */
export function getRegisteredProvider(type: string): RegisteredProvider | undefined {
  return registry.get(type);
}

/** All registrations, in registration order. */
export function listRegisteredProviders(): readonly RegisteredProvider[] {
  return [...registry.values()];
}

/** Just the registered type strings. */
export function registeredProviderTypes(): readonly string[] {
  return [...registry.keys()];
}

// ============================================================================
// Construction
// ============================================================================

/**
 * The subset of `LLMProvider` a registered provider must actually implement
 * for the manager and router to drive it. `embed` is deliberately excluded —
 * a CLI-shaped host cannot generally offer an embeddings endpoint, and
 * `ExternalCliProvider` throws `EMBEDDING_UNSUPPORTED` so the caller falls
 * back rather than receiving a fabricated vector.
 */
const REQUIRED_PROVIDER_METHODS = [
  'isAvailable',
  'healthCheck',
  'generate',
  'complete',
  'getConfig',
  'getSupportedModels',
  'getCostPerToken',
  'dispose',
] as const;

/**
 * Validate that a factory actually produced something the manager can drive.
 * Returns an error message, or `undefined` when the instance conforms.
 *
 * This runs at construction rather than registration because the product is
 * what must conform, and calling a factory eagerly at registration time would
 * be an unwanted side effect (a provider constructor may spawn processes or
 * open handles).
 */
export function validateProviderInstance(
  type: string,
  instance: unknown
): string | undefined {
  if (!instance || typeof instance !== 'object') {
    return `provider "${type}" factory returned ${instance === null ? 'null' : typeof instance}, expected an LLMProvider`;
  }
  const candidate = instance as Partial<LLMProvider>;
  const missing = REQUIRED_PROVIDER_METHODS.filter(
    (method) => typeof candidate[method] !== 'function'
  );
  if (missing.length > 0) {
    return `provider "${type}" is missing required LLMProvider method(s): ${missing.join(', ')}`;
  }
  if (typeof candidate.type !== 'string' || candidate.type.length === 0) {
    return `provider "${type}" must expose a non-empty \`type\``;
  }
  if (candidate.type !== type) {
    return `provider "${type}" reports type "${candidate.type}" — a provider must not claim an identity other than the one it was registered under`;
  }
  return undefined;
}

/**
 * Build an instance of a registered provider.
 *
 * Throws `PROVIDER_UNAVAILABLE` when the type is not registered, and
 * `INVALID_REQUEST` when the factory produced something that is not a usable
 * `LLMProvider`. `ProviderManager.createProvider()` calls this from the
 * `default` arm of its built-in `switch`, so built-ins always win and a
 * registration can never shadow one.
 */
export function createRegisteredProvider(type: LLMProviderType): LLMProvider {
  const registration = registry.get(type);
  if (!registration) {
    throw createLLMError(`Unknown provider type: ${type}`, 'PROVIDER_UNAVAILABLE', {
      retryable: false,
    });
  }

  const instance = registration.factory(registration.config);
  const problem = validateProviderInstance(type, instance);
  if (problem) {
    throw createLLMError(problem, 'INVALID_REGISTRATION', { retryable: false });
  }
  return instance;
}

/**
 * The billing mode a registered provider declared, with its provenance, for
 * `aqe health` to render as "external — <mode> (declared by <source>)".
 * Returns `undefined` for a type that is not registered.
 */
export function registeredBillingDeclaration(
  type: LLMProviderType
): { mode: BillingMode; source: ProviderRegistrationSource; detail?: string } | undefined {
  const registration = registry.get(type);
  if (!registration) return undefined;
  return {
    // Absent declaration → metered-api: assume it costs money and needs a cap.
    mode: registration.billingMode ?? 'metered-api',
    source: registration.source,
    detail: registration.sourceDetail,
  };
}
