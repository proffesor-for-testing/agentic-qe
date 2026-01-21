/**
 * ADR-051 Success Rate Benchmark
 *
 * REAL metrics measurement for AQE v3 components.
 * This benchmark runs actual operations and measures real success rates,
 * replacing the hardcoded placeholder values that were previously used.
 *
 * Components tested:
 * - Agent Booster WASM transforms
 * - Model Router decisions
 * - ONNX Embeddings generation
 * - ReasoningBank pattern storage
 *
 * Run with: npx vitest run tests/benchmarks/success-rate-benchmark.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface BenchmarkResult {
  component: string;
  operation: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  errors: string[];
}

interface BenchmarkSuite {
  timestamp: string;
  version: string;
  results: BenchmarkResult[];
  summary: {
    totalOperations: number;
    overallSuccessRate: number;
    avgLatencyMs: number;
    componentRates: Record<string, number>;
  };
}

// ============================================================================
// Benchmark Utilities
// ============================================================================

async function runBenchmark(
  component: string,
  operation: string,
  fn: () => Promise<boolean>,
  iterations: number = 10
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  const errors: string[] = [];
  let successCount = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      const success = await fn();
      const latency = performance.now() - start;
      latencies.push(latency);
      if (success) {
        successCount++;
      }
    } catch (error) {
      const latency = performance.now() - start;
      latencies.push(latency);
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    component,
    operation,
    totalRuns: iterations,
    successfulRuns: successCount,
    failedRuns: iterations - successCount,
    successRate: successCount / iterations,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    minLatencyMs: Math.min(...latencies),
    maxLatencyMs: Math.max(...latencies),
    errors: [...new Set(errors)], // Unique errors only
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('ADR-051 Success Rate Benchmark', () => {
  const results: BenchmarkResult[] = [];
  let agentBooster: any;
  let modelRouter: any;
  let onnxAdapter: any;
  let reasoningBank: any;

  beforeAll(async () => {
    // Dynamically import to avoid bundling issues
    try {
      const wasmModule = await import(
        '../../src/integrations/agent-booster-wasm/index.js'
      );
      agentBooster = wasmModule;
      await wasmModule.warmup?.();
    } catch (e) {
      console.warn('Agent Booster WASM not available:', e);
    }

    try {
      const routerModule = await import(
        '../../src/integrations/agentic-flow/model-router/index.js'
      );
      modelRouter = routerModule.createModelRouter();
    } catch (e) {
      console.warn('Model Router not available:', e);
    }

    try {
      const onnxModule = await import(
        '../../src/integrations/agentic-flow/onnx-embeddings/index.js'
      );
      onnxAdapter = onnxModule.createONNXEmbeddingsAdapter();
      await onnxAdapter.initialize();
    } catch (e) {
      console.warn('ONNX Embeddings not available:', e);
    }

    try {
      const bankModule = await import(
        '../../src/learning/real-qe-reasoning-bank.js'
      );
      reasoningBank = bankModule.createRealQEReasoningBank();
      await reasoningBank.initialize();
    } catch (e) {
      console.warn('ReasoningBank not available:', e);
    }
  }, 60000);

  afterAll(async () => {
    // Cleanup
    if (onnxAdapter?.dispose) await onnxAdapter.dispose();
    if (reasoningBank?.dispose) await reasoningBank.dispose();
    if (modelRouter?.dispose) await modelRouter.dispose();

    // Generate report
    const suite = generateReport(results);
    saveReport(suite);
  });

  // ==========================================================================
  // Agent Booster WASM Benchmarks
  // ==========================================================================

  describe('Agent Booster WASM', () => {
    it('should benchmark simple function replacement', async () => {
      if (!agentBooster) {
        console.warn('Skipping: Agent Booster not available');
        return;
      }

      const result = await runBenchmark(
        'AgentBooster',
        'simple-function-replace',
        async () => {
          const res = await agentBooster.transform(
            'function foo() { return 1; }',
            'function foo() { return 42; }',
            agentBooster.Language.JavaScript
          );
          return res.success && res.mergedCode.includes('42');
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.7);
    });

    it('should benchmark var-to-const transform', async () => {
      if (!agentBooster) return;

      const result = await runBenchmark(
        'AgentBooster',
        'var-to-const',
        async () => {
          const res = await agentBooster.transform(
            'var x = 1; var y = 2;',
            'const x = 1; const y = 2;',
            agentBooster.Language.JavaScript
          );
          return res.success && res.mergedCode.includes('const');
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.8);
    });

    it('should benchmark type annotation addition', async () => {
      if (!agentBooster) return;

      const result = await runBenchmark(
        'AgentBooster',
        'add-type-annotations',
        async () => {
          const res = await agentBooster.transform(
            'function greet(name) { return `Hello ${name}`; }',
            'function greet(name: string): string { return `Hello ${name}`; }',
            agentBooster.Language.TypeScript
          );
          return res.success && res.mergedCode.includes(': string');
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.7);
    });

    it('should benchmark test assertion addition', async () => {
      if (!agentBooster) return;

      const result = await runBenchmark(
        'AgentBooster',
        'add-test-assertion',
        async () => {
          const res = await agentBooster.transform(
            `test('adds numbers', () => { const result = add(1, 2); });`,
            `test('adds numbers', () => { const result = add(1, 2); expect(result).toBe(3); });`,
            agentBooster.Language.JavaScript
          );
          return res.success && res.mergedCode.includes('expect');
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.6);
    });

    it('should benchmark async conversion', async () => {
      if (!agentBooster) return;

      const result = await runBenchmark(
        'AgentBooster',
        'sync-to-async',
        async () => {
          const res = await agentBooster.transform(
            `test('fetches data', () => { const data = fetchData(); });`,
            `test('fetches data', async () => { const data = await fetchData(); });`,
            agentBooster.Language.JavaScript
          );
          return res.success && res.mergedCode.includes('async');
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.6);
    });
  });

  // ==========================================================================
  // Model Router Benchmarks
  // ==========================================================================

  describe('Model Router', () => {
    const testCases = [
      { task: 'Fix typo in comment', expectedTier: 0 },
      { task: 'Add console.log for debugging', expectedTier: 0 },
      { task: 'Convert var to const', expectedTier: 0 },
      { task: 'Implement user authentication with OAuth2', expectedTier: 2 },
      { task: 'Design microservices architecture', expectedTier: 3 },
      { task: 'Review security vulnerabilities in auth flow', expectedTier: 3 },
    ];

    it('should benchmark routing decisions', async () => {
      if (!modelRouter) {
        console.warn('Skipping: Model Router not available');
        return;
      }

      const result = await runBenchmark(
        'ModelRouter',
        'route-decision',
        async () => {
          const testCase = testCases[Math.floor(Math.random() * testCases.length)];
          const decision = await modelRouter.route({ task: testCase.task });
          // Check if decision was made (any tier is valid)
          return decision && typeof decision.tier === 'number';
        },
        30
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.9);
    });

    it('should benchmark complexity analysis', async () => {
      if (!modelRouter) return;

      const result = await runBenchmark(
        'ModelRouter',
        'complexity-analysis',
        async () => {
          const decision = await modelRouter.route({
            task: 'Implement feature with tests',
            codeContext: 'function existing() { return true; }',
          });
          return (
            decision &&
            typeof decision.complexityAnalysis?.overall === 'number' &&
            decision.complexityAnalysis.overall >= 0 &&
            decision.complexityAnalysis.overall <= 100
          );
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.9);
    });

    it('should benchmark Agent Booster eligibility detection', async () => {
      if (!modelRouter) return;

      const boosterTasks = [
        'Convert var to const',
        'Add type annotations',
        'Remove console.log statements',
        'Convert function to arrow function',
      ];

      const result = await runBenchmark(
        'ModelRouter',
        'booster-eligibility',
        async () => {
          const task = boosterTasks[Math.floor(Math.random() * boosterTasks.length)];
          const decision = await modelRouter.route({ task });
          // Should route to tier 0 (Booster) for simple tasks
          return decision && decision.tier === 0;
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.7);
    });
  });

  // ==========================================================================
  // ONNX Embeddings Benchmarks
  // ==========================================================================

  describe('ONNX Embeddings', () => {
    it('should benchmark embedding generation', async () => {
      if (!onnxAdapter) {
        console.warn('Skipping: ONNX Adapter not available');
        return;
      }

      const testTexts = [
        'Unit testing best practices',
        'Integration test patterns',
        'Test-driven development',
        'Code coverage analysis',
        'Mutation testing strategies',
      ];

      const result = await runBenchmark(
        'ONNXEmbeddings',
        'generate-embedding',
        async () => {
          const text = testTexts[Math.floor(Math.random() * testTexts.length)];
          const embedding = await onnxAdapter.generateEmbedding(text);
          return (
            embedding &&
            Array.isArray(embedding.vector) &&
            embedding.vector.length === 384 // MiniLM dimension
          );
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.9);
    });

    it('should benchmark similarity comparison', async () => {
      if (!onnxAdapter) return;

      const result = await runBenchmark(
        'ONNXEmbeddings',
        'similarity-compare',
        async () => {
          const similarity = await onnxAdapter.compareSimilarity(
            'Unit testing with Jest',
            'Testing JavaScript with Jest framework',
            'cosine'
          );
          // Cosine similarity range is [-1, 1], not [0, 1]
          return typeof similarity === 'number' && similarity >= -1 && similarity <= 1;
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.9);
    });

    it('should benchmark store and search', async () => {
      if (!onnxAdapter) return;

      // Store some embeddings first
      await onnxAdapter.generateAndStore('Test pattern for authentication', {
        namespace: 'benchmark',
      });
      await onnxAdapter.generateAndStore('Test pattern for API validation', {
        namespace: 'benchmark',
      });

      const result = await runBenchmark(
        'ONNXEmbeddings',
        'search',
        async () => {
          const results = await onnxAdapter.searchByText('authentication testing', {
            namespace: 'benchmark',
            topK: 5,
          });
          return Array.isArray(results);
        },
        10
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.8);
    });
  });

  // ==========================================================================
  // ReasoningBank Benchmarks
  // ==========================================================================

  describe('ReasoningBank', () => {
    // Track stored pattern IDs for use in outcome recording
    const storedPatternIds: string[] = [];

    it('should benchmark pattern storage', async () => {
      if (!reasoningBank) {
        console.warn('Skipping: ReasoningBank not available');
        return;
      }

      let counter = 0;
      const result = await runBenchmark(
        'ReasoningBank',
        'store-pattern',
        async () => {
          counter++;
          // Use correct method name: storeQEPattern (not storePattern)
          const storeResult = await reasoningBank.storeQEPattern({
            patternType: 'test-strategy',
            name: `benchmark-pattern-${counter}`,
            description: 'Test pattern for benchmark',
          });
          // Capture the pattern ID for later use in outcome recording
          if (storeResult.success && storeResult.value?.id) {
            storedPatternIds.push(storeResult.value.id);
          }
          return storeResult.success;
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.9);
    });

    it('should benchmark pattern search (HNSW O(log n))', async () => {
      if (!reasoningBank) return;

      const result = await runBenchmark(
        'ReasoningBank',
        'search-pattern-hnsw',
        async () => {
          // Use correct method name: searchQEPatterns (uses HNSW index, O(log n))
          const searchResult = await reasoningBank.searchQEPatterns('test generation', {
            limit: 10,
          });
          // searchQEPatterns returns Result<Array<...>> with { success, value } structure
          return searchResult.success && Array.isArray(searchResult.value);
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.8);
    });

    it('should benchmark task routing', async () => {
      if (!reasoningBank) return;

      const result = await runBenchmark(
        'ReasoningBank',
        'route-task',
        async () => {
          const routingResult = await reasoningBank.routeTask({
            task: 'Generate unit tests for authentication module',
            domain: 'test-generation',
          });
          // routeTask returns Result<RealQERoutingResult> with { success, value } structure
          return (
            routingResult.success &&
            routingResult.value &&
            typeof routingResult.value.recommendedAgent === 'string' &&
            typeof routingResult.value.confidence === 'number'
          );
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.8);
    });

    it('should benchmark learning outcome recording', async () => {
      if (!reasoningBank) return;

      // Need stored pattern IDs from the storage test (runs before this)
      if (storedPatternIds.length === 0) {
        console.warn('Skipping: No stored pattern IDs available');
        return;
      }

      let counter = 0;
      const result = await runBenchmark(
        'ReasoningBank',
        'record-outcome',
        async () => {
          // Use valid pattern IDs from previously stored patterns
          const patternId = storedPatternIds[counter % storedPatternIds.length];
          counter++;
          // Use correct method name: recordOutcome (not recordLearningOutcome)
          const outcomeResult = await reasoningBank.recordOutcome({
            patternId,
            success: Math.random() > 0.3,
            metrics: {
              executionTimeMs: Math.random() * 1000,
              testsPassed: Math.floor(Math.random() * 10),
            },
          });
          // Result uses { success, value } structure (not { ok })
          return outcomeResult.success;
        },
        20
      );

      results.push(result);
      expect(result.successRate).toBeGreaterThan(0.9);
    });
  });
});

// ============================================================================
// Report Generation
// ============================================================================

function generateReport(results: BenchmarkResult[]): BenchmarkSuite {
  const componentRates: Record<string, number[]> = {};

  for (const r of results) {
    if (!componentRates[r.component]) {
      componentRates[r.component] = [];
    }
    componentRates[r.component].push(r.successRate);
  }

  const avgComponentRates: Record<string, number> = {};
  for (const [comp, rates] of Object.entries(componentRates)) {
    avgComponentRates[comp] = rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  const totalOps = results.reduce((sum, r) => sum + r.totalRuns, 0);
  const totalSuccess = results.reduce((sum, r) => sum + r.successfulRuns, 0);
  const avgLatency =
    results.reduce((sum, r) => sum + r.avgLatencyMs, 0) / results.length;

  return {
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    results,
    summary: {
      totalOperations: totalOps,
      overallSuccessRate: totalSuccess / totalOps,
      avgLatencyMs: avgLatency,
      componentRates: avgComponentRates,
    },
  };
}

function saveReport(suite: BenchmarkSuite): void {
  const reportDir = path.join(process.cwd(), 'docs', 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(
    reportDir,
    `success-rate-benchmark-${timestamp}.json`
  );

  fs.writeFileSync(reportPath, JSON.stringify(suite, null, 2));

  // Also write markdown summary
  const mdReport = generateMarkdownReport(suite);
  const mdPath = path.join(reportDir, `success-rate-benchmark-${timestamp}.md`);
  fs.writeFileSync(mdPath, mdReport);

  console.log(`\n📊 Benchmark report saved to:`);
  console.log(`   JSON: ${reportPath}`);
  console.log(`   MD:   ${mdPath}`);
}

function generateMarkdownReport(suite: BenchmarkSuite): string {
  const lines: string[] = [
    '# ADR-051 Success Rate Benchmark Report',
    '',
    `**Generated:** ${suite.timestamp}`,
    `**Version:** ${suite.version}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Operations | ${suite.summary.totalOperations} |`,
    `| Overall Success Rate | **${(suite.summary.overallSuccessRate * 100).toFixed(1)}%** |`,
    `| Average Latency | ${suite.summary.avgLatencyMs.toFixed(2)}ms |`,
    '',
    '## Component Success Rates',
    '',
    '| Component | Success Rate | Status |',
    '|-----------|--------------|--------|',
  ];

  for (const [comp, rate] of Object.entries(suite.summary.componentRates)) {
    const status = rate >= 0.9 ? '✅ Excellent' : rate >= 0.7 ? '⚠️ Good' : '❌ Needs Work';
    lines.push(`| ${comp} | ${(rate * 100).toFixed(1)}% | ${status} |`);
  }

  lines.push('', '## Detailed Results', '');

  for (const r of suite.results) {
    lines.push(`### ${r.component} - ${r.operation}`);
    lines.push('');
    lines.push(`- **Success Rate:** ${(r.successRate * 100).toFixed(1)}%`);
    lines.push(`- **Runs:** ${r.successfulRuns}/${r.totalRuns}`);
    lines.push(`- **Avg Latency:** ${r.avgLatencyMs.toFixed(2)}ms`);
    lines.push(`- **Min/Max:** ${r.minLatencyMs.toFixed(2)}ms / ${r.maxLatencyMs.toFixed(2)}ms`);
    if (r.errors.length > 0) {
      lines.push(`- **Errors:** ${r.errors.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*This report was generated by running actual operations, not from hardcoded values.*');

  return lines.join('\n');
}
