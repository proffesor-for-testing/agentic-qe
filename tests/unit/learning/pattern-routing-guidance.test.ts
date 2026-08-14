import { describe, expect, it } from 'vitest';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import type { QERoutingResult } from '../../../src/learning/qe-reasoning-bank-types.js';
import {
  enhanceRoutingWithPatterns,
  maybeEnhanceRoutingWithPatterns,
  type RoutingPatternMatch,
} from '../../../src/learning/pattern-routing-guidance.js';

describe('enhanceRoutingWithPatterns', () => {
  it('appends relevant learned guidance while preserving static guidance', () => {
    const pattern = createPattern('relevant', 0.3);

    const result = enhanceRoutingWithPatterns(createRoutingResult(), [match(pattern, 0.5)]);

    expect(result.guidance).toEqual([
      'Static domain guidance',
      '--- Relevant Patterns ---',
      '[Pattern: relevant] relevant description (confidence: 80%, similarity: 50%)',
    ]);
    expect(result.patterns).toEqual([pattern]);
  });

  it.each([
    ['low similarity', match(createPattern('low similarity', 0.9), 0.499)],
    ['low quality', match(createPattern('low quality', 0.299), 0.9)],
  ])('does not append %s pattern guidance', (_label, candidate) => {
    const original = createRoutingResult();

    expect(enhanceRoutingWithPatterns(original, [candidate])).toBe(original);
  });

  it('preserves the routing result when no patterns match', () => {
    const original = createRoutingResult();

    expect(enhanceRoutingWithPatterns(original, [])).toBe(original);
  });

  it('preserves legacy guidance when learned guidance is not explicitly enabled', () => {
    const original = createRoutingResult();
    const relevant = match(createPattern('relevant', 0.9), 0.9);

    expect(maybeEnhanceRoutingWithPatterns(undefined, original, [relevant])).toBe(original);
    expect(maybeEnhanceRoutingWithPatterns(false, original, [relevant])).toBe(original);
  });

  it('applies relevant guidance when explicitly enabled', () => {
    const original = createRoutingResult();
    const relevant = match(createPattern('relevant', 0.9), 0.9);

    expect(maybeEnhanceRoutingWithPatterns(true, original, [relevant]).guidance)
      .toContain('--- Relevant Patterns ---');
  });
});

function createRoutingResult(): QERoutingResult {
  return {
    recommendedAgent: 'qe-test-architect',
    confidence: 0.4,
    alternatives: [],
    domains: ['test-generation'],
    patterns: [],
    guidance: ['Static domain guidance'],
    reasoning: 'Domain match',
  };
}

function createPattern(name: string, qualityScore: number): QEPattern {
  return {
    id: `pattern-${name}`,
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name,
    description: `${name} description`,
    confidence: 0.8,
    usageCount: 3,
    successRate: 0.9,
    qualityScore,
    context: { tags: [] },
    template: { type: 'guidance', content: name, variables: [] },
    tier: 'long-term',
    createdAt: new Date(0),
    lastUsedAt: new Date(0),
    successfulUses: 3,
    reusable: false,
    reuseCount: 0,
    averageTokenSavings: 0,
  };
}

function match(pattern: QEPattern, similarity: number): RoutingPatternMatch {
  return { pattern, similarity };
}
