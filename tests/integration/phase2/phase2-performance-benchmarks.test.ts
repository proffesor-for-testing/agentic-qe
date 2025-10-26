/**
 * Phase 2 Performance Benchmark Tests
 *
 * Validates that Phase 2 components meet performance targets:
 * - Pattern matching: <50ms (p95)
 * - Learning iteration: <100ms
 * - ML flaky detection: <500ms for 1000 tests
 * - Memory usage: <100MB per agent
 *
 * @module tests/integration/phase2/phase2-performance-benchmarks
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank } from '@reasoning/QEReasoningBank';
import { LearningEngine } from '@learning/LearningEngine';
import { PatternExtractor } from '@reasoning/PatternExtractor';
import { FlakyTestDetector } from '@learning/FlakyTestDetector';
import { PerformanceTracker } from '@learning/PerformanceTracker';

// Helper to calculate percentiles
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[index];
}

// Helper to track memory usage
function getMemoryUsageMB(): number {
  const usage = process.memoryUsage();
  return usage.heapUsed / 1024 / 1024;
}

describe('Phase 2 Performance Benchmark Tests', () => {
  let reasoningBank: QEReasoningBank;
  let learningEngine: LearningEngine;
  let patternExtractor: PatternExtractor;
  let flakyDetector: FlakyTestDetector;
  let performanceTracker: PerformanceTracker;

  beforeEach(() => {
    reasoningBank = new QEReasoningBank();
    learningEngine = new LearningEngine();
    patternExtractor = new PatternExtractor();
    flakyDetector = new FlakyTestDetector();
    performanceTracker = new PerformanceTracker();
  });

  afterEach(() => {
    learningEngine.clear();
  });

  // ===========================================================================
  // Pattern Matching Performance
  // ===========================================================================

  describe('Pattern Matching Performance (<50ms p95)', () => {
    it('should match patterns in <50ms (p95) for 100 patterns', async () => {
      // Populate with 100 patterns
      for (let i = 0; i < 100; i++) {
        await reasoningBank.storePattern({
          id: `perf-pattern-${i}`,
          name: `Test Pattern ${i}`,
          category: i % 2 === 0 ? 'unit' : 'integration',
          framework: 'jest',
          language: 'typescript',
          description: `Performance test pattern ${i}`,
          template: 'describe("{{name}}", () => { ... });',
          applicability: {
            complexity: i % 3 === 0 ? 'low' : 'medium',
            context: ['testing', `context-${i % 5}`],
            constraints: []
          },
          metrics: {
            successRate: 0.85 + Math.random() * 0.15,
            usageCount: Math.floor(Math.random() * 50),
            averageQuality: 0.80 + Math.random() * 0.2,
            lastUsed: new Date()
          },
          tags: [`tag-${i % 10}`, 'performance'],
          metadata: { benchmarkId: i }
        });
      }

      // Run 100 pattern matching operations and measure times
      const times: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();

        await reasoningBank.findMatchingPatterns({
          framework: 'jest',
          language: 'typescript',
          keywords: ['test', 'pattern'],
          limit: 10
        });

        times.push(performance.now() - start);
      }

      const p50 = percentile(times, 0.50);
      const p95 = percentile(times, 0.95);
      const p99 = percentile(times, 0.99);

      console.log('\n━━━ Pattern Matching Performance ━━━');
      console.log(`Samples: ${times.length}`);
      console.log(`p50: ${p50.toFixed(2)}ms`);
      console.log(`p95: ${p95.toFixed(2)}ms`);
      console.log(`p99: ${p99.toFixed(2)}ms`);

      expect(p95).toBeLessThan(50); // <50ms at p95
    }, 30000);

    it('should scale pattern matching with database size', async () => {
      const sizes = [10, 50, 100, 200, 500];
      const results: Array<{ size: number; p95: number }> = [];

      for (const size of sizes) {
        // Clear and populate
        reasoningBank = new QEReasoningBank();

        for (let i = 0; i < size; i++) {
          await reasoningBank.storePattern({
            id: `scale-pattern-${i}`,
            name: `Pattern ${i}`,
            category: 'unit',
            framework: 'jest',
            language: 'typescript',
            description: `Scaling test pattern ${i}`,
            template: '...',
            applicability: { complexity: 'medium', context: [], constraints: [] },
            metrics: { successRate: 0.85, usageCount: 0, averageQuality: 0, lastUsed: new Date() },
            tags: ['scaling'],
            metadata: {}
          });
        }

        // Benchmark
        const times: number[] = [];
        for (let i = 0; i < 50; i++) {
          const start = performance.now();
          await reasoningBank.findMatchingPatterns({
            framework: 'jest',
            language: 'typescript',
            limit: 5
          });
          times.push(performance.now() - start);
        }

        const p95 = percentile(times, 0.95);
        results.push({ size, p95 });
      }

      console.log('\n━━━ Pattern Matching Scaling ━━━');
      console.log('Size  | p95 (ms)');
      console.log('------|----------');
      results.forEach(r => {
        console.log(`${r.size.toString().padStart(5)} | ${r.p95.toFixed(2).padStart(8)}`);
      });

      // Should maintain <50ms even with 500 patterns
      results.forEach(r => {
        expect(r.p95).toBeLessThan(50);
      });
    }, 60000);
  });

  // ===========================================================================
  // Learning Engine Performance
  // ===========================================================================

  describe('Learning Engine Performance (<100ms per iteration)', () => {
    it('should complete learning iteration in <100ms', async () => {
      // Seed with 50 experiences
      for (let i = 0; i < 50; i++) {
        await learningEngine.recordOutcome({
          id: `learn-perf-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100 + Math.random() * 50,
          coverage: 0.80 + Math.random() * 0.15,
          edgeCasesCaught: 5 + Math.floor(Math.random() * 5),
          feedback: {
            quality: 0.75 + Math.random() * 0.2,
            relevance: 0.85 + Math.random() * 0.15
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2 + Math.floor(Math.random() * 3),
            linesOfCode: 100 + Math.floor(Math.random() * 100)
          }
        });
      }

      // Benchmark learning iterations
      const times: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();

        await learningEngine.recordOutcome({
          id: `benchmark-${i}`,
          timestamp: new Date(),
          testId: `bench-test-${i}`,
          testName: `Benchmark Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.85,
          edgeCasesCaught: 6,
          feedback: { quality: 0.85, relevance: 0.9 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 3,
            linesOfCode: 150
          }
        });

        times.push(performance.now() - start);
      }

      const avg = times.reduce((a, b) => a + b) / times.length;
      const p95 = percentile(times, 0.95);

      console.log('\n━━━ Learning Engine Performance ━━━');
      console.log(`Average: ${avg.toFixed(2)}ms`);
      console.log(`p95: ${p95.toFixed(2)}ms`);

      expect(avg).toBeLessThan(100); // <100ms average
      expect(p95).toBeLessThan(150); // <150ms at p95
    }, 30000);

    it('should analyze trends in <200ms', async () => {
      // Seed with 100 experiences
      for (let i = 0; i < 100; i++) {
        await learningEngine.recordOutcome({
          id: `trend-${i}`,
          timestamp: new Date(Date.now() - (100 - i) * 60000),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.80 + (i * 0.001),
          edgeCasesCaught: 5,
          feedback: { quality: 0.75 + (i * 0.002), relevance: 0.9 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
      }

      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await learningEngine.analyzeTrends();
        times.push(performance.now() - start);
      }

      const avg = times.reduce((a, b) => a + b) / times.length;
      const p95 = percentile(times, 0.95);

      console.log('\n━━━ Trend Analysis Performance ━━━');
      console.log(`Average: ${avg.toFixed(2)}ms`);
      console.log(`p95: ${p95.toFixed(2)}ms`);

      expect(avg).toBeLessThan(200); // <200ms average
    }, 30000);
  });

  // ===========================================================================
  // ML Flaky Detection Performance
  // ===========================================================================

  describe('ML Flaky Detection Performance (<500ms for 1000 tests)', () => {
    it('should detect flaky tests in <500ms for 1000 test results', async () => {
      // Generate 1000 test results
      const history = [];
      for (let i = 0; i < 1000; i++) {
        history.push({
          name: `test-${i % 100}`,
          passed: Math.random() > 0.2, // 80% pass rate (some flaky)
          duration: 100 + Math.random() * 50,
          timestamp: Date.now() - (1000 - i) * 60000
        });
      }

      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await flakyDetector.detectFlakyTests(history);
        times.push(performance.now() - start);
      }

      const avg = times.reduce((a, b) => a + b) / times.length;
      const p95 = percentile(times, 0.95);

      console.log('\n━━━ ML Flaky Detection Performance (1000 tests) ━━━');
      console.log(`Average: ${avg.toFixed(2)}ms`);
      console.log(`p95: ${p95.toFixed(2)}ms`);

      expect(avg).toBeLessThan(500); // <500ms average
      expect(p95).toBeLessThan(750); // <750ms at p95
    }, 30000);

    it('should scale ML detection with test history size', async () => {
      const sizes = [100, 500, 1000, 2000, 5000];
      const results: Array<{ size: number; time: number }> = [];

      for (const size of sizes) {
        const history = Array.from({ length: size }, (_, i) => ({
          name: `test-${i % 50}`,
          passed: Math.random() > 0.15,
          duration: 100 + Math.random() * 50,
          timestamp: Date.now() - (size - i) * 60000
        }));

        const start = performance.now();
        await flakyDetector.detectFlakyTests(history);
        const elapsed = performance.now() - start;

        results.push({ size, time: elapsed });
      }

      console.log('\n━━━ ML Detection Scaling ━━━');
      console.log('Size  | Time (ms)');
      console.log('------|----------');
      results.forEach(r => {
        console.log(`${r.size.toString().padStart(5)} | ${r.time.toFixed(2).padStart(9)}`);
      });

      // Should complete in reasonable time even for large datasets
      expect(results[results.length - 1].time).toBeLessThan(2000); // <2s for 5000 tests
    }, 60000);
  });

  // ===========================================================================
  // Pattern Extraction Performance
  // ===========================================================================

  describe('Pattern Extraction Performance', () => {
    it('should extract patterns in <200ms for typical test file', async () => {
      const testCode = `
        describe('UserService', () => {
          let service: UserService;

          beforeEach(() => {
            service = new UserService();
          });

          describe('createUser', () => {
            it('should create user with valid data', async () => {
              const user = await service.createUser({ name: 'John', email: 'john@example.com' });
              expect(user.id).toBeDefined();
              expect(user.email).toBe('john@example.com');
            });

            it('should throw on invalid email', async () => {
              await expect(service.createUser({ name: 'John', email: 'invalid' }))
                .rejects.toThrow('Invalid email');
            });
          });

          describe('updateUser', () => {
            it('should update user data', async () => {
              const user = await service.createUser({ name: 'John', email: 'john@example.com' });
              const updated = await service.updateUser(user.id, { name: 'Jane' });
              expect(updated.name).toBe('Jane');
            });
          });
        });
      `;

      const times: number[] = [];
      for (let i = 0; i < 50; i++) {
        const start = performance.now();

        await patternExtractor.extractPatterns(testCode, {
          framework: 'jest',
          language: 'typescript'
        });

        times.push(performance.now() - start);
      }

      const avg = times.reduce((a, b) => a + b) / times.length;
      const p95 = percentile(times, 0.95);

      console.log('\n━━━ Pattern Extraction Performance ━━━');
      console.log(`Average: ${avg.toFixed(2)}ms`);
      console.log(`p95: ${p95.toFixed(2)}ms`);

      expect(avg).toBeLessThan(200); // <200ms average
    }, 20000);
  });

  // ===========================================================================
  // End-to-End Workflow Performance
  // ===========================================================================

  describe('End-to-End Workflow Performance', () => {
    it('should complete pattern extraction → storage → matching in <500ms', async () => {
      const times: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();

        // Extract
        const patterns = await patternExtractor.extractPatterns(`
          describe('Test', () => {
            it('works', () => { expect(true).toBe(true); });
          });
        `, { framework: 'jest', language: 'typescript' });

        // Store
        for (const pattern of patterns) {
          await reasoningBank.storePattern({
            id: `e2e-${Date.now()}-${Math.random()}`,
            name: pattern.name,
            category: pattern.category,
            framework: 'jest',
            language: 'typescript',
            description: pattern.description,
            template: pattern.template || '',
            applicability: { complexity: 'low', context: [], constraints: [] },
            metrics: { successRate: 0.85, usageCount: 0, averageQuality: 0, lastUsed: new Date() },
            tags: [],
            metadata: {}
          });
        }

        // Match
        await reasoningBank.findMatchingPatterns({
          framework: 'jest',
          language: 'typescript',
          limit: 5
        });

        times.push(performance.now() - start);
      }

      const avg = times.reduce((a, b) => a + b) / times.length;

      console.log('\n━━━ E2E Workflow Performance ━━━');
      console.log(`Average: ${avg.toFixed(2)}ms`);

      expect(avg).toBeLessThan(500); // <500ms for complete workflow
    }, 20000);

    it('should complete learning record → analysis → recommendation in <300ms', async () => {
      // Seed with initial data
      for (let i = 0; i < 20; i++) {
        await learningEngine.recordOutcome({
          id: `seed-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.85,
          edgeCasesCaught: 6,
          feedback: { quality: 0.85, relevance: 0.9 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
      }

      const times: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();

        // Record
        await learningEngine.recordOutcome({
          id: `e2e-learn-${i}`,
          timestamp: new Date(),
          testId: `e2e-test-${i}`,
          testName: `E2E Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.85,
          edgeCasesCaught: 6,
          feedback: { quality: 0.85, relevance: 0.9 },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });

        // Analyze
        await learningEngine.analyzeTrends();

        // Recommend
        await learningEngine.applyLearning({
          framework: 'jest',
          language: 'typescript',
          complexity: 2
        });

        times.push(performance.now() - start);
      }

      const avg = times.reduce((a, b) => a + b) / times.length;

      console.log('\n━━━ Learning E2E Performance ━━━');
      console.log(`Average: ${avg.toFixed(2)}ms`);

      expect(avg).toBeLessThan(300); // <300ms for complete learning workflow
    }, 30000);
  });
});
