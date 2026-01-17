/**
 * Automated Benchmark Suite
 *
 * Comprehensive performance benchmarks for critical paths with regression detection.
 * Uses tinybench for accurate measurements and statistical analysis.
 *
 * Usage:
 *   npm run benchmark                    - Run all benchmarks
 *   npm run benchmark -- --filter=agent  - Run specific benchmark
 *   npm run benchmark -- --baseline=v2.3.5  - Compare against specific baseline
 */

import { Bench } from 'tinybench';
import * as fs from 'fs/promises';
import * as path from 'path';

// Types
export interface BenchmarkResult {
  name: string;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stdDev: number;
  min: number;
  max: number;
  samples: number;
  unit: string;
}

export interface BaselineData {
  version: string;
  date: string;
  commit: string;
  environment: {
    node: string;
    platform: string;
    arch: string;
    cpus: number;
    memory: string;
  };
  benchmarks: Record<string, BenchmarkResult>;
}

export interface RegressionResult {
  detected: boolean;
  percent: number;
  status: 'pass' | 'warning' | 'fail';
  message?: string;
  tTest?: {
    pValue: number;
    significant: boolean;
  };
}

export interface ComparisonResult {
  benchmark: string;
  current: BenchmarkResult;
  baseline?: BenchmarkResult;
  regression: RegressionResult;
}

/**
 * Main Benchmark Suite
 */
export class BenchmarkSuite {
  private bench: Bench;
  private results: BenchmarkResult[] = [];
  private baseline?: BaselineData;

  constructor() {
    this.bench = new Bench({
      time: 5000, // 5 seconds per benchmark
      warmupIterations: 5,
      iterations: 100,
    });
  }

  /**
   * Load baseline for comparison
   */
  async loadBaseline(version: string = 'v2.3.5'): Promise<void> {
    const baselinePath = path.join(__dirname, 'baselines', `${version}.json`);
    try {
      const data = await fs.readFile(baselinePath, 'utf-8');
      this.baseline = JSON.parse(data);
      console.log(`✓ Loaded baseline: ${this.baseline.version}`);
    } catch (error) {
      console.warn(`⚠ Could not load baseline ${version}:`, (error as Error).message);
    }
  }

  /**
   * Register all benchmarks
   */
  registerBenchmarks(): void {
    // Agent Spawning Benchmark
    // Uses a real TestGeneratorAgent to measure actual agent spawn performance
    this.bench.add('agent:spawn', async () => {
      const { TestGeneratorAgent } = await import('../src/agents/TestGeneratorAgent');
      const { SwarmMemoryManager } = await import('../src/core/memory/SwarmMemoryManager');
      const { EventEmitter } = await import('events');
      const { QEAgentType } = await import('../src/types');

      // Create required dependencies (minimal setup for benchmarking)
      const memoryStore = new SwarmMemoryManager({
        dbPath: ':memory:', // In-memory for benchmark isolation
        enableWAL: false,
        cacheSize: 100,
      });
      await memoryStore.initialize();

      const eventBus = new EventEmitter();

      const agent = new TestGeneratorAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [
          { name: 'test-generation', level: 1, domain: 'testing' },
          { name: 'pattern-matching', level: 1, domain: 'testing' },
        ],
        context: { projectPath: '/tmp/benchmark' },
        memoryStore,
        eventBus,
        enableLearning: false, // Disable learning for consistent benchmark
        enablePatterns: false, // Disable patterns for consistent benchmark
      });

      await agent.initialize();
      await agent.shutdown();
      await memoryStore.close();
    });

    // Pattern Matching Benchmark
    this.bench.add('pattern:match', async () => {
      const { AgentDBManager } = await import('../src/core/memory/AgentDBManager');
      const manager = new AgentDBManager({
        adapter: {
          type: 'memory' as any,
          dimension: 384,
          failFast: false,
          validateOnStartup: false,
        },
        enableQUICSync: false,
        syncPort: 4433,
        syncPeers: [],
        enableLearning: false,
        enableReasoning: false,
        cacheSize: 100,
        quantizationType: 'none',
      });

      await manager.initialize();

      // Store a few patterns first
      for (let i = 0; i < 10; i++) {
        const embedding = new Array(384).fill(0).map(() => Math.random());
        await manager.store({
          id: `pattern-${i}`,
          content: `Test pattern ${i}`,
          embedding,
          metadata: { type: 'test' },
        });
      }

      // Generate query embedding
      const queryEmbedding = new Array(384).fill(0).map(() => Math.random());

      // Search for patterns
      await manager.retrieve(queryEmbedding, { k: 10 });

      await manager.shutdown();
    });

    // Memory Query Benchmark
    this.bench.add('memory:query', async () => {
      const { HNSWVectorMemory } = await import('../src/core/memory/HNSWVectorMemory');
      const memory = new HNSWVectorMemory({
        dimension: 384,
        maxElements: 1000,
        M: 16,
        efConstruction: 200,
      });

      await memory.initialize();

      // Add some vectors first
      for (let i = 0; i < 100; i++) {
        const vector = new Array(384).fill(0).map(() => Math.random());
        await memory.add(`vector-${i}`, vector, { index: i });
      }

      // Query memory
      const query = new Array(384).fill(0).map(() => Math.random());
      await memory.search(query, 10);

      await memory.shutdown();
    });

    // Learning Iteration Benchmark
    this.bench.add('learning:iteration', async () => {
      const { PerformanceOptimizer } = await import('../src/learning/PerformanceOptimizer');
      const optimizer = new PerformanceOptimizer({
        enableCaching: true,
        cacheSize: 1000,
        enableLazyEval: true,
        enableBatchUpdates: true,
        batchUpdateSize: 32,
        enableMemoryPooling: true,
        memoryPoolSize: 500,
        enablePrioritization: false,
        priorityDecay: 0.95,
        lazyAccessThreshold: 10,
      });

      // Queue updates
      for (let i = 0; i < 32; i++) {
        optimizer.queueUpdate(
          `state-${i % 10}`,
          `action-${i % 5}`,
          0.5,
          0.6 + Math.random() * 0.2
        );
      }

      // Process batch (Q-value update cycle)
      optimizer.processBatchUpdates();

      optimizer.reset();
    });

    // Binary Cache Load Benchmark
    this.bench.add('cache:load', async () => {
      const { BinaryMetadataCache } = await import('../src/core/cache/BinaryMetadataCache');
      const cache = new BinaryMetadataCache({
        maxSize: 1000,
        ttl: 3600000,
        enableCompression: false,
      });

      await cache.initialize();

      // Simulate cache load
      const data = Buffer.from('test data'.repeat(100));
      await cache.set('test-key', data, { type: 'test' });
      await cache.get('test-key');

      await cache.shutdown();
    });

    // Test Discovery Benchmark - Simplified to file system scan
    this.bench.add('test:discovery', async () => {
      const glob = await import('glob');
      const testDir = path.join(__dirname, '../tests/contracts');

      // Discover test files
      const files = await new Promise<string[]>((resolve, reject) => {
        glob.glob('**/*.test.ts', { cwd: testDir }, (err, matches) => {
          if (err) reject(err);
          else resolve(matches);
        });
      });

      // Simulate basic analysis
      for (const file of files.slice(0, 5)) {
        const fullPath = path.join(testDir, file);
        const fs = await import('fs/promises');
        await fs.readFile(fullPath, 'utf-8');
      }
    });

    console.log(`✓ Registered ${this.bench.tasks.length} benchmarks`);
  }

  /**
   * Run benchmark suite
   */
  async run(): Promise<BenchmarkResult[]> {
    console.log('\n🚀 Starting benchmark suite...\n');

    await this.bench.run();

    console.log('\n📊 Benchmark Results:\n');

    // Process results
    for (const task of this.bench.tasks) {
      const result = this.processBenchmarkResult(task);
      this.results.push(result);

      // Display result
      console.log(`${task.name}:`);
      console.log(`  Mean:   ${result.mean.toFixed(2)}${result.unit}`);
      console.log(`  Median: ${result.median.toFixed(2)}${result.unit}`);
      console.log(`  P95:    ${result.p95.toFixed(2)}${result.unit}`);
      console.log(`  P99:    ${result.p99.toFixed(2)}${result.unit}`);
      console.log(`  StdDev: ${result.stdDev.toFixed(2)}${result.unit}`);
      console.log(`  Samples: ${result.samples}`);
      console.log();
    }

    return this.results;
  }

  /**
   * Process benchmark result with statistical analysis
   */
  private processBenchmarkResult(task: any): BenchmarkResult {
    const samples = task.result.samples || [];

    // Remove outliers using Tukey's fences
    const cleanedSamples = this.removeOutliers(samples);

    // Calculate statistics
    const sorted = [...cleanedSamples].sort((a, b) => a - b);
    const mean = cleanedSamples.reduce((a, b) => a + b, 0) / cleanedSamples.length;
    const median = this.percentile(sorted, 50);
    const p95 = this.percentile(sorted, 95);
    const p99 = this.percentile(sorted, 99);
    const stdDev = this.calculateStdDev(cleanedSamples, mean);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    return {
      name: task.name,
      mean,
      median,
      p95,
      p99,
      stdDev,
      min,
      max,
      samples: cleanedSamples.length,
      unit: 'ms',
    };
  }

  /**
   * Remove outliers using Tukey's fences
   */
  private removeOutliers(samples: number[]): number[] {
    const sorted = [...samples].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 25);
    const q3 = this.percentile(sorted, 75);
    const iqr = q3 - q1;

    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    return samples.filter(s => s >= lowerFence && s <= upperFence);
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(samples: number[], mean: number): number {
    const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;
    return Math.sqrt(variance);
  }

  /**
   * Compare results against baseline
   */
  compareWithBaseline(): ComparisonResult[] {
    if (!this.baseline) {
      console.warn('⚠ No baseline loaded for comparison');
      return [];
    }

    const comparisons: ComparisonResult[] = [];

    for (const result of this.results) {
      const baselineResult = this.baseline.benchmarks[result.name];
      const regression = this.detectRegression(result, baselineResult);

      comparisons.push({
        benchmark: result.name,
        current: result,
        baseline: baselineResult,
        regression,
      });
    }

    return comparisons;
  }

  /**
   * Detect performance regression
   */
  private detectRegression(
    current: BenchmarkResult,
    baseline?: BenchmarkResult
  ): RegressionResult {
    if (!baseline) {
      return { detected: false, percent: 0, status: 'pass' };
    }

    // Calculate regression percentage
    const regressionPercent = ((current.mean - baseline.mean) / baseline.mean) * 100;

    // 10% threshold
    const threshold = 10;

    if (regressionPercent <= -5) {
      // Performance improvement
      return {
        detected: false,
        percent: regressionPercent,
        status: 'pass',
        message: `Performance improved by ${Math.abs(regressionPercent).toFixed(1)}%`,
      };
    } else if (regressionPercent > threshold) {
      // Regression detected (fail)
      return {
        detected: true,
        percent: regressionPercent,
        status: 'fail',
        message: `Performance regression of ${regressionPercent.toFixed(1)}% detected (threshold: ${threshold}%)`,
      };
    } else if (regressionPercent > 5) {
      // Minor regression (warning)
      return {
        detected: true,
        percent: regressionPercent,
        status: 'warning',
        message: `Minor performance regression of ${regressionPercent.toFixed(1)}%`,
      };
    } else {
      // Within acceptable range
      return {
        detected: false,
        percent: regressionPercent,
        status: 'pass',
      };
    }
  }

  /**
   * Generate comparison report
   */
  generateReport(comparisons: ComparisonResult[]): string {
    const lines: string[] = [];

    lines.push('# Performance Benchmark Report');
    lines.push('');
    lines.push(`**Baseline**: ${this.baseline?.version || 'N/A'}`);
    lines.push(`**Date**: ${new Date().toISOString()}`);
    lines.push('');

    // Summary
    const passed = comparisons.filter(c => c.regression.status === 'pass').length;
    const warnings = comparisons.filter(c => c.regression.status === 'warning').length;
    const failed = comparisons.filter(c => c.regression.status === 'fail').length;

    lines.push('## Summary');
    lines.push('');
    lines.push(`- ✅ Passed: ${passed}`);
    lines.push(`- ⚠️ Warnings: ${warnings}`);
    lines.push(`- ❌ Failed: ${failed}`);
    lines.push('');

    // Detailed results table
    lines.push('## Results');
    lines.push('');
    lines.push('| Benchmark | Baseline | Current | Change | Status |');
    lines.push('|-----------|----------|---------|--------|--------|');

    for (const comp of comparisons) {
      const baselineMean = comp.baseline?.mean.toFixed(2) || 'N/A';
      const currentMean = comp.current.mean.toFixed(2);
      const change = comp.regression.percent.toFixed(1) + '%';
      const status = this.getStatusIcon(comp.regression.status);

      lines.push(
        `| ${comp.benchmark} | ${baselineMean}ms | ${currentMean}ms | ${change} | ${status} |`
      );
    }

    lines.push('');

    // Failures and warnings
    const issues = comparisons.filter(c => c.regression.status !== 'pass');
    if (issues.length > 0) {
      lines.push('## Issues');
      lines.push('');

      for (const issue of issues) {
        const icon = issue.regression.status === 'fail' ? '❌' : '⚠️';
        lines.push(`### ${icon} ${issue.benchmark}`);
        lines.push('');
        lines.push(`- **Baseline**: ${issue.baseline?.mean.toFixed(2)}ms (p95: ${issue.baseline?.p95.toFixed(2)}ms)`);
        lines.push(`- **Current**: ${issue.current.mean.toFixed(2)}ms (p95: ${issue.current.p95.toFixed(2)}ms)`);
        lines.push(`- **Regression**: ${issue.regression.percent.toFixed(1)}%`);
        lines.push(`- **Message**: ${issue.regression.message || 'N/A'}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: 'pass' | 'warning' | 'fail'): string {
    switch (status) {
      case 'pass':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'fail':
        return '❌';
    }
  }

  /**
   * Save results as JSON
   */
  async saveResults(outputPath: string): Promise<void> {
    const data = {
      version: 'current',
      date: new Date().toISOString(),
      commit: process.env.GITHUB_SHA || 'local',
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpus: require('os').cpus().length,
        memory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + 'GB',
      },
      benchmarks: this.results.reduce((acc, r) => {
        acc[r.name] = r;
        return acc;
      }, {} as Record<string, BenchmarkResult>),
    };

    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    console.log(`\n📄 Results saved to: ${outputPath}`);
  }

  /**
   * Check if any regression fails
   */
  hasRegressionFailures(comparisons: ComparisonResult[]): boolean {
    return comparisons.some(c => c.regression.status === 'fail');
  }
}

/**
 * CLI entry point
 */
export async function runBenchmarkCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const baselineVersion = args.find(a => a.startsWith('--baseline='))?.split('=')[1] || 'v2.3.5';
  const outputPath = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'benchmark-results.json';

  const suite = new BenchmarkSuite();

  // Load baseline
  await suite.loadBaseline(baselineVersion);

  // Register and run benchmarks
  suite.registerBenchmarks();
  await suite.run();

  // Compare with baseline
  const comparisons = suite.compareWithBaseline();

  // Generate report
  const report = suite.generateReport(comparisons);
  console.log('\n' + report);

  // Save results
  await suite.saveResults(outputPath);

  // Exit with failure if regressions detected
  if (suite.hasRegressionFailures(comparisons)) {
    console.error('\n❌ Performance regressions detected!');
    process.exit(1);
  } else {
    console.log('\n✅ All benchmarks passed!');
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  runBenchmarkCLI().catch(error => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });
}
