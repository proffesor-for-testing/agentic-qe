/**
 * Agentic QE v3 — Config-driven external provider registration
 * ADR-127 (issue #628)
 *
 * Turns the `externalProviders` block of `.agentic-qe/llm-config.json` into
 * live entries in the provider registry.
 *
 * This is the half of ADR-127 that actually unblocks the requester. An
 * in-process `registerProvider()` call cannot reach the `aqe` CLI bundle or the
 * MCP server bundle — they are separate esbuild artifacts spawned as
 * subprocesses — but both call `loadRouterConfig()`, so a declaration on disk
 * reaches both. No third-party code is imported: a declaration is data, and the
 * provider it produces is AQE's own `ExternalCliProvider`.
 *
 * Untrusted-input discipline (inherited from ADR-125's `sanitizeAgentOverrides`):
 * entries are validated and dropped **individually** with a warning. One
 * malformed declaration must never fail router construction for the project.
 */

import {
  ExternalCliProvider,
  validateExternalCliConfig,
  type ExternalCliProviderConfig,
} from '../providers/external-cli.js';
import {
  tryRegisterProvider,
  unregisterProvider,
  validateProviderType,
} from '../provider-registry.js';
import type { LLMProvider } from '../interfaces';

/**
 * Types THIS module registered on the last load. Reaping is keyed off actual
 * ownership rather than off the `source` metadata field, because that field is
 * caller-supplied: an in-process embedder that passes `source: 'config'` must
 * not have its registration silently reaped by an unrelated config reload.
 */
const configOwnedTypes = new Set<string>();

/** Result of processing an `externalProviders` block. */
export interface ExternalProviderRegistrationResult {
  /** Types successfully registered. */
  readonly registered: string[];
  /** Human-readable reasons entries were dropped. */
  readonly warnings: string[];
}

/**
 * Register every valid declaration in an `externalProviders` block.
 *
 * Idempotent: re-registering the same type replaces the previous entry, and
 * config-sourced registrations that are no longer declared are removed. API
 * registrations (`registerProvider()`) are never touched — a config reload must
 * not silently unregister a provider an embedder installed in-process.
 */
export function registerExternalProviders(
  declarations: Record<string, ExternalCliProviderConfig> | undefined,
  options: { sourceDetail?: string } = {}
): ExternalProviderRegistrationResult {
  const registered: string[] = [];
  const warnings: string[] = [];
  const sourceDetail = options.sourceDetail ?? '.agentic-qe/llm-config.json';

  const declared = new Set(Object.keys(declarations ?? {}));

  // Drop declarations this module previously registered that are no longer in
  // the file, so removing an entry actually removes the provider. Types we do
  // not own are left alone. If the registry was reset out from under us,
  // `unregisterProvider` simply no-ops and the set is rebuilt below.
  for (const owned of configOwnedTypes) {
    if (!declared.has(owned)) {
      unregisterProvider(owned);
    }
  }
  configOwnedTypes.clear();

  for (const [type, declaration] of Object.entries(declarations ?? {})) {
    const typeProblem = validateProviderType(type);
    if (typeProblem) {
      warnings.push(`externalProviders["${type}"] ignored: ${typeProblem}`);
      continue;
    }

    const configProblem = validateExternalCliConfig(type, declaration);
    if (configProblem) {
      warnings.push(`${configProblem} — ignoring this entry.`);
      continue;
    }

    const registrationProblem = tryRegisterProvider(
      type,
      // The declaration is captured here, so each construction gets a fresh
      // provider built from the same validated data.
      () => new ExternalCliProvider(type, declaration) as unknown as LLMProvider,
      {
        billingMode: declaration.billingMode,
        displayName: declaration.displayName,
        models: declaration.models,
        config: declaration,
        source: 'config',
        sourceDetail,
      }
    );

    if (registrationProblem) {
      warnings.push(`externalProviders["${type}"] ignored: ${registrationProblem}`);
      continue;
    }
    configOwnedTypes.add(type);
    registered.push(type);
  }

  return { registered, warnings };
}

/**
 * Extract and shallow-validate an `externalProviders` block read off disk.
 * Returns only entries that are objects; deeper validation happens at
 * registration so every rejection is reported through one path.
 */
export function sanitizeExternalProviders(
  raw: unknown
): { declarations: Record<string, ExternalCliProviderConfig>; warnings: string[] } {
  const declarations: Record<string, ExternalCliProviderConfig> = {};
  const warnings: string[] = [];

  if (raw === undefined) return { declarations, warnings };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('externalProviders must be an object keyed by provider type; ignoring it.');
    return { declarations, warnings };
  }

  for (const [type, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      warnings.push(`externalProviders["${type}"] must be an object; ignoring this entry.`);
      continue;
    }
    declarations[type] = value as ExternalCliProviderConfig;
  }

  return { declarations, warnings };
}
