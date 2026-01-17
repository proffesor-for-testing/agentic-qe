/**
 * Spawn Comparison Benchmark Tests
 * Phase 3 D1: Memory Pooling for 16x Agent Spawn Speedup
 *
 * HONEST BENCHMARKS - Measures what we claim to optimize:
 * - Direct spawn WITH initialization (the actual expensive operation)
 * - Pool acquisition of pre-initialized agents
 * - Warmup overhead (latency is moved, not eliminated)
 * - End-to-end integration through AgentSpawnHandler
 *
 * Target: Reduce spawn time from ~50-100ms to ~3-6ms
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  AgentPool,
  createQEAgentPool,
  PoolableAgent,
  AgentCreator,
} from '../../src/agents/pool';
import { QEAgentType } from '../../src/types';
import { QEAgentFactory } from '../../src/agents';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { BaseAgent } from '../../src/agents/BaseAgent';

interface BenchmarkResult {
  operation: string;
  iterations: number;
  times: number[];
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  p50TimeMs: number;
  p95TimeMs: number;
  p99TimeMs: number;
}

function calculatePercentile(times: number[], percentile: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function createBenchmarkResult(operation: string, times: number[]): BenchmarkResult {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    operation,
    iterations: times.length,
    times,
    avgTimeMs: times.reduce((a, b) => a + b, 0) / times.length,
    minTimeMs: sorted[0],
    maxTimeMs: sorted[sorted.length - 1],
    p50TimeMs: calculatePercentile(times, 50),
    p95TimeMs: calculatePercentile(times, 95),
    p99TimeMs: calculatePercentile(times, 99),
  };
}

describe('Spawn Performance Comparison (HONEST)', () => {
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;
  let agentFactory: QEAgentFactory;
  let pool: AgentPool<PoolableAgent>;
  let agentCreator: AgentCreator;

  const results: {
    directSpawnNoInit: BenchmarkResult | null;
    directSpawnWithInit: BenchmarkResult | null;
    pooledCold: BenchmarkResult | null;
    pooledAfterWarmup: BenchmarkResult | null;
    warmupTime: number;
  } = {
    directSpawnNoInit: null,
    directSpawnWithInit: null,
    pooledCold: null,
    pooledAfterWarmup: null,
    warmupTime: 0,
  };

  // Track created agents for cleanup
  const createdAgents: BaseAgent[] = [];

  beforeAll(async () => {
    // Initialize memory store
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    eventBus = new EventEmitter();

    // Create agent factory
    agentFactory = new QEAgentFactory({
      eventBus,
      memoryStore,
      context: {
        id: 'benchmark-context',
        type: 'benchmark',
        status: 'initializing' as any,
      },
    });

    // Create agent creator function
    agentCreator = async (type: QEAgentType) => {
      const agent = await agentFactory.createAgent(type, { enableLearning: false });
      createdAgents.push(agent);
      return agent;
    };
  });

  afterAll(async () => {
    // Cleanup created agents
    for (const agent of createdAgents) {
      try {
        await agent.terminate();
      } catch {
        // Ignore cleanup errors
      }
    }

    if (pool) {
      await pool.shutdown();
    }
    if (memoryStore) {
      await memoryStore.close();
    }

    // Print final comparison report
    printHonestReport();
  });

  function printHonestReport(): void {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║      HONEST SPAWN PERFORMANCE COMPARISON - PHASE 3 D1            ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log('║  Target: Reduce spawn from ~50-100ms to ~3-6ms (16x speedup)     ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Show what we were PREVIOUSLY measuring (wrong)
    if (results.directSpawnNoInit) {
      console.log('┌─────────────────────────────────────────────────────────────────┐');
      console.log('│ ⚠️  PREVIOUS BASELINE (WRONG) - createAgent() without init      │');
      console.log('├─────────────────────────────────────────────────────────────────┤');
      console.log(`│ Average:    ${results.directSpawnNoInit.avgTimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log(`│ This was NOT the 50-100ms problem we claimed to solve!         │`);
      console.log('└─────────────────────────────────────────────────────────────────┘');
    }

    // Show CORRECT baseline
    if (results.directSpawnWithInit) {
      console.log('');
      console.log('┌─────────────────────────────────────────────────────────────────┐');
      console.log('│ ✅ CORRECT BASELINE - createAgent() + initialize()              │');
      console.log('├─────────────────────────────────────────────────────────────────┤');
      console.log(`│ Iterations: ${results.directSpawnWithInit.iterations.toString().padEnd(52)}│`);
      console.log(`│ Average:    ${results.directSpawnWithInit.avgTimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log(`│ Min:        ${results.directSpawnWithInit.minTimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log(`│ Max:        ${results.directSpawnWithInit.maxTimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log(`│ P50:        ${results.directSpawnWithInit.p50TimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log(`│ P95:        ${results.directSpawnWithInit.p95TimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log('└─────────────────────────────────────────────────────────────────┘');

      // Verdict on whether the problem exists
      const problemExists = results.directSpawnWithInit.avgTimeMs >= 30;
      console.log('');
      if (problemExists) {
        console.log(`│ ✅ PROBLEM VERIFIED: ${results.directSpawnWithInit.avgTimeMs.toFixed(0)}ms spawn is slow enough to optimize │`);
      } else {
        console.log('┌─────────────────────────────────────────────────────────────────┐');
        console.log(`│ ⚠️  PROBLEM MAY NOT EXIST: ${results.directSpawnWithInit.avgTimeMs.toFixed(2)}ms is already fast           │`);
        console.log(`│ The claimed 50-100ms spawn time was not observed.              │`);
        console.log('└─────────────────────────────────────────────────────────────────┘');
      }
    }

    // Warmup overhead
    console.log('');
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ ⏱️  WARMUP OVERHEAD (latency moved, not eliminated)              │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│ Warmup Time: ${results.warmupTime.toFixed(2).padEnd(51)}ms │`);
    console.log(`│ This cost is paid upfront during fleet initialization          │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');

    // Pooled results
    if (results.pooledAfterWarmup) {
      console.log('');
      console.log('┌─────────────────────────────────────────────────────────────────┐');
      console.log('│ 🚀 POOLED SPAWN (After Warmup) - Optimized Path                 │');
      console.log('├─────────────────────────────────────────────────────────────────┤');
      console.log(`│ Iterations: ${results.pooledAfterWarmup.iterations.toString().padEnd(52)}│`);
      console.log(`│ Average:    ${results.pooledAfterWarmup.avgTimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log(`│ Min:        ${results.pooledAfterWarmup.minTimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log(`│ Max:        ${results.pooledAfterWarmup.maxTimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log(`│ P50:        ${results.pooledAfterWarmup.p50TimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log(`│ P95:        ${results.pooledAfterWarmup.p95TimeMs.toFixed(2).padEnd(52)}ms │`);
      console.log('└─────────────────────────────────────────────────────────────────┘');
    }

    // Final verdict
    if (results.directSpawnWithInit && results.pooledAfterWarmup) {
      const speedup = results.directSpawnWithInit.avgTimeMs / results.pooledAfterWarmup.avgTimeMs;
      const targetSpeedup = 16;
      const targetPooledTime = 6; // ms
      const meetsSpeedupTarget = speedup >= targetSpeedup;
      const meetsTimeTarget = results.pooledAfterWarmup.avgTimeMs <= targetPooledTime;
      const targetMet = meetsSpeedupTarget || meetsTimeTarget;

      console.log('');
      console.log('╔═════════════════════════════════════════════════════════════════╗');
      console.log('║                    HONEST SPEEDUP SUMMARY                       ║');
      console.log('╠═════════════════════════════════════════════════════════════════╣');
      console.log(`║ Direct (with init):  ${results.directSpawnWithInit.avgTimeMs.toFixed(2).padEnd(42)}ms ║`);
      console.log(`║ Pooled (warmed):     ${results.pooledAfterWarmup.avgTimeMs.toFixed(2).padEnd(42)}ms ║`);
      console.log(`║ Warmup overhead:     ${results.warmupTime.toFixed(2).padEnd(42)}ms ║`);
      console.log('╠═════════════════════════════════════════════════════════════════╣');
      console.log(`║ SPEEDUP FACTOR:      ${speedup.toFixed(1).padEnd(42)}x ║`);
      console.log(`║ Target (16x OR ≤6ms): ${targetMet ? '✅ MET' : '❌ NOT MET'.padEnd(42)} ║`);
      console.log('╠═════════════════════════════════════════════════════════════════╣');

      // Amortization analysis
      const agentsToAmortize = Math.ceil(results.warmupTime / results.directSpawnWithInit.avgTimeMs);
      console.log(`║ BREAK-EVEN ANALYSIS:                                            ║`);
      console.log(`║ Warmup cost amortized after ${agentsToAmortize.toString().padEnd(35)} spawns ║`);

      if (agentsToAmortize <= 10) {
        console.log(`║ ✅ Pool is worthwhile for most workloads                        ║`);
      } else if (agentsToAmortize <= 50) {
        console.log(`║ ⚠️  Pool only worthwhile for high-volume spawning               ║`);
      } else {
        console.log(`║ ❌ Pool overhead exceeds benefits for typical usage             ║`);
      }

      console.log('╚═════════════════════════════════════════════════════════════════╝');
    }

    console.log('');
  }

  describe('1. Verify Problem Exists', () => {
    it('should measure createAgent WITHOUT initialize (previous wrong baseline)', async () => {
      const iterations = 3;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await agentFactory.createAgent(QEAgentType.TEST_GENERATOR, { enableLearning: false });
        const elapsed = performance.now() - startTime;
        times.push(elapsed);
      }

      results.directSpawnNoInit = createBenchmarkResult('Direct (no init)', times);

      console.log('\n--- createAgent() WITHOUT initialize() ---');
      console.log(`Average: ${results.directSpawnNoInit.avgTimeMs.toFixed(2)}ms`);
      console.log('This was the WRONG baseline we used before!');

      expect(results.directSpawnNoInit.avgTimeMs).toBeGreaterThan(0);
    });

    it('should measure createAgent WITH initialize (CORRECT baseline)', async () => {
      const iterations = 3;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const agent = await agentFactory.createAgent(QEAgentType.TEST_GENERATOR, {
          enableLearning: false,
        });
        await agent.initialize(); // THE EXPENSIVE PART
        const elapsed = performance.now() - startTime;
        times.push(elapsed);
        createdAgents.push(agent);
      }

      results.directSpawnWithInit = createBenchmarkResult('Direct (with init)', times);

      console.log('\n--- createAgent() + initialize() (CORRECT BASELINE) ---');
      console.log(`Average: ${results.directSpawnWithInit.avgTimeMs.toFixed(2)}ms`);
      console.log(`Min: ${results.directSpawnWithInit.minTimeMs.toFixed(2)}ms`);
      console.log(`Max: ${results.directSpawnWithInit.maxTimeMs.toFixed(2)}ms`);
      console.log(`Times: ${times.map((t) => t.toFixed(2)).join(', ')}ms`);

      // Check if problem actually exists
      if (results.directSpawnWithInit.avgTimeMs < 10) {
        console.log('\n⚠️  WARNING: Direct spawn is already fast (<10ms)');
        console.log('The claimed 50-100ms problem may not exist in current codebase.');
      } else if (results.directSpawnWithInit.avgTimeMs >= 50) {
        console.log('\n✅ PROBLEM CONFIRMED: Spawn time is in the 50-100ms range');
      }

      expect(results.directSpawnWithInit.avgTimeMs).toBeGreaterThan(0);
    });
  });

  describe('2. Pool Performance with Warmup Overhead', () => {
    beforeAll(async () => {
      // Initialize pool
      pool = await createQEAgentPool(
        agentCreator,
        { enableLearning: false },
        {
          debug: false,
          warmupStrategy: 'eager',
          typeConfigs: new Map([
            [
              QEAgentType.TEST_GENERATOR,
              {
                type: QEAgentType.TEST_GENERATOR,
                minSize: 2,
                maxSize: 10,
                warmupCount: 2,
                preInitialize: true,
                idleTtlMs: 60000,
                growthIncrement: 2,
              },
            ],
          ]),
        }
      );
    });

    it('should measure warmup overhead (latency moved, not eliminated)', async () => {
      console.log('\n--- Pool Warmup (includes agent creation + initialization) ---');

      const warmupStart = performance.now();
      await pool.warmup([QEAgentType.TEST_GENERATOR]);
      results.warmupTime = performance.now() - warmupStart;

      console.log(`Warmup Time: ${results.warmupTime.toFixed(2)}ms`);

      const stats = pool.getStats();
      console.log(`Agents warmed: ${stats.totalAgents}`);
      console.log(`Cost per agent: ${(results.warmupTime / stats.totalAgents).toFixed(2)}ms`);

      // Warmup should take time (if it's instant, something is wrong)
      expect(results.warmupTime).toBeGreaterThan(0);
    });

    it('should measure pool acquisition after warmup', async () => {
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const result = await pool.acquire(QEAgentType.TEST_GENERATOR);
        const elapsed = performance.now() - startTime;
        times.push(elapsed);

        // Release back immediately
        await pool.release(result.meta.poolId);
      }

      results.pooledAfterWarmup = createBenchmarkResult('Pooled (warmed)', times);

      console.log('\n--- Pool Acquisition (after warmup) ---');
      console.log(`Average: ${results.pooledAfterWarmup.avgTimeMs.toFixed(2)}ms`);
      console.log(`Min: ${results.pooledAfterWarmup.minTimeMs.toFixed(2)}ms`);
      console.log(`Max: ${results.pooledAfterWarmup.maxTimeMs.toFixed(2)}ms`);
      console.log(`Times: ${times.map((t) => t.toFixed(2)).join(', ')}ms`);

      expect(results.pooledAfterWarmup.avgTimeMs).toBeLessThan(50);
    });

    it('should calculate honest speedup', () => {
      if (!results.directSpawnWithInit || !results.pooledAfterWarmup) {
        console.log('Skipping - missing results');
        return;
      }

      const speedup = results.directSpawnWithInit.avgTimeMs / results.pooledAfterWarmup.avgTimeMs;

      console.log('\n--- HONEST SPEEDUP ---');
      console.log(`Direct (with init): ${results.directSpawnWithInit.avgTimeMs.toFixed(2)}ms`);
      console.log(`Pooled (warmed): ${results.pooledAfterWarmup.avgTimeMs.toFixed(2)}ms`);
      console.log(`Warmup overhead: ${results.warmupTime.toFixed(2)}ms`);
      console.log(`SPEEDUP: ${speedup.toFixed(1)}x`);

      // Break-even analysis
      const agentsNeededToBreakEven = Math.ceil(
        results.warmupTime /
          (results.directSpawnWithInit.avgTimeMs - results.pooledAfterWarmup.avgTimeMs)
      );
      console.log(`\nBreak-even after ${agentsNeededToBreakEven} agent spawns`);

      // Speedup should exist but may not hit target
      expect(speedup).toBeGreaterThan(1);
    });
  });

  describe('3. Pool Statistics', () => {
    it('should report accurate pool metrics', () => {
      const stats = pool.getStats();

      console.log('\n--- Pool Statistics ---');
      console.log(`Total Agents: ${stats.totalAgents}`);
      console.log(`Available: ${stats.availableAgents}`);
      console.log(`In Use: ${stats.inUseAgents}`);
      console.log(`Total Acquisitions: ${stats.totalAcquisitions}`);
      console.log(`Total Misses: ${stats.totalMisses}`);
      console.log(`Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
      console.log(`Avg Acquisition Time: ${stats.avgAcquisitionTimeMs.toFixed(2)}ms`);

      expect(stats.totalAcquisitions).toBeGreaterThan(0);
    });
  });
});
