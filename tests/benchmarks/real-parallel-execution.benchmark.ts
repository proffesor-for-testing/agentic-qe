#!/usr/bin/env npx tsx
/**
 * REAL Parallel Execution Benchmark
 *
 * This benchmark runs ACTUAL tests using the project's real test suite.
 * It compares MinCut-based partitioning vs round-robin with real wall-clock measurements.
 *
 * Usage:
 *   npx tsx tests/benchmarks/real-parallel-execution.benchmark.ts
 *
 * What this measures:
 * - Real test file dependency analysis (using ts-morph)
 * - Real test execution time (using child_process + Jest)
 * - Real speedup from MinCut partitioning
 */

import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'fast-glob';
import {
  MinCutPartitioner,
  TestDependencyAnalyzer,
  RealTestExecutor,
  aggregateBatchResults,
  TestFile,
} from '../../src/test/partition/index.js';

interface BenchmarkConfig {
  /** Number of workers/partitions */
  workerCount: number;
  /** Maximum tests to run (for quick benchmarks) */
  maxTests: number;
  /** Test file pattern */
  testPattern: string;
  /** Excluded patterns */
  excludePatterns: string[];
}

const CONFIG: BenchmarkConfig = {
  workerCount: 4,
  maxTests: 20, // Limit for benchmark speed
  testPattern: 'tests/unit/**/*.test.ts',
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.skip.test.ts',
    '**/benchmarks/**',
    '**/integration/**', // Skip integration tests for speed
  ],
};

async function discoverTestFiles(): Promise<string[]> {
  console.log(`\n🔍 Discovering test files matching: ${CONFIG.testPattern}`);

  const files = await glob(CONFIG.testPattern, {
    cwd: process.cwd(),
    ignore: CONFIG.excludePatterns,
    absolute: false,
  });

  console.log(`   Found ${files.length} test files`);

  // Limit for benchmark speed
  const limitedFiles = files.slice(0, CONFIG.maxTests);
  if (files.length > CONFIG.maxTests) {
    console.log(`   (Limited to ${CONFIG.maxTests} for benchmark)`);
  }

  return limitedFiles;
}

async function analyzeRealDependencies(testFiles: string[]): Promise<TestFile[]> {
  console.log(`\n📊 Analyzing REAL dependencies using ts-morph...`);

  const analyzer = new TestDependencyAnalyzer('tests');
  const startTime = performance.now();

  const analysis = await analyzer.analyzeTestDependencies(testFiles);

  console.log(`   Analysis time: ${analysis.analysisTimeMs.toFixed(2)}ms`);
  console.log(`   Shared fixtures found: ${analysis.sharedFixtures.length}`);

  const totalDeps = Array.from(analysis.dependencies.values())
    .reduce((sum, deps) => sum + deps.length, 0);
  console.log(`   Total dependencies: ${totalDeps}`);

  // Convert to TestFile format
  const testFilesWithDeps = analyzer.toTestFiles(testFiles, analysis);

  return testFilesWithDeps;
}

function roundRobinPartition(tests: TestFile[], k: number): TestFile[][] {
  const partitions: TestFile[][] = Array.from({ length: k }, () => []);
  tests.forEach((test, i) => {
    partitions[i % k].push(test);
  });
  return partitions;
}

function countCrossPartitionDeps(partitions: TestFile[][]): number {
  let count = 0;
  const allPaths = new Set(partitions.flat().map(t => t.path));

  for (const partition of partitions) {
    const partitionPaths = new Set(partition.map(t => t.path));

    for (const test of partition) {
      for (const dep of [...test.dependencies, ...test.dependents]) {
        if (!partitionPaths.has(dep) && allPaths.has(dep)) {
          count++;
        }
      }
    }
  }

  return Math.floor(count / 2); // Avoid double-counting
}

async function runBenchmark() {
  console.log('═'.repeat(60));
  console.log('  REAL Parallel Execution Benchmark');
  console.log('  Using ACTUAL test files and REAL execution');
  console.log('═'.repeat(60));

  // 1. Discover test files
  const testFiles = await discoverTestFiles();
  if (testFiles.length === 0) {
    console.error('❌ No test files found!');
    process.exit(1);
  }

  // 2. Analyze REAL dependencies
  const testsWithDeps = await analyzeRealDependencies(testFiles);

  // Show some dependency examples
  console.log('\n📋 Sample dependencies (first 3 files):');
  for (const test of testsWithDeps.slice(0, 3)) {
    console.log(`   ${path.basename(test.path)}: ${test.dependencies.length} deps, est. ${test.estimatedDuration.toFixed(0)}ms`);
    if (test.dependencies.length > 0) {
      console.log(`      → ${test.dependencies.slice(0, 2).map(d => path.basename(d)).join(', ')}${test.dependencies.length > 2 ? '...' : ''}`);
    }
  }

  // 3. Partition with MinCut
  console.log(`\n🔀 Partitioning ${testsWithDeps.length} tests into ${CONFIG.workerCount} workers...`);

  const partitioner = new MinCutPartitioner({ partitionCount: CONFIG.workerCount });

  const mincutStart = performance.now();
  const mincutResult = await partitioner.partition(testsWithDeps);
  const mincutPartitionTime = performance.now() - mincutStart;

  console.log(`   MinCut algorithm: ${mincutResult.algorithm}`);
  console.log(`   Partition time: ${mincutPartitionTime.toFixed(2)}ms`);
  console.log(`   Cross-partition deps: ${mincutResult.totalCrossPartitionDeps}`);

  // 4. Partition with round-robin for comparison
  const rrPartitions = roundRobinPartition(testsWithDeps, CONFIG.workerCount);
  const rrCrossPartitionDeps = countCrossPartitionDeps(rrPartitions);
  console.log(`   Round-robin cross-deps: ${rrCrossPartitionDeps}`);

  // 5. Execute REAL tests with both strategies
  console.log('\n⏱️  Executing REAL tests (this will take a while)...\n');

  const executor = new RealTestExecutor({
    timeout: 30000,
    collectCoverage: false,
  });

  // Run MinCut partitioned tests
  console.log('--- MinCut Partitioning ---');
  const mincutBatches = mincutResult.partitions.map(p => p.tests.map(t => t.path));
  for (let i = 0; i < mincutBatches.length; i++) {
    console.log(`   Worker ${i}: ${mincutBatches[i].length} tests`);
  }

  const mincutExecStart = performance.now();
  const mincutBatchResults = await executor.executeParallel(mincutBatches, (worker, result) => {
    const status = result.passed ? '✅' : '❌';
    console.log(`   [W${worker}] ${status} ${path.basename(result.testFile)} (${result.duration.toFixed(0)}ms)`);
  });
  const mincutExecTime = performance.now() - mincutExecStart;
  const mincutAgg = aggregateBatchResults(mincutBatchResults);

  // Run round-robin partitioned tests
  console.log('\n--- Round-Robin Partitioning ---');
  const rrBatches = rrPartitions.map(p => p.map(t => t.path));
  for (let i = 0; i < rrBatches.length; i++) {
    console.log(`   Worker ${i}: ${rrBatches[i].length} tests`);
  }

  const rrExecStart = performance.now();
  const rrBatchResults = await executor.executeParallel(rrBatches, (worker, result) => {
    const status = result.passed ? '✅' : '❌';
    console.log(`   [W${worker}] ${status} ${path.basename(result.testFile)} (${result.duration.toFixed(0)}ms)`);
  });
  const rrExecTime = performance.now() - rrExecStart;
  const rrAgg = aggregateBatchResults(rrBatchResults);

  // 6. Print results
  console.log('\n' + '═'.repeat(60));
  console.log('  RESULTS: Real Wall-Clock Comparison');
  console.log('═'.repeat(60));

  console.log('\n┌─────────────────────┬──────────────┬──────────────┐');
  console.log('│ Metric              │   MinCut     │  Round-Robin │');
  console.log('├─────────────────────┼──────────────┼──────────────┤');
  console.log(`│ Tests executed      │ ${String(mincutAgg.total).padStart(12)} │ ${String(rrAgg.total).padStart(12)} │`);
  console.log(`│ Passed              │ ${String(mincutAgg.passed).padStart(12)} │ ${String(rrAgg.passed).padStart(12)} │`);
  console.log(`│ Failed              │ ${String(mincutAgg.failed).padStart(12)} │ ${String(rrAgg.failed).padStart(12)} │`);
  console.log(`│ Cross-partition deps│ ${String(mincutResult.totalCrossPartitionDeps).padStart(12)} │ ${String(rrCrossPartitionDeps).padStart(12)} │`);
  console.log('├─────────────────────┼──────────────┼──────────────┤');
  console.log(`│ Total test time     │ ${(mincutAgg.totalDuration / 1000).toFixed(2).padStart(10)}s │ ${(rrAgg.totalDuration / 1000).toFixed(2).padStart(10)}s │`);
  console.log(`│ Wall-clock time     │ ${(mincutExecTime / 1000).toFixed(2).padStart(10)}s │ ${(rrExecTime / 1000).toFixed(2).padStart(10)}s │`);
  console.log(`│ Max worker time     │ ${(mincutAgg.maxWorkerDuration / 1000).toFixed(2).padStart(10)}s │ ${(rrAgg.maxWorkerDuration / 1000).toFixed(2).padStart(10)}s │`);
  console.log(`│ Parallel speedup    │ ${mincutAgg.parallelSpeedup.toFixed(2).padStart(10)}x │ ${rrAgg.parallelSpeedup.toFixed(2).padStart(10)}x │`);
  console.log('└─────────────────────┴──────────────┴──────────────┘');

  // Calculate improvement
  const wallClockImprovement = rrExecTime > 0 ? ((rrExecTime - mincutExecTime) / rrExecTime * 100) : 0;
  const crossDepReduction = rrCrossPartitionDeps > 0
    ? ((rrCrossPartitionDeps - mincutResult.totalCrossPartitionDeps) / rrCrossPartitionDeps * 100)
    : 0;

  console.log('\n📈 IMPROVEMENT SUMMARY:');
  console.log(`   Cross-partition dependencies: ${crossDepReduction.toFixed(1)}% reduction`);
  console.log(`   Wall-clock time: ${wallClockImprovement.toFixed(1)}% ${wallClockImprovement > 0 ? 'faster' : 'slower'}`);
  console.log(`   MinCut speedup: ${mincutAgg.parallelSpeedup.toFixed(2)}x vs Round-Robin: ${rrAgg.parallelSpeedup.toFixed(2)}x`);

  if (wallClockImprovement >= 10) {
    console.log('\n✅ MinCut partitioning provides MEASURABLE improvement!');
  } else if (wallClockImprovement > 0) {
    console.log('\n⚠️  MinCut partitioning provides slight improvement.');
  } else {
    console.log('\n❌ No improvement detected (may need more tests with dependencies).');
  }

  console.log('\n' + '═'.repeat(60));
}

// Run benchmark
runBenchmark().catch(console.error);
