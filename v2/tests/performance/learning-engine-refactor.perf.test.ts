/**
 * Performance Tests: LearningEngine Refactor
 *
 * Verifies that the refactored LearningEngine with database persistence:
 * 1. Has <10% overhead compared to in-memory only
 * 2. Completes 1000 learning cycles in <5 seconds
 * 3. Memory usage stays bounded
 * 4. Batch writes are efficient
 */

// CRITICAL: Unmock Database to use real implementation for performance tests
jest.unmock('../../src/utils/Database');

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LearningEngine } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { Database } from '../../src/utils/Database';
import { TaskResult } from '../../src/learning/RewardCalculator';
import { createSeededRandom } from '../../src/utils/SeededRandom';
import fs from 'fs';
import path from 'path';

describe('LearningEngine Performance (Refactored)', () => {
  // Use tests/.tmp directory for test databases (not project root)
  const tmpDir = path.join(__dirname, '../.tmp');
  const testDbPath = path.join(tmpDir, '.test-learning-perf.db');
  const memoryDbPath = path.join(tmpDir, '.test-memory-perf.db');
  let database: Database;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    // Ensure tmp directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Clean up test databases
    [testDbPath, memoryDbPath].forEach(dbPath => {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    });

    // Create fresh database and memory manager
    database = new Database(testDbPath);
    await database.initialize();

    memoryManager = new SwarmMemoryManager(memoryDbPath);
    await memoryManager.initialize();
  });

  afterEach(async () => {
    // Close database connections
    try {
      if (database) await database.close();
    } catch (error) {
      // Ignore close errors
    }

    try {
      if (memoryManager && (memoryManager as any).db) {
        (memoryManager as any).db.close();
      }
    } catch (error) {
      // Ignore close errors
    }

    // Clean up test databases
    [testDbPath, memoryDbPath].forEach(dbPath => {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    });
  });

  describe('Persistence Overhead', () => {
    it('should have <10% overhead compared to no persistence', async () => {
      const agentId = 'perf-agent-overhead';
      let engineInMemory: LearningEngine | null = null;
      let engineWithDB: LearningEngine | null = null;

      try {
        // Test 1: In-memory only (no database)
        engineInMemory = new LearningEngine(
          agentId + '-memory',
          memoryManager,
          { enabled: true }
          // No database parameter
        );
        // Disable database auto-init by setting env var to empty
        const originalPath = process.env.AQE_DB_PATH;
        process.env.AQE_DB_PATH = '';

        await engineInMemory.initialize();

        const startMemory = Date.now();
        for (let i = 0; i < 100; i++) {
          const task = {
            type: 'test-generation',
            context: {},
            requirements: { capabilities: ['testing'] }
          };

          const result: TaskResult = {
            success: true,
            executionTime: 1000,
            errors: [],
            coverage: 0.85,
            metadata: {
              strategy: 'template',
              toolsUsed: ['jest'],
              parallelization: 0.5,
              retryPolicy: 'exponential',
              resourceAllocation: 0.5
            }
          };

          await engineInMemory.recordExperience(task, result);
        }
        const durationMemory = Date.now() - startMemory;

        // Cleanup in-memory engine
        engineInMemory.dispose();
        engineInMemory = null;

        // Restore environment
        if (originalPath) {
          process.env.AQE_DB_PATH = originalPath;
        } else {
          delete process.env.AQE_DB_PATH;
        }

        // Test 2: With database persistence
        engineWithDB = new LearningEngine(
          agentId + '-db',
          memoryManager,
          { enabled: true },
          database
        );
        await engineWithDB.initialize();

        const startDB = Date.now();
        for (let i = 0; i < 100; i++) {
          const task = {
            type: 'test-generation',
            context: {},
            requirements: { capabilities: ['testing'] }
          };

          const result: TaskResult = {
            success: true,
            executionTime: 1000,
            errors: [],
            coverage: 0.85,
            metadata: {
              strategy: 'template',
              toolsUsed: ['jest'],
              parallelization: 0.5,
              retryPolicy: 'exponential',
              resourceAllocation: 0.5
            }
          };

          await engineWithDB.recordExperience(task, result);
        }
        const durationDB = Date.now() - startDB;

        // Calculate overhead
        const overhead = ((durationDB - durationMemory) / durationMemory) * 100;

        console.log(`In-memory duration: ${durationMemory}ms`);
        console.log(`With database duration: ${durationDB}ms`);
        console.log(`Overhead: ${overhead.toFixed(2)}%`);

        // Verify overhead is less than 10%
        expect(overhead).toBeLessThan(10);
      } finally {
        // Cleanup
        if (engineInMemory) {
          engineInMemory.dispose();
        }
        if (engineWithDB) {
          engineWithDB.dispose();
        }
      }
    }, 30000); // 30 second timeout

    it('should complete 1000 learning cycles in <5 seconds', async () => {
      const agentId = 'perf-agent-throughput';
      let engine: LearningEngine | null = null;
      const rng = createSeededRandom(900001);

      try {
        engine = new LearningEngine(
          agentId,
          memoryManager,
          { enabled: true, batchSize: 50, updateFrequency: 100 },
          database
        );
        await engine.initialize();

        const start = Date.now();

        // Run 1000 learning cycles
        for (let i = 0; i < 1000; i++) {
          const task = {
            type: 'test-generation',
            context: {},
            requirements: { capabilities: ['testing'] }
          };

          const result: TaskResult = {
            success: rng.random() > 0.2,
            executionTime: 1000 + rng.random() * 500,
            errors: [],
            coverage: 0.7 + rng.random() * 0.3,
            metadata: {
              strategy: i % 3 === 0 ? 'template' : i % 3 === 1 ? 'property' : 'mutation',
              toolsUsed: ['jest'],
              parallelization: 0.5,
              retryPolicy: 'exponential',
              resourceAllocation: 0.5
            }
          };

          await engine.recordExperience(task, result);
        }

        const duration = Date.now() - start;

        console.log(`1000 learning cycles completed in ${duration}ms`);
        console.log(`Average: ${(duration / 1000).toFixed(2)}ms per cycle`);

        // Verify completion time
        expect(duration).toBeLessThan(5000); // 5 seconds

        // Verify all experiences were persisted
        const stats = await database.getLearningStatistics(agentId);
        expect(stats.totalExperiences).toBe(1000);
      } finally {
        if (engine) {
          engine.dispose();
        }
      }
    }, 10000); // 10 second timeout
  });

  describe('Memory Usage', () => {
    it('should keep memory usage bounded during continuous learning', async () => {
      const agentId = 'perf-agent-memory';
      let engine: LearningEngine | null = null;

      try {
        engine = new LearningEngine(
          agentId,
          memoryManager,
          { enabled: true, maxMemorySize: 10 * 1024 * 1024 }, // 10MB limit
          database
        );
        await engine.initialize();

        // Force garbage collection before measurement
        if (global.gc) {
          global.gc();
        }

        const initialMemory = process.memoryUsage().heapUsed;

        // Run 500 learning cycles
        for (let i = 0; i < 500; i++) {
          const task = {
            type: 'test-generation',
            context: { iteration: i },
            requirements: { capabilities: ['testing'] }
          };

          const result: TaskResult = {
            success: true,
            executionTime: 1000,
            errors: [],
            coverage: 0.85,
            metadata: {
              strategy: 'template',
              toolsUsed: ['jest'],
              parallelization: 0.5,
              retryPolicy: 'exponential',
              resourceAllocation: 0.5
            }
          };

          await engine.recordExperience(task, result);

          // Periodic GC to prevent false positives
          if (i % 100 === 0 && global.gc) {
            global.gc();
          }
        }

        // Force garbage collection after test
        if (global.gc) {
          global.gc();
        }

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // MB

        console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Memory increase: ${memoryIncrease.toFixed(2)} MB`);

        // Memory increase should be reasonable (< 50MB)
        expect(memoryIncrease).toBeLessThan(50);
      } finally {
        if (engine) {
          engine.dispose();
        }
      }
    }, 30000); // 30 second timeout
  });

  describe('Batch Write Efficiency', () => {
    it('should batch writes efficiently for high-volume learning', async () => {
      const agentId = 'perf-agent-batch';
      let engine: LearningEngine | null = null;

      try {
        // Small batch size for faster testing
        engine = new LearningEngine(
          agentId,
          memoryManager,
          { enabled: true, batchSize: 10, updateFrequency: 50 },
          database
        );
        await engine.initialize();

        const start = Date.now();

        // Run 200 rapid learning cycles
        const promises = [];
        for (let i = 0; i < 200; i++) {
          const task = {
            type: 'test-generation',
            context: {},
            requirements: { capabilities: ['testing'] }
          };

          const result: TaskResult = {
            success: true,
            executionTime: 1000,
            errors: [],
            coverage: 0.85,
            metadata: {
              strategy: 'template',
              toolsUsed: ['jest'],
              parallelization: 0.5,
              retryPolicy: 'exponential',
              resourceAllocation: 0.5
            }
          };

          // Don't await - queue them up to test batching
          promises.push(engine.recordExperience(task, result));
        }

        // Wait for all to complete
        await Promise.all(promises);

        const duration = Date.now() - start;

        console.log(`200 batched writes completed in ${duration}ms`);
        console.log(`Average: ${(duration / 200).toFixed(2)}ms per write`);

        // Batching should make this fast (< 2 seconds)
        expect(duration).toBeLessThan(2000);

        // Verify all experiences were persisted
        const stats = await database.getLearningStatistics(agentId);
        expect(stats.totalExperiences).toBe(200);
      } finally {
        if (engine) {
          engine.dispose();
        }
      }
    }, 15000); // 15 second timeout
  });

  describe('Concurrent Learning', () => {
    it('should handle concurrent learning from multiple agents', async () => {
      const agentCount = 5;
      const cyclesPerAgent = 50;
      let engines: LearningEngine[] = [];

      try {
        engines = await Promise.all(
          Array.from({ length: agentCount }, async (_, i) => {
            const engine = new LearningEngine(
              `perf-agent-concurrent-${i}`,
              memoryManager,
              { enabled: true },
              database
            );
            await engine.initialize();
            return engine;
          })
        );

        const start = Date.now();

        // Run concurrent learning
        await Promise.all(
          engines.map(async (engine, agentIdx) => {
            for (let i = 0; i < cyclesPerAgent; i++) {
              const task = {
                type: 'test-generation',
                context: { agent: agentIdx },
                requirements: { capabilities: ['testing'] }
              };

              const result: TaskResult = {
                success: true,
                executionTime: 1000,
                errors: [],
                coverage: 0.85,
                metadata: {
                  strategy: 'template',
                  toolsUsed: ['jest'],
                  parallelization: 0.5,
                  retryPolicy: 'exponential',
                  resourceAllocation: 0.5
                }
              };

              await engine.recordExperience(task, result);
            }
          })
        );

        const duration = Date.now() - start;

        console.log(`${agentCount} agents × ${cyclesPerAgent} cycles = ${agentCount * cyclesPerAgent} total cycles`);
        console.log(`Concurrent learning completed in ${duration}ms`);
        console.log(`Average: ${(duration / (agentCount * cyclesPerAgent)).toFixed(2)}ms per cycle`);

        // Should complete in reasonable time (< 5 seconds)
        expect(duration).toBeLessThan(5000);

        // Verify all experiences were persisted
        for (let i = 0; i < agentCount; i++) {
          const stats = await database.getLearningStatistics(`perf-agent-concurrent-${i}`);
          expect(stats.totalExperiences).toBe(cyclesPerAgent);
        }
      } finally {
        // Cleanup all engines
        for (const engine of engines) {
          if (engine) {
            engine.dispose();
          }
        }
      }
    }, 15000); // 15 second timeout
  });

  describe('Database Query Performance', () => {
    it('should retrieve Q-values quickly after learning', async () => {
      const agentId = 'perf-agent-query';
      let engine: LearningEngine | null = null;

      try {
        engine = new LearningEngine(
          agentId,
          memoryManager,
          { enabled: true },
          database
        );
        await engine.initialize();

        // Learn from 100 experiences
        for (let i = 0; i < 100; i++) {
          const task = {
            type: 'test-generation',
            context: {},
            requirements: { capabilities: ['testing'] }
          };

          const result: TaskResult = {
            success: true,
            executionTime: 1000,
            errors: [],
            coverage: 0.85,
            metadata: {
              strategy: i % 3 === 0 ? 'template' : i % 3 === 1 ? 'property' : 'mutation',
              toolsUsed: ['jest'],
              parallelization: 0.5,
              retryPolicy: 'exponential',
              resourceAllocation: 0.5
            }
          };

          await engine.recordExperience(task, result);
        }

        // Test query performance
        const start = Date.now();
        const qValues = await database.getAllQValues(agentId);
        const duration = Date.now() - start;

        console.log(`Retrieved ${qValues.length} Q-values in ${duration}ms`);

        // Query should be fast (< 100ms)
        expect(duration).toBeLessThan(100);
        expect(qValues.length).toBeGreaterThan(0);
      } finally {
        if (engine) {
          engine.dispose();
        }
      }
    });

    it('should retrieve learning statistics quickly', async () => {
      const agentId = 'perf-agent-stats';
      let engine: LearningEngine | null = null;
      const rng = createSeededRandom(900002);

      try {
        engine = new LearningEngine(
          agentId,
          memoryManager,
          { enabled: true },
          database
        );
        await engine.initialize();

        // Learn from 100 experiences
        for (let i = 0; i < 100; i++) {
          const task = {
            type: 'test-generation',
            context: {},
            requirements: { capabilities: ['testing'] }
          };

          const result: TaskResult = {
            success: rng.random() > 0.3,
            executionTime: 1000,
            errors: [],
            coverage: 0.85,
            metadata: {
              strategy: 'template',
              toolsUsed: ['jest'],
              parallelization: 0.5,
              retryPolicy: 'exponential',
              resourceAllocation: 0.5
            }
          };

          await engine.recordExperience(task, result);
        }

        // Test statistics query performance
        const start = Date.now();
        const stats = await database.getLearningStatistics(agentId);
        const duration = Date.now() - start;

        console.log(`Retrieved statistics in ${duration}ms`);
        console.log(`Total experiences: ${stats.totalExperiences}`);
        console.log(`Avg reward: ${stats.avgReward.toFixed(3)}`);
        console.log(`Q-table size: ${stats.qTableSize}`);

        // Statistics query should be fast (< 50ms)
        expect(duration).toBeLessThan(50);
        expect(stats.totalExperiences).toBe(100);
      } finally {
        if (engine) {
          engine.dispose();
        }
      }
    });
  });
});
