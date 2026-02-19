/**
 * Agentic QE v3 - Performance Benchmarks
 *
 * REAL benchmarks that measure actual performance.
 * Run these BEFORE claiming any O(log n) or performance improvements.
 *
 * @module benchmarks/performance-benchmarks
 */

import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface BenchmarkResult {
  name: string;
  operation: string;
  inputSize: number;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  medianTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  opsPerSecond: number;
  complexity: string;
  verified: boolean;
  details: string;
}

export interface BenchmarkSuite {
  suiteName: string;
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuCores: number;
  };
  results: BenchmarkResult[];
  summary: string;
}

// ============================================================================
// Benchmark Utilities
// ============================================================================

/**
 * Run a benchmark with multiple iterations and collect statistics
 */
export async function runBenchmark(
  name: string,
  operation: string,
  fn: () => Promise<void> | void,
  options: {
    iterations?: number;
    warmupIterations?: number;
    inputSize?: number;
  } = {}
): Promise<BenchmarkResult> {
  const { iterations = 100, warmupIterations = 10, inputSize = 0 } = options;
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  // Force GC if available
  if (global.gc) {
    global.gc();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  // Calculate statistics
  times.sort((a, b) => a - b);
  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / iterations;
  const medianTime = times[Math.floor(iterations / 2)];
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const opsPerSecond = 1000 / avgTime;

  return {
    name,
    operation,
    inputSize,
    iterations,
    totalTimeMs: totalTime,
    avgTimeMs: avgTime,
    medianTimeMs: medianTime,
    minTimeMs: minTime,
    maxTimeMs: maxTime,
    opsPerSecond,
    complexity: 'measured',
    verified: true,
    details: `${iterations} iterations, ${warmupIterations} warmup`,
  };
}

/**
 * Verify O(log n) complexity by measuring at different input sizes
 */
export async function verifyLogNComplexity(
  name: string,
  setupFn: (size: number) => Promise<{ runFn: () => Promise<void> | void; cleanup?: () => Promise<void> }>,
  sizes: number[] = [100, 1000, 10000, 100000]
): Promise<{
  verified: boolean;
  ratio: number;
  expectedRatio: number;
  details: string;
  results: BenchmarkResult[];
}> {
  const results: BenchmarkResult[] = [];

  for (const size of sizes) {
    const { runFn, cleanup } = await setupFn(size);

    const result = await runBenchmark(name, `n=${size}`, runFn, {
      iterations: 50,
      warmupIterations: 5,
      inputSize: size,
    });

    results.push(result);

    if (cleanup) {
      await cleanup();
    }
  }

  // For O(log n), when n increases 10x, time should increase by ~log(10) ≈ 2.3x
  // Compare first and last measurements
  const firstResult = results[0];
  const lastResult = results[results.length - 1];

  const sizeRatio = lastResult.inputSize / firstResult.inputSize;
  const timeRatio = lastResult.avgTimeMs / firstResult.avgTimeMs;
  const expectedLogRatio = Math.log(sizeRatio) / Math.log(10); // Should be close to this for O(log n)

  // O(log n) verified if time ratio is significantly less than linear (size ratio)
  // and somewhat close to log ratio
  const isLogN = timeRatio < sizeRatio * 0.1 && timeRatio < expectedLogRatio * 3;

  return {
    verified: isLogN,
    ratio: timeRatio,
    expectedRatio: expectedLogRatio,
    details: isLogN
      ? `Time grew ${timeRatio.toFixed(2)}x while input grew ${sizeRatio}x - consistent with O(log n)`
      : `Time grew ${timeRatio.toFixed(2)}x while input grew ${sizeRatio}x - NOT O(log n), appears O(n) or worse`,
    results,
  };
}

/**
 * Compare two implementations
 */
export async function compareImplementations(
  name: string,
  impl1: { name: string; fn: () => Promise<void> | void },
  impl2: { name: string; fn: () => Promise<void> | void },
  iterations: number = 100
): Promise<{
  winner: string;
  speedup: number;
  impl1Result: BenchmarkResult;
  impl2Result: BenchmarkResult;
}> {
  const result1 = await runBenchmark(`${name} - ${impl1.name}`, 'comparison', impl1.fn, { iterations });
  const result2 = await runBenchmark(`${name} - ${impl2.name}`, 'comparison', impl2.fn, { iterations });

  const speedup = result1.avgTimeMs / result2.avgTimeMs;

  return {
    winner: speedup > 1 ? impl2.name : impl1.name,
    speedup: speedup > 1 ? speedup : 1 / speedup,
    impl1Result: result1,
    impl2Result: result2,
  };
}

// ============================================================================
// HNSW Benchmarks
// ============================================================================

/**
 * Mock memory backend type for benchmarks
 */
interface MockMemoryBackend {
  set(key: string, value: unknown, metadata?: unknown): Promise<void>;
  get(key: string): Promise<{ value: unknown; metadata?: unknown } | null>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
  close(): Promise<void>;
  vectorSearch(embedding: number[], k: number): Promise<Array<{ key: string; score: number; metadata: unknown }>>;
  storeVector(key: string, embedding: number[], metadata?: unknown): Promise<void>;
  getStats(): Promise<{ keyCount: number; vectorCount: number }>;
  search(): Promise<never[]>;
  count(): Promise<number>;
  hasCodeIntelligenceIndex(): boolean;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Create a mock memory backend for benchmarks
 */
function createMockMemoryBackend(): MockMemoryBackend {
  const store = new Map<string, { value: unknown; metadata?: unknown }>();
  const vectors = new Map<string, { embedding: number[]; metadata: unknown }>();

  return {
    set: async (key: string, value: unknown, metadata?: unknown) => {
      store.set(key, { value, metadata });
    },
    get: async (key: string) => store.get(key) || null,
    delete: async (key: string) => store.delete(key),
    has: async (key: string) => store.has(key),
    keys: async () => Array.from(store.keys()),
    clear: async () => { store.clear(); vectors.clear(); },
    close: async () => {},
    vectorSearch: async (embedding: number[], k: number) => {
      // Simple brute force search for mock
      const results = Array.from(vectors.entries())
        .map(([key, data]) => {
          // Cosine similarity
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < embedding.length; i++) {
            dot += embedding[i] * (data.embedding[i] || 0);
            normA += embedding[i] * embedding[i];
            normB += (data.embedding[i] || 0) * (data.embedding[i] || 0);
          }
          const score = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
          return { key, score, metadata: data.metadata };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
      return results;
    },
    storeVector: async (key: string, embedding: number[], metadata?: unknown) => {
      vectors.set(key, { embedding, metadata });
    },
    getStats: async () => ({ keyCount: store.size, vectorCount: vectors.size }),
    search: async () => [],
    count: async () => store.size,
    hasCodeIntelligenceIndex: () => false,
    initialize: async () => {},
    dispose: async () => { store.clear(); vectors.clear(); },
  };
}

/**
 * Benchmark HNSW index operations
 */
export async function benchmarkHNSWIndex(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  try {
    // Dynamic import to handle optional dependency
    const { HNSWIndex, DEFAULT_HNSW_CONFIG } = await import(
      '../domains/coverage-analysis/services/hnsw-index.js'
    );

    const dimensions = 768;
    const config = {
      ...DEFAULT_HNSW_CONFIG,
      dimensions,
      maxElements: 10000,
      efConstruction: 200,
      M: 16,
      efSearch: 50,
      namespace: 'benchmark',
      metric: 'cosine' as const,
    };

    const mockMemory = createMockMemoryBackend();
    // Cast mock to MemoryBackend for benchmark purposes - mock implements required methods
    const index = new HNSWIndex(mockMemory as unknown as import('../kernel/interfaces.js').MemoryBackend, config);

    // Benchmark initialization
    const initResult = await runBenchmark(
      'HNSW',
      'initialize',
      async () => {
        await index.initialize();
      },
      { iterations: 10 }
    );
    results.push(initResult);

    await index.initialize();

    // Insert vectors for search benchmarks
    for (let i = 0; i < 1000; i++) {
      const vector = Array.from({ length: dimensions }, () => Math.random());
      await index.insert(`vec-${i}`, vector, {
        filePath: `src/file${i}.ts`,
        lineCoverage: 50 + Math.random() * 50,
        branchCoverage: 50 + Math.random() * 50,
        functionCoverage: 50 + Math.random() * 50,
        statementCoverage: 50 + Math.random() * 50,
        uncoveredLineCount: Math.floor(Math.random() * 100),
        uncoveredBranchCount: Math.floor(Math.random() * 50),
        riskScore: Math.random(),
        lastUpdated: Date.now(),
        totalLines: 100 + Math.floor(Math.random() * 500),
      });
    }

    // Benchmark insert operation
    let insertCounter = 2000;
    const insertResult = await runBenchmark(
      'HNSW',
      'insert',
      async () => {
        const vector = Array.from({ length: dimensions }, () => Math.random());
        await index.insert(`temp-${insertCounter++}`, vector);
      },
      { iterations: 100 }
    );
    results.push(insertResult);

    // Benchmark search operation
    const searchResult = await runBenchmark(
      'HNSW',
      'search (k=10)',
      async () => {
        const query = Array.from({ length: dimensions }, () => Math.random());
        await index.search(query, 10);
      },
      { iterations: 100 }
    );
    results.push(searchResult);

    // Verify O(log n) for search
    const logNVerification = await verifyLogNComplexity(
      'HNSW Search',
      async (size) => {
        const testConfig = {
          ...DEFAULT_HNSW_CONFIG,
          dimensions,
          maxElements: size * 2,
          efConstruction: 200,
          M: 16,
          efSearch: 50,
          namespace: `benchmark-${size}`,
          metric: 'cosine' as const,
        };
        const testMemory = createMockMemoryBackend();
        const testIndex = new HNSWIndex(testMemory as unknown as import('../kernel/interfaces.js').MemoryBackend, testConfig);
        await testIndex.initialize();

        for (let i = 0; i < size; i++) {
          const vector = Array.from({ length: dimensions }, () => Math.random());
          await testIndex.insert(`vec-${i}`, vector);
        }

        return {
          runFn: async () => {
            const query = Array.from({ length: dimensions }, () => Math.random());
            await testIndex.search(query, 10);
          },
        };
      },
      [100, 1000, 5000]
    );

    results.push({
      name: 'HNSW Search Complexity',
      operation: 'O(log n) verification',
      inputSize: 0,
      iterations: logNVerification.results.length,
      totalTimeMs: 0,
      avgTimeMs: 0,
      medianTimeMs: 0,
      minTimeMs: 0,
      maxTimeMs: 0,
      opsPerSecond: 0,
      complexity: logNVerification.verified ? 'O(log n) VERIFIED' : 'NOT O(log n)',
      verified: logNVerification.verified,
      details: logNVerification.details,
    });
  } catch (error) {
    results.push({
      name: 'HNSW',
      operation: 'benchmark',
      inputSize: 0,
      iterations: 0,
      totalTimeMs: 0,
      avgTimeMs: 0,
      medianTimeMs: 0,
      minTimeMs: 0,
      maxTimeMs: 0,
      opsPerSecond: 0,
      complexity: 'FAILED',
      verified: false,
      details: `Benchmark failed: ${toErrorMessage(error)}`,
    });
  }

  return results;
}

// ============================================================================
// Coverage Analysis Benchmarks
// ============================================================================

/**
 * Benchmark coverage parsing operations
 */
export async function benchmarkCoverageParser(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  try {
    const { parseLCOV, extractGaps } = await import(
      '../domains/coverage-analysis/services/coverage-parser.js'
    );

    // Generate sample LCOV data
    const generateLCOV = (numFiles: number, linesPerFile: number): string => {
      let lcov = '';
      for (let f = 0; f < numFiles; f++) {
        lcov += `SF:src/file${f}.ts\n`;
        for (let l = 1; l <= linesPerFile; l++) {
          lcov += `DA:${l},${Math.random() > 0.3 ? 1 : 0}\n`;
        }
        lcov += `LF:${linesPerFile}\n`;
        lcov += `LH:${Math.floor(linesPerFile * 0.7)}\n`;
        lcov += 'end_of_record\n';
      }
      return lcov;
    };

    // Write test LCOV file
    const fs = await import('fs/promises');
    const testLcov = generateLCOV(50, 100);
    await fs.writeFile('/tmp/test-coverage.lcov', testLcov);

    // Benchmark parsing
    const parseResult = await runBenchmark(
      'Coverage Parser',
      'parse LCOV (50 files, 100 lines each)',
      async () => {
        await parseLCOV('/tmp/test-coverage.lcov');
      },
      { iterations: 50 }
    );
    results.push(parseResult);

    // Benchmark gap extraction
    const report = await parseLCOV('/tmp/test-coverage.lcov');
    const gapResult = await runBenchmark(
      'Coverage Parser',
      'extract gaps',
      () => {
        extractGaps(report);
      },
      { iterations: 100 }
    );
    results.push(gapResult);

    // Cleanup
    await fs.unlink('/tmp/test-coverage.lcov').catch(() => {});
  } catch (error) {
    results.push({
      name: 'Coverage Parser',
      operation: 'benchmark',
      inputSize: 0,
      iterations: 0,
      totalTimeMs: 0,
      avgTimeMs: 0,
      medianTimeMs: 0,
      minTimeMs: 0,
      maxTimeMs: 0,
      opsPerSecond: 0,
      complexity: 'FAILED',
      verified: false,
      details: `Benchmark failed: ${toErrorMessage(error)}`,
    });
  }

  return results;
}

// ============================================================================
// Security Scanner Benchmarks
// ============================================================================

/**
 * Benchmark security scanner operations
 */
export async function benchmarkSecurityScanner(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  try {
    const { isSemgrepAvailable, runSemgrep } = await import(
      '../domains/security-compliance/services/semgrep-integration.js'
    );

    // Check if semgrep is available
    const available = await isSemgrepAvailable();

    const availabilityResult = await runBenchmark(
      'Security Scanner',
      'check semgrep availability',
      async () => {
        await isSemgrepAvailable();
      },
      { iterations: 10 }
    );
    results.push(availabilityResult);

    if (available) {
      // Benchmark actual scan on a small directory
      const scanResult = await runBenchmark(
        'Security Scanner',
        'semgrep scan (current directory)',
        async () => {
          await runSemgrep({
            target: '.',
            config: 'auto',
            timeout: 60,
          });
        },
        { iterations: 3, warmupIterations: 1 }
      );
      results.push(scanResult);
    } else {
      results.push({
        name: 'Security Scanner',
        operation: 'semgrep scan',
        inputSize: 0,
        iterations: 0,
        totalTimeMs: 0,
        avgTimeMs: 0,
        medianTimeMs: 0,
        minTimeMs: 0,
        maxTimeMs: 0,
        opsPerSecond: 0,
        complexity: 'N/A',
        verified: false,
        details: 'Semgrep not installed - install with: pip install semgrep',
      });
    }
  } catch (error) {
    results.push({
      name: 'Security Scanner',
      operation: 'benchmark',
      inputSize: 0,
      iterations: 0,
      totalTimeMs: 0,
      avgTimeMs: 0,
      medianTimeMs: 0,
      minTimeMs: 0,
      maxTimeMs: 0,
      opsPerSecond: 0,
      complexity: 'FAILED',
      verified: false,
      details: `Benchmark failed: ${toErrorMessage(error)}`,
    });
  }

  return results;
}

// ============================================================================
// Full Benchmark Suite
// ============================================================================

/**
 * Run all benchmarks and generate a comprehensive report
 */
export async function runFullBenchmarkSuite(): Promise<BenchmarkSuite> {
  const os = await import('os');

  const suite: BenchmarkSuite = {
    suiteName: 'Agentic QE v3 Performance Benchmarks',
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCores: os.cpus().length,
    },
    results: [],
    summary: '',
  };

  console.log('Running HNSW benchmarks...');
  suite.results.push(...(await benchmarkHNSWIndex()));

  console.log('Running Coverage Parser benchmarks...');
  suite.results.push(...(await benchmarkCoverageParser()));

  console.log('Running Security Scanner benchmarks...');
  suite.results.push(...(await benchmarkSecurityScanner()));

  // Generate summary
  const verified = suite.results.filter((r) => r.verified);
  const failed = suite.results.filter((r) => !r.verified && r.complexity === 'FAILED');
  const unverified = suite.results.filter((r) => !r.verified && r.complexity !== 'FAILED');

  suite.summary = `
=== BENCHMARK SUMMARY ===
Total benchmarks: ${suite.results.length}
Verified: ${verified.length}
Failed: ${failed.length}
Unverified/Unavailable: ${unverified.length}

=== O(log n) CLAIMS ===
${suite.results
  .filter((r) => r.operation.includes('O(log n)'))
  .map((r) => `${r.name}: ${r.verified ? '✅ VERIFIED' : '❌ NOT VERIFIED'} - ${r.details}`)
  .join('\n')}

=== PERFORMANCE METRICS ===
${suite.results
  .filter((r) => r.opsPerSecond > 0)
  .map((r) => `${r.name} (${r.operation}): ${r.opsPerSecond.toFixed(2)} ops/sec, avg ${r.avgTimeMs.toFixed(3)}ms`)
  .join('\n')}
`;

  return suite;
}

/**
 * Format benchmark results as markdown
 */
export function formatBenchmarkReport(suite: BenchmarkSuite): string {
  let report = `# Performance Benchmark Report

**Generated:** ${suite.timestamp}
**Node.js:** ${suite.environment.nodeVersion}
**Platform:** ${suite.environment.platform} (${suite.environment.arch})
**CPU Cores:** ${suite.environment.cpuCores}

## Results

| Benchmark | Operation | Avg Time | Ops/sec | Complexity | Verified |
|-----------|-----------|----------|---------|------------|----------|
`;

  for (const r of suite.results) {
    report += `| ${r.name} | ${r.operation} | ${r.avgTimeMs.toFixed(3)}ms | ${r.opsPerSecond.toFixed(2)} | ${r.complexity} | ${r.verified ? '✅' : '❌'} |\n`;
  }

  report += `\n## Details\n\n`;

  for (const r of suite.results) {
    report += `### ${r.name} - ${r.operation}\n`;
    report += `- **Iterations:** ${r.iterations}\n`;
    report += `- **Input Size:** ${r.inputSize}\n`;
    report += `- **Min:** ${r.minTimeMs.toFixed(3)}ms\n`;
    report += `- **Max:** ${r.maxTimeMs.toFixed(3)}ms\n`;
    report += `- **Median:** ${r.medianTimeMs.toFixed(3)}ms\n`;
    report += `- **Details:** ${r.details}\n\n`;
  }

  report += `## Summary\n\n\`\`\`\n${suite.summary}\n\`\`\`\n`;

  return report;
}
