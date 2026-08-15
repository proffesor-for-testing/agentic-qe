import type { QERoutingResult } from './qe-reasoning-bank-types.js';
import type { QEPattern } from './qe-patterns.js';

export const ROUTING_PATTERN_SIMILARITY_FLOOR = 0.5;
export const ROUTING_PATTERN_QUALITY_FLOOR = 0.3;

/**
 * Add actionable learned-pattern context to an existing routing result.
 * This is pure composition: callers retain ownership of the initialized store.
 */
export interface RoutingPatternMatch {
  pattern: QEPattern;
  similarity: number;
}

export function enhanceRoutingWithPatterns<T extends QERoutingResult>(
  routingResult: T,
  patternResults: RoutingPatternMatch[],
): T {
  const relevantPatterns = patternResults.filter(
    ({ pattern, similarity }) =>
      similarity >= ROUTING_PATTERN_SIMILARITY_FLOOR
      && pattern.qualityScore >= ROUTING_PATTERN_QUALITY_FLOOR,
  );

  if (relevantPatterns.length === 0) return routingResult;

  const patternHints = relevantPatterns.map(({ pattern, similarity }) =>
    `[Pattern: ${pattern.name}] ${pattern.description} `
      + `(confidence: ${(pattern.confidence * 100).toFixed(0)}%, `
      + `similarity: ${(similarity * 100).toFixed(0)}%)`,
  );
  const existingPatternIds = new Set(routingResult.patterns.map(({ id }) => id));
  const additionalPatterns = relevantPatterns
    .map(({ pattern }) => pattern)
    .filter(({ id }) => !existingPatternIds.has(id));
  const avgSimilarity = relevantPatterns.reduce((sum, result) => sum + result.similarity, 0)
    / relevantPatterns.length;

  return {
    ...routingResult,
    patterns: [...routingResult.patterns, ...additionalPatterns],
    guidance: [
      ...routingResult.guidance,
      '--- Relevant Patterns ---',
      ...patternHints,
    ],
    reasoning: `${routingResult.reasoning}; Found ${relevantPatterns.length} relevant pattern(s) `
      + `with avg similarity ${(avgSimilarity * 100).toFixed(0)}%`,
    confidence: Math.min(1, routingResult.confidence + relevantPatterns.length * 0.02),
  } as T;
}

/** Preserve legacy routing output unless the caller explicitly enables learned guidance. */
export function maybeEnhanceRoutingWithPatterns<T extends QERoutingResult>(
  enabled: boolean | undefined,
  routingResult: T,
  patternResults: RoutingPatternMatch[],
): T {
  return enabled ? enhanceRoutingWithPatterns(routingResult, patternResults) : routingResult;
}
