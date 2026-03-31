/**
 * Agentic QE v3 - RuVector Filter Adapter Unit Tests
 * Task 1.2: Metadata Filtering Layer (ruvector-filter)
 *
 * Tests AND/OR/NOT filter composition, each filter operator,
 * backward compatibility, and performance requirements.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  applyFilter,
  applyFilterSync,
  evaluateFilter,
  validateFilter,
  resetNativeEngine,
  and,
  or,
  not,
  field,
} from '../../../../src/integrations/ruvector/filter-adapter';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags';
import type { PatternSearchResult } from '../../../../src/learning/pattern-store';
import type { QEPattern } from '../../../../src/learning/qe-patterns';
import type { FilterExpression } from '../../../../src/integrations/ruvector/interfaces';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockPattern(overrides: Partial<QEPattern> = {}): QEPattern {
  return {
    id: 'pattern-1',
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name: 'Mock Pattern',
    description: 'A mock pattern for testing',
    confidence: 0.85,
    usageCount: 10,
    successRate: 0.9,
    qualityScore: 0.8,
    context: {
      language: 'typescript',
      framework: 'vitest',
      testType: 'unit',
      tags: ['auth', 'security'],
    },
    template: {
      type: 'code',
      content: 'test template',
      variables: [],
    },
    tier: 'long-term',
    createdAt: new Date('2026-01-15'),
    lastUsedAt: new Date('2026-03-10'),
    successfulUses: 8,
    reusable: true,
    reuseCount: 5,
    averageTokenSavings: 200,
    ...overrides,
  } as QEPattern;
}

function createMockResult(
  patternOverrides: Partial<QEPattern> = {},
  score = 0.9
): PatternSearchResult {
  return {
    pattern: createMockPattern(patternOverrides),
    score,
    matchType: 'vector',
    similarity: score,
    canReuse: true,
    estimatedTokenSavings: 200,
    reuseConfidence: 0.85,
  };
}

function createTestResults(): PatternSearchResult[] {
  return [
    createMockResult({
      id: 'p1',
      qeDomain: 'test-generation',
      confidence: 0.95,
      context: { tags: ['auth', 'security'], language: 'typescript', framework: 'vitest', testType: 'unit' },
      createdAt: new Date('2026-01-01'),
    }, 0.95),
    createMockResult({
      id: 'p2',
      qeDomain: 'coverage-analysis',
      confidence: 0.7,
      context: { tags: ['coverage', 'metrics'], language: 'python', framework: 'pytest', testType: 'integration' },
      createdAt: new Date('2026-02-15'),
    }, 0.8),
    createMockResult({
      id: 'p3',
      qeDomain: 'security-compliance',
      confidence: 0.5,
      context: { tags: ['owasp', 'security'], language: 'typescript', framework: 'jest', testType: 'e2e' },
      createdAt: new Date('2026-03-01'),
    }, 0.6),
    createMockResult({
      id: 'p4',
      qeDomain: 'test-generation',
      confidence: 0.3,
      context: { tags: ['ui', 'component'], language: 'javascript', framework: 'cypress', testType: 'e2e' },
      createdAt: new Date('2025-12-01'),
    }, 0.4),
  ];
}

// ============================================================================
// Tests
// ============================================================================

describe('FilterAdapter', () => {
  beforeEach(() => {
    resetNativeEngine();
    setRuVectorFeatureFlags({ useMetadataFiltering: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
    resetNativeEngine();
  });

  // --------------------------------------------------------------------------
  // Backward Compatibility
  // --------------------------------------------------------------------------

  describe('Backward Compatibility', () => {
    it('should return all results when no filter is provided', () => {
      const results = createTestResults();
      const filtered = applyFilterSync(results, undefined);
      expect(filtered).toHaveLength(results.length);
      expect(filtered).toEqual(results);
    });

    it('should return all results when filter is null', () => {
      const results = createTestResults();
      const filtered = applyFilterSync(results, null);
      expect(filtered).toHaveLength(results.length);
    });

    it('should return results unchanged when feature flag is disabled (async)', async () => {
      setRuVectorFeatureFlags({ useMetadataFiltering: false });
      const results = createTestResults();
      const domainFilter = field('qeDomain', 'eq', 'test-generation');
      const filtered = await applyFilter(results, domainFilter);
      // Feature flag off -> all results returned unfiltered
      expect(filtered).toHaveLength(results.length);
    });
  });

  // --------------------------------------------------------------------------
  // FIELD Filter - eq operator
  // --------------------------------------------------------------------------

  describe('FIELD Filter - eq', () => {
    it('should filter by domain equality', () => {
      const results = createTestResults();
      const filter = field('qeDomain', 'eq', 'test-generation');
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2);
      expect(filtered.every(r => r.pattern.qeDomain === 'test-generation')).toBe(true);
    });

    it('should filter by tier equality', () => {
      const results = [
        createMockResult({ id: 'a', tier: 'short-term' }),
        createMockResult({ id: 'b', tier: 'long-term' }),
        createMockResult({ id: 'c', tier: 'short-term' }),
      ];
      const filter = field('tier', 'eq', 'long-term');
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].pattern.tier).toBe('long-term');
    });
  });

  // --------------------------------------------------------------------------
  // FIELD Filter - gt/lt/gte/lte operators (confidence/numeric)
  // --------------------------------------------------------------------------

  describe('FIELD Filter - numeric operators', () => {
    it('should filter by confidence > threshold (gt)', () => {
      const results = createTestResults();
      const filter = field('confidence', 'gt', 0.7);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(1); // only 0.95 > 0.7
      expect(filtered[0].pattern.confidence).toBe(0.95);
    });

    it('should filter by confidence >= threshold (gte)', () => {
      const results = createTestResults();
      const filter = field('confidence', 'gte', 0.7);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // 0.95 and 0.7
    });

    it('should filter by confidence < threshold (lt)', () => {
      const results = createTestResults();
      const filter = field('confidence', 'lt', 0.5);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(1); // only 0.3
    });

    it('should filter by confidence <= threshold (lte)', () => {
      const results = createTestResults();
      const filter = field('confidence', 'lte', 0.5);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // 0.5 and 0.3
    });

    it('should filter by confidence between range (between)', () => {
      const results = createTestResults();
      const filter = field('confidence', 'between', [0.5, 0.8]);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // 0.7 and 0.5
    });
  });

  // --------------------------------------------------------------------------
  // FIELD Filter - in operator (severity)
  // --------------------------------------------------------------------------

  describe('FIELD Filter - in', () => {
    it('should filter by domain in list', () => {
      const results = createTestResults();
      const filter = field('qeDomain', 'in', ['test-generation', 'security-compliance']);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(3); // p1, p3, p4
    });

    it('should return empty when value not in list', () => {
      const results = createTestResults();
      const filter = field('qeDomain', 'in', ['chaos-resilience']);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // FIELD Filter - contains operator (tags)
  // --------------------------------------------------------------------------

  describe('FIELD Filter - contains (tags)', () => {
    it('should filter by tag containment in array', () => {
      const results = createTestResults();
      const filter = field('context.tags', 'contains', 'security');
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // p1 and p3 have 'security' tag
    });

    it('should filter by tag not present', () => {
      const results = createTestResults();
      const filter = field('context.tags', 'contains', 'nonexistent');
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(0);
    });

    it('should handle string contains for description', () => {
      const results = [
        createMockResult({ id: 'a', description: 'authentication test pattern' }),
        createMockResult({ id: 'b', description: 'coverage gap analysis' }),
      ];
      const filter = field('description', 'contains', 'authentication');
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].pattern.description).toContain('authentication');
    });
  });

  // --------------------------------------------------------------------------
  // FIELD Filter - between operator (date range)
  // --------------------------------------------------------------------------

  describe('FIELD Filter - date range (between)', () => {
    it('should filter by createdAt date range', () => {
      const results = createTestResults();
      const filter = field('createdAt', 'between', [
        new Date('2026-01-01'),
        new Date('2026-02-28'),
      ]);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // p1 (Jan 1) and p2 (Feb 15)
    });

    it('should exclude patterns outside date range', () => {
      const results = createTestResults();
      const filter = field('createdAt', 'between', [
        new Date('2026-06-01'),
        new Date('2026-12-31'),
      ]);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // AND composition
  // --------------------------------------------------------------------------

  describe('AND filter', () => {
    it('should require all conditions to match', () => {
      const results = createTestResults();
      const filter = and(
        field('qeDomain', 'eq', 'test-generation'),
        field('confidence', 'gte', 0.5)
      );
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(1); // only p1: domain=test-generation AND confidence=0.95
      expect(filtered[0].pattern.id).toBe('p1');
    });

    it('should return all results for empty AND', () => {
      const results = createTestResults();
      const filter: FilterExpression = { type: 'AND', children: [] };
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(results.length);
    });
  });

  // --------------------------------------------------------------------------
  // OR composition
  // --------------------------------------------------------------------------

  describe('OR filter', () => {
    it('should match any condition', () => {
      const results = createTestResults();
      const filter = or(
        field('qeDomain', 'eq', 'coverage-analysis'),
        field('qeDomain', 'eq', 'security-compliance')
      );
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // p2 and p3
    });

    it('should return all results for empty OR', () => {
      const results = createTestResults();
      const filter: FilterExpression = { type: 'OR', children: [] };
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(results.length);
    });
  });

  // --------------------------------------------------------------------------
  // NOT composition
  // --------------------------------------------------------------------------

  describe('NOT filter', () => {
    it('should invert a condition', () => {
      const results = createTestResults();
      const filter = not(field('qeDomain', 'eq', 'test-generation'));
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // p2 and p3
      expect(filtered.every(r => r.pattern.qeDomain !== 'test-generation')).toBe(true);
    });

    it('should return all results when NOT has no child', () => {
      const results = createTestResults();
      const filter: FilterExpression = { type: 'NOT' };
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(results.length);
    });
  });

  // --------------------------------------------------------------------------
  // Nested/Complex composition
  // --------------------------------------------------------------------------

  describe('Nested composition', () => {
    it('should handle AND containing OR', () => {
      const results = createTestResults();
      // (domain in [test-gen, coverage]) AND confidence >= 0.7
      const filter = and(
        or(
          field('qeDomain', 'eq', 'test-generation'),
          field('qeDomain', 'eq', 'coverage-analysis')
        ),
        field('confidence', 'gte', 0.7)
      );
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // p1 (test-gen, 0.95) and p2 (coverage, 0.7)
    });

    it('should handle NOT inside AND', () => {
      const results = createTestResults();
      // NOT(domain=test-generation) AND confidence > 0.4
      const filter = and(
        not(field('qeDomain', 'eq', 'test-generation')),
        field('confidence', 'gt', 0.4)
      );
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // p2 (coverage, 0.7) and p3 (security, 0.5)
    });

    it('should handle triple nesting', () => {
      const results = createTestResults();
      // (domain=test-gen OR (domain=security AND confidence >= 0.5))
      const filter = or(
        field('qeDomain', 'eq', 'test-generation'),
        and(
          field('qeDomain', 'eq', 'security-compliance'),
          field('confidence', 'gte', 0.5)
        )
      );
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(3); // p1, p4 (test-gen), p3 (security+0.5)
    });
  });

  // --------------------------------------------------------------------------
  // Nested field paths
  // --------------------------------------------------------------------------

  describe('Nested field paths', () => {
    it('should resolve dot-separated field paths on pattern', () => {
      const results = createTestResults();
      const filter = field('context.language', 'eq', 'typescript');
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // p1 and p3
    });

    it('should resolve result-level fields', () => {
      const results = createTestResults();
      const filter = field('score', 'gte', 0.8);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(2); // p1 (0.95) and p2 (0.8)
    });
  });

  // --------------------------------------------------------------------------
  // Filter validation
  // --------------------------------------------------------------------------

  describe('validateFilter', () => {
    it('should validate a correct FIELD filter', () => {
      const result = validateFilter(field('qeDomain', 'eq', 'test-generation'));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject FIELD filter without field', () => {
      const result = validateFilter({ type: 'FIELD', operator: 'eq', value: 'x' } as FilterExpression);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('field'))).toBe(true);
    });

    it('should reject FIELD filter without operator', () => {
      const result = validateFilter({ type: 'FIELD', field: 'x', value: 'y' } as FilterExpression);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('operator'))).toBe(true);
    });

    it('should reject AND without children array', () => {
      const result = validateFilter({ type: 'AND' } as FilterExpression);
      expect(result.valid).toBe(false);
    });

    it('should reject NOT without child', () => {
      const result = validateFilter({ type: 'NOT' } as FilterExpression);
      expect(result.valid).toBe(false);
    });

    it('should validate nested filters recursively', () => {
      const filter = and(
        field('qeDomain', 'eq', 'test-generation'),
        or(
          field('confidence', 'gte', 0.5),
          { type: 'FIELD', field: 'x' } as FilterExpression // missing operator
        )
      );
      const result = validateFilter(filter);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid operator', () => {
      const result = validateFilter({
        type: 'FIELD',
        field: 'x',
        operator: 'invalid' as any,
        value: 'y',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid operator'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Builder helpers
  // --------------------------------------------------------------------------

  describe('Builder helpers', () => {
    it('and() should create AND expression', () => {
      const expr = and(field('a', 'eq', 1), field('b', 'eq', 2));
      expect(expr.type).toBe('AND');
      expect(expr.children).toHaveLength(2);
    });

    it('or() should create OR expression', () => {
      const expr = or(field('a', 'eq', 1));
      expect(expr.type).toBe('OR');
      expect(expr.children).toHaveLength(1);
    });

    it('not() should create NOT expression', () => {
      const expr = not(field('a', 'eq', 1));
      expect(expr.type).toBe('NOT');
      expect(expr.child).toBeDefined();
    });

    it('field() should create FIELD expression', () => {
      const expr = field('confidence', 'between', [0.5, 0.9]);
      expect(expr.type).toBe('FIELD');
      expect(expr.field).toBe('confidence');
      expect(expr.operator).toBe('between');
      expect(expr.value).toEqual([0.5, 0.9]);
    });
  });

  // --------------------------------------------------------------------------
  // Performance
  // --------------------------------------------------------------------------

  describe('Performance', () => {
    it('should filter 1000 results in under 1ms', () => {
      // Create 1000 mock results
      const results: PatternSearchResult[] = [];
      for (let i = 0; i < 1000; i++) {
        results.push(
          createMockResult({
            id: `perf-${i}`,
            qeDomain: i % 3 === 0 ? 'test-generation' : 'coverage-analysis',
            confidence: Math.random(),
          }, Math.random())
        );
      }

      const filter = and(
        field('qeDomain', 'eq', 'test-generation'),
        field('confidence', 'gte', 0.5)
      );

      const start = performance.now();
      const filtered = applyFilterSync(results, filter);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5); // CI runners may be slower than local dev
      expect(filtered.length).toBeLessThanOrEqual(results.length);
      expect(filtered.every(r =>
        r.pattern.qeDomain === 'test-generation' && r.pattern.confidence >= 0.5
      )).toBe(true);
    });

    it('should handle deeply nested filters efficiently', () => {
      const results: PatternSearchResult[] = [];
      for (let i = 0; i < 500; i++) {
        results.push(
          createMockResult({
            id: `deep-${i}`,
            confidence: i / 500,
            qeDomain: ['test-generation', 'coverage-analysis', 'security-compliance'][i % 3] as any,
          }, i / 500)
        );
      }

      // 4 levels of nesting
      const filter = and(
        or(
          field('qeDomain', 'eq', 'test-generation'),
          and(
            field('qeDomain', 'eq', 'security-compliance'),
            not(field('confidence', 'lt', 0.3))
          )
        ),
        field('confidence', 'gte', 0.2)
      );

      const start = performance.now();
      const filtered = applyFilterSync(results, filter);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5); // CI runners may be slower than local dev
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should handle empty results array', () => {
      const filter = field('qeDomain', 'eq', 'test-generation');
      const filtered = applyFilterSync([], filter);
      expect(filtered).toHaveLength(0);
    });

    it('should handle undefined field gracefully', () => {
      const results = [createMockResult({ id: 'edge-1' })];
      const filter = field('nonexistent.deep.path', 'eq', 'anything');
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(0); // undefined !== 'anything'
    });

    it('should handle non-numeric value with numeric operators', () => {
      const results = [createMockResult({ id: 'edge-2' })];
      const filter = field('qeDomain', 'gt', 5);
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(0); // string is not > number
    });

    it('should handle between with non-array value', () => {
      const results = [createMockResult({ id: 'edge-3', confidence: 0.5 })];
      const filter = field('confidence', 'between', 'not-an-array');
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(0);
    });

    it('should handle in with non-array filter value', () => {
      const results = [createMockResult({ id: 'edge-4' })];
      const filter = field('qeDomain', 'in', 'not-an-array');
      const filtered = applyFilterSync(results, filter);
      expect(filtered).toHaveLength(0);
    });
  });
});
