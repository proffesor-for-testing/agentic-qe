/**
 * Baseline Collector
 *
 * Collects and saves baseline performance metrics for a specific version.
 * Run this script after each major release to establish new performance baselines.
 *
 * Usage:
 *   npm run benchmark:collect -- --version=v2.4.0
 *   npm run benchmark:collect -- --version=v2.3.5 --output=custom-baseline.json
 */

import { BenchmarkSuite, BaselineData } from './suite';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface CollectorOptions {
  version: string;
  outputPath?: string;
  runs?: number;
  description?: string;
}

/**
 * Collect baseline metrics by running benchmarks multiple times
 */
export async function collectBaseline(options: CollectorOptions): Promise<BaselineData> {
  const {
    version,
    runs = 3,
    description = `Baseline metrics for ${version}`,
  } = options;

  console.log(`\n🎯 Collecting baseline for ${version}`);
  console.log(`   Runs: ${runs}`);
  console.log(`   Description: ${description}\n`);

  // Run benchmarks multiple times to get stable results
  const allResults: any[] = [];

  for (let i = 0; i < runs; i++) {
    console.log(`\n📊 Run ${i + 1}/${runs}\n`);

    const suite = new BenchmarkSuite();
    suite.registerBenchmarks();
    const results = await suite.run();

    allResults.push(results);

    // Wait between runs to avoid thermal throttling
    if (i < runs - 1) {
      console.log('\n⏳ Waiting 5 seconds before next run...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Aggregate results across all runs
  const aggregatedBenchmarks: Record<string, any> = {};

  // Get all benchmark names from first run
  const benchmarkNames = allResults[0].map((r: any) => r.name);

  for (const benchmarkName of benchmarkNames) {
    // Collect all runs for this benchmark
    const benchmarkRuns = allResults.map(runResults =>
      runResults.find((r: any) => r.name === benchmarkName)
    );

    // Aggregate statistics
    const means = benchmarkRuns.map(r => r.mean);
    const medians = benchmarkRuns.map(r => r.median);
    const p95s = benchmarkRuns.map(r => r.p95);
    const p99s = benchmarkRuns.map(r => r.p99);
    const stdDevs = benchmarkRuns.map(r => r.stdDev);
    const mins = benchmarkRuns.map(r => r.min);
    const maxs = benchmarkRuns.map(r => r.max);
    const samples = benchmarkRuns.map(r => r.samples);

    aggregatedBenchmarks[benchmarkName] = {
      name: benchmarkName,
      mean: average(means),
      median: average(medians),
      p95: average(p95s),
      p99: average(p99s),
      stdDev: average(stdDevs),
      min: Math.min(...mins),
      max: Math.max(...maxs),
      samples: Math.round(average(samples)),
      unit: 'ms',
    };

    console.log(`\n✓ ${benchmarkName}:`);
    console.log(`  Mean: ${aggregatedBenchmarks[benchmarkName].mean.toFixed(2)}ms (±${aggregatedBenchmarks[benchmarkName].stdDev.toFixed(2)}ms)`);
    console.log(`  Range: ${aggregatedBenchmarks[benchmarkName].min.toFixed(2)}ms - ${aggregatedBenchmarks[benchmarkName].max.toFixed(2)}ms`);
  }

  // Create baseline data structure
  const baseline: BaselineData = {
    version,
    date: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || await getGitCommit() || 'local',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
    },
    benchmarks: aggregatedBenchmarks,
  };

  // Add metadata
  (baseline as any).metadata = {
    description,
    source: 'Baseline collector',
    runs,
    collectedAt: new Date().toISOString(),
  };

  return baseline;
}

/**
 * Save baseline to file
 */
export async function saveBaseline(baseline: BaselineData, outputPath?: string): Promise<string> {
  const finalPath = outputPath || path.join(
    __dirname,
    'baselines',
    `${baseline.version}.json`
  );

  // Ensure directory exists
  await fs.mkdir(path.dirname(finalPath), { recursive: true });

  // Save baseline
  await fs.writeFile(finalPath, JSON.stringify(baseline, null, 2));

  console.log(`\n✅ Baseline saved to: ${finalPath}`);
  return finalPath;
}

/**
 * Calculate average of numbers
 */
function average(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

/**
 * Get current git commit hash
 */
async function getGitCommit(): Promise<string | null> {
  try {
    const { execSync } = await import('child_process');
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' });
    return commit.trim();
  } catch (error) {
    return null;
  }
}

/**
 * CLI entry point
 */
export async function runBaselineCollectorCLI(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const versionArg = args.find(a => a.startsWith('--version='));
  const outputArg = args.find(a => a.startsWith('--output='));
  const runsArg = args.find(a => a.startsWith('--runs='));
  const descriptionArg = args.find(a => a.startsWith('--description='));

  if (!versionArg) {
    console.error('❌ Error: --version is required');
    console.error('\nUsage:');
    console.error('  npm run benchmark:collect -- --version=v2.4.0');
    console.error('  npm run benchmark:collect -- --version=v2.3.5 --runs=5');
    console.error('  npm run benchmark:collect -- --version=v2.4.0 --output=custom.json');
    process.exit(1);
  }

  const version = versionArg.split('=')[1];
  const outputPath = outputArg?.split('=')[1];
  const runs = runsArg ? parseInt(runsArg.split('=')[1], 10) : 3;
  const description = descriptionArg?.split('=')[1];

  // Collect baseline
  const baseline = await collectBaseline({
    version,
    outputPath,
    runs,
    description,
  });

  // Save baseline
  await saveBaseline(baseline, outputPath);

  console.log('\n✅ Baseline collection complete!');
  console.log('\nNext steps:');
  console.log(`  1. Review baseline file: ${outputPath || `benchmarks/baselines/${version}.json`}`);
  console.log(`  2. Commit to repository: git add benchmarks/baselines/${version}.json`);
  console.log(`  3. Update benchmark-strategy.md with new baseline targets`);
}

// Run if executed directly
if (require.main === module) {
  runBaselineCollectorCLI().catch(error => {
    console.error('❌ Baseline collection failed:', error);
    process.exit(1);
  });
}
