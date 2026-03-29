/**
 * Milestone 1 Performance Baselines
 *
 * Measures key operations to establish before/after comparison points
 * for the Milestone 1 improvements (R1: HDC, R2: CUSUM, R3: Delta).
 *
 * These baselines capture the ACTUAL performance of the Milestone 1
 * implementations:
 *
 *   1. Cosine similarity (current pattern comparison -- HDC will replace)
 *   2. HDC fingerprinting via HdcFingerprinter (R1)
 *   3. Coherence gate energy computation (CUSUM augmented, R2)
 *   4. Temporal compression round-trip (compress + decompress)
 *   5. CUSUM drift detection via CusumDetector (R2)
 *   6. Delta event sourcing via DeltaTracker with SQLite (R3)
 *
 * Run with:
 *   npx vitest run tests/performance/milestone1-baselines.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { cosineSimilarity } from '../../src/shared/utils/vector-math.js';
import {
  cosineSimilarity as temporalCosineSimilarity,
  createTemporalCompressionService,
} from '../../src/integrations/ruvector/temporal-compression.js';
import {
  CoherenceGate,
  type TestArtifact,
} from '../../src/integrations/ruvector/coherence-gate.js';
import { HdcFingerprinter } from '../../src/integrations/ruvector/hdc-fingerprint.js';
import { CusumDetector } from '../../src/integrations/ruvector/cusum-detector.js';
import { DeltaTracker } from '../../src/integrations/ruvector/delta-tracker.js';
import Database from 'better-sqlite3';

// ============================================================================
// Helpers
// ============================================================================

/**
 * High-resolution timer returning elapsed microseconds.
 */
function measureUs(fn: () => void, iterations: number): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;
  return (elapsed * 1000) / iterations; // convert ms to us, divide by iterations
}

/**
 * High-resolution timer returning elapsed nanoseconds.
 */
function measureNs(fn: () => void, iterations: number): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;
  return (elapsed * 1_000_000) / iterations; // convert ms to ns, divide by iterations
}

/**
 * Generate a deterministic Float32Array vector of given dimension.
 */
function generateFloat32Vector(dim: number, seed: number): Float32Array {
  const vec = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    vec[i] = Math.sin(seed * 0.1 + i * 0.01) * 0.5;
  }
  return vec;
}

/**
 * Generate a deterministic number[] vector of given dimension.
 */
function generateNumberVector(dim: number, seed: number): number[] {
  const vec: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) {
    vec[i] = Math.sin(seed * 0.1 + i * 0.01) * 0.5;
  }
  return vec;
}

/**
 * Create a test artifact for coherence gate benchmarking.
 */
function createTestArtifact(complexity: 'simple' | 'complex'): TestArtifact {
  if (complexity === 'simple') {
    return {
      assertions: ['expect(result).toBe(true)'],
      observedBehavior: ['result was true'],
      coverage: 0.85,
      domain: 'test-generation',
      confidence: 0.9,
    };
  }
  return {
    assertions: [
      'expect(result).toBe(true)',
      'expect(error).toBeNull()',
      'expect(response.status).toBe(200)',
      'expect(data.length).toBeGreaterThan(0)',
      'expect(cache.hit).toBe(true)',
    ],
    observedBehavior: [
      'result was true',
      'no error thrown',
      'HTTP 200 returned',
      'data array has 5 elements',
      'cache was populated',
    ],
    coverage: 0.72,
    domain: 'integration-testing',
    confidence: 0.78,
  };
}

/**
 * Collected baseline measurements for summary assertion.
 */
const baselineResults: Record<string, number> = {};

// ============================================================================
// 1. Cosine Similarity Baselines
// ============================================================================

describe('Baseline: Cosine Similarity (current pattern comparison)', () => {
  const ITERATIONS = 100_000;
  const WARMUP = 1_000;

  it('vector-math cosineSimilarity: 128-dim number[]', () => {
    const a = generateNumberVector(128, 1);
    const b = generateNumberVector(128, 2);

    // Warmup
    for (let i = 0; i < WARMUP; i++) cosineSimilarity(a, b);

    const avgUs = measureUs(() => cosineSimilarity(a, b), ITERATIONS);
    baselineResults['cosine_128_number'] = avgUs;

    console.log(
      `[BASELINE] cosineSimilarity(128-dim number[]): ${avgUs.toFixed(3)} us/op (${ITERATIONS} iterations)`,
    );

    // Sanity: cosine similarity of non-zero vectors should be defined
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(-1);
    expect(result).toBeLessThanOrEqual(1);

    // Upper bound: should complete in < 50us per call
    expect(avgUs).toBeLessThan(50);
  });

  it('vector-math cosineSimilarity: 384-dim number[]', () => {
    const a = generateNumberVector(384, 1);
    const b = generateNumberVector(384, 2);

    for (let i = 0; i < WARMUP; i++) cosineSimilarity(a, b);

    const avgUs = measureUs(() => cosineSimilarity(a, b), ITERATIONS);
    baselineResults['cosine_384_number'] = avgUs;

    console.log(
      `[BASELINE] cosineSimilarity(384-dim number[]): ${avgUs.toFixed(3)} us/op (${ITERATIONS} iterations)`,
    );

    expect(avgUs).toBeLessThan(100);
  });

  it('temporal-compression cosineSimilarity: 128-dim Float32Array', () => {
    const a = generateFloat32Vector(128, 1);
    const b = generateFloat32Vector(128, 2);

    for (let i = 0; i < WARMUP; i++) temporalCosineSimilarity(a, b);

    const avgUs = measureUs(() => temporalCosineSimilarity(a, b), ITERATIONS);
    baselineResults['cosine_128_float32'] = avgUs;

    console.log(
      `[BASELINE] temporalCosineSimilarity(128-dim Float32Array): ${avgUs.toFixed(3)} us/op (${ITERATIONS} iterations)`,
    );

    expect(avgUs).toBeLessThan(50);
  });

  it('temporal-compression cosineSimilarity: 384-dim Float32Array', () => {
    const a = generateFloat32Vector(384, 1);
    const b = generateFloat32Vector(384, 2);

    for (let i = 0; i < WARMUP; i++) temporalCosineSimilarity(a, b);

    const avgUs = measureUs(() => temporalCosineSimilarity(a, b), ITERATIONS);
    baselineResults['cosine_384_float32'] = avgUs;

    console.log(
      `[BASELINE] temporalCosineSimilarity(384-dim Float32Array): ${avgUs.toFixed(3)} us/op (${ITERATIONS} iterations)`,
    );

    expect(avgUs).toBeLessThan(100);
  });
});

// ============================================================================
// 2. HDC Actual Implementation (HdcFingerprinter)
// ============================================================================

describe('Baseline: HDC HdcFingerprinter (actual R1 implementation)', () => {
  const ITERATIONS_FP = 10_000;
  const ITERATIONS_HAMMING = 100_000;
  const ITERATIONS_BIND = 100_000;
  const WARMUP = 1_000;

  let hdc: HdcFingerprinter;

  beforeAll(() => {
    hdc = new HdcFingerprinter({ dimensions: 10000 });
  });

  it('fingerprint: generate 10K-bit fingerprint from pattern', () => {
    const pattern = { id: 'bench-1', domain: 'security', type: 'xss' };

    // Warmup
    for (let i = 0; i < WARMUP; i++) hdc.fingerprint(pattern);

    const avgUs = measureUs(() => hdc.fingerprint(pattern), ITERATIONS_FP);
    baselineResults['hdc_fingerprint'] = avgUs;

    console.log(
      `[BASELINE] HdcFingerprinter.fingerprint(): ${avgUs.toFixed(3)} us/op (${ITERATIONS_FP} iterations)`,
    );

    const fp = hdc.fingerprint(pattern);
    expect(fp.vector.length).toBe(1250); // 10000 / 8
    expect(fp.dimensions).toBe(10000);
    expect(fp.hash).toBeTruthy();

    // Fingerprinting includes FNV-1a + xorshift128 PRNG; allow generous headroom
    expect(avgUs).toBeLessThan(500);
  });

  it('hammingDistance: 1250-byte binary vectors (10K-bit HDC)', () => {
    const fpA = hdc.fingerprint({ id: 'hd-a', domain: 'test', type: 'unit' });
    const fpB = hdc.fingerprint({ id: 'hd-b', domain: 'test', type: 'integration' });

    // Warmup
    for (let i = 0; i < WARMUP; i++) hdc.hammingDistance(fpA.vector, fpB.vector);

    const avgUs = measureUs(
      () => hdc.hammingDistance(fpA.vector, fpB.vector),
      ITERATIONS_HAMMING,
    );
    baselineResults['hdc_hamming'] = avgUs;

    console.log(
      `[BASELINE] HdcFingerprinter.hammingDistance(1250B / 10K-bit): ${avgUs.toFixed(3)} us/op (${ITERATIONS_HAMMING} iterations)`,
    );

    // Distance should be roughly ~5000 for unrelated patterns (half the bits differ)
    const dist = hdc.hammingDistance(fpA.vector, fpB.vector);
    expect(dist).toBeGreaterThan(3000);
    expect(dist).toBeLessThan(7000);

    // Uses popcount lookup table -- should be fast
    expect(avgUs).toBeLessThan(100);
  });

  it('compositionalBind: 1250-byte binary vectors', () => {
    const fpA = hdc.fingerprint({ id: 'cb-a', domain: 'api', type: 'rest' });
    const fpB = hdc.fingerprint({ id: 'cb-b', domain: 'api', type: 'graphql' });

    // Warmup
    for (let i = 0; i < WARMUP; i++) hdc.compositionalBind(fpA.vector, fpB.vector);

    const avgUs = measureUs(
      () => hdc.compositionalBind(fpA.vector, fpB.vector),
      ITERATIONS_BIND,
    );
    baselineResults['hdc_bind'] = avgUs;

    console.log(
      `[BASELINE] HdcFingerprinter.compositionalBind(1250B / 10K-bit): ${avgUs.toFixed(3)} us/op (${ITERATIONS_BIND} iterations)`,
    );

    // XOR bind should be very fast
    expect(avgUs).toBeLessThan(50);
  });

  it('HDC hamming vs Cosine: comparison speed ratio', () => {
    const fpA = hdc.fingerprint({ id: 'ratio-a', domain: 'perf', type: 'bench' });
    const fpB = hdc.fingerprint({ id: 'ratio-b', domain: 'perf', type: 'test' });
    const cosA = generateFloat32Vector(128, 1);
    const cosB = generateFloat32Vector(128, 2);

    const ITERS = 100_000;

    // Warmup both
    for (let i = 0; i < 1000; i++) {
      hdc.hammingDistance(fpA.vector, fpB.vector);
      temporalCosineSimilarity(cosA, cosB);
    }

    const hdcUs = measureUs(() => hdc.hammingDistance(fpA.vector, fpB.vector), ITERS);
    const cosUs = measureUs(
      () => temporalCosineSimilarity(cosA, cosB),
      ITERS,
    );

    const ratio = cosUs / hdcUs;

    console.log(
      `[BASELINE] HDC hamming(1250B) vs cosine(128-dim): ` +
        `HDC=${hdcUs.toFixed(3)}us, Cosine=${cosUs.toFixed(3)}us, ` +
        `ratio=${ratio.toFixed(2)}x`,
    );

    // Both should be fast; log the ratio for post-Milestone comparison
    expect(hdcUs).toBeLessThan(200);
    expect(cosUs).toBeLessThan(200);
  });
});

// ============================================================================
// 3. Coherence Gate Energy Computation
// ============================================================================

describe('Baseline: Coherence Gate Energy', () => {
  const ITERATIONS = 10_000;
  const WARMUP = 500;

  let gate: CoherenceGate;

  beforeAll(() => {
    gate = new CoherenceGate(0.4);
  });

  it('computeEnergy: simple artifact (reflex tier)', () => {
    const artifact = createTestArtifact('simple');

    for (let i = 0; i < WARMUP; i++) gate.computeEnergy(artifact);

    const avgUs = measureUs(() => gate.computeEnergy(artifact), ITERATIONS);
    baselineResults['energy_reflex'] = avgUs;

    console.log(
      `[BASELINE] computeEnergy(simple, reflex): ${avgUs.toFixed(3)} us/op (${ITERATIONS} iterations)`,
    );

    const result = gate.computeEnergy(artifact);
    expect(result.energy).toBeGreaterThanOrEqual(0);
    expect(result.energy).toBeLessThanOrEqual(1);

    // Reflex tier should complete in < 100us
    expect(avgUs).toBeLessThan(100);
  });

  it('computeEnergy: complex artifact (retrieval tier)', () => {
    const artifact = createTestArtifact('complex');
    // Retrieval tier with WASM CohomologyEngine is ~2ms per call.
    // Use fewer iterations to stay within timeout.
    const RETRIEVAL_ITERATIONS = 500;
    const RETRIEVAL_WARMUP = 50;

    for (let i = 0; i < RETRIEVAL_WARMUP; i++) gate.computeEnergy(artifact, true);

    const avgUs = measureUs(
      () => gate.computeEnergy(artifact, true),
      RETRIEVAL_ITERATIONS,
    );
    baselineResults['energy_retrieval'] = avgUs;

    console.log(
      `[BASELINE] computeEnergy(complex, retrieval): ${avgUs.toFixed(3)} us/op (${RETRIEVAL_ITERATIONS} iterations)`,
    );

    const result = gate.computeEnergy(artifact, true);
    expect(result.tier).toBe('retrieval');
    expect(result.energy).toBeGreaterThanOrEqual(0);
    expect(result.energy).toBeLessThanOrEqual(1);

    // Retrieval tier includes sheaf Laplacian via WASM CohomologyEngine.
    // With 5 assertions and full identity restriction maps, ~2ms is expected.
    // This is the baseline that CUSUM augmentation should not degrade.
    expect(avgUs).toBeLessThan(5000);
  }, 30_000); // Extended timeout for WASM-heavy computation

  it('validate: full validation with witness chain', () => {
    const artifact = createTestArtifact('complex');
    // Use a fresh gate to avoid log growth affecting timing
    const freshGate = new CoherenceGate(0.4);

    for (let i = 0; i < WARMUP; i++) freshGate.validate(artifact);

    const avgUs = measureUs(() => freshGate.validate(artifact), ITERATIONS);
    baselineResults['validate_witness'] = avgUs;

    console.log(
      `[BASELINE] validate(complex artifact): ${avgUs.toFixed(3)} us/op (${ITERATIONS} iterations)`,
    );

    const result = freshGate.validate(artifact);
    expect(result.witness).toBeDefined();
    expect(result.witness.recordHash).toBeTruthy();

    // Validation includes SHA-256 hashing, so allow more headroom
    expect(avgUs).toBeLessThan(1000);
  });
});

// ============================================================================
// 4. Temporal Compression Round-Trip
// ============================================================================

describe('Baseline: Temporal Compression', () => {
  const ITERATIONS = 10_000;
  const WARMUP = 500;

  let compressionService: ReturnType<typeof createTemporalCompressionService>;

  beforeAll(async () => {
    compressionService = createTemporalCompressionService();
    await compressionService.initialize();
  });

  it('compress: 384-dim Float32Array (hot tier)', () => {
    const vec = generateFloat32Vector(384, 42);

    for (let i = 0; i < WARMUP; i++) compressionService.compress(vec, 'hot');

    const avgUs = measureUs(
      () => compressionService.compress(vec, 'hot'),
      ITERATIONS,
    );
    baselineResults['compress_hot'] = avgUs;

    console.log(
      `[BASELINE] compress(384-dim, hot): ${avgUs.toFixed(3)} us/op (${ITERATIONS} iterations)`,
    );

    const compressed = compressionService.compress(vec, 'hot');
    expect(compressed.data.length).toBe(384);
    expect(compressed.tier).toBe('hot');

    expect(avgUs).toBeLessThan(200);
  });

  it('compress + decompress round-trip: 384-dim (hot tier)', () => {
    const vec = generateFloat32Vector(384, 42);

    // Pre-compress for warmup
    for (let i = 0; i < WARMUP; i++) {
      const c = compressionService.compress(vec, 'hot');
      compressionService.decompress(c);
    }

    const avgUs = measureUs(() => {
      const c = compressionService.compress(vec, 'hot');
      compressionService.decompress(c);
    }, ITERATIONS);
    baselineResults['roundtrip_hot'] = avgUs;

    console.log(
      `[BASELINE] compress+decompress(384-dim, hot): ${avgUs.toFixed(3)} us/op (${ITERATIONS} iterations)`,
    );

    // Verify fidelity
    const compressed = compressionService.compress(vec, 'hot');
    const restored = compressionService.decompress(compressed);
    const fidelity = temporalCosineSimilarity(vec, restored);
    console.log(`[BASELINE] hot-tier round-trip fidelity: ${fidelity.toFixed(6)}`);
    expect(fidelity).toBeGreaterThan(0.95);

    expect(avgUs).toBeLessThan(400);
  });

  it('compress + decompress round-trip: 384-dim (cold tier)', () => {
    const vec = generateFloat32Vector(384, 42);

    for (let i = 0; i < WARMUP; i++) {
      const c = compressionService.compress(vec, 'cold');
      compressionService.decompress(c);
    }

    const avgUs = measureUs(() => {
      const c = compressionService.compress(vec, 'cold');
      compressionService.decompress(c);
    }, ITERATIONS);
    baselineResults['roundtrip_cold'] = avgUs;

    console.log(
      `[BASELINE] compress+decompress(384-dim, cold): ${avgUs.toFixed(3)} us/op (${ITERATIONS} iterations)`,
    );

    // Cold tier has lower fidelity due to 3-bit quantization
    const compressed = compressionService.compress(vec, 'cold');
    const restored = compressionService.decompress(compressed);
    const fidelity = temporalCosineSimilarity(vec, restored);
    console.log(`[BASELINE] cold-tier round-trip fidelity: ${fidelity.toFixed(6)}`);
    expect(fidelity).toBeGreaterThan(0.8);

    expect(avgUs).toBeLessThan(400);
  });
});

// ============================================================================
// 5. CUSUM Actual Implementation (CusumDetector)
// ============================================================================

describe('Baseline: CUSUM CusumDetector (actual R2 implementation)', () => {
  const ITERATIONS = 100_000;
  const WARMUP = 1_000;

  it('CUSUM update: single call (post-warmup)', () => {
    // The actual CusumDetector has a warmup period (default 20 samples)
    // to estimate mu. We must complete warmup before benchmarking.
    const detector = new CusumDetector({ threshold: 5, slack: 0.5, resetOnAlarm: true, warmupSamples: 20 });

    // Complete warmup phase with near-zero values
    for (let i = 0; i < 20; i++) {
      detector.update('retrieve', (Math.random() - 0.5) * 0.1);
    }

    // Warmup the JIT with post-warmup calls
    for (let i = 0; i < WARMUP; i++) {
      detector.update('retrieve', Math.random() * 0.1);
    }

    // Reset and re-warm for clean measurement
    const freshDetector = new CusumDetector({ threshold: 5, slack: 0.5, resetOnAlarm: true, warmupSamples: 20 });
    for (let i = 0; i < 20; i++) {
      freshDetector.update('retrieve', (Math.random() - 0.5) * 0.1);
    }

    let driftCount = 0;
    const avgNs = measureNs(() => {
      const result = freshDetector.update('retrieve', Math.random() * 0.1);
      if (result.driftDetected) driftCount++;
    }, ITERATIONS);
    baselineResults['cusum_update_ns'] = avgNs;

    console.log(
      `[BASELINE] CusumDetector.update(): ${avgNs.toFixed(1)} ns/op (${ITERATIONS} iterations)`,
    );

    // CUSUM update is pure arithmetic with Map lookup -- should be extremely fast
    expect(avgNs).toBeLessThan(10_000); // < 10us in nanoseconds
  });

  it('CUSUM drift detection: mean-shift scenario', () => {
    const detector = new CusumDetector({ threshold: 5, slack: 0.5, resetOnAlarm: true, warmupSamples: 20 });

    // Complete warmup with stationary data near zero
    for (let i = 0; i < 20; i++) {
      detector.update('retrieve', (Math.random() - 0.5) * 0.2);
    }

    // Feed additional stationary data (100 samples near zero)
    for (let i = 0; i < 100; i++) {
      detector.update('retrieve', (Math.random() - 0.5) * 0.2);
    }

    // Introduce a mean shift of 2.0
    let samplesUntilDetection = 0;
    let detected = false;

    for (let i = 0; i < 100; i++) {
      const result = detector.update('retrieve', 2.0 + (Math.random() - 0.5) * 0.2);
      samplesUntilDetection++;
      if (result.driftDetected && !detected) {
        detected = true;
        console.log(
          `[BASELINE] CusumDetector detected drift after ${samplesUntilDetection} samples (mean shift = 2.0)`,
        );
        break;
      }
    }

    expect(detected).toBe(true);
    // Should detect within 10 samples per plan spec
    expect(samplesUntilDetection).toBeLessThanOrEqual(10);
  });

  it('CUSUM update across multiple gate types', () => {
    const detector = new CusumDetector({ threshold: 5, slack: 0.5, resetOnAlarm: true, warmupSamples: 20 });
    const gateTypes: Array<'retrieve' | 'write' | 'learn' | 'act'> = ['retrieve', 'write', 'learn', 'act'];

    // Complete warmup for all gate types
    for (const gateType of gateTypes) {
      for (let i = 0; i < 20; i++) {
        detector.update(gateType, (Math.random() - 0.5) * 0.1);
      }
    }

    // Benchmark update cycling through gate types
    let idx = 0;
    const avgNs = measureNs(() => {
      detector.update(gateTypes[idx % 4], Math.random() * 0.1);
      idx++;
    }, ITERATIONS);

    console.log(
      `[BASELINE] CusumDetector.update() (4 gate types): ${avgNs.toFixed(1)} ns/op (${ITERATIONS} iterations)`,
    );

    // Per-gate state lookup via Map should add minimal overhead
    expect(avgNs).toBeLessThan(10_000);
  });
});

// ============================================================================
// 6. Delta Tracker Actual Implementation (SQLite-backed)
// ============================================================================

describe('Baseline: DeltaTracker (actual R3 implementation, SQLite :memory:)', () => {
  const RECORD_ITERATIONS = 500;
  const WARMUP = 50;

  let db: InstanceType<typeof Database>;
  let tracker: DeltaTracker;

  beforeAll(() => {
    db = new Database(':memory:');
    tracker = new DeltaTracker(db);
    tracker.initialize();
  });

  it('recordDelta: small pattern object', () => {
    const pattern = {
      id: 'test-pattern-1',
      domain: 'test-generation',
      confidence: 0.85,
      tags: ['unit', 'fast'],
    };

    // Warmup: create genesis + record deltas for warmup patterns
    for (let i = 0; i < WARMUP; i++) {
      const pid = `warmup-rec-${i}`;
      tracker.createGenesis(pid, { ...pattern, confidence: 0 });
      tracker.recordDelta(pid, { ...pattern, confidence: 0 }, { ...pattern, confidence: i * 0.01 });
    }

    // Benchmark: fresh pattern for each call to avoid version collision
    const freshDb = new Database(':memory:');
    const freshTracker = new DeltaTracker(freshDb);
    freshTracker.initialize();

    // Pre-create genesis entries for all iterations
    for (let i = 0; i < RECORD_ITERATIONS; i++) {
      freshTracker.createGenesis(`perf-${i}`, { ...pattern, confidence: 0 });
    }

    let recordIdx = 0;
    const avgUs = measureUs(() => {
      const modified = { ...pattern, confidence: Math.random() };
      freshTracker.recordDelta(`perf-${recordIdx}`, { ...pattern, confidence: 0 }, modified);
      recordIdx++;
    }, RECORD_ITERATIONS);
    baselineResults['delta_record'] = avgUs;

    console.log(
      `[BASELINE] DeltaTracker.recordDelta(small pattern, SQLite :memory:): ${avgUs.toFixed(3)} us/op (${RECORD_ITERATIONS} iterations)`,
    );

    // SQLite in-memory delta recording should be reasonably fast
    expect(avgUs).toBeLessThan(2000);
  });

  it('rollback: after 10 updates', () => {
    const ROLLBACK_ITERATIONS = 50;
    const patternId = 'rollback-bench';
    const baseState = { id: patternId, domain: 'test', data: 'state-0' };

    // Build up 10 versions for one pattern
    tracker.createGenesis(patternId, baseState);
    let prev: Record<string, unknown> = { ...baseState };
    for (let v = 1; v <= 10; v++) {
      const next = { ...prev, data: `state-${v}`, version: v };
      tracker.recordDelta(patternId, prev, next);
      prev = next;
    }

    // Warmup: rollback to version 5 (rollback adds a new version, so we
    // only need to recreate for fresh rollback targets)
    // For benchmarking, each rollback is to a different pattern's history
    const warmupDb = new Database(':memory:');
    const warmupTracker = new DeltaTracker(warmupDb);
    warmupTracker.initialize();
    for (let i = 0; i < 10; i++) {
      const pid = `warmup-rb-${i}`;
      warmupTracker.createGenesis(pid, { data: 'state-0' });
      let p: Record<string, unknown> = { data: 'state-0' };
      for (let v = 1; v <= 10; v++) {
        const n = { data: `state-${v}`, version: v };
        warmupTracker.recordDelta(pid, p, n);
        p = n;
      }
      warmupTracker.rollback(pid, 5);
    }

    // Benchmark: each iteration creates a fresh history and rolls back
    const benchDb = new Database(':memory:');
    const benchTracker = new DeltaTracker(benchDb);
    benchTracker.initialize();

    const avgUs = measureUs(() => {
      const pid = `rb-${Math.random().toString(36).slice(2, 10)}`;
      benchTracker.createGenesis(pid, { data: 'state-0' });
      let p: Record<string, unknown> = { data: 'state-0' };
      for (let v = 1; v <= 10; v++) {
        const n = { data: `state-${v}`, version: v };
        benchTracker.recordDelta(pid, p, n);
        p = n;
      }
      benchTracker.rollback(pid, 5);
    }, ROLLBACK_ITERATIONS);
    baselineResults['delta_rollback'] = avgUs;

    console.log(
      `[BASELINE] DeltaTracker.rollback(10 versions -> v5, SQLite :memory:): ${avgUs.toFixed(3)} us/op (${ROLLBACK_ITERATIONS} iterations, includes rebuild)`,
    );

    // Verify correctness on the original pattern
    const verifyDb = new Database(':memory:');
    const verifyTracker = new DeltaTracker(verifyDb);
    verifyTracker.initialize();
    verifyTracker.createGenesis('verify', { data: 'state-0' });
    let vPrev: Record<string, unknown> = { data: 'state-0' };
    for (let v = 1; v <= 10; v++) {
      const n = { data: `state-${v}`, version: v };
      verifyTracker.recordDelta('verify', vPrev, n);
      vPrev = n;
    }
    const restored = verifyTracker.rollback('verify', 5) as Record<string, unknown>;
    expect(restored).not.toBeNull();
    expect(restored.data).toBe('state-5');

    // SQLite-backed rollback with patch replay; generous bound
    expect(avgUs).toBeLessThan(20_000);
  });
});

// ============================================================================
// Summary
// ============================================================================

describe('Baseline Summary', () => {
  it('all baseline measurements within expected bounds', () => {
    console.log('\n========================================');
    console.log('  MILESTONE 1 PERFORMANCE BASELINES');
    console.log('========================================');

    const bounds: Record<string, number> = {
      cosine_128_number: 50,
      cosine_384_number: 100,
      cosine_128_float32: 50,
      cosine_384_float32: 100,
      hdc_fingerprint: 500,
      hdc_hamming: 100,
      hdc_bind: 50,
      energy_reflex: 100,
      energy_retrieval: 5000,
      validate_witness: 1000,
      compress_hot: 200,
      roundtrip_hot: 400,
      roundtrip_cold: 400,
      cusum_update_ns: 10_000,
      delta_record: 2000,
      delta_rollback: 20_000,
    };

    const failures: string[] = [];

    for (const [key, bound] of Object.entries(bounds)) {
      const measured = baselineResults[key];
      if (measured !== undefined) {
        const unit = key.endsWith('_ns') ? 'ns' : 'us';
        const status = measured <= bound ? 'PASS' : 'FAIL';
        console.log(
          `  ${status}: ${key} = ${measured.toFixed(3)} ${unit}/op (bound: ${bound} ${unit})`,
        );
        if (measured > bound) {
          failures.push(`${key}: ${measured.toFixed(3)} ${unit} > ${bound} ${unit}`);
        }
      } else {
        console.log(`  SKIP: ${key} (not measured)`);
      }
    }

    console.log('========================================');
    console.log('Run this test again after Milestone 1 to compare.');
    console.log('Look for [BASELINE] lines above for individual measurements.');
    console.log('');
    console.log('Expected improvements after Milestone 1:');
    console.log('  - HDC hammingDistance should be 10-100x faster than cosine similarity');
    console.log('  - CUSUM update should add < 1us overhead to coherence gate');
    console.log('  - Delta recordDelta (SQLite) should be < 500us per write');
    console.log('  - Delta rollback (SQLite) should be < 5ms for 10-version history');
    console.log('========================================\n');

    expect(failures).toEqual([]);
  });
});
