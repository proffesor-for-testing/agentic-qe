/**
 * Pattern Bank Performance Benchmarks
 *
 * Validates performance claims:
 * - Pattern matching: <50ms p95
 * - Vector similarity: Fast computation
 * - Registry load/save: Efficient I/O
 * - Memory usage: Handles 10k+ patterns
 *
 * @module tests/reasoning/performance
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank, TestPattern } from '../../src/reasoning/QEReasoningBank';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

interface PerformanceMeasurement {
  operation: string;
  measurements: number[];
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
}

describe('Pattern Bank Performance', () => {
  let reasoningBank: QEReasoningBank;
  let tempDir: string;

  beforeEach(async () => {
    reasoningBank = new QEReasoningBank();
    tempDir = path.join(tmpdir(), `perf-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('Pattern Matching Performance', () => {
    beforeEach(async () => {
      // Seed 1000 patterns for realistic testing
      const patterns = generatePatterns(1000);
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }
    });

    it('should match patterns in <50ms (p95)', async () => {
      const measurements: number[] = [];

      // Run 100 matching operations
      for (let i = 0; i < 100; i++) {
        const start = performance.now();

        await reasoningBank.findMatchingPatterns({
          codeType: 'test',
          framework: 'jest',
          keywords: ['api', 'unit', 'controller']
        }, 10);

        const duration = performance.now() - start;
        measurements.push(duration);
      }

      const stats = calculatePercentiles(measurements);

      console.log(`Pattern Matching Performance:
  Mean: ${stats.mean.toFixed(2)}ms
  P50: ${stats.p50.toFixed(2)}ms
  P95: ${stats.p95.toFixed(2)}ms
  P99: ${stats.p99.toFixed(2)}ms
  Min: ${stats.min.toFixed(2)}ms
  Max: ${stats.max.toFixed(2)}ms`);

      expect(stats.p95).toBeLessThan(50);
      expect(stats.mean).toBeLessThan(30);
    });

    it('should retrieve patterns by ID in <5ms (p95)', async () => {
      const measurements: number[] = [];
      const patternIds = Array.from({ length: 100 }, (_, i) => `pattern-${i}`);

      for (const id of patternIds) {
        const start = performance.now();
        await reasoningBank.getPattern(id);
        const duration = performance.now() - start;
        measurements.push(duration);
      }

      const stats = calculatePercentiles(measurements);

      console.log(`Pattern Retrieval Performance:
  Mean: ${stats.mean.toFixed(2)}ms
  P95: ${stats.p95.toFixed(2)}ms`);

      expect(stats.p95).toBeLessThan(5);
    });

    it('should handle concurrent pattern searches efficiently', async () => {
      const start = performance.now();

      // Run 10 concurrent searches
      const searches = Array.from({ length: 10 }, (_, i) =>
        reasoningBank.findMatchingPatterns({
          codeType: 'test',
          framework: 'jest',
          keywords: [`keyword-${i}`]
        }, 5)
      );

      await Promise.all(searches);

      const totalDuration = performance.now() - start;

      console.log(`Concurrent Searches Duration: ${totalDuration.toFixed(2)}ms`);

      // Should complete in reasonable time
      expect(totalDuration).toBeLessThan(500);
    });

    it('should scale linearly with result limit', async () => {
      const limits = [5, 10, 20, 50];
      const timings: Record<number, number> = {};

      for (const limit of limits) {
        const measurements: number[] = [];

        for (let i = 0; i < 10; i++) {
          const start = performance.now();

          await reasoningBank.findMatchingPatterns({
            codeType: 'test',
            framework: 'jest'
          }, limit);

          measurements.push(performance.now() - start);
        }

        timings[limit] = calculatePercentiles(measurements).mean;
      }

      console.log('Scaling with result limit:', timings);

      // Should scale reasonably (not exponentially)
      expect(timings[50]).toBeLessThan(timings[5] * 5);
    });
  });

  describe('Vector Similarity Performance', () => {
    beforeEach(async () => {
      const patterns = generatePatterns(500);
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }
    });

    it('should calculate similarity fast', async () => {
      const pattern1 = await reasoningBank.getPattern('pattern-0');
      const pattern2 = await reasoningBank.getPattern('pattern-1');

      expect(pattern1).not.toBeNull();
      expect(pattern2).not.toBeNull();

      const measurements: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        reasoningBank.calculateSimilarity(pattern1!, pattern2!);
        measurements.push(performance.now() - start);
      }

      const stats = calculatePercentiles(measurements);

      console.log(`Similarity Calculation Performance:
  Mean: ${stats.mean.toFixed(3)}ms
  P95: ${stats.p95.toFixed(3)}ms`);

      expect(stats.p95).toBeLessThan(1);
    });

    it('should search similar patterns efficiently', async () => {
      const referencePattern = await reasoningBank.getPattern('pattern-0');
      expect(referencePattern).not.toBeNull();

      const measurements: number[] = [];

      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await reasoningBank.searchSimilarPatterns(referencePattern!, 5);
        measurements.push(performance.now() - start);
      }

      const stats = calculatePercentiles(measurements);

      console.log(`Similar Pattern Search Performance:
  Mean: ${stats.mean.toFixed(2)}ms
  P95: ${stats.p95.toFixed(2)}ms`);

      expect(stats.p95).toBeLessThan(50);
    });
  });

  describe('Registry Load/Save Performance', () => {
    it('should save 1000 patterns quickly', async () => {
      const patterns = generatePatterns(1000);
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      const registryPath = path.join(tempDir, 'perf-registry.json');

      const start = performance.now();
      await reasoningBank.saveToRegistry(registryPath);
      const duration = performance.now() - start;

      console.log(`Save 1000 patterns: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(500);
    });

    it('should load 1000 patterns quickly', async () => {
      // First save patterns
      const patterns = generatePatterns(1000);
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      const registryPath = path.join(tempDir, 'load-test.json');
      await reasoningBank.saveToRegistry(registryPath);

      // Now test loading
      const freshBank = new QEReasoningBank();

      const start = performance.now();
      await freshBank.loadFromRegistry(registryPath);
      const duration = performance.now() - start;

      console.log(`Load 1000 patterns: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(1000);
    });

    it('should handle large registry files efficiently', async () => {
      const patterns = generatePatterns(5000);
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      const registryPath = path.join(tempDir, 'large-registry.json');

      const saveStart = performance.now();
      await reasoningBank.saveToRegistry(registryPath);
      const saveDuration = performance.now() - saveStart;

      const freshBank = new QEReasoningBank();
      const loadStart = performance.now();
      await freshBank.loadFromRegistry(registryPath);
      const loadDuration = performance.now() - loadStart;

      console.log(`Large Registry (5000 patterns):
  Save: ${saveDuration.toFixed(2)}ms
  Load: ${loadDuration.toFixed(2)}ms`);

      expect(saveDuration).toBeLessThan(2000);
      expect(loadDuration).toBeLessThan(3000);
    });
  });

  describe('Memory Usage', () => {
    it('should handle 10k+ patterns without memory issues', async () => {
      const patternCount = 10000;
      const batchSize = 500;

      const startMemory = process.memoryUsage().heapUsed;

      // Add patterns in batches
      for (let batch = 0; batch < patternCount / batchSize; batch++) {
        const patterns = generatePatterns(batchSize, batch * batchSize);

        for (const pattern of patterns) {
          await reasoningBank.storePattern(pattern);
        }

        // Allow GC to run
        if (global.gc) {
          global.gc();
        }
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (endMemory - startMemory) / 1024 / 1024; // MB

      console.log(`Memory Usage for 10k patterns: ${memoryIncrease.toFixed(2)}MB`);

      const stats = await reasoningBank.getStatistics();
      expect(stats.totalPatterns).toBe(patternCount);

      // Should use reasonable memory (< 100MB for 10k patterns)
      expect(memoryIncrease).toBeLessThan(100);
    });

    it('should not leak memory during repeated operations', async () => {
      const patterns = generatePatterns(100);
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      if (global.gc) {
        global.gc();
      }

      const startMemory = process.memoryUsage().heapUsed;

      // Perform 1000 operations
      for (let i = 0; i < 1000; i++) {
        await reasoningBank.findMatchingPatterns({
          codeType: 'test',
          framework: 'jest'
        }, 10);

        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      if (global.gc) {
        global.gc();
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (endMemory - startMemory) / 1024 / 1024;

      console.log(`Memory leak test: ${memoryIncrease.toFixed(2)}MB increase`);

      // Should not significantly increase memory
      expect(memoryIncrease).toBeLessThan(10);
    });
  });

  describe('Tag Search Performance', () => {
    beforeEach(async () => {
      const patterns = generatePatterns(1000);
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }
    });

    it('should search by tags in <50ms (p95)', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await reasoningBank.searchByTags(['api', 'unit']);
        measurements.push(performance.now() - start);
      }

      const stats = calculatePercentiles(measurements);

      console.log(`Tag Search Performance:
  Mean: ${stats.mean.toFixed(2)}ms
  P95: ${stats.p95.toFixed(2)}ms`);

      expect(stats.p95).toBeLessThan(50);
    });

    it('should handle complex tag queries efficiently', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await reasoningBank.searchByTags(['api', 'unit', 'controller', 'rest', 'validation']);
        measurements.push(performance.now() - start);
      }

      const stats = calculatePercentiles(measurements);

      console.log(`Complex Tag Query Performance:
  Mean: ${stats.mean.toFixed(2)}ms
  P95: ${stats.p95.toFixed(2)}ms`);

      expect(stats.p95).toBeLessThan(50);
    });
  });

  describe('Statistics Calculation Performance', () => {
    it('should calculate statistics quickly for large datasets', async () => {
      const patterns = generatePatterns(5000);
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }

      const measurements: number[] = [];

      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await reasoningBank.getStatistics();
        measurements.push(performance.now() - start);
      }

      const stats = calculatePercentiles(measurements);

      console.log(`Statistics Calculation (5000 patterns):
  Mean: ${stats.mean.toFixed(2)}ms
  P95: ${stats.p95.toFixed(2)}ms`);

      expect(stats.p95).toBeLessThan(20);
    });
  });
});

/**
 * Generate test patterns for performance testing
 */
function generatePatterns(count: number, startIndex: number = 0): TestPattern[] {
  const patterns: TestPattern[] = [];
  const frameworks: Array<'jest' | 'mocha' | 'vitest' | 'playwright' | 'cypress' | 'jasmine' | 'ava'> =
    ['jest', 'mocha', 'vitest', 'playwright'];
  const languages: Array<'typescript' | 'javascript' | 'python'> = ['typescript', 'javascript'];
  const tagSets = [
    ['api', 'unit', 'controller'],
    ['integration', 'database', 'repository'],
    ['e2e', 'browser', 'ui'],
    ['performance', 'load', 'stress'],
    ['security', 'auth', 'validation']
  ];

  for (let i = startIndex; i < startIndex + count; i++) {
    const framework = frameworks[i % frameworks.length];
    const language = languages[i % languages.length];
    const tags = tagSets[i % tagSets.length];

    patterns.push({
      id: `pattern-${i}`,
      name: `Test Pattern ${i}`,
      description: `Performance test pattern ${i}`,
      category: i % 2 === 0 ? 'unit' : 'integration',
      framework,
      language,
      template: `template-${i}`,
      examples: [`example-${i}`, `example-${i}-2`],
      confidence: 0.7 + Math.random() * 0.3,
      usageCount: Math.floor(Math.random() * 100),
      successRate: 0.6 + Math.random() * 0.4,
      metadata: {
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        version: '1.0.0',
        tags
      }
    });
  }

  return patterns;
}

/**
 * Calculate percentiles from measurements
 */
function calculatePercentiles(measurements: number[]): {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
} {
  const sorted = [...measurements].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    p50: sorted[Math.floor(len * 0.5)],
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)],
    mean: measurements.reduce((sum, val) => sum + val, 0) / len,
    min: sorted[0],
    max: sorted[len - 1]
  };
}
