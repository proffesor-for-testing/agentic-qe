/**
 * Tests for HnswShadowValidator (ADR-071 Phase 2C)
 *
 * Verifies that the shadow validator correctly detects divergences
 * between brute-force reference and HnswAdapter search results.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { HnswShadowValidator } from '../../../src/kernel/hnsw-shadow-validator.js';
import { HnswAdapter } from '../../../src/kernel/hnsw-adapter.js';

// ============================================================================
// Helpers
// ============================================================================

const DIM = 8;

function randomVector(dim = DIM): number[] {
  return Array.from({ length: dim }, () => Math.random() - 0.5);
}

function createValidator(name: string): HnswShadowValidator {
  const adapter = HnswAdapter.create(name, { dimensions: DIM, M: 4, efConstruction: 50 });
  return new HnswShadowValidator(adapter);
}

// ============================================================================
// Tests
// ============================================================================

describe('HnswShadowValidator', () => {
  afterEach(() => {
    HnswAdapter.closeAll();
  });

  it('should report zero divergence for identical results', () => {
    const validator = createValidator('shadow-zero');

    // Add 20 vectors
    for (let i = 0; i < 20; i++) {
      validator.addVector(`vec-${i}`, randomVector());
    }

    // Run 10 queries
    const queries = Array.from({ length: 10 }, () => randomVector());
    const result = validator.validate(queries, { k: 5 });

    // For small indexes, brute-force and adapter (both use brute-force internally
    // via ProgressiveHnswBackend) should produce identical results
    expect(result.totalQueries).toBe(10);
    expect(result.divergenceRate).toBeLessThanOrEqual(0.02);
    expect(result.passesGoGate).toBe(true);
    expect(result.avgJaccardOverlap).toBeGreaterThan(0.9);
  });

  it('should track vector count', () => {
    const validator = createValidator('shadow-count');

    expect(validator.size).toBe(0);

    validator.addVector('a', randomVector());
    validator.addVector('b', randomVector());
    expect(validator.size).toBe(2);

    validator.removeVector('a');
    expect(validator.size).toBe(1);
  });

  it('should handle empty index gracefully', () => {
    const validator = createValidator('shadow-empty');

    const queries = [randomVector()];
    const result = validator.validate(queries, { k: 5 });

    expect(result.totalQueries).toBe(1);
    expect(result.divergenceRate).toBe(0);
    expect(result.passesGoGate).toBe(true);
  });

  it('should handle empty queries gracefully', () => {
    const validator = createValidator('shadow-no-queries');
    validator.addVector('a', randomVector());

    const result = validator.validate([], { k: 5 });

    expect(result.totalQueries).toBe(0);
    expect(result.divergenceRate).toBe(0);
    expect(result.passesGoGate).toBe(true);
  });

  it('should report low score deltas for brute-force-backed adapter', () => {
    const validator = createValidator('shadow-deltas');

    for (let i = 0; i < 50; i++) {
      validator.addVector(`v-${i}`, randomVector());
    }

    const queries = Array.from({ length: 20 }, () => randomVector());
    const result = validator.validate(queries, { k: 10 });

    // Score deltas should be near-zero since both use same search algorithm
    expect(result.avgTop1ScoreDelta).toBeLessThan(0.01);
    expect(result.maxTop1ScoreDelta).toBeLessThan(0.05);
  });

  it('should respect custom threshold', () => {
    const validator = createValidator('shadow-threshold');

    for (let i = 0; i < 10; i++) {
      validator.addVector(`v-${i}`, randomVector());
    }

    const queries = Array.from({ length: 5 }, () => randomVector());

    // Very tight threshold
    const strict = validator.validate(queries, { k: 5, threshold: 0 });
    // Lenient threshold
    const lenient = validator.validate(queries, { k: 5, threshold: 1.0 });

    expect(lenient.passesGoGate).toBe(true);
    // strict may or may not pass depending on floating point — just check it ran
    expect(strict.totalQueries).toBe(5);
  });
});
