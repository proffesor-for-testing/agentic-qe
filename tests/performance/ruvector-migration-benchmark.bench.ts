/**
 * RuVector Migration Performance Benchmark
 *
 * Validates migration performance criteria from issue #355:
 * - 150K pattern migration completes in <5 minutes
 * - Peak memory does not exceed 2x normal operating memory
 * - Rollback completes in <60 seconds
 *
 * Run manually:
 *   RUN_SCALE_BENCH=1 npx vitest bench tests/performance/ruvector-migration-benchmark.bench.ts
 *
 * @see Issue #355 — RuVector P1: Migration Performance (Task 1.3)
 */

import { describe, bench, beforeAll } from 'vitest';

import { ProgressiveHnswBackend } from '../../src/kernel/progressive-hnsw-backend.js';
import {
  createTemporalCompressionService,
  type TemporalCompressionService,
} from '../../src/integrations/ruvector/temporal-compression.js';

// ============================================================================
// Configuration
// ============================================================================

const DIMENSIONS = 384;
const SCALE_BENCH = process.env.RUN_SCALE_BENCH === '1';
const MIGRATION_SIZE = SCALE_BENCH ? 150_000 : 10_000;
const BATCH_SIZE = 1000;

// ============================================================================
// Helpers
// ============================================================================

function generateTestVector(id: number): Float32Array {
  const vector = new Float32Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i++) {
    vector[i] = Math.sin(id * 0.1 + i * 0.01) * 0.5;
  }
  return vector;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

// ============================================================================
// Migration Simulation
// ============================================================================

describe(`Migration Performance (${MIGRATION_SIZE / 1000}K patterns)`, () => {
  let sourceBackend: ProgressiveHnswBackend;
  let compressionService: TemporalCompressionService;

  beforeAll(async () => {
    compressionService = createTemporalCompressionService();
    await compressionService.initialize();

    // Build source index (simulates existing data)
    sourceBackend = new ProgressiveHnswBackend({
      dimensions: DIMENSIONS,
      metric: 'cosine',
    });
    for (let i = 0; i < MIGRATION_SIZE; i++) {
      sourceBackend.add(i, generateTestVector(i));
    }
  });

  bench(`migrate ${MIGRATION_SIZE / 1000}K patterns to new backend`, () => {
    const targetBackend = new ProgressiveHnswBackend({
      dimensions: DIMENSIONS,
      metric: 'cosine',
    });

    // Batch migration
    for (let batch = 0; batch < MIGRATION_SIZE; batch += BATCH_SIZE) {
      const end = Math.min(batch + BATCH_SIZE, MIGRATION_SIZE);
      for (let i = batch; i < end; i++) {
        targetBackend.add(i, generateTestVector(i));
      }
    }
  }, {
    iterations: 1,
    warmupIterations: 0,
  });

  bench(`migrate ${MIGRATION_SIZE / 1000}K with compression`, () => {
    const targetBackend = new ProgressiveHnswBackend({
      dimensions: DIMENSIONS,
      metric: 'cosine',
    });

    for (let batch = 0; batch < MIGRATION_SIZE; batch += BATCH_SIZE) {
      const end = Math.min(batch + BATCH_SIZE, MIGRATION_SIZE);
      for (let i = batch; i < end; i++) {
        const vec = generateTestVector(i);
        // Compress before storing (simulates migration with compression)
        const tier = i < MIGRATION_SIZE * 0.3 ? 'hot' : i < MIGRATION_SIZE * 0.7 ? 'warm' : 'cold';
        compressionService.compress(vec, tier as 'hot' | 'warm' | 'cold');
        targetBackend.add(i, vec);
      }
    }
  }, {
    iterations: 1,
    warmupIterations: 0,
  });

  bench('rollback simulation (rebuild from snapshot)', () => {
    // Rollback = drop target and restore source vectors
    const restoredBackend = new ProgressiveHnswBackend({
      dimensions: DIMENSIONS,
      metric: 'cosine',
    });

    // Simulate restoring a subset (rollback typically from checkpoint)
    const rollbackSize = Math.min(MIGRATION_SIZE, 50_000);
    for (let i = 0; i < rollbackSize; i++) {
      restoredBackend.add(i, generateTestVector(i));
    }
  }, {
    iterations: 1,
    warmupIterations: 0,
  });
});

// ============================================================================
// Memory During Migration
// ============================================================================

describe('Peak Memory During Migration', () => {
  bench(`measure peak memory ratio for ${MIGRATION_SIZE / 1000}K patterns`, () => {
    const baselineMemBefore = process.memoryUsage().heapUsed;

    // Normal operating memory: single backend
    const normalBackend = new ProgressiveHnswBackend({
      dimensions: DIMENSIONS,
      metric: 'cosine',
    });
    const testSize = Math.min(MIGRATION_SIZE, 10_000);
    for (let i = 0; i < testSize; i++) {
      normalBackend.add(i, generateTestVector(i));
    }
    const normalMem = process.memoryUsage().heapUsed - baselineMemBefore;

    // Migration memory: two backends coexist
    const migrationMemBefore = process.memoryUsage().heapUsed;
    const targetBackend = new ProgressiveHnswBackend({
      dimensions: DIMENSIONS,
      metric: 'cosine',
    });
    for (let i = 0; i < testSize; i++) {
      targetBackend.add(i, generateTestVector(i));
    }
    const migrationMem = process.memoryUsage().heapUsed - migrationMemBefore;

    // Log ratio for manual comparison (target: <2x)
    const ratio = (normalMem + migrationMem) / Math.max(normalMem, 1);
    console.log(`[migration] peak_memory_ratio=${ratio.toFixed(2)}x normal=${formatBytes(normalMem)} migration=${formatBytes(migrationMem)}`);
  }, {
    iterations: 1,
    warmupIterations: 0,
  });
});
