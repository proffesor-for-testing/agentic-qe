/**
 * RuvLLM Agent Performance Benchmark
 *
 * REAL measurements with actual @ruvector/ruvllm native module
 * Tests Phase 0 milestones M0.1-M0.4:
 * - M0.1: SessionManager (50% latency reduction claim)
 * - M0.2: Batch Query (4x throughput claim)
 * - M0.3: Embedding generation
 * - M0.4: Routing observability
 *
 * Run with: npx tsx tests/benchmarks/ruvllm-agent-performance.benchmark.ts
 */

import { EventEmitter } from 'events';
import { BaseAgent, BaseAgentConfig } from '../../src/agents/BaseAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentCapability, QETask, TaskAssignment } from '../../src/types';
import { loadRuvLLM, isRuvLLMAvailable } from '../../src/utils/ruvllm-loader';
import {
  LLMBaselineTracker,
  LLMPerformanceMeasurement,
} from '../../src/providers/LLMBaselineTracker';

interface BenchmarkResult {
  name: string;
  operation: string;
  samples: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latencyMin: number;
  latencyMax: number;
  latencyAvg: number;
  tokensPerSecond: number;
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
 * Test agent that exposes LLM operations for benchmarking
 */
class BenchmarkAgent extends BaseAgent {
  constructor(config: BaseAgentConfig) {
    super(config);
  }

  public async generateWithLLM(prompt: string): Promise<string> {
    if (!this.hasLLM()) {
      throw new Error('LLM not available');
    }
    return this.llmComplete(prompt);
  }

  public async embedWithLLM(text: string): Promise<number[]> {
    if (!this.hasLLM()) {
      throw new Error('LLM not available');
    }
    return this.llmEmbed(text);
  }

  public async chatWithLLM(input: string): Promise<string> {
    if (!this.hasLLM()) {
      throw new Error('LLM not available');
    }
    return this.llmChat(input);
  }

  public async batchGenerateWithLLM(prompts: string[]): Promise<string[]> {
    if (!this.hasLLM()) {
      throw new Error('LLM not available');
    }
    return this.llmBatchComplete(prompts);
  }

  public getRouting(input: string): any {
    return this.getLLMRoutingDecision(input);
  }

  protected async initializeComponents(): Promise<void> {}
  protected async performTask(task: QETask): Promise<any> {
    return { success: true };
  }
  protected async loadKnowledge(): Promise<void> {}
  protected async cleanup(): Promise<void> {}
}

/**
 * Run completion benchmark
 */
async function benchmarkCompletion(
  agent: BenchmarkAgent,
  samples: number
): Promise<BenchmarkResult> {
  console.log(`\n📊 Benchmarking RuvLLM Completion (${samples} samples)...`);

  const latencies: number[] = [];
  const tokenRates: number[] = [];
  let errors = 0;

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
      const start = performance.now();
      const response = await agent.generateWithLLM(prompt);
      const latency = performance.now() - start;

      latencies.push(latency);
      // Estimate tokens (rough approximation)
      const outputTokens = Math.ceil(response.length / 4);
      const tokenRate = (outputTokens / latency) * 1000;
      tokenRates.push(tokenRate);

      console.log(
        `  Sample ${i + 1}/${samples}: ${latency.toFixed(0)}ms, ` +
          `~${outputTokens} tokens, ${tokenRate.toFixed(1)} tok/s`
      );
    } catch (error) {
      errors++;
      console.error(`  Sample ${i + 1} FAILED: ${(error as Error).message}`);
    }
  }

  const avgLatency =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
  const avgTokenRate =
    tokenRates.length > 0
      ? tokenRates.reduce((a, b) => a + b, 0) / tokenRates.length
      : 0;

  return {
    name: 'RuvLLM Agent Completion',
    operation: 'completion',
    samples,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    latencyMin: Math.min(...latencies, Infinity),
    latencyMax: Math.max(...latencies, 0),
    latencyAvg: avgLatency,
    tokensPerSecond: avgTokenRate,
    errors,
  };
}

/**
 * Run session/chat benchmark (M0.1 - 50% latency reduction)
 */
async function benchmarkSession(
  agent: BenchmarkAgent,
  samples: number
): Promise<{ withSession: BenchmarkResult; baseline: BenchmarkResult; reduction: number }> {
  console.log(`\n🔄 Benchmarking Session Manager (${samples} samples)...`);
  console.log('  Testing M0.1 claim: 50% latency reduction for multi-turn...');

  // Baseline: independent completions
  console.log('\n  Phase 1: Baseline (independent completions)...');
  const baselineLatencies: number[] = [];
  const conversation = [
    'My name is TestAgent.',
    'What is my name?',
    'Remember that I like testing.',
    'What do I like?',
    'Thanks for the conversation.',
  ];

  for (let i = 0; i < Math.min(samples, conversation.length); i++) {
    try {
      const start = performance.now();
      await agent.generateWithLLM(conversation[i]);
      const latency = performance.now() - start;
      baselineLatencies.push(latency);
      console.log(`    Baseline ${i + 1}: ${latency.toFixed(0)}ms`);
    } catch (error) {
      console.error(`    Baseline ${i + 1} FAILED: ${(error as Error).message}`);
    }
  }

  // Session: multi-turn chat
  console.log('\n  Phase 2: Session-based (multi-turn chat)...');
  const sessionLatencies: number[] = [];

  for (let i = 0; i < Math.min(samples, conversation.length); i++) {
    try {
      const start = performance.now();
      await agent.chatWithLLM(conversation[i]);
      const latency = performance.now() - start;
      sessionLatencies.push(latency);
      console.log(`    Session ${i + 1}: ${latency.toFixed(0)}ms`);
    } catch (error) {
      console.error(`    Session ${i + 1} FAILED: ${(error as Error).message}`);
    }
  }

  const baselineAvg =
    baselineLatencies.length > 0
      ? baselineLatencies.reduce((a, b) => a + b, 0) / baselineLatencies.length
      : 0;
  const sessionAvg =
    sessionLatencies.length > 0
      ? sessionLatencies.reduce((a, b) => a + b, 0) / sessionLatencies.length
      : 0;

  const reduction = baselineAvg > 0 ? ((baselineAvg - sessionAvg) / baselineAvg) * 100 : 0;

  console.log(`\n  📈 Session Results:`);
  console.log(`    Baseline avg: ${baselineAvg.toFixed(0)}ms`);
  console.log(`    Session avg:  ${sessionAvg.toFixed(0)}ms`);
  console.log(`    Reduction:    ${reduction.toFixed(1)}%`);
  console.log(`    Meets 50% target: ${reduction >= 50 ? '✅ YES' : '❌ NO'}`);

  return {
    baseline: {
      name: 'RuvLLM Baseline',
      operation: 'baseline',
      samples: baselineLatencies.length,
      latencyP50: percentile(baselineLatencies, 50),
      latencyP95: percentile(baselineLatencies, 95),
      latencyP99: percentile(baselineLatencies, 99),
      latencyMin: Math.min(...baselineLatencies, Infinity),
      latencyMax: Math.max(...baselineLatencies, 0),
      latencyAvg: baselineAvg,
      tokensPerSecond: 0,
      errors: samples - baselineLatencies.length,
    },
    withSession: {
      name: 'RuvLLM Session',
      operation: 'session',
      samples: sessionLatencies.length,
      latencyP50: percentile(sessionLatencies, 50),
      latencyP95: percentile(sessionLatencies, 95),
      latencyP99: percentile(sessionLatencies, 99),
      latencyMin: Math.min(...sessionLatencies, Infinity),
      latencyMax: Math.max(...sessionLatencies, 0),
      latencyAvg: sessionAvg,
      tokensPerSecond: 0,
      errors: samples - sessionLatencies.length,
    },
    reduction,
  };
}

/**
 * Run batch benchmark (M0.2 - 4x throughput)
 */
async function benchmarkBatch(
  agent: BenchmarkAgent,
  batchSize: number
): Promise<{ sequential: number; parallel: number; speedup: number }> {
  console.log(`\n📦 Benchmarking Batch Query (${batchSize} prompts)...`);
  console.log('  Testing M0.2 claim: 4x throughput improvement...');

  const prompts = Array(batchSize)
    .fill(0)
    .map((_, i) => `What is ${i + 1} + ${i + 1}? Answer with just the number.`);

  // Sequential execution
  console.log('  Sequential execution...');
  const seqStart = performance.now();
  for (const prompt of prompts) {
    await agent.generateWithLLM(prompt);
  }
  const sequential = performance.now() - seqStart;
  console.log(`  Sequential: ${sequential.toFixed(0)}ms`);

  // Batch/Parallel execution
  console.log('  Batch execution...');
  const batchStart = performance.now();
  await agent.batchGenerateWithLLM(prompts);
  const parallel = performance.now() - batchStart;
  console.log(`  Batch: ${parallel.toFixed(0)}ms`);

  const speedup = sequential / parallel;
  console.log(`  Speedup: ${speedup.toFixed(2)}x`);
  console.log(`  Meets 4x target: ${speedup >= 4 ? '✅ YES' : '❌ NO'}`);

  return { sequential, parallel, speedup };
}

/**
 * Run embedding benchmark (M0.3)
 */
async function benchmarkEmbedding(
  agent: BenchmarkAgent,
  samples: number
): Promise<BenchmarkResult> {
  console.log(`\n🔢 Benchmarking Embedding Generation (${samples} samples)...`);

  const latencies: number[] = [];
  let errors = 0;
  let dimensions = 0;

  const texts = [
    'This is a test sentence for embedding.',
    'Unit testing improves code quality.',
    'Quality engineering is essential for software.',
    'Continuous integration catches bugs early.',
    'Test coverage measures code validation.',
  ];

  for (let i = 0; i < samples; i++) {
    const text = texts[i % texts.length];

    try {
      const start = performance.now();
      const embedding = await agent.embedWithLLM(text);
      const latency = performance.now() - start;

      latencies.push(latency);
      dimensions = embedding.length;

      console.log(`  Sample ${i + 1}/${samples}: ${latency.toFixed(0)}ms, ${dimensions} dims`);
    } catch (error) {
      errors++;
      console.error(`  Sample ${i + 1} FAILED: ${(error as Error).message}`);
    }
  }

  const avgLatency =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

  return {
    name: `RuvLLM Embedding (${dimensions}d)`,
    operation: 'embedding',
    samples,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    latencyMin: Math.min(...latencies, Infinity),
    latencyMax: Math.max(...latencies, 0),
    latencyAvg: avgLatency,
    tokensPerSecond: dimensions, // Store dimensions here
    errors,
  };
}

/**
 * Test routing observability (M0.4)
 */
async function testRouting(agent: BenchmarkAgent): Promise<any> {
  console.log(`\n🎯 Testing Routing Observability (M0.4)...`);

  const routing = agent.getRouting('Generate a unit test for a calculator function');

  if (routing) {
    console.log('  Routing decision available:');
    console.log(`    Model: ${routing.model}`);
    console.log(`    Confidence: ${routing.confidence}`);
    console.log(`    Memory hits: ${routing.memoryHits}`);
    console.log(`    Est. latency: ${routing.estimatedLatency}ms`);
    return routing;
  } else {
    console.log('  Routing not available (fallback mode)');
    return null;
  }
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RuvLLM Agent Performance Benchmark');
  console.log('  Testing Phase 0 Milestones M0.1-M0.4');
  console.log('═══════════════════════════════════════════════════════════════');

  // Check RuvLLM availability
  if (!isRuvLLMAvailable()) {
    console.error('\n❌ ERROR: @ruvector/ruvllm not available');
    console.log('Install with: npm install @ruvector/ruvllm');
    process.exit(1);
  }

  const ruvllm = loadRuvLLM()!;
  console.log(`\n✅ RuvLLM loaded`);
  console.log(`  Version: ${typeof ruvllm.version === 'function' ? ruvllm.version() : ruvllm.version}`);
  console.log(`  SIMD: ${typeof ruvllm.hasSimdSupport === 'function' ? ruvllm.hasSimdSupport() : ruvllm.hasSimdSupport}`);

  // Initialize agent with RuvLLM
  const eventBus = new EventEmitter();
  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();

  const capabilities: AgentCapability[] = [
    {
      name: 'benchmark-agent',
      description: 'RuvLLM benchmark testing',
      version: '1.0.0',
    },
  ];

  const config: BaseAgentConfig = {
    type: 'ruvllm-benchmark-agent',
    capabilities,
    context: {
      environment: 'benchmark',
      project: { name: 'ruvllm-benchmark', version: '1.0.0' },
    },
    memoryStore,
    eventBus,
    llm: {
      enabled: true,
      preferredProvider: 'ruvllm',
      enableSessions: true,
      enableBatch: true,
    },
    enableLearning: true,
  };

  const agent = new BenchmarkAgent(config);

  try {
    console.log('\n⏳ Initializing benchmark agent...');
    await agent.initialize();

    if (!agent.hasLLM()) {
      console.error('\n❌ Agent LLM not available after initialization');
      process.exit(1);
    }

    console.log('✅ Agent initialized with LLM');
    console.log(`  LLM Stats: ${JSON.stringify(agent.getLLMStats())}`);

    const results: BenchmarkResult[] = [];
    const samples = 5;

    // Run benchmarks
    const completionResult = await benchmarkCompletion(agent, samples);
    results.push(completionResult);

    const sessionResult = await benchmarkSession(agent, samples);
    results.push(sessionResult.baseline);
    results.push(sessionResult.withSession);

    const batchResult = await benchmarkBatch(agent, 3);

    const embeddingResult = await benchmarkEmbedding(agent, samples);
    results.push(embeddingResult);

    const routingResult = await testRouting(agent);

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  BENCHMARK RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('📈 Latency Results:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(
      'Operation'.padEnd(30) +
        'P50'.padStart(10) +
        'P95'.padStart(10) +
        'Avg'.padStart(10) +
        'Errors'.padStart(8)
    );
    console.log('─────────────────────────────────────────────────────────────');

    for (const result of results) {
      if (result.samples > 0) {
        console.log(
          result.name.padEnd(30) +
            `${result.latencyP50.toFixed(0)}ms`.padStart(10) +
            `${result.latencyP95.toFixed(0)}ms`.padStart(10) +
            `${result.latencyAvg.toFixed(0)}ms`.padStart(10) +
            `${result.errors}`.padStart(8)
        );
      }
    }

    console.log('\n📊 Phase 0 Milestone Validation:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(
      `  M0.1 SessionManager (50% latency): ${sessionResult.reduction.toFixed(1)}% reduction ` +
        `${sessionResult.reduction >= 50 ? '✅' : '❌'}`
    );
    console.log(
      `  M0.2 Batch Query (4x throughput):  ${batchResult.speedup.toFixed(2)}x speedup ` +
        `${batchResult.speedup >= 4 ? '✅' : '❌'}`
    );
    console.log(
      `  M0.3 Embedding Generation:         ${embeddingResult.errors === 0 ? '✅ Working' : '❌ Errors'}`
    );
    console.log(
      `  M0.4 Routing Observability:        ${routingResult ? '✅ Available' : '⚠️ Not available'}`
    );

    // Store in baseline tracker
    console.log('\n📊 Storing results in baseline tracker...');
    const tracker = new LLMBaselineTracker({ debug: false });
    await tracker.initialize();

    for (const result of results) {
      if (result.samples > 0 && result.latencyAvg > 0) {
        const measurement = tracker.recordMeasurement({
          provider: 'ruvllm',
          model: 'local',
          operation: result.operation,
          metrics: {
            latencyP50: result.latencyP50,
            latencyP95: result.latencyP95,
            latencyP99: result.latencyP99,
            tokensPerSecond: result.tokensPerSecond,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            errorRate: result.errors / result.samples,
          },
          sampleSize: result.samples,
          timestamp: new Date(),
          environment: {
            node: process.version,
            platform: process.platform,
          },
        });

        // Compare to baseline
        const comparison = tracker.compareToBaseline(measurement);
        if (comparison.baseline) {
          console.log(`  ${result.operation}: ${comparison.improvement!.latencyP50Change.toFixed(1)}% latency change`);
        }
      }
    }

    // Set baselines if requested
    if (process.argv.includes('--set-baseline')) {
      console.log('\n🎯 Setting new baselines...');
      for (const result of results) {
        if (result.samples > 0 && result.latencyAvg > 0) {
          const measurements = tracker.getMeasurements('ruvllm', 'local', result.operation, 1);
          if (measurements.length > 0) {
            tracker.setBaseline('ruvllm', 'local', result.operation, measurements[0].id!);
            console.log(`  ✅ Baseline set for ${result.operation}`);
          }
        }
      }
    }

    tracker.close();

    // Output JSON
    console.log('\n📊 Benchmark data (JSON):');
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          environment: { node: process.version, platform: process.platform },
          results,
          milestones: {
            m01_session_reduction: sessionResult.reduction,
            m02_batch_speedup: batchResult.speedup,
            m03_embedding_working: embeddingResult.errors === 0,
            m04_routing_available: routingResult !== null,
          },
        },
        null,
        2
      )
    );

    await agent.terminate();
    await memoryStore.close();

    console.log('\n✅ Benchmark complete');
  } catch (error) {
    console.error('\n❌ Benchmark error:', error);
    await agent.terminate();
    await memoryStore.close();
    process.exit(1);
  }
}

main().catch(console.error);
