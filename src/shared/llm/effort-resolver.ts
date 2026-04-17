/**
 * Agentic QE v3 - Effort Level Resolver
 * ADR-093: Opus 4.7 Migration + Claude Code 2026-04 Feature Adoption
 *
 * Resolves the effort level for a given LLM request. Implements the
 * priority chain:
 *
 *   runtime call-site override
 *     > per-agent frontmatter `effort:`
 *     > QE_EFFORT_LEVEL env var
 *     > config/fleet-defaults.yaml `effort_level`
 *     > DEFAULT_EFFORT_LEVEL (xhigh)
 *
 * Only levels that the target model's capabilities support are applied
 * downstream; claude.ts silently downgrades unsupported levels.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Anthropic effort levels for agentic reasoning.
 * Ordered low-to-high: low < medium < high < xhigh < max.
 * `xhigh` was introduced with Opus 4.7 (2026-04-16) and is Anthropic's
 * recommended starting point for agentic coding per ADR-093.
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Ordered list of effort levels for comparison and downgrade logic.
 */
export const EFFORT_LEVELS: readonly EffortLevel[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

/**
 * ADR-093 fleet-wide default effort level. `xhigh` is Anthropic's
 * recommended starting point for agentic coding on Opus 4.7+.
 */
export const DEFAULT_EFFORT_LEVEL: EffortLevel = 'xhigh';

/**
 * Valid effort level strings. Used to validate env/YAML input.
 */
function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === 'string' && (EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * Options for the effort resolver.
 */
export interface ResolveEffortOptions {
  /** Explicit runtime override (highest priority). */
  override?: EffortLevel;
  /** Per-agent effort from frontmatter (second priority). */
  agentEffort?: EffortLevel;
  /** Path to the fleet defaults YAML (mainly for testing). */
  fleetDefaultsPath?: string;
  /** Injected env for testing. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Cache the YAML-parsed fleet default to avoid re-reading on every call.
 * Reset via `resetFleetDefaultsCache()` for tests.
 */
let fleetDefaultCache: EffortLevel | null | undefined;

/**
 * Reset the fleet-defaults cache. Call between tests that mutate the YAML.
 */
export function resetFleetDefaultsCache(): void {
  fleetDefaultCache = undefined;
}

/**
 * Read `effort_level` from config/fleet-defaults.yaml.
 * Returns null if the file is missing, unreadable, or malformed.
 * Uses a minimal regex parser to avoid adding a YAML dependency.
 */
function loadFleetDefaultSync(fleetDefaultsPath: string): EffortLevel | null {
  try {
    // Synchronous file read via require-like pattern — fs.readFileSync would
    // require a blocking import; we accept async-only and cache eagerly on
    // first resolver call.
    // Callers needing sync resolution should seed via env or override.
    const { readFileSync } = require('fs') as typeof import('fs');
    const raw = readFileSync(fleetDefaultsPath, 'utf8');
    const match = raw.match(/^\s*effort_level\s*:\s*['"]?([a-z]+)['"]?\s*$/m);
    if (match && isEffortLevel(match[1])) {
      return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the effort level for a request following ADR-093's priority chain.
 *
 * @example
 * ```ts
 * // Default: returns 'xhigh' in a fresh environment
 * resolveEffortLevel();
 *
 * // Env override
 * resolveEffortLevel({ env: { QE_EFFORT_LEVEL: 'medium' } }); // 'medium'
 *
 * // Per-agent override
 * resolveEffortLevel({ agentEffort: 'max' }); // 'max'
 *
 * // Runtime override wins over everything
 * resolveEffortLevel({ override: 'low', agentEffort: 'max' }); // 'low'
 * ```
 */
export function resolveEffortLevel(options: ResolveEffortOptions = {}): EffortLevel {
  // 1. Runtime override
  if (options.override && isEffortLevel(options.override)) {
    return options.override;
  }

  // 2. Per-agent frontmatter
  if (options.agentEffort && isEffortLevel(options.agentEffort)) {
    return options.agentEffort;
  }

  // 3. Env var
  const env = options.env ?? process.env;
  const envLevel = env.QE_EFFORT_LEVEL;
  if (envLevel && isEffortLevel(envLevel)) {
    return envLevel;
  }

  // 4. Fleet defaults YAML
  const yamlPath =
    options.fleetDefaultsPath ??
    path.join(process.cwd(), 'config', 'fleet-defaults.yaml');

  if (fleetDefaultCache === undefined) {
    fleetDefaultCache = loadFleetDefaultSync(yamlPath);
  }
  if (fleetDefaultCache) {
    return fleetDefaultCache;
  }

  // 5. Hardcoded default
  return DEFAULT_EFFORT_LEVEL;
}

/**
 * Downgrade an effort level to a target maximum. Used by provider code
 * when the target model does not support the requested level
 * (e.g., Sonnet 4.6 does not support `xhigh`).
 *
 * @example
 * downgradeEffort('xhigh', 'high'); // 'high'
 * downgradeEffort('low', 'high');   // 'low' (no upgrade)
 */
export function downgradeEffort(
  requested: EffortLevel,
  cap: EffortLevel,
): EffortLevel {
  const requestedIdx = EFFORT_LEVELS.indexOf(requested);
  const capIdx = EFFORT_LEVELS.indexOf(cap);
  return requestedIdx > capIdx ? cap : requested;
}
