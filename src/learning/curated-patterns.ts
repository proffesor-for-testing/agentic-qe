/**
 * Agentic QE v3 - Patterns a person or the product curated (#1388)
 *
 * Automatic writers (experience capture, session consolidation, the
 * PostTestGeneration hook, task-completed extraction, dream insights,
 * ReasoningBankService task patterns) store patterns with unmeasured
 * "task completed" evidence. Test generation applies such a pattern only once
 * it has a measured success. Two kinds of pattern apply without one:
 *
 *   - built-in seeds shipped with AQE, and their cross-domain transfers
 *     (`<seed> (from <domain>)`);
 *   - patterns a person curated: `aqe learning import` / `import-merge` mark
 *     each imported pattern with `context.curation = 'user-import'`.
 *
 * Curation is a positive marker no automatic writer sets. It is never
 * inferred from the absence of an automatic writer's markers.
 */

import { PRETRAINED_PATTERNS } from './pretrained-patterns.js';

/** How a person curated a pattern. */
export type PatternCuration = 'user-import';

/** The context field that carries the curation marker. */
export const CURATION_FIELD = 'curation';

/**
 * Seeds ReasoningBankService stores into an empty bank
 * (src/mcp/services/reasoning-bank-service.ts, seedInitialPatternsIfNeeded).
 */
export const REASONING_BANK_SERVICE_SEED_NAMES: readonly string[] = [
  'unit-test-generation',
  'coverage-gap-analysis',
  'integration-test-generation',
  'flaky-test-remediation',
  'security-vulnerability-scan',
];

/** Names of every built-in seed pattern. */
export const BUILTIN_SEED_PATTERN_NAMES: ReadonlySet<string> = new Set([
  ...PRETRAINED_PATTERNS.map((pattern) => pattern.name),
  ...REASONING_BANK_SERVICE_SEED_NAMES,
]);

const TRANSFER_SUFFIX = / \(from [a-z-]+\)$/;

/** True for a built-in seed or its cross-domain transfer `<seed> (from <domain>)`. */
export function isBuiltinSeedName(name: string): boolean {
  return BUILTIN_SEED_PATTERN_NAMES.has(name) || BUILTIN_SEED_PATTERN_NAMES.has(name.replace(TRANSFER_SUFFIX, ''));
}

/** Mark a pattern context as curated by a person (overrides any incoming marker). */
export function markUserCurated<T extends object>(context: T | undefined, curation: PatternCuration): T & { curation: PatternCuration } {
  return { ...(context ?? ({} as T)), [CURATION_FIELD]: curation } as T & { curation: PatternCuration };
}

/** True when the parsed pattern context carries a person's curation marker. */
export function isUserCurated(context: unknown): boolean {
  if (!context || typeof context !== 'object') return false;
  return (context as Record<string, unknown>)[CURATION_FIELD] === 'user-import';
}
