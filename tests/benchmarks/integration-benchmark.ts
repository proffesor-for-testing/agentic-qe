#!/usr/bin/env npx tsx
/**
 * Integration Test Benchmark
 *
 * Tests MinCut on integration tests which are more likely to have
 * shared fixtures and interdependencies.
 */

import * as path from 'path';
import { glob } from 'fast-glob';
import {
  MinCutPartitioner,
  TestDependencyAnalyzer,
  RealTestExecutor,
  aggregateBatchResults,
  TestFile,
} from '../../src/test/partition/index.js';

const CONFIG = {
  workerCount: 4,
  maxTests: 16, // Limit for benchmark speed
  testPattern: 'tests/integration/**/*.test.ts',
  excludePatterns: [
    '**/node_modules/**',
    '**/*.skip.test.ts',
    '**/phase2/**', // Skip slow phase2 tests
  ],
};

async function discoverTestFiles(): Promise<string[]> {
  console.log(`\n🔍 Discovering integration tests: ${CONFIG.testPattern}`);

  const files = await glob(CONFIG.testPattern, {
    cwd: process.cwd(),
    ignore: CONFIG.excludePatterns,
    absolute: false,
  });

  console.log(`   Found ${files.length} integration test files`);

  const limitedFiles = files.slice(0, CONFIG.maxTests);
  if (files.length > CONFIG.maxTests) {
    console.log(`   (Limited to ${CONFIG.maxTests} for benchmark)`);
  }

  return limitedFiles;
}

async function analyzeRealDependencies(testFiles: string[]): Promise<TestFile[]> {
  console.log(`\n📊 Analyzing REAL dependencies using ts-morph...`);

  const analyzer = new TestDependencyAnalyzer('tests');
  const analysis = await analyzer.analyzeTestDependencies(testFiles);

  console.log(`   Analysis time: ${analysis.analysisTimeMs.toFixed(2)}ms`);
  console.log(`   Shared fixtures found: ${analysis.sharedFixtures.length}`);
  if (analysis.sharedFixtures.length > 0) {
    console.log(`   Fixtures: ${analysis.sharedFixtures.slice(0, 5).map(f => path.basename(f)).join(', ')}`);
  }

  const totalDeps = Array.from(analysis.dependencies.values())
    .reduce((sum, deps) => sum + deps.length, 0);
  console.log(`   Total dependencies: ${totalDeps}`);

  // Show dependency details
  for (const [testPath, deps] of analysis.dependencies) {
    if (deps.length > 0) {
      console.log(`   ${path.basename(testPath)} → ${deps.map(d => path.basename(d)).join(', ')}`);
    }
  }

  return analyzer.toTestFiles(testFiles, analysis);
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
  return Math.floor(count / 2);
}

async function runBenchmark() {
  console.log('═'.repeat(60));
  console.log('  Integration Test Benchmark');
  console.log('  Testing MinCut on tests with shared fixtures');
  console.log('═'.repeat(60));

  const testFiles = await discoverTestFiles();
  if (testFiles.length === 0) {
    console.error('❌ No integration test files found!');
    process.exit(1);
  }

  const testsWithDeps = await analyzeRealDependencies(testFiles);

  // Check if we have any dependencies
  const totalDeps = testsWithDeps.reduce((sum, t) => sum + t.dependencies.length, 0);
  console.log(`\n📋 Dependency summary: ${totalDeps} total dependencies across ${testsWithDeps.length} tests`);

  // Partition with MinCut
  console.log(`\n🔀 Partitioning ${testsWithDeps.length} tests into ${CONFIG.workerCount} workers...`);

  const partitioner = new MinCutPartitioner({ partitionCount: CONFIG.workerCount });
  const mincutStart = performance.now();
  const mincutResult = await partitioner.partition(testsWithDeps);
  const mincutPartitionTime = performance.now() - mincutStart;

  console.log(`   MinCut algorithm: ${mincutResult.algorithm}`);
  console.log(`   Partition time: ${mincutPartitionTime.toFixed(2)}ms`);
  console.log(`   Cross-partition deps (MinCut): ${mincutResult.totalCrossPartitionDeps}`);

  // Round-robin for comparison
  const rrPartitions = roundRobinPartition(testsWithDeps, CONFIG.workerCount);
  const rrCrossPartitionDeps = countCrossPartitionDeps(rrPartitions);
  console.log(`   Cross-partition deps (Round-Robin): ${rrCrossPartitionDeps}`);

  // Show partition distribution
  console.log('\n📦 MinCut Partition Distribution:');
  for (let i = 0; i < mincutResult.partitions.length; i++) {
    const p = mincutResult.partitions[i];
    console.log(`   Worker ${i}: ${p.tests.length} tests (${p.estimatedDuration.toFixed(0)}ms est)`);
    p.tests.forEach(t => console.log(`      - ${path.basename(t.path)}`));
  }

  console.log('\n📦 Round-Robin Partition Distribution:');
  for (let i = 0; i < rrPartitions.length; i++) {
    const p = rrPartitions[i];
    const duration = p.reduce((sum, t) => sum + t.estimatedDuration, 0);
    console.log(`   Worker ${i}: ${p.length} tests (${duration.toFixed(0)}ms est)`);
    p.forEach(t => console.log(`      - ${path.basename(t.path)}`));
  }

  // Execute REAL tests
  console.log('\n⏱️  Executing REAL integration tests...\n');

  const executor = new RealTestExecutor({
    timeout: 60000, // Integration tests may be slower
    collectCoverage: false,
  });

  // MinCut execution
  console.log('--- MinCut Execution ---');
  const mincutBatches = mincutResult.partitions.map(p => p.tests.map(t => t.path));
  const mincutExecStart = performance.now();
  const mincutBatchResults = await executor.executeParallel(mincutBatches, (worker, result) => {
    const status = result.passed ? '✅' : '❌';
    console.log(`   [W${worker}] ${status} ${path.basename(result.testFile)} (${result.duration.toFixed(0)}ms)`);
  });
  const mincutExecTime = performance.now() - mincutExecStart;
  const mincutAgg = aggregateBatchResults(mincutBatchResults);

  // Round-robin execution
  console.log('\n--- Round-Robin Execution ---');
  const rrBatches = rrPartitions.map(p => p.map(t => t.path));
  const rrExecStart = performance.now();
  const rrBatchResults = await executor.executeParallel(rrBatches, (worker, result) => {
    const status = result.passed ? '✅' : '❌';
    console.log(`   [W${worker}] ${status} ${path.basename(result.testFile)} (${result.duration.toFixed(0)}ms)`);
  });
  const rrExecTime = performance.now() - rrExecStart;
  const rrAgg = aggregateBatchResults(rrBatchResults);

  // Results
  console.log('\n' + '═'.repeat(60));
  console.log('  RESULTS: Integration Test Comparison');
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

  const wallClockImprovement = rrExecTime > 0 ? ((rrExecTime - mincutExecTime) / rrExecTime * 100) : 0;
  const crossDepReduction = rrCrossPartitionDeps > 0
    ? ((rrCrossPartitionDeps - mincutResult.totalCrossPartitionDeps) / rrCrossPartitionDeps * 100)
    : 0;

  console.log('\n📈 IMPROVEMENT SUMMARY:');
  console.log(`   Cross-partition dependencies: ${crossDepReduction.toFixed(1)}% reduction`);
  console.log(`   Wall-clock time: ${wallClockImprovement.toFixed(1)}% ${wallClockImprovement > 0 ? 'faster' : 'slower'}`);

  if (totalDeps === 0) {
    console.log('\n⚠️  No test-to-test dependencies found.');
    console.log('   Integration tests in this project are also well-isolated.');
    console.log('   MinCut provides no benefit without inter-test dependencies.');
  } else if (wallClockImprovement >= 10) {
    console.log('\n✅ MinCut provides MEASURABLE improvement!');
  } else if (wallClockImprovement > 0) {
    console.log('\n⚠️  MinCut provides slight improvement.');
  } else {
    console.log('\n❌ No wall-clock improvement detected.');
  }

  console.log('\n' + '═'.repeat(60));
}

runBenchmark().catch(console.error);
