/**
 * Benchmark alias: RvfPatternStore
 *
 * The plan (ADR-066 Phase 1.6) called for this file at .bench.ts.
 * The actual benchmarks are in rvf-pattern-store.test.ts (same directory).
 *
 * Re-export for plan compliance:
 *   npx vitest run tests/benchmarks/rvf-pattern-store.bench.ts
 */
export * from './rvf-pattern-store.test.js';
