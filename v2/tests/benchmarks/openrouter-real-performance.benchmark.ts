/**
 * Real Performance Benchmark - OpenRouter with Devstral Models
 *
 * REAL measurements - no mocks, actual API calls
 * Per issue #142 roadmap and brutal-honesty-review requirements
 *
 * Run with: npx tsx tests/benchmarks/openrouter-real-performance.benchmark.ts
 *
 * Environment: Set OPENROUTER_API_KEY before running
 */

import {
  OpenRouterProvider,
  RECOMMENDED_MODELS,
} from '../../src/providers/OpenRouterProvider';
import {
  LLMBaselineTracker,
  LLMPerformanceMeasurement,
} from '../../src/providers/LLMBaselineTracker';

interface BenchmarkResult {
  name: string;
  model: string;
  samples: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latencyMin: number;
  latencyMax: number;
  latencyAvg: number;
  tokensPerSecond: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  errors: number;
}

interface BenchmarkMetrics {
  latencies: number[];
  tokenRates: number[];
  inputTokens: number;
  outputTokens: number;
  errors: number;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Measure single completion latency
 */
async function measureCompletion(
  provider: OpenRouterProvider,
  prompt: string
): Promise<{ latency: number; inputTokens: number; outputTokens: number }> {
  const start = performance.now();
  const response = await provider.complete({
    model: provider.getCurrentModel(),
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 100,
    temperature: 0.1,
  });
  const latency = performance.now() - start;

  return {
    latency,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Run benchmark for a specific model
 */
async function runBenchmark(
  provider: OpenRouterProvider,
  modelId: string,
  samples: number = 5
): Promise<BenchmarkResult> {
  console.log(`\n📊 Benchmarking ${modelId} (${samples} samples)...`);

  // Switch to the model
  await provider.setModel(modelId);

  const metrics: BenchmarkMetrics = {
    latencies: [],
    tokenRates: [],
    inputTokens: 0,
    outputTokens: 0,
    errors: 0,
  };

  // Test prompts of varying complexity
  const prompts = [
    'What is 2 + 2? Answer with just the number.',
    'Write a one-line JavaScript function that adds two numbers.',
    'Explain what a unit test is in one sentence.',
    'What is the time complexity of binary search?',
    'Name three testing frameworks for JavaScript.',
  ];

  for (let i = 0; i < samples; i++) {
    const prompt = prompts[i % prompts.length];

    try {
      const result = await measureCompletion(provider, prompt);

      metrics.latencies.push(result.latency);
      metrics.inputTokens += result.inputTokens;
      metrics.outputTokens += result.outputTokens;

      // Calculate tokens per second
      const totalTokens = result.inputTokens + result.outputTokens;
      const tokenRate = (totalTokens / result.latency) * 1000;
      metrics.tokenRates.push(tokenRate);

      console.log(
        `  Sample ${i + 1}/${samples}: ${result.latency.toFixed(0)}ms, ` +
          `${result.outputTokens} tokens, ${tokenRate.toFixed(1)} tok/s`
      );

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      metrics.errors++;
      console.error(`  Sample ${i + 1} FAILED: ${(error as Error).message}`);
    }
  }

  // Calculate statistics
  const latencies = metrics.latencies;
  const avgLatency =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
  const avgTokenRate =
    metrics.tokenRates.length > 0
      ? metrics.tokenRates.reduce((a, b) => a + b, 0) / metrics.tokenRates.length
      : 0;

  return {
    name: `OpenRouter ${modelId}`,
    model: modelId,
    samples,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    latencyMin: Math.min(...latencies, Infinity),
    latencyMax: Math.max(...latencies, 0),
    latencyAvg: avgLatency,
    tokensPerSecond: avgTokenRate,
    totalInputTokens: metrics.inputTokens,
    totalOutputTokens: metrics.outputTokens,
    totalCost: provider.getTotalCost(),
    errors: metrics.errors,
  };
}

/**
 * Run batch completion benchmark
 */
async function runBatchBenchmark(
  provider: OpenRouterProvider,
  modelId: string,
  batchSize: number = 3
): Promise<{ sequential: number; parallel: number; speedup: number }> {
  console.log(`\n📦 Batch Benchmark: ${modelId} (${batchSize} prompts)...`);

  await provider.setModel(modelId);

  const prompts = Array(batchSize)
    .fill(0)
    .map((_, i) => `What is ${i + 1} + ${i + 1}? Answer with just the number.`);

  // Sequential execution
  console.log('  Sequential execution...');
  const seqStart = performance.now();
  for (const prompt of prompts) {
    await provider.complete({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 10,
    });
  }
  const sequential = performance.now() - seqStart;
  console.log(`  Sequential: ${sequential.toFixed(0)}ms`);

  // Parallel execution
  console.log('  Parallel execution...');
  const parStart = performance.now();
  await Promise.all(
    prompts.map((prompt) =>
      provider.complete({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 10,
      })
    )
  );
  const parallel = performance.now() - parStart;
  console.log(`  Parallel: ${parallel.toFixed(0)}ms`);

  const speedup = sequential / parallel;
  console.log(`  Speedup: ${speedup.toFixed(2)}x`);

  return { sequential, parallel, speedup };
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  OpenRouter Real Performance Benchmark');
  console.log('  Models aligned with issue #142 LLM Independence roadmap');
  console.log('═══════════════════════════════════════════════════════════════');

  // Check for API key
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('\n❌ ERROR: OPENROUTER_API_KEY not set');
    console.log('Set it with: export OPENROUTER_API_KEY=your-key-here');
    process.exit(1);
  }

  // Initialize provider
  const provider = new OpenRouterProvider({
    debug: false,
    enableModelDiscovery: true,
  });

  try {
    await provider.initialize();
    console.log('\n✅ OpenRouter provider initialized');

    // Models to benchmark (from issue #142 roadmap)
    // Only FREE model for default runs to avoid costs
    const modelsToTest = [
      RECOMMENDED_MODELS.AGENTIC_CODING_FREE,  // Devstral 2 2512 FREE (123B)
    ];

    // Add paid models only if explicitly requested
    if (process.argv.includes('--include-paid')) {
      modelsToTest.push(
        RECOMMENDED_MODELS.CHEAPEST_PAID,      // Devstral Small 2505 ($0.06/$0.12)
      );
    }

    const results: BenchmarkResult[] = [];
    const batchResults: Array<{
      model: string;
      sequential: number;
      parallel: number;
      speedup: number;
    }> = [];

    // Run latency benchmarks
    for (const model of modelsToTest) {
      try {
        const result = await runBenchmark(provider, model, 5);
        results.push(result);
      } catch (error) {
        console.error(`\n❌ Benchmark failed for ${model}: ${(error as Error).message}`);
      }
    }

    // Run batch benchmark on first model
    if (modelsToTest.length > 0) {
      try {
        const batchResult = await runBatchBenchmark(provider, modelsToTest[0], 3);
        batchResults.push({ model: modelsToTest[0], ...batchResult });
      } catch (error) {
        console.error(`\n❌ Batch benchmark failed: ${(error as Error).message}`);
      }
    }

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  BENCHMARK RESULTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('📈 Latency Results:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(
      'Model'.padEnd(45) +
        'P50'.padStart(8) +
        'P95'.padStart(8) +
        'Avg'.padStart(8) +
        'Tok/s'.padStart(8)
    );
    console.log('─────────────────────────────────────────────────────────────');

    for (const result of results) {
      console.log(
        result.model.padEnd(45) +
          `${result.latencyP50.toFixed(0)}ms`.padStart(8) +
          `${result.latencyP95.toFixed(0)}ms`.padStart(8) +
          `${result.latencyAvg.toFixed(0)}ms`.padStart(8) +
          `${result.tokensPerSecond.toFixed(1)}`.padStart(8)
      );
    }

    if (batchResults.length > 0) {
      console.log('\n📦 Batch Results:');
      console.log('─────────────────────────────────────────────────────────────');
      for (const br of batchResults) {
        console.log(
          `  ${br.model}:\n` +
            `    Sequential: ${br.sequential.toFixed(0)}ms\n` +
            `    Parallel:   ${br.parallel.toFixed(0)}ms\n` +
            `    Speedup:    ${br.speedup.toFixed(2)}x`
        );
      }
    }

    console.log('\n💰 Cost Summary:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`  Total cost: $${provider.getTotalCost().toFixed(6)}`);
    console.log(`  Total requests: ${provider.getRequestCount()}`);

    // =========================================
    // Store results in baseline tracker
    // =========================================
    console.log('\n📊 Storing results in baseline tracker...');

    const tracker = new LLMBaselineTracker({ debug: false });
    await tracker.initialize();

    const storedMeasurements: LLMPerformanceMeasurement[] = [];

    for (const result of results) {
      const measurement = tracker.recordMeasurement({
        provider: 'openrouter',
        model: result.model,
        operation: 'completion',
        metrics: {
          latencyP50: result.latencyP50,
          latencyP95: result.latencyP95,
          latencyP99: result.latencyP99,
          tokensPerSecond: result.tokensPerSecond,
          inputTokens: result.totalInputTokens,
          outputTokens: result.totalOutputTokens,
          cost: result.totalCost,
          errorRate: result.errors / result.samples,
        },
        sampleSize: result.samples,
        timestamp: new Date(),
        environment: {
          node: process.version,
          platform: process.platform,
        },
      });

      storedMeasurements.push(measurement);

      // Compare to existing baseline
      const comparison = tracker.compareToBaseline(measurement);

      if (comparison.baseline) {
        console.log(`\n  📈 ${result.model} vs baseline:`);
        console.log(
          `    Latency change: ${comparison.improvement!.latencyP50Change.toFixed(1)}%` +
            (comparison.improvement!.latencyP50Change < 0 ? ' ✅' : ' ⚠️')
        );
        console.log(
          `    Throughput change: ${comparison.improvement!.throughputChange.toFixed(1)}%` +
            (comparison.improvement!.throughputChange > 0 ? ' ✅' : ' ⚠️')
        );
        console.log(`    Meets 10% improvement target: ${comparison.meetsTarget ? '✅ YES' : '❌ NO'}`);
      } else {
        console.log(`\n  📊 ${result.model}: No baseline set yet`);
        console.log('    Run with --set-baseline to establish baseline');
      }
    }

    // Store batch results if available
    for (const br of batchResults) {
      tracker.recordMeasurement({
        provider: 'openrouter',
        model: br.model,
        operation: 'batch',
        metrics: {
          latencyP50: br.parallel,
          latencyP95: br.parallel * 1.1,
          latencyP99: br.parallel * 1.2,
          tokensPerSecond: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          errorRate: 0,
        },
        sampleSize: 3,
        timestamp: new Date(),
        environment: {
          node: process.version,
          platform: process.platform,
        },
      });
    }

    // Set baselines if requested
    if (process.argv.includes('--set-baseline')) {
      console.log('\n🎯 Setting new baselines...');
      for (const m of storedMeasurements) {
        tracker.setBaseline(m.provider, m.model, m.operation, m.id!);
        console.log(`  ✅ Baseline set for ${m.model}`);
      }
    }

    // Get summary stats
    console.log('\n📊 Historical Summary:');
    for (const result of results) {
      const summary = tracker.getSummary('openrouter', result.model);
      if (summary.totalMeasurements > 1) {
        console.log(`  ${result.model}:`);
        console.log(`    Total measurements: ${summary.totalMeasurements}`);
        console.log(`    Avg latency P50: ${summary.avgLatencyP50.toFixed(0)}ms`);
        console.log(`    Avg throughput: ${summary.avgThroughput.toFixed(1)} tok/s`);
        console.log(`    Total cost: $${summary.totalCost.toFixed(6)}`);
      }
    }

    tracker.close();

    // Write results to JSON for tracking over time
    const timestamp = new Date().toISOString();
    const benchmarkData = {
      timestamp,
      environment: {
        node: process.version,
        platform: process.platform,
      },
      results,
      batchResults,
      summary: {
        totalCost: provider.getTotalCost(),
        totalRequests: provider.getRequestCount(),
      },
    };

    console.log('\n📊 Benchmark data (JSON):');
    console.log(JSON.stringify(benchmarkData, null, 2));

    await provider.shutdown();
    console.log('\n✅ Benchmark complete');
    console.log('\nUsage:');
    console.log('  Run again to compare against baseline');
    console.log('  Add --set-baseline to establish new baseline');
  } catch (error) {
    console.error('\n❌ Benchmark error:', error);
    await provider.shutdown();
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);
