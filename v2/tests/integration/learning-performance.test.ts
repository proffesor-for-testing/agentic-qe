/**
 * Learning System Performance Integration Tests
 *
 * Tests performance benchmarks for the learning system
 * Based on CRITICAL-LEARNING-SYSTEM-ANALYSIS.md findings
 *
 * Test Coverage:
 * 1. Pattern lookup < 50ms
 * 2. Pattern storage < 25ms
 * 3. Database queries efficient
 * 4. Memory usage reasonable
 * 5. Concurrent operations performance
 * 6. Learning overhead < 100ms
 *
 * **Performance Targets** (from README):
 * - Pattern lookup: < 50ms (p95)
 * - Pattern storage: < 25ms (p95)
 * - Learning overhead: < 100ms per task
 * - Memory usage: < 100MB for 1000+ patterns
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEReasoningBank, TestPattern } from '@reasoning/QEReasoningBank';
import { LearningEngine } from '@learning/LearningEngine';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { Database } from '@utils/Database';
import * as fs from 'fs';
import * as path from 'path';
import { createSeededRandom } from '../../src/utils/SeededRandom';

// Mock Logger
import * as LoggerModule from '@utils/Logger';
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
(LoggerModule.Logger as any).getInstance = jest.fn(() => mockLogger);

describe('Learning System Performance Tests', () => {
  let reasoningBank: QEReasoningBank;
  let learningEngine: LearningEngine;
  let memoryManager: SwarmMemoryManager;
  let database: Database;
  let testDbPath: string;
  const TEST_AGENT_ID = 'perf-test-agent';

  beforeEach(async () => {
    testDbPath = path.join(__dirname, '../temp', `perf-test-${Date.now()}.db`);
    const tempDir = path.dirname(testDbPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    database = new Database(testDbPath);
    await database.initialize();

    // Create patterns table with indexes
    await database.run(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        framework TEXT NOT NULL,
        language TEXT NOT NULL,
        template TEXT NOT NULL,
        examples TEXT,
        confidence REAL NOT NULL,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        quality REAL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add performance indexes
    await database.run('CREATE INDEX IF NOT EXISTS idx_framework ON patterns(framework)');
    await database.run('CREATE INDEX IF NOT EXISTS idx_category ON patterns(category)');
    await database.run('CREATE INDEX IF NOT EXISTS idx_quality ON patterns(quality)');

    reasoningBank = new QEReasoningBank({ minQuality: 0.6 });

    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();

    learningEngine = new LearningEngine(TEST_AGENT_ID, memoryManager, {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95
    });
    await learningEngine.initialize();
  });

  afterEach(async () => {
    if (database) {
      await database.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (memoryManager) {
      await memoryManager.clear();
    }
  });

  /**
   * Test 1: Pattern Lookup Performance
   * **Target**: < 50ms (p95)
   */
  describe('Pattern Lookup Performance', () => {
    it('should lookup patterns under 50ms (p95)', async () => {
      // Pre-populate patterns
      const rng = createSeededRandom(300001);
      const patternCount = 100;
      for (let i = 0; i < patternCount; i++) {
        const pattern: TestPattern = {
          id: `perf-pattern-${i}`,
          name: `Pattern ${i}`,
          description: `Performance test pattern ${i}`,
          category: i % 2 === 0 ? 'unit' : 'integration',
          framework: 'jest',
          language: 'typescript',
          template: `template ${i}`,
          examples: [`example ${i}`],
          confidence: 0.8 + (rng.random() * 0.15),
          usageCount: Math.floor(rng.random() * 50),
          successRate: 0.7 + (rng.random() * 0.25),
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: [`tag-${i % 10}`]
          }
        };
        await reasoningBank.storePattern(pattern);
      }

      // Measure lookup times
      const lookupTimes: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await reasoningBank.findMatchingPatterns({
          codeType: 'test',
          framework: 'jest',
          keywords: [`tag-${i % 10}`]
        });

        const duration = performance.now() - start;
        lookupTimes.push(duration);
      }

      // Calculate p95
      lookupTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(lookupTimes.length * 0.95);
      const p95Time = lookupTimes[p95Index];

      const avgTime = lookupTimes.reduce((a, b) => a + b, 0) / lookupTimes.length;
      const maxTime = Math.max(...lookupTimes);

      console.log(`Pattern Lookup Performance:`);
      console.log(`  - Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  - P95: ${p95Time.toFixed(2)}ms`);
      console.log(`  - Max: ${maxTime.toFixed(2)}ms`);
      console.log(`  - Target: < 50ms (p95)`);

      // ❌ EXPECTED TO FAIL: In-memory lookup fast, but no DB persistence
      expect(p95Time).toBeLessThan(50);
    }, 30000);

    it('should maintain lookup performance with large pattern sets', async () => {
      // Test with 1000 patterns
      const patternCount = 1000;
      console.log(`Populating ${patternCount} patterns...`);

      for (let i = 0; i < patternCount; i++) {
        const pattern: TestPattern = {
          id: `large-pattern-${i}`,
          name: `Large Pattern ${i}`,
          description: `Pattern ${i}`,
          category: ['unit', 'integration', 'e2e'][i % 3] as any,
          framework: 'jest',
          language: 'typescript',
          template: `template ${i}`,
          examples: [`example ${i}`],
          confidence: 0.8,
          usageCount: 0,
          successRate: 0,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: [`category-${i % 20}`]
          }
        };
        await reasoningBank.storePattern(pattern);
      }

      // Measure lookup performance
      const start = performance.now();
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['category-5']
      });
      const duration = performance.now() - start;

      console.log(`Lookup with 1000 patterns: ${duration.toFixed(2)}ms`);

      expect(matches.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should still be fast
    }, 60000);
  });

  /**
   * Test 2: Pattern Storage Performance
   * **Target**: < 25ms (p95)
   */
  describe('Pattern Storage Performance', () => {
    it('should store patterns under 25ms (p95)', async () => {
      const storageTimes: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const pattern: TestPattern = {
          id: `storage-perf-${i}`,
          name: `Storage Pattern ${i}`,
          description: `Performance test`,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: `template ${i}`,
          examples: [`example ${i}`],
          confidence: 0.85,
          usageCount: 0,
          successRate: 0,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['perf']
          }
        };

        const start = performance.now();
        await reasoningBank.storePattern(pattern);
        const duration = performance.now() - start;

        storageTimes.push(duration);
      }

      // Calculate p95
      storageTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(storageTimes.length * 0.95);
      const p95Time = storageTimes[p95Index];

      const avgTime = storageTimes.reduce((a, b) => a + b, 0) / storageTimes.length;

      console.log(`Pattern Storage Performance:`);
      console.log(`  - Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  - P95: ${p95Time.toFixed(2)}ms`);
      console.log(`  - Target: < 25ms (p95)`);

      // ❌ EXPECTED TO FAIL: In-memory storage fast, but no DB writes
      expect(p95Time).toBeLessThan(25);
    }, 30000);

    it('should handle batch storage efficiently', async () => {
      const batchSize = 100;
      const patterns: TestPattern[] = [];

      // Prepare batch
      for (let i = 0; i < batchSize; i++) {
        patterns.push({
          id: `batch-pattern-${i}`,
          name: `Batch Pattern ${i}`,
          description: 'Batch test',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: `template ${i}`,
          examples: [],
          confidence: 0.8,
          usageCount: 0,
          successRate: 0,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: []
          }
        });
      }

      // Time batch storage
      const start = performance.now();
      for (const pattern of patterns) {
        await reasoningBank.storePattern(pattern);
      }
      const duration = performance.now() - start;

      const avgPerPattern = duration / batchSize;

      console.log(`Batch Storage (${batchSize} patterns):`);
      console.log(`  - Total: ${duration.toFixed(2)}ms`);
      console.log(`  - Per pattern: ${avgPerPattern.toFixed(2)}ms`);

      expect(avgPerPattern).toBeLessThan(30);
    }, 30000);
  });

  /**
   * Test 3: Database Query Efficiency
   */
  describe('Database Query Efficiency', () => {
    it('should use indexes for fast queries', async () => {
      // Populate database
      const rng = createSeededRandom(300002);
      for (let i = 0; i < 500; i++) {
        await database.run(`
          INSERT INTO patterns (
            id, name, description, category, framework, language,
            template, examples, confidence, usage_count, success_rate, quality, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `db-pattern-${i}`,
          `Pattern ${i}`,
          'Description',
          i % 2 === 0 ? 'unit' : 'integration',
          'jest',
          'typescript',
          'template',
          JSON.stringify([]),
          0.8,
          i % 50,
          0.8 + (rng.random() * 0.15),
          0.75 + (rng.random() * 0.2),
          JSON.stringify({ createdAt: new Date(), updatedAt: new Date(), version: '1.0.0', tags: [] })
        ]);
      }

      // Test indexed query (framework)
      const start1 = performance.now();
      const results1 = await database.all('SELECT * FROM patterns WHERE framework = ?', ['jest']);
      const duration1 = performance.now() - start1;

      console.log(`Indexed query (framework): ${duration1.toFixed(2)}ms (${results1.length} results)`);

      // ❌ EXPECTED TO FAIL if indexes not created
      expect(duration1).toBeLessThan(50);

      // Test indexed query (category)
      const start2 = performance.now();
      const results2 = await database.all('SELECT * FROM patterns WHERE category = ?', ['unit']);
      const duration2 = performance.now() - start2;

      console.log(`Indexed query (category): ${duration2.toFixed(2)}ms (${results2.length} results)`);

      expect(duration2).toBeLessThan(50);

      // Test quality filter (indexed)
      const start3 = performance.now();
      const results3 = await database.all('SELECT * FROM patterns WHERE quality > ?', [0.8]);
      const duration3 = performance.now() - start3;

      console.log(`Indexed query (quality): ${duration3.toFixed(2)}ms (${results3.length} results)`);

      expect(duration3).toBeLessThan(50);
    }, 30000);

    it('should optimize complex queries', async () => {
      // Complex query with multiple conditions
      const start = performance.now();
      const results = await database.all(`
        SELECT * FROM patterns
        WHERE framework = ? AND category = ? AND quality > ?
        ORDER BY quality DESC
        LIMIT 10
      `, ['jest', 'unit', 0.7]);
      const duration = performance.now() - start;

      console.log(`Complex query: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(100);
    });
  });

  /**
   * Test 4: Memory Usage
   * **Target**: < 100MB for 1000+ patterns
   */
  describe('Memory Usage', () => {
    it('should maintain reasonable memory usage', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed;
      console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);

      // Load 1000 patterns
      const patternCount = 1000;
      for (let i = 0; i < patternCount; i++) {
        const pattern: TestPattern = {
          id: `memory-pattern-${i}`,
          name: `Memory Pattern ${i}`,
          description: `Pattern for memory test ${i}`,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: `template ${i}`.repeat(10), // Some content
          examples: Array(5).fill(`example ${i}`),
          confidence: 0.8,
          usageCount: 0,
          successRate: 0,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: [`tag-${i % 20}`]
          }
        };
        await reasoningBank.storePattern(pattern);
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      console.log(`Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)} MB for ${patternCount} patterns`);
      console.log(`Per pattern: ${(memoryIncreaseMB / patternCount * 1024).toFixed(2)} KB`);

      // ❌ EXPECTED TO FAIL: In-memory storage uses memory
      expect(memoryIncreaseMB).toBeLessThan(100);
    }, 60000);

    it('should not leak memory on repeated operations', async () => {
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed;

      // Perform operations repeatedly
      for (let cycle = 0; cycle < 10; cycle++) {
        // Store patterns
        for (let i = 0; i < 50; i++) {
          await reasoningBank.storePattern({
            id: `leak-test-${cycle}-${i}`,
            name: `Pattern ${i}`,
            description: 'Leak test',
            category: 'unit',
            framework: 'jest',
            language: 'typescript',
            template: 'template',
            examples: [],
            confidence: 0.8,
            usageCount: 0,
            successRate: 0,
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              version: '1.0.0',
              tags: []
            }
          });
        }

        // Query patterns
        await reasoningBank.findMatchingPatterns({
          codeType: 'test',
          framework: 'jest',
          keywords: ['unit']
        });

        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      console.log(`Memory after 10 cycles: ${memoryIncreaseMB.toFixed(2)} MB increase`);

      // Should not increase significantly (memory leaks)
      expect(memoryIncreaseMB).toBeLessThan(50);
    }, 60000);
  });

  /**
   * Test 5: Concurrent Operations Performance
   */
  describe('Concurrent Operations', () => {
    it('should handle concurrent pattern lookups', async () => {
      // Pre-populate
      for (let i = 0; i < 100; i++) {
        await reasoningBank.storePattern({
          id: `concurrent-${i}`,
          name: `Pattern ${i}`,
          description: 'Concurrent test',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'template',
          examples: [],
          confidence: 0.8,
          usageCount: 0,
          successRate: 0,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: [`tag-${i % 10}`]
          }
        });
      }

      // Perform concurrent lookups
      const start = performance.now();
      const lookups = Array.from({ length: 50 }, (_, i) =>
        reasoningBank.findMatchingPatterns({
          codeType: 'test',
          framework: 'jest',
          keywords: [`tag-${i % 10}`]
        })
      );

      const results = await Promise.all(lookups);
      const duration = performance.now() - start;

      console.log(`50 concurrent lookups: ${duration.toFixed(2)}ms`);
      console.log(`Average per lookup: ${(duration / 50).toFixed(2)}ms`);

      expect(results.length).toBe(50);
      expect(duration).toBeLessThan(1000); // All 50 under 1s
    }, 30000);

    it('should handle concurrent storage operations', async () => {
      const patterns = Array.from({ length: 100 }, (_, i) => ({
        id: `concurrent-store-${i}`,
        name: `Pattern ${i}`,
        description: 'Concurrent storage',
        category: 'unit' as const,
        framework: 'jest' as const,
        language: 'typescript' as const,
        template: 'template',
        examples: [] as string[],
        confidence: 0.8,
        usageCount: 0,
        successRate: 0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: [] as string[]
        }
      }));

      const start = performance.now();
      await Promise.all(patterns.map(p => reasoningBank.storePattern(p)));
      const duration = performance.now() - start;

      console.log(`100 concurrent stores: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(2000);
    }, 30000);
  });

  /**
   * Test 6: Learning Overhead
   * **Target**: < 100ms per task
   */
  describe('Learning Overhead', () => {
    it('should add minimal overhead to task execution', async () => {
      const rng = createSeededRandom(300003);
      const iterations = 100;
      const overheadTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const task = {
          id: `overhead-task-${i}`,
          type: 'test-execution',
          previousAttempts: 0
        };

        const result = {
          success: rng.random() > 0.2,
          executionTime: 1000,
          strategy: 'parallel',
          toolsUsed: ['jest'],
          parallelization: 0.7,
          retryPolicy: 'exponential',
          resourceAllocation: 0.6
        };

        const start = performance.now();
        await learningEngine.learnFromExecution(task, result);
        const duration = performance.now() - start;

        overheadTimes.push(duration);
      }

      // Calculate p95
      overheadTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(overheadTimes.length * 0.95);
      const p95Time = overheadTimes[p95Index];

      const avgTime = overheadTimes.reduce((a, b) => a + b, 0) / overheadTimes.length;

      console.log(`Learning Overhead:`);
      console.log(`  - Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  - P95: ${p95Time.toFixed(2)}ms`);
      console.log(`  - Target: < 100ms`);

      expect(p95Time).toBeLessThan(100);
    }, 30000);
  });
});
