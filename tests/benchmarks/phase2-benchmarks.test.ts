/**
 * Phase 2 Comprehensive Benchmark Suite
 *
 * Performance benchmarks with validation against Phase 2 requirements:
 * - Pattern lookup: <50ms p95
 * - Learning overhead: <10% additional time
 * - Pattern extraction: <5s for 100 files
 * - Memory usage: <100MB per project
 * - Throughput: 100+ operations/sec
 *
 * @module tests/benchmarks/phase2-benchmarks
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank } from '@reasoning/QEReasoningBank';
import { LearningEngine } from '@learning/LearningEngine';
import { PatternExtractor } from '@reasoning/PatternExtractor';

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
  throughput: number;
}

class BenchmarkRunner {
  static async run(
    name: string,
    operation: () => Promise<void>,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    const measurements: number[] = [];

    // Warmup
    for (let i = 0; i < 10; i++) {
      await operation();
    }

    // Actual benchmark
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const duration = performance.now() - start;
      measurements.push(duration);
    }

    const totalDuration = performance.now() - startTime;

    // Calculate statistics
    const sorted = measurements.sort((a, b) => a - b);
    const result: BenchmarkResult = {
      operation: name,
      iterations,
      totalDuration,
      avgDuration: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      minDuration: sorted[0],
      maxDuration: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      throughput: (iterations / totalDuration) * 1000 // ops/sec
    };

    return result;
  }

  static printResult(result: BenchmarkResult): void {
    console.log(`\n━━━ ${result.operation} ━━━`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Total: ${result.totalDuration.toFixed(2)}ms`);
    console.log(`Average: ${result.avgDuration.toFixed(2)}ms`);
    console.log(`Min: ${result.minDuration.toFixed(2)}ms`);
    console.log(`Max: ${result.maxDuration.toFixed(2)}ms`);
    console.log(`P50: ${result.p50.toFixed(2)}ms`);
    console.log(`P95: ${result.p95.toFixed(2)}ms`);
    console.log(`P99: ${result.p99.toFixed(2)}ms`);
    console.log(`Throughput: ${result.throughput.toFixed(0)} ops/sec`);
  }
}

describe('Phase 2 Comprehensive Benchmarks', () => {
  let reasoningBank: QEReasoningBank;
  let learningEngine: LearningEngine;
  let patternExtractor: PatternExtractor;

  beforeEach(() => {
    reasoningBank = new QEReasoningBank();
    learningEngine = new LearningEngine();
    patternExtractor = new PatternExtractor();
  });

  afterEach(() => {
    if (learningEngine) learningEngine.clear();
  });

  // ===========================================================================
  // QEReasoningBank Benchmarks
  // ===========================================================================

  describe('QEReasoningBank Benchmarks', () => {
    beforeEach(async () => {
      // Seed 1000 patterns
      for (let i = 0; i < 1000; i++) {
        await reasoningBank.storePattern({
          id: `bench-pattern-${i}`,
          name: `Benchmark Pattern ${i}`,
          category: i % 2 === 0 ? 'unit' : 'integration',
          framework: i % 3 === 0 ? 'jest' : i % 3 === 1 ? 'mocha' : 'vitest',
          language: 'typescript',
          description: `Benchmark pattern ${i}`,
          template: `template-${i}`,
          applicability: {
            complexity: i % 3 === 0 ? 'low' : i % 3 === 1 ? 'medium' : 'high',
            context: [`ctx-${i % 20}`],
            constraints: []
          },
          metrics: {
            successRate: 0.7 + Math.random() * 0.3,
            usageCount: Math.floor(Math.random() * 100),
            averageQuality: 0.7 + Math.random() * 0.3,
            lastUsed: new Date()
          },
          tags: [`tag-${i % 50}`, `type-${i % 10}`],
          metadata: { benchmarkId: i }
        });
      }
    });

    it('Benchmark: Pattern lookup by ID', async () => {
      const result = await BenchmarkRunner.run(
        'Pattern Lookup by ID',
        async () => {
          const id = `bench-pattern-${Math.floor(Math.random() * 1000)}`;
          await reasoningBank.getPattern(id);
        },
        200
      );

      BenchmarkRunner.printResult(result);

      // Validate against requirements
      expect(result.p95).toBeLessThan(50); // <50ms p95
      expect(result.avgDuration).toBeLessThan(20);
      expect(result.throughput).toBeGreaterThan(50);
    });

    it('Benchmark: Pattern search with filters', async () => {
      const result = await BenchmarkRunner.run(
        'Pattern Search with Filters',
        async () => {
          await reasoningBank.findMatchingPatterns({
            framework: 'jest',
            language: 'typescript',
            tags: [`tag-${Math.floor(Math.random() * 50)}`],
            limit: 10
          });
        },
        200
      );

      BenchmarkRunner.printResult(result);

      expect(result.p95).toBeLessThan(50);
      expect(result.avgDuration).toBeLessThan(30);
    });

    it('Benchmark: Pattern metrics update', async () => {
      const result = await BenchmarkRunner.run(
        'Pattern Metrics Update',
        async () => {
          const id = `bench-pattern-${Math.floor(Math.random() * 1000)}`;
          await reasoningBank.updateMetrics(id, true, 0.9);
        },
        200
      );

      BenchmarkRunner.printResult(result);

      expect(result.p95).toBeLessThan(20);
      expect(result.throughput).toBeGreaterThan(100);
    });

    it('Benchmark: Concurrent pattern operations', async () => {
      const concurrency = 20;
      const start = performance.now();

      await Promise.all(
        Array.from({ length: concurrency }, async (_, i) => {
          // Mix of operations
          if (i % 3 === 0) {
            await reasoningBank.getPattern(`bench-pattern-${i}`);
          } else if (i % 3 === 1) {
            await reasoningBank.findMatchingPatterns({
              framework: 'jest',
              limit: 5
            });
          } else {
            await reasoningBank.updateMetrics(`bench-pattern-${i}`, true, 0.9);
          }
        })
      );

      const duration = performance.now() - start;
      const throughput = (concurrency / duration) * 1000;

      console.log(`\n━━━ Concurrent Pattern Operations ━━━`);
      console.log(`Concurrency: ${concurrency}`);
      console.log(`Total: ${duration.toFixed(2)}ms`);
      console.log(`Throughput: ${throughput.toFixed(0)} ops/sec`);

      expect(throughput).toBeGreaterThan(50);
    });
  });

  // ===========================================================================
  // LearningEngine Benchmarks
  // ===========================================================================

  describe('LearningEngine Benchmarks', () => {
    it('Benchmark: Record learning outcome', async () => {
      const result = await BenchmarkRunner.run(
        'Record Learning Outcome',
        async () => {
          await learningEngine.recordOutcome({
            id: `bench-rec-${Date.now()}-${Math.random()}`,
            timestamp: new Date(),
            testId: 'bench-test',
            testName: 'Benchmark Test',
            outcome: 'success',
            executionTime: 100,
            coverage: 0.9,
            edgeCasesCaught: 6,
            feedback: { quality: 0.85, relevance: 0.9 },
            metadata: {
              framework: 'jest',
              language: 'typescript',
              complexity: 2,
              linesOfCode: 100
            }
          });
        },
        200
      );

      BenchmarkRunner.printResult(result);

      // Should have <10ms overhead
      expect(result.avgDuration).toBeLessThan(10);
      expect(result.p95).toBeLessThan(20);
      expect(result.throughput).toBeGreaterThan(100);
    });

    it('Benchmark: Trend analysis with 1000 records', async () => {
      // Seed 1000 records
      for (let i = 0; i < 1000; i++) {
        await learningEngine.recordOutcome({
          id: `trend-${i}`,
          timestamp: new Date(Date.now() + i * 1000),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: i % 10 === 0 ? 'flaky' : 'success',
          executionTime: 100 + (i % 100),
          coverage: 0.75 + (i % 100) * 0.002,
          edgeCasesCaught: 4 + (i % 10),
          feedback: { quality: 0.7 + (i % 100) * 0.003, relevance: 0.85 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
      }

      const result = await BenchmarkRunner.run(
        'Trend Analysis (1000 records)',
        async () => {
          await learningEngine.analyzeTrends();
        },
        20
      );

      BenchmarkRunner.printResult(result);

      expect(result.avgDuration).toBeLessThan(500);
      expect(result.p95).toBeLessThan(1000);
    });

    it('Benchmark: Apply learning recommendations', async () => {
      // Seed data
      for (let i = 0; i < 50; i++) {
        await learningEngine.recordOutcome({
          id: `apply-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.85,
          edgeCasesCaught: 6,
          feedback: { quality: 0.8, relevance: 0.85 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
      }

      const result = await BenchmarkRunner.run(
        'Apply Learning Recommendations',
        async () => {
          await learningEngine.applyLearning({
            framework: 'jest',
            language: 'typescript',
            complexity: 2
          });
        },
        100
      );

      BenchmarkRunner.printResult(result);

      expect(result.avgDuration).toBeLessThan(50);
      expect(result.throughput).toBeGreaterThan(20);
    });

    it('Benchmark: Improvement metrics calculation', async () => {
      // Seed 30 days of data
      for (let i = 0; i < 90; i++) {
        await learningEngine.recordOutcome({
          id: `metrics-${i}`,
          timestamp: new Date(Date.now() - (90 - i) * 24 * 60 * 60 * 1000),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.8 + i * 0.001,
          edgeCasesCaught: 5 + Math.floor(i / 10),
          feedback: { quality: 0.75 + i * 0.002, relevance: 0.85 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
      }

      const result = await BenchmarkRunner.run(
        'Improvement Metrics (30 days)',
        async () => {
          await learningEngine.getImprovementMetrics(30);
        },
        50
      );

      BenchmarkRunner.printResult(result);

      expect(result.avgDuration).toBeLessThan(100);
    });
  });

  // ===========================================================================
  // PatternExtractor Benchmarks
  // ===========================================================================

  describe('PatternExtractor Benchmarks', () => {
    const sampleCode = `
      describe('UserService', () => {
        let service: UserService;

        beforeEach(() => {
          service = new UserService();
        });

        it('should create user with valid data', async () => {
          const user = await service.createUser({
            email: 'test@example.com',
            name: 'Test User'
          });
          expect(user.id).toBeDefined();
          expect(user.email).toBe('test@example.com');
        });

        it('should throw on duplicate email', async () => {
          await service.createUser({ email: 'test@example.com', name: 'Test' });
          await expect(
            service.createUser({ email: 'test@example.com', name: 'Test2' })
          ).rejects.toThrow('Email already exists');
        });
      });
    `;

    it('Benchmark: Pattern extraction from code', async () => {
      const result = await BenchmarkRunner.run(
        'Pattern Extraction',
        async () => {
          await patternExtractor.extractPatterns(sampleCode, {
            framework: 'jest',
            language: 'typescript'
          });
        },
        100
      );

      BenchmarkRunner.printResult(result);

      expect(result.avgDuration).toBeLessThan(100);
      expect(result.throughput).toBeGreaterThan(10);
    });

    it('Benchmark: Large file extraction (1000 lines)', async () => {
      const largeCode = Array.from({ length: 50 }, (_, i) => `
        describe('Feature ${i}', () => {
          it('test ${i}a', () => { expect(true).toBe(true); });
          it('test ${i}b', () => { expect(1 + 1).toBe(2); });
          it('test ${i}c', async () => {
            const result = await fetchData();
            expect(result).toBeDefined();
          });
        });
      `).join('\n');

      const result = await BenchmarkRunner.run(
        'Large File Extraction (1000 lines)',
        async () => {
          await patternExtractor.extractPatterns(largeCode, {
            framework: 'jest',
            language: 'typescript'
          });
        },
        20
      );

      BenchmarkRunner.printResult(result);

      expect(result.avgDuration).toBeLessThan(500);
    });

    it('Benchmark: Batch extraction (100 files)', async () => {
      const files = Array.from({ length: 100 }, (_, i) => ({
        code: sampleCode,
        options: { framework: 'jest' as const, language: 'typescript' as const }
      }));

      const start = performance.now();

      for (const file of files) {
        await patternExtractor.extractPatterns(file.code, file.options);
      }

      const duration = performance.now() - start;
      const throughput = (files.length / duration) * 1000;

      console.log(`\n━━━ Batch Pattern Extraction (100 files) ━━━`);
      console.log(`Total: ${duration.toFixed(2)}ms`);
      console.log(`Average per file: ${(duration / files.length).toFixed(2)}ms`);
      console.log(`Throughput: ${throughput.toFixed(1)} files/sec`);

      // Should complete in <5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });

  // ===========================================================================
  // Memory Benchmarks
  // ===========================================================================

  describe('Memory Benchmarks', () => {
    it('Benchmark: Memory usage under load', async () => {
      if (global.gc) global.gc();

      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate typical workload
      // 500 patterns + 1000 learning records + 100 extractions

      for (let i = 0; i < 500; i++) {
        await reasoningBank.storePattern({
          id: `mem-${i}`,
          name: `Pattern ${i}`,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: 'Memory test',
          template: '...',
          applicability: { complexity: 'medium', context: [], constraints: [] },
          metrics: {
            successRate: 0.8,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: [],
          metadata: {}
        });
      }

      for (let i = 0; i < 1000; i++) {
        await learningEngine.recordOutcome({
          id: `mem-rec-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.85,
          edgeCasesCaught: 6,
          feedback: { quality: 0.8, relevance: 0.85 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
      }

      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024);

      console.log(`\n━━━ Memory Usage ━━━`);
      console.log(`Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Final: ${(finalMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Increase: ${memoryIncrease.toFixed(2)}MB`);

      // Should be <100MB for typical workload
      expect(memoryIncrease).toBeLessThan(100);
    });
  });

  // ===========================================================================
  // End-to-End Benchmarks
  // ===========================================================================

  describe('End-to-End Benchmarks', () => {
    it('Benchmark: Complete workflow (extract → store → retrieve → learn)', async () => {
      const sampleCode = `
        describe('API', () => {
          it('should handle requests', async () => {
            const response = await api.get('/users');
            expect(response.status).toBe(200);
          });
        });
      `;

      const result = await BenchmarkRunner.run(
        'Complete Workflow',
        async () => {
          // 1. Extract patterns
          const patterns = await patternExtractor.extractPatterns(sampleCode, {
            framework: 'jest',
            language: 'typescript'
          });

          // 2. Store patterns
          for (const pattern of patterns) {
            await reasoningBank.storePattern({
              id: `e2e-${Date.now()}-${Math.random()}`,
              name: pattern.name,
              category: 'unit',
              framework: 'jest',
              language: 'typescript',
              description: pattern.description,
              template: pattern.template || '',
              applicability: { complexity: 'medium', context: [], constraints: [] },
              metrics: {
                successRate: 0.9,
                usageCount: 0,
                averageQuality: 0,
                lastUsed: new Date()
              },
              tags: pattern.tags || [],
              metadata: {}
            });
          }

          // 3. Retrieve patterns
          await reasoningBank.findMatchingPatterns({
            framework: 'jest',
            language: 'typescript',
            limit: 5
          });

          // 4. Record learning
          await learningEngine.recordOutcome({
            id: `e2e-${Date.now()}`,
            timestamp: new Date(),
            testId: 'e2e-test',
            testName: 'E2E Test',
            outcome: 'success',
            executionTime: 100,
            coverage: 0.9,
            edgeCasesCaught: 6,
            feedback: { quality: 0.85, relevance: 0.9 },
            metadata: {
              framework: 'jest',
              language: 'typescript',
              complexity: 2,
              linesOfCode: 100
            }
          });
        },
        50
      );

      BenchmarkRunner.printResult(result);

      // Complete workflow should be fast
      expect(result.avgDuration).toBeLessThan(200);
      expect(result.p95).toBeLessThan(500);
    });
  });
});
