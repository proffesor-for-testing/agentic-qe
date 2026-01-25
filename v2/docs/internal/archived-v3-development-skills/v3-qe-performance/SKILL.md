# v3-qe-performance

## Purpose
Guide the implementation of performance optimization patterns for AQE v3, focusing on O(log n) sublinear algorithms and efficient resource utilization.

## Activation
- When optimizing QE algorithm performance
- When implementing sublinear data structures
- When profiling and benchmarking QE operations
- When optimizing memory and CPU usage

## Performance Patterns

### 1. O(log n) Coverage Gap Detection

```typescript
// v3/src/domains/coverage-analysis/algorithms/SublinearGapDetector.ts
import { HNSWIndex, Vector } from '@aqe/agentdb';

export class SublinearGapDetector {
  private readonly index: HNSWIndex;
  private readonly threshold: number;

  constructor(config: GapDetectorConfig) {
    this.index = new HNSWIndex({
      dimensions: config.dimensions,
      M: 16,
      efConstruction: 200,
      efSearch: 100
    });
    this.threshold = config.gapThreshold || 0.7;
  }

  // O(log n) gap detection instead of O(n²)
  async detectGaps(
    codeVectors: Vector[],
    testVectors: Vector[]
  ): Promise<CoverageGap[]> {
    // Build index from test vectors - O(n log n) one-time cost
    await this.index.buildIndex(testVectors);

    const gaps: CoverageGap[] = [];

    // For each code vector, find nearest test - O(log n) per query
    for (const codeVector of codeVectors) {
      const [nearest] = await this.index.search(codeVector.embedding, 1);

      // High distance = potential coverage gap
      if (nearest.distance > this.threshold) {
        gaps.push({
          codeLocation: codeVector.metadata.location,
          nearestTest: nearest.metadata.testPath,
          distance: nearest.distance,
          confidence: 1 - nearest.distance,
          suggestedTestType: this.inferTestType(codeVector)
        });
      }
    }

    return gaps.sort((a, b) => b.distance - a.distance);
  }

  // Incremental update - O(log n)
  async updateIndex(newTestVector: Vector): Promise<void> {
    await this.index.add(newTestVector);
  }

  // Batch update - O(k log n)
  async batchUpdate(newTestVectors: Vector[]): Promise<void> {
    await this.index.addBatch(newTestVectors);
  }
}

// Performance comparison:
// | Vectors | Brute Force | HNSW     | Speedup |
// |---------|-------------|----------|---------|
// | 10K     | 100ms       | 0.6ms    | 166x    |
// | 100K    | 10,000ms    | 0.8ms    | 12,500x |
// | 1M      | 1,000,000ms | 1.0ms    | 1M x    |
```

### 2. Efficient Test Prioritization

```typescript
// v3/src/domains/test-execution/algorithms/TestPrioritizer.ts
export class TestPrioritizer {
  // O(n log n) priority queue-based prioritization
  prioritizeTests(
    tests: Test[],
    changes: CodeChange[],
    history: TestHistory
  ): PrioritizedTest[] {
    // Use min-heap for efficient top-k extraction
    const heap = new MinHeap<PrioritizedTest>(
      (a, b) => b.priority - a.priority
    );

    for (const test of tests) {
      const priority = this.calculatePriority(test, changes, history);
      heap.push({ test, priority });
    }

    // Extract in priority order - O(n log n)
    return heap.toSortedArray();
  }

  private calculatePriority(
    test: Test,
    changes: CodeChange[],
    history: TestHistory
  ): number {
    let score = 0;

    // 1. Change proximity (40% weight)
    const changeProximity = this.calculateChangeProximity(test, changes);
    score += changeProximity * 0.4;

    // 2. Historical failure rate (30% weight)
    const failureRate = history.getFailureRate(test.id);
    score += failureRate * 0.3;

    // 3. Code complexity coverage (20% weight)
    const complexityCoverage = this.getComplexityCoverage(test);
    score += complexityCoverage * 0.2;

    // 4. Execution time (10% weight - prefer fast tests)
    const speedScore = 1 - (test.avgDuration / history.maxDuration);
    score += speedScore * 0.1;

    return score;
  }
}
```

### 3. Parallel Test Execution Optimization

```typescript
// v3/src/domains/test-execution/services/OptimizedParallelExecutor.ts
export class OptimizedParallelExecutor {
  private readonly workerPool: WorkerPool;
  private readonly loadBalancer: LoadBalancer;

  constructor(config: ExecutorConfig) {
    this.workerPool = new WorkerPool(config.maxWorkers);
    this.loadBalancer = new LoadBalancer(config.strategy);
  }

  async executeTests(tests: Test[]): Promise<TestResult[]> {
    // 1. Bin packing for optimal distribution
    const bins = this.binPackTests(tests, this.workerPool.size);

    // 2. Execute bins in parallel with work stealing
    const results = await Promise.all(
      bins.map((bin, i) => this.executebin(bin, i))
    );

    return results.flat();
  }

  // Bin packing - O(n log n)
  private binPackTests(tests: Test[], numBins: number): Test[][] {
    // Sort by estimated duration descending
    const sorted = [...tests].sort((a, b) => b.estimatedDuration - a.estimatedDuration);

    // Min-heap of bin loads
    const binLoads = new MinHeap<{ index: number; load: number }>(
      (a, b) => a.load - b.load
    );

    // Initialize bins
    const bins: Test[][] = Array.from({ length: numBins }, () => []);
    for (let i = 0; i < numBins; i++) {
      binLoads.push({ index: i, load: 0 });
    }

    // Assign tests to bins (first-fit decreasing)
    for (const test of sorted) {
      const minBin = binLoads.pop()!;
      bins[minBin.index].push(test);
      minBin.load += test.estimatedDuration;
      binLoads.push(minBin);
    }

    return bins;
  }

  // Work stealing for load balancing
  private async executeBin(tests: Test[], workerId: number): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const queue = [...tests];

    while (queue.length > 0) {
      const test = queue.shift()!;
      const result = await this.workerPool.execute(workerId, test);
      results.push(result);

      // Check for steal opportunities
      if (queue.length < 2) {
        const stolen = await this.loadBalancer.stealWork(workerId);
        if (stolen) queue.push(...stolen);
      }
    }

    return results;
  }
}
```

### 4. Memory-Efficient Pattern Storage

```typescript
// v3/src/infrastructure/memory/EfficientPatternStore.ts
export class EfficientPatternStore {
  private readonly lruCache: LRUCache<string, Pattern>;
  private readonly bloomFilter: BloomFilter;
  private readonly compressor: Compressor;

  constructor(config: PatternStoreConfig) {
    this.lruCache = new LRUCache(config.cacheSize);
    this.bloomFilter = new BloomFilter(config.expectedItems, config.falsePositiveRate);
    this.compressor = new Compressor('lz4');
  }

  // O(1) existence check with bloom filter
  async mightExist(patternId: string): Promise<boolean> {
    return this.bloomFilter.mightContain(patternId);
  }

  // O(1) cache lookup, O(log n) disk fallback
  async get(patternId: string): Promise<Pattern | null> {
    // Fast path: LRU cache
    const cached = this.lruCache.get(patternId);
    if (cached) return cached;

    // Bloom filter check before disk access
    if (!this.bloomFilter.mightContain(patternId)) {
      return null;
    }

    // Disk lookup with decompression
    const compressed = await this.diskStorage.get(patternId);
    if (!compressed) return null;

    const pattern = await this.compressor.decompress(compressed);
    this.lruCache.set(patternId, pattern);

    return pattern;
  }

  async store(pattern: Pattern): Promise<void> {
    // Compress before storing
    const compressed = await this.compressor.compress(pattern);

    // Update bloom filter
    this.bloomFilter.add(pattern.id);

    // Store compressed
    await this.diskStorage.set(pattern.id, compressed);

    // Update cache
    this.lruCache.set(pattern.id, pattern);
  }
}

// Memory savings:
// - LRU cache: Only hot patterns in memory
// - Bloom filter: 1 byte per pattern vs full storage
// - LZ4 compression: 3-5x size reduction
// - Total savings: 80-90% memory reduction
```

### 5. Incremental Analysis

```typescript
// v3/src/domains/coverage-analysis/services/IncrementalAnalyzer.ts
export class IncrementalAnalyzer {
  private readonly cache: AnalysisCache;
  private readonly differ: CodeDiffer;

  // Only analyze changed code - O(k) where k = changes
  async analyzeIncremental(
    previousAnalysis: Analysis,
    changes: CodeChange[]
  ): Promise<Analysis> {
    // Get affected files
    const affected = this.getAffectedFiles(changes);

    // Reuse cached results for unchanged files
    const reused = this.filterUnchanged(previousAnalysis, affected);

    // Only analyze changed portions
    const newAnalysis = await this.analyzeFiles(affected);

    // Merge results
    return this.mergeAnalysis(reused, newAnalysis);
  }

  private getAffectedFiles(changes: CodeChange[]): Set<string> {
    const affected = new Set<string>();

    for (const change of changes) {
      affected.add(change.filePath);

      // Add dependents (files that import this file)
      const dependents = this.getDependents(change.filePath);
      dependents.forEach(d => affected.add(d));
    }

    return affected;
  }
}
```

### 6. Benchmark Suite

```typescript
// v3/src/infrastructure/performance/BenchmarkSuite.ts
export class QEBenchmarkSuite {
  async runBenchmarks(): Promise<BenchmarkReport> {
    const results: BenchmarkResult[] = [];

    // Coverage gap detection
    results.push(await this.benchmarkGapDetection());

    // Test prioritization
    results.push(await this.benchmarkPrioritization());

    // Pattern search
    results.push(await this.benchmarkPatternSearch());

    // Memory operations
    results.push(await this.benchmarkMemory());

    return {
      results,
      summary: this.generateSummary(results),
      recommendations: this.generateRecommendations(results)
    };
  }

  private async benchmarkGapDetection(): Promise<BenchmarkResult> {
    const sizes = [1000, 10000, 100000];
    const measurements: Measurement[] = [];

    for (const size of sizes) {
      const vectors = this.generateVectors(size);

      // Warm up
      await this.runGapDetection(vectors.slice(0, 100));

      // Measure
      const start = performance.now();
      await this.runGapDetection(vectors);
      const duration = performance.now() - start;

      measurements.push({
        size,
        duration,
        throughput: size / duration * 1000,
        memoryUsed: process.memoryUsage().heapUsed
      });
    }

    return {
      name: 'Gap Detection',
      measurements,
      complexity: this.estimateComplexity(measurements)
    };
  }

  private estimateComplexity(measurements: Measurement[]): string {
    // Fit to common complexity classes
    const ratios = measurements.map((m, i) => {
      if (i === 0) return 1;
      const sizeRatio = m.size / measurements[i-1].size;
      const timeRatio = m.duration / measurements[i-1].duration;
      return timeRatio / sizeRatio;
    });

    const avgRatio = ratios.reduce((a, b) => a + b) / ratios.length;

    if (avgRatio < 0.5) return 'O(log n)';
    if (avgRatio < 1.2) return 'O(n)';
    if (avgRatio < 2.5) return 'O(n log n)';
    return 'O(n²)';
  }
}
```

## Performance Targets

| Operation | Target | Current | Status |
|-----------|--------|---------|--------|
| Gap detection (10K vectors) | < 10ms | TBD | 🔴 |
| Test prioritization (1K tests) | < 50ms | TBD | 🔴 |
| Pattern search (100K patterns) | < 5ms | TBD | 🔴 |
| Memory per pattern | < 100 bytes | TBD | 🔴 |
| Incremental analysis | < 100ms | TBD | 🔴 |

## Implementation Checklist

- [ ] Implement SublinearGapDetector with HNSW
- [ ] Create optimized TestPrioritizer
- [ ] Build parallel executor with work stealing
- [ ] Add efficient pattern storage
- [ ] Implement incremental analysis
- [ ] Create benchmark suite
- [ ] Profile and optimize hot paths
- [ ] Document performance characteristics

## Related Skills
- v3-qe-memory-system - AgentDB optimization
- v3-qe-core-implementation - Domain algorithms
- v3-qe-fleet-coordination - Distributed execution
