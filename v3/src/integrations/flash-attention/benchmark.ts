/**
 * Flash Attention Performance Benchmark Suite
 * Validates 2.49x-7.47x speedup targets for QE workloads (ADR-040)
 * @module flash-attention/benchmark
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  QEWorkloadType,
  BenchmarkResult,
  FlashAttentionMetrics
} from './types.js';
import { QE_FLASH_ATTENTION_CONFIG, QE_PERFORMANCE_TARGETS } from './config.js';
import { createQEFlashAttention } from './flash-attention.js';

// CLI arguments
const args = process.argv.slice(2);
const runAll = args.includes('--all');
const workloadArg = args.find(arg => arg.startsWith('--workload='))?.split('=')[1] as QEWorkloadType | undefined;
const exportJSON = args.includes('--export-json');
const exportMarkdown = args.includes('--export-markdown') || runAll;

/**
 * Flash Attention Benchmark Suite
 *
 * Validates performance improvements for QE workloads:
 * - Test similarity: 50ms → <15ms (3.33x target)
 * - Code embedding: 50ms → <15ms (3.33x target)
 * - Defect matching: 20ms → <5ms (4x target)
 * - Coverage search: 100ms → <1ms (100x with HNSW)
 * - Pattern adaptation: 2ms → <0.05ms (40x with SONA)
 */
export class FlashAttentionBenchmark {
  private results: Map<QEWorkloadType, BenchmarkResult> = new Map();
  private warmupIterations = 3;
  private benchmarkIterations = 10;

  /**
   * Run full benchmark suite
   */
  async runFullSuite(): Promise<Map<QEWorkloadType, BenchmarkResult>> {
    const workloads: QEWorkloadType[] = [
      'test-similarity',
      'code-embedding',
      'defect-matching',
      'coverage-analysis',
      'pattern-adaptation'
    ];

    console.log('[FlashAttention Benchmark] Starting full benchmark suite...');
    console.log(`[FlashAttention Benchmark] Warmup iterations: ${this.warmupIterations}`);
    console.log(`[FlashAttention Benchmark] Benchmark iterations: ${this.benchmarkIterations}`);

    for (const workload of workloads) {
      console.log(`\n[FlashAttention Benchmark] Benchmarking: ${workload}`);
      const result = await this.benchmarkWorkload(workload);
      this.results.set(workload, result);
      this.printBenchmarkResult(result);
    }

    this.printSummary();
    return this.results;
  }

  /**
   * Benchmark specific workload
   */
  async benchmarkWorkload(workload: QEWorkloadType): Promise<BenchmarkResult> {
    // Get workload-specific parameters
    const params = this.getWorkloadParameters(workload);

    // Warmup
    console.log(`[FlashAttention Benchmark] Warming up...`);
    await this.runBenchmark(params, this.warmupIterations, true);

    // Baseline benchmark (standard attention)
    console.log(`[FlashAttention Benchmark] Running baseline...`);
    const baseline = await this.runBenchmark(params, this.benchmarkIterations, false, true);

    // Flash Attention benchmark
    console.log(`[FlashAttention Benchmark] Running Flash Attention...`);
    const flash = await this.runBenchmark(params, this.benchmarkIterations, false, false);

    // Calculate metrics
    const speedup = baseline.timeMs / flash.timeMs;
    const memoryReduction = 1 - (flash.memoryMB / baseline.memoryMB);
    const target = QE_FLASH_ATTENTION_CONFIG[workload].targetSpeedup;
    const meetsTarget = speedup >= target.min;

    return {
      workload,
      baseline,
      flash,
      speedup,
      memoryReduction,
      meetsTarget
    };
  }

  /**
   * Get workload-specific parameters
   */
  private getWorkloadParameters(workload: QEWorkloadType) {
    const config = QE_FLASH_ATTENTION_CONFIG[workload];

    switch (workload) {
      case 'test-similarity':
        return {
          seqLen: 512,
          dim: 768,
          numTests: 100
        };

      case 'code-embedding':
        return {
          seqLen: 1024,
          dim: 1024,
          numTests: 50
        };

      case 'defect-matching':
        return {
          seqLen: 256,
          dim: 512,
          numTests: 200
        };

      case 'coverage-analysis':
        return {
          seqLen: 256,
          dim: 384,
          numTests: 500
        };

      case 'pattern-adaptation':
        return {
          seqLen: 128,
          dim: 256,
          numTests: 1000
        };

      default:
        return {
          seqLen: 512,
          dim: 768,
          numTests: 100
        };
    }
  }

  /**
   * Run benchmark with specified parameters
   */
  private async runBenchmark(
    params: { seqLen: number; dim: number; numTests: number },
    iterations: number,
    warmup: boolean,
    useBaseline: boolean = false
  ): Promise<FlashAttentionMetrics> {
    const { seqLen, dim, numTests } = params;
    const times: number[] = [];
    const memories: number[] = [];

    for (let i = 0; i < iterations; i++) {
      // Generate test data
      const Q = this.generateRandomMatrix(seqLen, dim);
      const K = this.generateRandomMatrix(seqLen, dim);
      const V = this.generateRandomMatrix(seqLen, dim);

      // Measure memory before
      const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;

      // Run computation
      const start = performance.now();

      if (useBaseline) {
        // Use baseline attention (O(N^2) memory)
        await this.computeBaseline(Q, K, V, seqLen, dim);
      } else {
        // Use Flash Attention
        const workload = this.inferWorkloadFromParams(params);
        const flashAttn = await createQEFlashAttention(workload);
        await flashAttn.computeFlashAttention(Q, K, V, seqLen, dim);
        flashAttn.dispose();
      }

      const end = performance.now();

      // Measure memory after
      const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;

      if (!warmup) {
        times.push(end - start);
        memories.push(memAfter - memBefore);
      }

      // Force GC between iterations (if available)
      if (global.gc) {
        global.gc();
      }
    }

    if (warmup) {
      return {
        timeMs: 0,
        memoryMB: 0,
        speedup: 1.0,
        throughput: 0,
        peakMemoryMB: 0
      };
    }

    // Calculate statistics
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const p95Time = this.percentile(times, 95);
    const p99Time = this.percentile(times, 99);
    const avgMemory = memories.reduce((a, b) => a + b, 0) / memories.length;
    const maxMemory = Math.max(...memories);

    return {
      timeMs: p95Time, // Use p95 for consistency
      memoryMB: avgMemory,
      speedup: 1.0,
      throughput: (seqLen * seqLen) / (p95Time / 1000),
      peakMemoryMB: maxMemory
    };
  }

  /**
   * Compute baseline attention (standard O(N^2) memory)
   */
  private async computeBaseline(
    Q: Float32Array,
    K: Float32Array,
    V: Float32Array,
    seqLen: number,
    dim: number
  ): Promise<Float32Array> {
    // Compute full attention matrix (O(N^2) memory)
    const attnMatrix = new Float32Array(seqLen * seqLen);
    const scale = 1.0 / Math.sqrt(dim);

    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        let sum = 0.0;
        for (let k = 0; k < dim; k++) {
          sum += Q[i * dim + k] * K[j * dim + k];
        }
        attnMatrix[i * seqLen + j] = sum * scale;
      }
    }

    // Apply softmax row-wise
    for (let i = 0; i < seqLen; i++) {
      const rowStart = i * seqLen;
      const rowEnd = rowStart + seqLen;
      let max = -Infinity;
      for (let j = rowStart; j < rowEnd; j++) {
        if (attnMatrix[j] > max) max = attnMatrix[j];
      }

      let sum = 0.0;
      for (let j = rowStart; j < rowEnd; j++) {
        attnMatrix[j] = Math.exp(attnMatrix[j] - max);
        sum += attnMatrix[j];
      }

      for (let j = rowStart; j < rowEnd; j++) {
        attnMatrix[j] /= sum;
      }
    }

    // Compute output
    const output = new Float32Array(seqLen * dim);
    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        const weight = attnMatrix[i * seqLen + j];
        for (let k = 0; k < dim; k++) {
          output[i * dim + k] += weight * V[j * dim + k];
        }
      }
    }

    return output;
  }

  /**
   * Infer workload type from parameters
   */
  private inferWorkloadFromParams(
    params: { seqLen: number; dim: number; numTests: number }
  ): QEWorkloadType {
    if (params.seqLen === 512 && params.dim === 768) return 'test-similarity';
    if (params.seqLen === 1024 && params.dim === 1024) return 'code-embedding';
    if (params.seqLen === 256 && params.dim === 512) return 'defect-matching';
    if (params.seqLen === 256 && params.dim === 384) return 'coverage-analysis';
    if (params.seqLen === 128 && params.dim === 256) return 'pattern-adaptation';
    return 'test-similarity';
  }

  /**
   * Generate random matrix for testing
   */
  private generateRandomMatrix(rows: number, cols: number): Float32Array {
    const data = new Float32Array(rows * cols);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * 2; // [-1, 1]
    }
    return data;
  }

  /**
   * Calculate percentile
   */
  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[idx];
  }

  /**
   * Print benchmark result
   */
  public printBenchmarkResult(result: BenchmarkResult): void {
    const { workload, baseline, flash, speedup, memoryReduction, meetsTarget } = result;
    const target = QE_FLASH_ATTENTION_CONFIG[workload].targetSpeedup;
    const perfTarget = QE_PERFORMANCE_TARGETS[workload];

    console.log(`\n  Results for ${workload}:`);
    console.log(`  ├─ Baseline:      ${baseline.timeMs.toFixed(2)}ms, ${baseline.memoryMB.toFixed(1)}MB`);
    console.log(`  ├─ Flash Attn:    ${flash.timeMs.toFixed(2)}ms, ${flash.memoryMB.toFixed(1)}MB`);
    console.log(`  ├─ Speedup:       ${speedup.toFixed(2)}x (target: ${target.min}x-${target.max}x)`);
    console.log(`  ├─ Memory:        -${(memoryReduction * 100).toFixed(1)}%`);
    console.log(`  ├─ Throughput:    ${flash.throughput.toFixed(0)} tokens/sec`);
    console.log(`  ├─ Target Latency: <${perfTarget.latency.after}ms (actual: ${flash.timeMs.toFixed(2)}ms)`);
    console.log(`  └─ Status:        ${meetsTarget ? '✓ PASS' : '✗ FAIL'}`);
  }

  /**
   * Print summary of all benchmarks
   */
  private printSummary(): void {
    console.log('\n' + '='.repeat(70));
    console.log('Flash Attention Benchmark Summary');
    console.log('='.repeat(70));

    let passCount = 0;
    let failCount = 0;

    for (const [workload, result] of this.results) {
      const status = result.meetsTarget;
      if (status) passCount++;
      else failCount++;

      console.log(`\n${workload}:`);
      console.log(`  Speedup: ${result.speedup.toFixed(2)}x`);
      console.log(`  Memory:  -${(result.memoryReduction * 100).toFixed(1)}%`);
      console.log(`  Status:  ${status ? '✓ PASS' : '✗ FAIL'}`);
    }

    console.log('\n' + '-'.repeat(70));
    console.log(`Total: ${passCount} PASS, ${failCount} FAIL`);
    console.log('='.repeat(70));

    // Check if all meet targets
    const allPass = failCount === 0;
    console.log(`\nOverall: ${allPass ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);

    if (allPass) {
      console.log('\nFlash Attention successfully achieves 2.49x-7.47x speedup target!');
    }
  }

  /**
   * Get benchmark results
   */
  getResults(): Map<QEWorkloadType, BenchmarkResult> {
    return new Map(this.results);
  }

  /**
   * Export results as JSON
   */
  exportResultsJSON(): string {
    const resultsObj: Record<string, BenchmarkResult> = {};
    for (const [workload, result] of this.results) {
      resultsObj[workload] = result;
    }
    return JSON.stringify(resultsObj, null, 2);
  }

  /**
   * Reset benchmark results
   */
  reset(): void {
    this.results.clear();
  }

  /**
   * Export results as JSON file
   */
  async exportResultsToFile(filepath: string): Promise<void> {
    const resultsObj: Record<string, BenchmarkResult> = {};
    for (const [workload, result] of this.results) {
      resultsObj[workload] = result;
    }

    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(),
      results: resultsObj
    };

    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    console.log(`\n[FlashAttention Benchmark] JSON results exported to: ${filepath}`);
  }

  /**
   * Export results as Markdown file
   */
  async exportResultsMarkdown(filepath: string): Promise<void> {
    const lines: string[] = [];

    // Header
    lines.push('# Flash Attention Benchmark Report');
    lines.push('');
    lines.push(`**Generated**: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Executive Summary');
    lines.push('');

    const summary = this.generateSummary();
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Workloads | ${summary.totalWorkloads} |`);
    lines.push(`| Passed | ${summary.passCount} |`);
    lines.push(`| Failed | ${summary.failCount} |`);
    lines.push(`| Average Speedup | ${summary.avgSpeedup.toFixed(2)}x |`);
    lines.push(`| Status | ${summary.allPass ? '✓ ALL PASSED' : '✗ SOME FAILED'} |`);
    lines.push('');

    // Detailed results
    lines.push('## Detailed Results');
    lines.push('');

    for (const [workload, result] of this.results) {
      const target = QE_FLASH_ATTENTION_CONFIG[workload].targetSpeedup;
      const perfTarget = QE_PERFORMANCE_TARGETS[workload];

      lines.push(`### ${workload.replace(/-/g, ' ').toUpperCase()}`);
      lines.push('');
      lines.push(`**Target Speedup**: ${target.min}x-${target.max}x`);
      lines.push(`**Status**: ${result.meetsTarget ? '✓ PASS' : '✗ FAIL'}`);
      lines.push('');
      lines.push('#### Performance Metrics');
      lines.push('');
      lines.push('| Metric | Baseline | Flash Attention | Improvement |');
      lines.push('|--------|----------|-----------------|-------------|');
      lines.push(`| Latency (p95) | ${result.baseline.timeMs.toFixed(2)}ms | ${result.flash.timeMs.toFixed(2)}ms | ${result.speedup.toFixed(2)}x |`);
      lines.push(`| Memory Usage | ${result.baseline.memoryMB.toFixed(1)}MB | ${result.flash.memoryMB.toFixed(1)}MB | -${(result.memoryReduction * 100).toFixed(1)}% |`);
      lines.push(`| Throughput | ${result.baseline.throughput.toFixed(0)} tokens/s | ${result.flash.throughput.toFixed(0)} tokens/s | ${((result.flash.throughput / result.baseline.throughput)).toFixed(2)}x |`);
      lines.push(`| Peak Memory | ${result.baseline.peakMemoryMB.toFixed(1)}MB | ${result.flash.peakMemoryMB.toFixed(1)}MB | -${((1 - result.flash.peakMemoryMB / result.baseline.peakMemoryMB) * 100).toFixed(1)}% |`);
      lines.push('');

      // Target comparison
      lines.push('#### Target Comparison');
      lines.push('');
      lines.push('| Target | Expected | Actual | Status |');
      lines.push('|--------|----------|--------|--------|');
      lines.push(`| Latency | <${perfTarget.latency.after}ms | ${result.flash.timeMs.toFixed(2)}ms | ${result.flash.timeMs < perfTarget.latency.after ? '✓' : '✗'} |`);
      lines.push(`| Memory | <${perfTarget.memory.after}MB | ${result.flash.memoryMB.toFixed(1)}MB | ${result.flash.memoryMB < perfTarget.memory.after ? '✓' : '✗'} |`);
      lines.push(`| Speedup | ${target.min}x minimum | ${result.speedup.toFixed(2)}x | ${result.speedup >= target.min ? '✓' : '✗'} |`);
      lines.push('');
    }

    // Analysis
    lines.push('## Analysis');
    lines.push('');

    if (summary.allPass) {
      lines.push('✓ **All benchmarks PASSED** - Flash Attention achieves target performance!');
    } else {
      lines.push('✗ **Some benchmarks FAILED** - Performance needs optimization');
    }

    lines.push('');
    lines.push('### Key Findings');
    lines.push('');

    for (const [workload, result] of this.results) {
      if (result.meetsTarget) {
        lines.push(`- **${workload}**: Achieved ${result.speedup.toFixed(2)}x speedup (target: ${QE_FLASH_ATTENTION_CONFIG[workload].targetSpeedup.min}x)`);
      } else {
        lines.push(`- **${workload}**: Only achieved ${result.speedup.toFixed(2)}x speedup (target: ${QE_FLASH_ATTENTION_CONFIG[workload].targetSpeedup.min}x) - needs optimization`);
      }
    }

    lines.push('');
    lines.push('### Recommendations');
    lines.push('');

    if (summary.avgSpeedup < 2.49) {
      lines.push('- Average speedup below 2.49x target - consider:');
      lines.push('  - Enabling WASM-SIMD backend');
      lines.push('  - Optimizing block sizes for current hardware');
      lines.push('  - Implementing fused softmax operation');
    } else if (summary.avgSpeedup > 7.47) {
      lines.push('- Average speedup exceeds 7.47x target - excellent performance!');
    } else {
      lines.push('- Performance within target range (2.49x-7.47x)');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('*This report was generated by the Flash Attention Benchmark Suite for QE Workloads*');
    lines.push('*Per ADR-040: Flash Attention Integration for Quality Engineering*');

    await fs.writeFile(filepath, lines.join('\n'));
    console.log(`[FlashAttention Benchmark] Markdown report exported to: ${filepath}`);
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(): {
    totalWorkloads: number;
    passCount: number;
    failCount: number;
    avgSpeedup: number;
    allPass: boolean;
  } {
    let passCount = 0;
    let failCount = 0;
    let totalSpeedup = 0;

    for (const result of this.results.values()) {
      if (result.meetsTarget) passCount++;
      else failCount++;
      totalSpeedup += result.speedup;
    }

    return {
      totalWorkloads: this.results.size,
      passCount,
      failCount,
      avgSpeedup: totalSpeedup / this.results.size,
      allPass: failCount === 0
    };
  }
}

/**
 * Run Flash Attention benchmarks
 */
export async function runFlashAttentionBenchmarks(): Promise<Map<QEWorkloadType, BenchmarkResult>> {
  const benchmark = new FlashAttentionBenchmark();
  return await benchmark.runFullSuite();
}

/**
 * Run specific workload benchmark
 */
export async function benchmarkWorkload(
  workload: QEWorkloadType
): Promise<BenchmarkResult> {
  const benchmark = new FlashAttentionBenchmark();
  return await benchmark.benchmarkWorkload(workload);
}

/**
 * Main execution - run benchmarks from CLI
 */
async function main(): Promise<void> {
  console.log('[FlashAttention Benchmark] Starting benchmark suite...');
  console.log('[FlashAttention Benchmark] Arguments:', args.join(' '));

  const benchmark = new FlashAttentionBenchmark();

  // Run benchmarks
  if (runAll) {
    console.log('[FlashAttention Benchmark] Running all workloads...');
    await benchmark.runFullSuite();
  } else if (workloadArg) {
    console.log(`[FlashAttention Benchmark] Running workload: ${workloadArg}`);
    const result = await benchmark.benchmarkWorkload(workloadArg);
    benchmark.printBenchmarkResult(result);
  } else {
    console.log('[FlashAttention Benchmark] No workload specified, running full suite...');
    await benchmark.runFullSuite();
  }

  // Create benchmarks directory if needed
  const benchmarksDir = path.join(process.cwd(), 'benchmarks');
  try {
    await fs.mkdir(benchmarksDir, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  // Export results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

  if (exportJSON) {
    const jsonPath = path.join(benchmarksDir, `flash-attention-results-${timestamp}.json`);
    await benchmark.exportResultsToFile(jsonPath);
  }

  if (exportMarkdown) {
    const mdPath = path.join(benchmarksDir, `flash-attention-results-${timestamp}.md`);
    await benchmark.exportResultsMarkdown(mdPath);
  }

  console.log('[FlashAttention Benchmark] Complete!');
}

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1].endsWith('benchmark.ts')) {
  main().catch(err => {
    console.error('[FlashAttention Benchmark] Error:', err);
    process.exit(1);
  });
}
