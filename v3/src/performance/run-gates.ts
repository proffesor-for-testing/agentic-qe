#!/usr/bin/env npx tsx
/**
 * Agentic QE v3 - Performance Gate Runner
 *
 * CI script to run performance benchmarks and validate against targets.
 * Returns exit codes:
 * - 0: All gates passed
 * - 1: One or more gates failed
 * - 2: Warnings (gates passed but approaching limits)
 *
 * Usage:
 *   npm run performance:gate
 *   npx tsx src/performance/run-gates.ts
 *
 * Environment Variables:
 *   PERF_OUTPUT_FORMAT: 'text' | 'markdown' | 'json' (default: 'markdown')
 *   PERF_ITERATIONS: Number of benchmark iterations (default: 1000)
 *   PERF_WARMUP: Number of warmup iterations (default: 100)
 *
 * @module performance/run-gates
 */

import { createBenchmarkSuite } from './benchmarks.js';
import { CIPerformanceGates } from './ci-gates.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  outputFormat: (process.env.PERF_OUTPUT_FORMAT || 'markdown') as 'text' | 'markdown' | 'json',
  iterations: parseInt(process.env.PERF_ITERATIONS || '1000', 10),
  warmupIterations: parseInt(process.env.PERF_WARMUP || '100', 10),
  timeout: parseInt(process.env.PERF_TIMEOUT || '30000', 10),
};

// ============================================================================
// Main Function
// ============================================================================

async function main(): Promise<void> {
  console.error('='.repeat(60));
  console.error('AGENTIC QE v3 - PERFORMANCE GATES');
  console.error('='.repeat(60));
  console.error('');

  console.error(`Configuration:`);
  console.error(`  - Iterations: ${CONFIG.iterations}`);
  console.error(`  - Warmup: ${CONFIG.warmupIterations}`);
  console.error(`  - Output: ${CONFIG.outputFormat}`);
  console.error(`  - Timeout: ${CONFIG.timeout}ms`);
  console.error('');

  // Create benchmark suite
  console.error('Running benchmarks...');
  const suite = createBenchmarkSuite({
    iterations: CONFIG.iterations,
    warmupIterations: CONFIG.warmupIterations,
    timeout: CONFIG.timeout,
    forceGC: true,
    trackMemory: true,
  });

  try {
    // Run all benchmarks
    const startTime = Date.now();
    const results = await suite.runAll();
    const duration = Date.now() - startTime;

    console.error(`\nBenchmarks completed in ${duration}ms`);
    console.error('');

    // Create CI gates and generate report
    const gates = new CIPerformanceGates();
    const report = gates.generateReport(results);

    // Output report in requested format
    let output: string;
    switch (CONFIG.outputFormat) {
      case 'json':
        output = gates.formatReportJSON(report);
        break;
      case 'text':
        output = gates.formatReportText(report);
        break;
      case 'markdown':
      default:
        output = gates.formatReportMarkdown(report);
        break;
    }

    // Write to stdout (so it can be captured/redirected)
    console.log(output);

    // Write summary to stderr for CI logs
    console.error('');
    console.error('='.repeat(60));
    console.error('SUMMARY');
    console.error('='.repeat(60));
    console.error(report.summary);
    console.error('');

    // Exit with appropriate code
    if (report.exitCode === 0) {
      console.error('✅ All performance gates PASSED');
    } else if (report.exitCode === 2) {
      console.error('⚠️ Performance gates passed with WARNINGS');
    } else {
      console.error('❌ Performance gates FAILED');
    }

    console.error(`Exit code: ${report.exitCode}`);
    process.exit(report.exitCode);
  } catch (error) {
    console.error('');
    console.error('❌ FATAL ERROR running benchmarks:');
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    suite.destroy();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
