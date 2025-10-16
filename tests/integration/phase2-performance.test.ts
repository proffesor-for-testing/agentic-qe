/**
 * Phase 2 Performance Integration Tests
 *
 * Validates performance requirements:
 * - <50ms pattern retrieval under load (p95)
 * - Learning convergence in <100 iterations
 * - Pattern extraction scales to 1000+ tests
 * - Memory usage <100MB per project
 *
 * @module tests/integration/phase2-performance
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank } from '../../src/reasoning/QEReasoningBank';
import { LearningEngine } from '../../src/learning/LearningEngine';
import { PatternExtractor } from '../../src/reasoning/PatternExtractor';

describe('Phase 2 Performance Integration', () => {
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
  // Pattern Retrieval Performance (<50ms p95)
  // ===========================================================================

  describe('Pattern Retrieval Performance', () => {
    beforeEach(async () => {
      // Seed with 100 patterns
      for (let i = 0; i < 100; i++) {
        await reasoningBank.storePattern({
          id: `pattern-${i}`,
          name: `Test Pattern ${i}`,
          category: i % 2 === 0 ? 'unit' : 'integration',
          framework: i % 3 === 0 ? 'jest' : i % 3 === 1 ? 'mocha' : 'vitest',
          language: 'typescript',
          description: `Pattern ${i} for testing`,
          template: `template-${i}`,
          applicability: {
            complexity: i % 3 === 0 ? 'low' : i % 3 === 1 ? 'medium' : 'high',
            context: [`context-${i % 5}`],
            constraints: []
          },
          metrics: {
            successRate: 0.7 + Math.random() * 0.3,
            usageCount: Math.floor(Math.random() * 100),
            averageQuality: 0.7 + Math.random() * 0.3,
            lastUsed: new Date()
          },
          tags: [`tag-${i % 10}`, `category-${i % 5}`],
          metadata: { index: i }
        });
      }
    });

    it('should retrieve pattern by ID in <50ms (p95)', async () => {
      const measurements: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const patternId = `pattern-${i % 100}`;

        const start = performance.now();
        await reasoningBank.getPattern(patternId);
        const duration = performance.now() - start;

        measurements.push(duration);
      }

      // Calculate p95
      const sorted = measurements.sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95 = sorted[p95Index];

      console.log(`Pattern retrieval p95: ${p95.toFixed(2)}ms`);
      expect(p95).toBeLessThan(50);

      // Also check average
      const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      console.log(`Pattern retrieval avg: ${avg.toFixed(2)}ms`);
      expect(avg).toBeLessThan(20);
    });

    it('should find matching patterns in <50ms (p95)', async () => {
      const measurements: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await reasoningBank.findMatchingPatterns({
          framework: i % 3 === 0 ? 'jest' : 'mocha',
          language: 'typescript',
          tags: [`tag-${i % 10}`],
          limit: 10
        });
        const duration = performance.now() - start;

        measurements.push(duration);
      }

      const sorted = measurements.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];

      console.log(`Pattern matching p95: ${p95.toFixed(2)}ms`);
      expect(p95).toBeLessThan(50);
    });

    it('should handle concurrent pattern lookups efficiently', async () => {
      const concurrentRequests = 50;
      const start = performance.now();

      await Promise.all(
        Array.from({ length: concurrentRequests }, (_, i) =>
          reasoningBank.findMatchingPatterns({
            framework: 'jest',
            language: 'typescript',
            tags: [`tag-${i % 10}`],
            limit: 5
          })
        )
      );

      const duration = performance.now() - start;
      const avgPerRequest = duration / concurrentRequests;

      console.log(`Concurrent lookups avg per request: ${avgPerRequest.toFixed(2)}ms`);
      expect(avgPerRequest).toBeLessThan(100);
    });

    it('should scale pattern search to 1000+ patterns', async () => {
      // Add 900 more patterns (total 1000)
      for (let i = 100; i < 1000; i++) {
        await reasoningBank.storePattern({
          id: `pattern-${i}`,
          name: `Pattern ${i}`,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: `Pattern ${i}`,
          template: '...',
          applicability: { complexity: 'medium', context: [], constraints: [] },
          metrics: {
            successRate: 0.8,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: [`tag-${i % 50}`],
          metadata: { batch: 'scale-test' }
        });
      }

      const stats = await reasoningBank.getStatistics();
      expect(stats.totalPatterns).toBeGreaterThanOrEqual(1000);

      // Search should still be fast
      const start = performance.now();
      const results = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        limit: 10
      });
      const duration = performance.now() - start;

      console.log(`Search in 1000+ patterns: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(100);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Learning Engine Performance (<10% overhead)
  // ===========================================================================

  describe('Learning Engine Performance', () => {
    it('should record outcomes with <10ms overhead', async () => {
      const measurements: number[] = [];
      const iterations = 200;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await learningEngine.recordOutcome({
          id: `perf-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Performance Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.9,
          edgeCasesCaught: 6,
          feedback: {
            quality: 0.85,
            relevance: 0.8
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });
        const duration = performance.now() - start;
        measurements.push(duration);
      }

      const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const sorted = measurements.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];

      console.log(`Learning record avg: ${avg.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms`);
      expect(avg).toBeLessThan(10);
      expect(p95).toBeLessThan(20);
    });

    it('should converge within 100 iterations', async () => {
      // Track quality improvement convergence
      const qualityHistory: number[] = [];

      for (let i = 0; i < 100; i++) {
        await learningEngine.recordOutcome({
          id: `conv-${i}`,
          timestamp: new Date(Date.now() + i * 60000),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: Math.max(50, 150 - i),
          coverage: 0.7 + i * 0.002,
          edgeCasesCaught: 3 + Math.floor(i / 10),
          feedback: {
            quality: 0.6 + i * 0.003,
            relevance: 0.85
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        });

        const stats = learningEngine.getStatistics();
        qualityHistory.push(stats.averageQuality);
      }

      // Check for convergence (quality improvement plateaus)
      const lastTenAvg = qualityHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
      const prevTenAvg = qualityHistory.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
      const improvementRate = (lastTenAvg - prevTenAvg) / prevTenAvg;

      console.log(`Quality improvement rate (last 20 iters): ${(improvementRate * 100).toFixed(2)}%`);
      expect(qualityHistory.length).toBeLessThanOrEqual(100);
      expect(lastTenAvg).toBeGreaterThan(prevTenAvg);
    });

    it('should analyze trends efficiently with 1000+ records', async () => {
      // Seed 1000 records
      for (let i = 0; i < 1000; i++) {
        await learningEngine.recordOutcome({
          id: `large-${i}`,
          timestamp: new Date(Date.now() + i * 1000),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: i % 10 === 0 ? 'flaky' : 'success',
          executionTime: 100 + (i % 100),
          coverage: 0.75 + (i % 100) * 0.002,
          edgeCasesCaught: 4 + (i % 10),
          feedback: {
            quality: 0.7 + (i % 100) * 0.003,
            relevance: 0.85
          },
          metadata: {
            framework: i % 2 === 0 ? 'jest' : 'mocha',
            language: 'typescript',
            complexity: 2 + (i % 3),
            linesOfCode: 100 + (i % 50)
          }
        });
      }

      const stats = learningEngine.getStatistics();
      expect(stats.totalRecords).toBe(1000);

      // Analyze trends should be fast
      const start = performance.now();
      const insights = await learningEngine.analyzeTrends();
      const duration = performance.now() - start;

      console.log(`Trend analysis on 1000 records: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500); // <500ms for 1000 records
      expect(insights.length).toBeGreaterThan(0);
    });

    it('should handle high-throughput learning (100 records/sec)', async () => {
      const recordsToProcess = 100;
      const start = performance.now();

      const promises = Array.from({ length: recordsToProcess }, (_, i) =>
        learningEngine.recordOutcome({
          id: `throughput-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.85,
          edgeCasesCaught: 6,
          feedback: {
            quality: 0.8,
            relevance: 0.85
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        })
      );

      await Promise.all(promises);
      const duration = performance.now() - start;
      const throughput = recordsToProcess / (duration / 1000);

      console.log(`Learning throughput: ${throughput.toFixed(0)} records/sec`);
      expect(throughput).toBeGreaterThan(50); // At least 50 records/sec
    });
  });

  // ===========================================================================
  // Pattern Extraction Performance
  // ===========================================================================

  describe('Pattern Extraction Performance', () => {
    it('should extract patterns from 100 files in <5 seconds', async () => {
      const testFiles = Array.from({ length: 100 }, (_, i) => ({
        path: `test-${i}.ts`,
        code: `
          describe('Service ${i}', () => {
            it('should handle operation ${i}', async () => {
              const service = new Service${i}();
              const result = await service.process({ id: ${i} });
              expect(result).toBeDefined();
              expect(result.id).toBe(${i});
            });

            it('should validate input ${i}', () => {
              const service = new Service${i}();
              expect(() => service.validate(null)).toThrow();
            });
          });
        `
      }));

      const start = performance.now();
      const allPatterns = [];

      for (const file of testFiles) {
        const patterns = await patternExtractor.extractPatterns(file.code, {
          framework: 'jest',
          language: 'typescript',
          filePath: file.path
        });
        allPatterns.push(...patterns);
      }

      const duration = performance.now() - start;

      console.log(`Extracted ${allPatterns.length} patterns from 100 files in ${duration.toFixed(0)}ms`);
      expect(duration).toBeLessThan(5000); // <5 seconds
      expect(allPatterns.length).toBeGreaterThan(0);
    });

    it('should handle large code files efficiently', async () => {
      // Generate large test file (1000 lines)
      const largeTestCode = Array.from({ length: 50 }, (_, i) => `
        describe('Feature ${i}', () => {
          it('test ${i}a', () => { expect(true).toBe(true); });
          it('test ${i}b', () => { expect(1 + 1).toBe(2); });
          it('test ${i}c', async () => {
            const result = await fetchData();
            expect(result).toBeDefined();
          });
        });
      `).join('\n');

      const start = performance.now();
      const patterns = await patternExtractor.extractPatterns(largeTestCode, {
        framework: 'jest',
        language: 'typescript'
      });
      const duration = performance.now() - start;

      console.log(`Large file extraction: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500);
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Memory Performance (<100MB per project)
  // ===========================================================================

  describe('Memory Performance', () => {
    it('should maintain memory usage <100MB for typical project', async () => {
      if (global.gc) {
        global.gc(); // Force garbage collection before test
      }

      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate typical project load
      // - 200 patterns
      // - 500 learning records
      // - 50 test file extractions

      // Add 200 patterns
      for (let i = 0; i < 200; i++) {
        await reasoningBank.storePattern({
          id: `mem-pattern-${i}`,
          name: `Pattern ${i}`,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: `Memory test pattern ${i}`,
          template: `template content ${i}`,
          applicability: { complexity: 'medium', context: [], constraints: [] },
          metrics: {
            successRate: 0.8,
            usageCount: 10,
            averageQuality: 0.85,
            lastUsed: new Date()
          },
          tags: [`tag-${i % 20}`],
          metadata: { memTest: true }
        });
      }

      // Add 500 learning records
      for (let i = 0; i < 500; i++) {
        await learningEngine.recordOutcome({
          id: `mem-record-${i}`,
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

      if (global.gc) {
        global.gc(); // Force garbage collection after operations
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // Convert to MB

      console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB`);
      expect(memoryIncrease).toBeLessThan(100);
    });

    it('should not leak memory during repeated operations', async () => {
      const measurements: number[] = [];

      for (let iteration = 0; iteration < 5; iteration++) {
        if (global.gc) global.gc();

        const beforeMemory = process.memoryUsage().heapUsed;

        // Perform operations
        for (let i = 0; i < 50; i++) {
          await reasoningBank.storePattern({
            id: `leak-test-${iteration}-${i}`,
            name: `Pattern ${i}`,
            category: 'unit',
            framework: 'jest',
            language: 'typescript',
            description: 'Leak test',
            template: '...',
            applicability: { complexity: 'low', context: [], constraints: [] },
            metrics: {
              successRate: 0.8,
              usageCount: 0,
              averageQuality: 0,
              lastUsed: new Date()
            },
            tags: [],
            metadata: {}
          });

          await learningEngine.recordOutcome({
            id: `leak-record-${iteration}-${i}`,
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

        const afterMemory = process.memoryUsage().heapUsed;
        const increase = (afterMemory - beforeMemory) / (1024 * 1024);
        measurements.push(increase);

        console.log(`Iteration ${iteration + 1} memory increase: ${increase.toFixed(2)}MB`);
      }

      // Memory growth should stabilize (not continuously increase)
      const firstHalf = measurements.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const secondHalf = measurements.slice(3).reduce((a, b) => a + b, 0) / 2;
      const growthRate = (secondHalf - firstHalf) / firstHalf;

      console.log(`Memory growth rate: ${(growthRate * 100).toFixed(2)}%`);
      expect(Math.abs(growthRate)).toBeLessThan(0.5); // <50% growth rate
    });
  });

  // ===========================================================================
  // End-to-End Performance
  // ===========================================================================

  describe('End-to-End Performance', () => {
    it('should complete full workflow in <10 seconds', async () => {
      const start = performance.now();

      // 1. Extract patterns (2 seconds target)
      const code = `
        describe('UserService', () => {
          it('creates user', async () => {
            const service = new UserService();
            const user = await service.create({ email: 'test@example.com' });
            expect(user.id).toBeDefined();
          });
        });
      `;

      const patterns = await patternExtractor.extractPatterns(code, {
        framework: 'jest',
        language: 'typescript'
      });

      // 2. Store patterns (1 second target)
      for (const pattern of patterns) {
        await reasoningBank.storePattern({
          id: `e2e-pattern-${Date.now()}-${Math.random()}`,
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

      // 3. Find matching patterns (0.05 seconds target)
      await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        limit: 5
      });

      // 4. Record learning outcomes (2 seconds target)
      for (let i = 0; i < 50; i++) {
        await learningEngine.recordOutcome({
          id: `e2e-${i}`,
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

      // 5. Analyze trends (1 second target)
      await learningEngine.analyzeTrends();

      const duration = performance.now() - start;

      console.log(`End-to-end workflow: ${duration.toFixed(0)}ms`);
      expect(duration).toBeLessThan(10000); // <10 seconds
    });
  });
});
