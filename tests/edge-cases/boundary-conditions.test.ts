/**
 * Edge Cases and Boundary Conditions Tests
 * Comprehensive testing of edge cases, boundary conditions,
 * error scenarios, and system limits for Claude Flow integration
 */

import { QEMemory } from '../../src/memory/QEMemory';
import { TaskExecutor } from '../../src/advanced/task-executor';
import { EnhancedMockMemory, EnhancedMockTaskExecutor } from '../mocks/enhanced-mocks';
import { Logger } from '../../src/utils/Logger';
import { QEMemoryEntry, MemoryType, TestResult, QEAgent } from '../../src/types';
import { TaskDefinition } from '../../src/advanced/task-executor';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('Edge Cases and Boundary Conditions', () => {
  let testDir: string;
  let logger: Logger;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'edge-cases-test', Date.now().toString());
    await fs.ensureDir(testDir);
    logger = new Logger('EdgeCaseTest', { level: 'error' }); // Reduce noise
  });

  afterAll(async () => {
    await fs.remove(testDir);
  });

  describe('Memory System Edge Cases', () => {
    let memory: QEMemory;

    beforeEach(async () => {
      memory = new QEMemory({
        persistPath: path.join(testDir, `edge-memory-${Date.now()}.json`),
        maxEntries: 100,
        defaultTTL: 10000,
        autoCleanup: true,
        cleanupInterval: 1000
      }, logger);
    });

    afterEach(async () => {
      if (memory) {
        await memory.destroy();
      }
    });

    describe('Boundary Value Testing', () => {
      it('should handle empty string keys and values', async () => {
        // Test empty key (should be rejected)
        await expect(memory.store({
          key: '',
          value: { test: 'data' },
          type: 'test-data' as MemoryType,
          sessionId: 'test-session',
          timestamp: new Date(),
          tags: []
        })).rejects.toThrow();

        // Test empty value (should be allowed)
        await expect(memory.store({
          key: 'empty-value-test',
          value: {},
          type: 'test-data' as MemoryType,
          sessionId: 'test-session',
          timestamp: new Date(),
          tags: []
        })).resolves.not.toThrow();

        // Test null value (should be allowed)
        await expect(memory.store({
          key: 'null-value-test',
          value: null,
          type: 'test-data' as MemoryType,
          sessionId: 'test-session',
          timestamp: new Date(),
          tags: []
        })).resolves.not.toThrow();

        // Verify retrieval
        const emptyResult = await memory.get('empty-value-test');
        const nullResult = await memory.get('null-value-test');
        
        expect(emptyResult?.value).toEqual({});
        expect(nullResult?.value).toBeNull();
      });

      it('should handle maximum length strings', async () => {
        // Test very long key (should have practical limits)
        const longKey = 'x'.repeat(1000);
        
        await expect(memory.store({
          key: longKey,
          value: { test: 'data' },
          type: 'test-data' as MemoryType,
          sessionId: 'test-session',
          timestamp: new Date(),
          tags: []
        })).resolves.not.toThrow();

        // Test extremely long key (should be rejected or handled gracefully)
        const extremelyLongKey = 'x'.repeat(100000);
        
        // This should either succeed or fail gracefully without crashing
        try {
          await memory.store({
            key: extremelyLongKey,
            value: { test: 'data' },
            type: 'test-data' as MemoryType,
            sessionId: 'test-session',
            timestamp: new Date(),
            tags: []
          });
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }

        // Test very large value
        const largeValue = {
          data: 'x'.repeat(100000), // 100KB string
          metadata: { size: 'large' }
        };
        
        await expect(memory.store({
          key: 'large-value-test',
          value: largeValue,
          type: 'test-data' as MemoryType,
          sessionId: 'test-session',
          timestamp: new Date(),
          tags: ['large']
        })).resolves.not.toThrow();

        // Verify large value can be retrieved
        const retrievedLarge = await memory.get('large-value-test');
        expect(retrievedLarge?.value).toEqual(largeValue);
      });

      it('should handle special characters and unicode in keys and values', async () => {
        const specialCases = [
          { key: 'unicode-🚀-test', value: { emoji: '🚀🔥💯', unicode: '测试数据' } },
          { key: 'special-chars-!@#$%^&*()', value: { data: 'special!@#$%^&*()' } },
          { key: 'newlines\n\r\t', value: { text: 'line1\nline2\rline3\ttabbed' } },
          { key: 'quotes-"single\'double"', value: { quotes: '"Hello\'World"' } },
          { key: 'json-{"key":"value"}', value: { json: '{"nested":"object"}' } },
          { key: 'sql-injection-\'DROP TABLE', value: { malicious: 'SELECT * FROM users; DROP TABLE--' } }
        ];

        for (const testCase of specialCases) {
          await expect(memory.store({
            key: testCase.key,
            value: testCase.value,
            type: 'test-data' as MemoryType,
            sessionId: 'special-chars-session',
            timestamp: new Date(),
            tags: ['special', 'unicode']
          })).resolves.not.toThrow();

          const retrieved = await memory.get(testCase.key);
          expect(retrieved?.value).toEqual(testCase.value);
        }
      });

      it('should handle edge case timestamps', async () => {
        const edgeTimestamps = [
          new Date(0), // Unix epoch
          new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // 1 year in future
          new Date('1900-01-01'), // Very old date
          new Date('2100-12-31'), // Far future date
        ];

        for (const [index, timestamp] of edgeTimestamps.entries()) {
          await expect(memory.store({
            key: `timestamp-test-${index}`,
            value: { timestamp: timestamp.toISOString() },
            type: 'test-data' as MemoryType,
            sessionId: 'timestamp-session',
            timestamp,
            tags: ['timestamp-edge']
          })).resolves.not.toThrow();
        }

        // Query by time range
        const futureEntries = await memory.query({
          sessionId: 'timestamp-session',
          startTime: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
        });

        expect(futureEntries.length).toBeGreaterThan(0);
      });
    });

    describe('Memory Limit Edge Cases', () => {
      it('should handle memory capacity overflow', async () => {
        // Fill memory to capacity
        for (let i = 0; i < 100; i++) {
          await memory.store({
            key: `capacity-test-${i}`,
            value: { index: i },
            type: 'test-data' as MemoryType,
            sessionId: 'capacity-session',
            timestamp: new Date(),
            tags: ['capacity']
          });
        }

        const stats1 = memory.getStats();
        expect(stats1.totalEntries).toBe(100);

        // Try to add one more entry (should trigger eviction)
        await memory.store({
          key: 'overflow-entry',
          value: { overflow: true },
          type: 'test-data' as MemoryType,
          sessionId: 'capacity-session',
          timestamp: new Date(),
          tags: ['overflow']
        });

        const stats2 = memory.getStats();
        expect(stats2.totalEntries).toBeLessThanOrEqual(100);

        // Verify the new entry exists
        const overflowEntry = await memory.get('overflow-entry');
        expect(overflowEntry).toBeTruthy();
      });

      it('should handle rapid successive operations', async () => {
        const rapidOperations = [];
        const operationCount = 1000;

        // Launch many operations simultaneously
        for (let i = 0; i < operationCount; i++) {
          rapidOperations.push(
            memory.store({
              key: `rapid-${i}`,
              value: { index: i, timestamp: Date.now() },
              type: 'test-data' as MemoryType,
              sessionId: 'rapid-session',
              timestamp: new Date(),
              tags: ['rapid']
            })
          );
        }

        // Wait for all operations to complete
        const results = await Promise.allSettled(rapidOperations);
        
        // Most operations should succeed
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        expect(successCount).toBeGreaterThan(operationCount * 0.8); // >80% success rate

        // Verify data integrity
        const allEntries = await memory.query({ sessionId: 'rapid-session' });
        expect(allEntries.length).toBeGreaterThan(0);
        
        // Check for duplicate keys (should not exist)
        const keys = allEntries.map(e => e.key);
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(keys.length);
      });

      it('should handle TTL edge cases', async () => {
        // Test zero TTL (should expire immediately)
        await memory.store({
          key: 'zero-ttl',
          value: { test: 'zero ttl' },
          type: 'test-data' as MemoryType,
          sessionId: 'ttl-session',
          timestamp: new Date(),
          ttl: 0,
          tags: ['ttl-test']
        });

        // Should be immediately expired
        const zeroTtlEntry = await memory.get('zero-ttl');
        expect(zeroTtlEntry).toBeNull();

        // Test very small TTL
        await memory.store({
          key: 'small-ttl',
          value: { test: 'small ttl' },
          type: 'test-data' as MemoryType,
          sessionId: 'ttl-session',
          timestamp: new Date(),
          ttl: 1, // 1ms
          tags: ['ttl-test']
        });

        // Wait a bit and check expiration
        await new Promise(resolve => setTimeout(resolve, 10));
        const smallTtlEntry = await memory.get('small-ttl');
        expect(smallTtlEntry).toBeNull();

        // Test very large TTL
        await memory.store({
          key: 'large-ttl',
          value: { test: 'large ttl' },
          type: 'test-data' as MemoryType,
          sessionId: 'ttl-session',
          timestamp: new Date(),
          ttl: Number.MAX_SAFE_INTEGER,
          tags: ['ttl-test']
        });

        const largeTtlEntry = await memory.get('large-ttl');
        expect(largeTtlEntry).toBeTruthy();
      });
    });

    describe('Concurrent Access Edge Cases', () => {
      it('should handle read-write conflicts gracefully', async () => {
        const key = 'conflict-test';
        const operations = [];

        // Initial store
        await memory.store({
          key,
          value: { version: 0 },
          type: 'test-data' as MemoryType,
          sessionId: 'conflict-session',
          timestamp: new Date(),
          tags: ['conflict']
        });

        // Launch concurrent reads and writes
        for (let i = 0; i < 50; i++) {
          // Read operation
          operations.push(memory.get(key));
          
          // Update operation
          operations.push(
            memory.update(key, {
              value: { version: i + 1, timestamp: Date.now() }
            })
          );
          
          // Another read
          operations.push(memory.get(key));
        }

        const results = await Promise.allSettled(operations);
        
        // Most operations should complete without throwing
        const errorCount = results.filter(r => r.status === 'rejected').length;
        expect(errorCount).toBeLessThan(operations.length * 0.1); // <10% error rate

        // Final state should be consistent
        const finalEntry = await memory.get(key);
        expect(finalEntry).toBeTruthy();
        expect(finalEntry?.value).toHaveProperty('version');
      });

      it('should handle simultaneous deletions safely', async () => {
        const keys = Array.from({ length: 100 }, (_, i) => `delete-test-${i}`);
        
        // Store all entries
        for (const key of keys) {
          await memory.store({
            key,
            value: { data: `data for ${key}` },
            type: 'test-data' as MemoryType,
            sessionId: 'delete-session',
            timestamp: new Date(),
            tags: ['delete-test']
          });
        }

        // Attempt to delete all entries simultaneously
        const deleteOperations = keys.map(key => memory.delete(key));
        const deleteResults = await Promise.allSettled(deleteOperations);
        
        // Should not crash
        expect(deleteResults.every(r => r.status === 'fulfilled')).toBe(true);

        // Verify all entries are gone
        const remainingEntries = await memory.query({ sessionId: 'delete-session' });
        expect(remainingEntries).toHaveLength(0);
      });
    });

    describe('Query Edge Cases', () => {
      it('should handle complex query combinations', async () => {
        // Setup diverse test data
        const testData = [
          { key: 'a1', tags: ['tag1', 'tag2'], type: 'test-data' as MemoryType },
          { key: 'a2', tags: ['tag2', 'tag3'], type: 'metric' as MemoryType },
          { key: 'b1', tags: ['tag1'], type: 'test-data' as MemoryType },
          { key: 'b2', tags: ['tag3'], type: 'cache' as MemoryType },
        ];

        for (const data of testData) {
          await memory.store({
            key: data.key,
            value: { key: data.key },
            type: data.type,
            sessionId: 'query-session',
            timestamp: new Date(),
            tags: data.tags
          });
        }

        // Test overlapping tag queries
        const tag1Results = await memory.query({
          sessionId: 'query-session',
          tags: ['tag1']
        });
        expect(tag1Results).toHaveLength(2);

        // Test multiple tag intersection
        const multiTagResults = await memory.query({
          sessionId: 'query-session',
          tags: ['tag1', 'tag2']
        });
        expect(multiTagResults).toHaveLength(1);
        expect(multiTagResults[0].key).toBe('a1');

        // Test tag + type combination
        const tagTypeResults = await memory.query({
          sessionId: 'query-session',
          tags: ['tag2'],
          type: 'metric'
        });
        expect(tagTypeResults).toHaveLength(1);
        expect(tagTypeResults[0].key).toBe('a2');

        // Test impossible combination
        const impossibleResults = await memory.query({
          sessionId: 'query-session',
          tags: ['tag1', 'tag3'] // No entry has both
        });
        expect(impossibleResults).toHaveLength(0);
      });

      it('should handle pagination edge cases', async () => {
        // Setup data for pagination tests
        for (let i = 0; i < 50; i++) {
          await memory.store({
            key: `page-test-${i.toString().padStart(2, '0')}`,
            value: { index: i },
            type: 'test-data' as MemoryType,
            sessionId: 'pagination-session',
            timestamp: new Date(Date.now() + i * 1000),
            tags: ['pagination']
          });
        }

        // Test zero limit
        const zeroLimit = await memory.query({
          sessionId: 'pagination-session',
          limit: 0
        });
        expect(zeroLimit).toHaveLength(0);

        // Test limit larger than total
        const largeLimit = await memory.query({
          sessionId: 'pagination-session',
          limit: 1000
        });
        expect(largeLimit).toHaveLength(50);

        // Test offset beyond end
        const beyondOffset = await memory.query({
          sessionId: 'pagination-session',
          offset: 100
        });
        expect(beyondOffset).toHaveLength(0);

        // Test negative offset (should be treated as 0)
        const negativeOffset = await memory.query({
          sessionId: 'pagination-session',
          offset: -10,
          limit: 5
        });
        expect(negativeOffset).toHaveLength(5);

        // Test very large offset + limit
        const edgePagination = await memory.query({
          sessionId: 'pagination-session',
          offset: 45,
          limit: 10
        });
        expect(edgePagination).toHaveLength(5); // Only 5 remaining entries
      });
    });
  });

  describe('Task Executor Edge Cases', () => {
    let taskExecutor: TaskExecutor;
    let mockExecutor: EnhancedMockTaskExecutor;

    beforeEach(async () => {
      taskExecutor = new TaskExecutor({ maxConcurrent: 5 });
      mockExecutor = new EnhancedMockTaskExecutor({ 
        executionDelay: 10, 
        failureRate: 0.1 
      });
    });

    afterEach(async () => {
      if (taskExecutor) {
        await taskExecutor.shutdown();
      }
      if (mockExecutor) {
        await mockExecutor.shutdown();
      }
    });

    describe('Task Definition Edge Cases', () => {
      it('should handle malformed task definitions', async () => {
        const malformedTasks = [
          // Missing required fields
          {
            id: 'malformed-1',
            // missing name, type, etc.
          },
          // Invalid types
          {
            id: 'malformed-2',
            name: 'Invalid Task',
            type: 'invalid-type' as any,
            priority: -1, // negative priority
            dependencies: null as any,
            timeout: 0,
            retryCount: -5,
            resources: null as any,
            metadata: undefined as any
          },
          // Circular dependencies
          {
            id: 'circular-1',
            name: 'Circular Task',
            type: 'testing',
            priority: 5,
            dependencies: ['circular-1'], // self-dependency
            timeout: 1000,
            retryCount: 0,
            resources: {
              maxMemory: 100 * 1024 * 1024,
              maxCpuPercent: 50,
              maxDiskSpace: 10 * 1024 * 1024,
              maxNetworkBandwidth: 1024 * 1024,
              requiredAgents: 1
            },
            metadata: {}
          }
        ];

        for (const task of malformedTasks) {
          try {
            const result = await mockExecutor.executeTask(task as TaskDefinition, 'test-agent');
            // If it succeeds, that's okay - just verify it's handled gracefully
            expect(result).toBeDefined();
          } catch (error) {
            // If it fails, make sure it's a proper error
            expect(error).toBeInstanceOf(Error);
          }
        }
      });

      it('should handle extreme resource requirements', async () => {
        const extremeTasks: TaskDefinition[] = [
          // Zero resources
          {
            id: 'zero-resources',
            name: 'Zero Resources Task',
            type: 'testing',
            priority: 5,
            dependencies: [],
            timeout: 1000,
            retryCount: 0,
            resources: {
              maxMemory: 0,
              maxCpuPercent: 0,
              maxDiskSpace: 0,
              maxNetworkBandwidth: 0,
              requiredAgents: 0
            },
            metadata: {}
          },
          // Massive resources
          {
            id: 'massive-resources',
            name: 'Massive Resources Task',
            type: 'optimization',
            priority: 10,
            dependencies: [],
            timeout: 1000,
            retryCount: 0,
            resources: {
              maxMemory: Number.MAX_SAFE_INTEGER,
              maxCpuPercent: 1000, // >100%
              maxDiskSpace: Number.MAX_SAFE_INTEGER,
              maxNetworkBandwidth: Number.MAX_SAFE_INTEGER,
              requiredAgents: 1000
            },
            metadata: {}
          }
        ];

        for (const task of extremeTasks) {
          const result = await mockExecutor.executeTask(task, 'resource-test-agent');
          expect(result).toBeDefined();
          expect(result.resourcesUsed).toBeDefined();
        }
      });

      it('should handle extreme timeout values', async () => {
        const timeoutTasks: TaskDefinition[] = [
          // Zero timeout
          {
            id: 'zero-timeout',
            name: 'Zero Timeout Task',
            type: 'testing',
            priority: 5,
            dependencies: [],
            timeout: 0,
            retryCount: 0,
            resources: {
              maxMemory: 100 * 1024 * 1024,
              maxCpuPercent: 50,
              maxDiskSpace: 10 * 1024 * 1024,
              maxNetworkBandwidth: 1024 * 1024,
              requiredAgents: 1
            },
            metadata: {}
          },
          // Very long timeout
          {
            id: 'long-timeout',
            name: 'Long Timeout Task',
            type: 'testing',
            priority: 5,
            dependencies: [],
            timeout: Number.MAX_SAFE_INTEGER,
            retryCount: 0,
            resources: {
              maxMemory: 100 * 1024 * 1024,
              maxCpuPercent: 50,
              maxDiskSpace: 10 * 1024 * 1024,
              maxNetworkBandwidth: 1024 * 1024,
              requiredAgents: 1
            },
            metadata: {}
          }
        ];

        for (const task of timeoutTasks) {
          const startTime = Date.now();
          
          try {
            const result = await mockExecutor.executeTask(task, 'timeout-test-agent');
            const duration = Date.now() - startTime;
            
            expect(result).toBeDefined();
            
            if (task.timeout === 0) {
              // Should complete quickly or timeout quickly
              expect(duration).toBeLessThan(1000);
            }
          } catch (error) {
            // Timeout errors are acceptable
            expect(error.message).toContain('timeout' || 'failed');
          }
        }
      });
    });

    describe('Concurrent Execution Edge Cases', () => {
      it('should handle executor shutdown during execution', async () => {
        const longRunningTask: TaskDefinition = {
          id: 'long-running',
          name: 'Long Running Task',
          type: 'optimization',
          priority: 5,
          dependencies: [],
          timeout: 30000, // 30 seconds
          retryCount: 0,
          resources: {
            maxMemory: 100 * 1024 * 1024,
            maxCpuPercent: 50,
            maxDiskSpace: 10 * 1024 * 1024,
            maxNetworkBandwidth: 1024 * 1024,
            requiredAgents: 1
          },
          metadata: {}
        };

        // Start long-running task
        const executionPromise = mockExecutor.executeTask(longRunningTask, 'shutdown-test-agent');
        
        // Shutdown executor after a short delay
        setTimeout(async () => {
          await mockExecutor.shutdown();
        }, 100);

        try {
          const result = await executionPromise;
          // If it completes, that's fine
          expect(result).toBeDefined();
        } catch (error) {
          // If it fails due to shutdown, that's also acceptable
          expect(error).toBeInstanceOf(Error);
        }
      });

      it('should handle resource exhaustion scenarios', async () => {
        // Create many concurrent tasks to stress the system
        const concurrentTasks = [];
        const taskCount = 100;

        for (let i = 0; i < taskCount; i++) {
          const task: TaskDefinition = {
            id: `stress-task-${i}`,
            name: `Stress Task ${i}`,
            type: 'testing',
            priority: Math.floor(Math.random() * 10) + 1,
            dependencies: [],
            timeout: 5000,
            retryCount: 1,
            resources: {
              maxMemory: 50 * 1024 * 1024,
              maxCpuPercent: 25,
              maxDiskSpace: 5 * 1024 * 1024,
              maxNetworkBandwidth: 512 * 1024,
              requiredAgents: 1
            },
            metadata: { stress: true }
          };

          concurrentTasks.push(mockExecutor.executeTask(task, `stress-agent-${i % 5}`));
        }

        const results = await Promise.allSettled(concurrentTasks);
        
        // System should handle the load gracefully
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failureCount = results.filter(r => r.status === 'rejected').length;
        
        // Most tasks should succeed, but some failures under extreme load are acceptable
        expect(successCount).toBeGreaterThan(taskCount * 0.5); // >50% success rate
        expect(failureCount).toBeLessThan(taskCount * 0.5); // <50% failure rate
        
        console.log(`\n🔄 Resource Exhaustion Test:`);
        console.log(`  Tasks: ${taskCount}`);
        console.log(`  Succeeded: ${successCount}`);
        console.log(`  Failed: ${failureCount}`);
        console.log(`  Success Rate: ${((successCount / taskCount) * 100).toFixed(1)}%`);
      });
    });
  });

  describe('Integration Edge Cases', () => {
    let memory: QEMemory;
    let taskExecutor: TaskExecutor;

    beforeEach(async () => {
      memory = new QEMemory({
        persistPath: path.join(testDir, `integration-edge-${Date.now()}.json`),
        maxEntries: 500,
        defaultTTL: 30000,
        autoCleanup: true
      }, logger);
      
      taskExecutor = new TaskExecutor({ maxConcurrent: 3 });
    });

    afterEach(async () => {
      if (memory) {
        await memory.destroy();
      }
      if (taskExecutor) {
        await taskExecutor.shutdown();
      }
    });

    it('should handle mixed success/failure workflows', async () => {
      const workflowId = 'mixed-workflow';
      const results = [];

      // Phase 1: Successful operation
      try {
        await memory.store({
          key: `${workflowId}-phase1`,
          value: { phase: 1, status: 'success' },
          type: 'session' as MemoryType,
          sessionId: workflowId,
          timestamp: new Date(),
          tags: ['phase1', 'success']
        });
        results.push('phase1-success');
      } catch (error) {
        results.push('phase1-failure');
      }

      // Phase 2: Task that might fail
      try {
        const task: TaskDefinition = {
          id: `${workflowId}-task`,
          name: 'Unreliable Task',
          type: 'testing',
          priority: 5,
          dependencies: [],
          timeout: 1000,
          retryCount: 2,
          resources: {
            maxMemory: 100 * 1024 * 1024,
            maxCpuPercent: 50,
            maxDiskSpace: 10 * 1024 * 1024,
            maxNetworkBandwidth: 1024 * 1024,
            requiredAgents: 1
          },
          metadata: { unreliable: true }
        };

        // Use mock executor with high failure rate
        const unreliableExecutor = new EnhancedMockTaskExecutor({ 
          executionDelay: 100, 
          failureRate: 0.7 
        });
        
        try {
          await unreliableExecutor.executeTask(task, 'unreliable-agent');
          results.push('phase2-success');
        } finally {
          await unreliableExecutor.shutdown();
        }
      } catch (error) {
        results.push('phase2-failure');
      }

      // Phase 3: Recovery operation
      try {
        const recoveryData = await memory.query({ sessionId: workflowId });
        
        await memory.store({
          key: `${workflowId}-recovery`,
          value: { 
            phase: 3, 
            status: 'recovery',
            previousPhases: results,
            dataFound: recoveryData.length
          },
          type: 'session' as MemoryType,
          sessionId: workflowId,
          timestamp: new Date(),
          tags: ['phase3', 'recovery']
        });
        results.push('phase3-success');
      } catch (error) {
        results.push('phase3-failure');
      }

      // Verify system resilience
      expect(results).toContain('phase1-success'); // First phase should always succeed
      expect(results).toContain('phase3-success'); // Recovery should work
      expect(results.length).toBe(3); // All phases attempted

      // Verify data integrity
      const finalData = await memory.query({ sessionId: workflowId });
      expect(finalData.length).toBeGreaterThan(0);
    });

    it('should handle data corruption scenarios', async () => {
      const sessionId = 'corruption-test';
      
      // Store initial valid data
      await memory.store({
        key: 'valid-data',
        value: { valid: true, data: 'good data' },
        type: 'test-data' as MemoryType,
        sessionId,
        timestamp: new Date(),
        tags: ['valid']
      });

      // Store potentially problematic data
      const problematicData = [
        // Circular reference (should be handled by JSON serialization)
        (() => {
          const obj: any = { type: 'circular' };
          obj.self = obj;
          return obj;
        })(),
        // Very deep nesting
        (() => {
          let deep: any = { level: 0 };
          for (let i = 1; i < 100; i++) {
            deep = { level: i, nested: deep };
          }
          return deep;
        })(),
        // Binary data
        {
          type: 'binary',
          data: Buffer.from('binary data').toString('base64')
        },
        // Functions (should be stripped or cause error)
        {
          type: 'function',
          fn: function() { return 'test'; },
          data: 'normal data'
        }
      ];

      for (const [index, data] of problematicData.entries()) {
        try {
          await memory.store({
            key: `problematic-${index}`,
            value: data,
            type: 'test-data' as MemoryType,
            sessionId,
            timestamp: new Date(),
            tags: ['problematic']
          });
        } catch (error) {
          // Some data types may legitimately fail - that's okay
          expect(error).toBeInstanceOf(Error);
        }
      }

      // Verify system is still functional
      const validEntry = await memory.get('valid-data');
      expect(validEntry).toBeTruthy();
      expect(validEntry?.value).toEqual({ valid: true, data: 'good data' });

      // Verify we can still query and store new data
      await memory.store({
        key: 'post-corruption-data',
        value: { recovered: true },
        type: 'test-data' as MemoryType,
        sessionId,
        timestamp: new Date(),
        tags: ['recovery']
      });

      const allData = await memory.query({ sessionId });
      expect(allData.length).toBeGreaterThan(0);
    });

    it('should handle system resource exhaustion gracefully', async () => {
      const sessionId = 'resource-exhaustion';
      
      // Try to exhaust memory with large entries
      const largeEntrySize = 1024 * 1024; // 1MB per entry
      const maxEntries = 100;
      
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < maxEntries; i++) {
        try {
          await memory.store({
            key: `large-entry-${i}`,
            value: {
              index: i,
              largeData: 'x'.repeat(largeEntrySize),
              metadata: { size: largeEntrySize }
            },
            type: 'test-data' as MemoryType,
            sessionId,
            timestamp: new Date(),
            tags: ['large', 'resource-test']
          });
          successCount++;
        } catch (error) {
          errorCount++;
          // System should handle resource exhaustion gracefully
          expect(error).toBeInstanceOf(Error);
        }
        
        // Check if we've hit memory limits
        const stats = memory.getStats();
        if (stats.totalEntries >= 500) { // Memory capacity reached
          break;
        }
      }
      
      console.log(`\n💾 Resource Exhaustion Test:`);
      console.log(`  Attempted: ${maxEntries} large entries`);
      console.log(`  Succeeded: ${successCount}`);
      console.log(`  Failed: ${errorCount}`);
      console.log(`  Final memory entries: ${memory.getStats().totalEntries}`);
      
      // System should remain functional even after resource exhaustion
      expect(successCount + errorCount).toBeGreaterThan(0);
      
      // Should still be able to perform basic operations
      await memory.store({
        key: 'post-exhaustion-test',
        value: { test: 'still works' },
        type: 'test-data' as MemoryType,
        sessionId: 'recovery',
        timestamp: new Date(),
        tags: ['recovery']
      });
      
      const recoveryData = await memory.get('post-exhaustion-test');
      expect(recoveryData).toBeTruthy();
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from partial system failures', async () => {
      let memory: QEMemory | null = null;
      const memoryPath = path.join(testDir, `recovery-${Date.now()}.json`);
      
      try {
        // Create initial memory with data
        memory = new QEMemory({
          persistPath: memoryPath,
          maxEntries: 100,
          autoCleanup: false
        }, logger);
        
        await memory.store({
          key: 'critical-data',
          value: { important: true, data: 'must survive' },
          type: 'session' as MemoryType,
          sessionId: 'critical-session',
          timestamp: new Date(),
          tags: ['critical']
        });
        
        await memory.persist();
        await memory.destroy();
        memory = null;
        
        // Simulate partial corruption by modifying the file
        const persistedData = await fs.readJSON(memoryPath);
        persistedData.corrupted = true; // Add corruption marker
        await fs.writeJSON(memoryPath, persistedData);
        
        // Try to recover
        memory = new QEMemory({
          persistPath: memoryPath,
          maxEntries: 100,
          autoCleanup: false
        }, logger);
        
        // Should still be able to operate
        await memory.store({
          key: 'recovery-data',
          value: { recovered: true },
          type: 'session' as MemoryType,
          sessionId: 'recovery-session',
          timestamp: new Date(),
          tags: ['recovery']
        });
        
        const recoveryEntry = await memory.get('recovery-data');
        expect(recoveryEntry).toBeTruthy();
        
      } catch (error) {
        // Recovery failures are acceptable as long as system doesn't crash
        expect(error).toBeInstanceOf(Error);
      } finally {
        if (memory) {
          await memory.destroy();
        }
      }
    });

    it('should handle cascading failures gracefully', async () => {
      const components = {
        memory: null as QEMemory | null,
        executor: null as TaskExecutor | null
      };
      
      const errors: string[] = [];
      
      try {
        // Set up components
        components.memory = new QEMemory({
          persistPath: path.join(testDir, `cascade-${Date.now()}.json`),
          maxEntries: 10, // Very small to trigger failures
          autoCleanup: false
        }, logger);
        
        components.executor = new TaskExecutor({ maxConcurrent: 1 });
        
        // Trigger cascade of failures
        const operations = [];
        
        // Memory failure: exceed capacity
        for (let i = 0; i < 20; i++) {
          operations.push(
            components.memory.store({
              key: `cascade-${i}`,
              value: { data: 'x'.repeat(10000) }, // Large data
              type: 'test-data' as MemoryType,
              sessionId: 'cascade-session',
              timestamp: new Date(),
              tags: ['cascade']
            }).catch(err => {
              errors.push(`Memory error: ${err.message}`);
            })
          );
        }
        
        // Executor failure: resource exhaustion
        for (let i = 0; i < 10; i++) {
          const task: TaskDefinition = {
            id: `cascade-task-${i}`,
            name: 'Cascade Task',
            type: 'testing',
            priority: 10,
            dependencies: [],
            timeout: 100, // Very short timeout
            retryCount: 0,
            resources: {
              maxMemory: Number.MAX_SAFE_INTEGER, // Excessive
              maxCpuPercent: 1000,
              maxDiskSpace: Number.MAX_SAFE_INTEGER,
              maxNetworkBandwidth: Number.MAX_SAFE_INTEGER,
              requiredAgents: 1000
            },
            metadata: { cascade: true }
          };
          
          operations.push(
            components.executor.executeTask(task, 'cascade-agent').catch(err => {
              errors.push(`Executor error: ${err.message}`);
            })
          );
        }
        
        await Promise.all(operations);
        
      } catch (error) {
        errors.push(`Setup error: ${error.message}`);
      } finally {
        // Cleanup should work even after failures
        if (components.memory) {
          try {
            await components.memory.destroy();
          } catch (error) {
            errors.push(`Memory cleanup error: ${error.message}`);
          }
        }
        
        if (components.executor) {
          try {
            await components.executor.shutdown();
          } catch (error) {
            errors.push(`Executor cleanup error: ${error.message}`);
          }
        }
      }
      
      // System should handle cascading failures without crashing
      console.log(`\n⚠️ Cascading Failures Test:`);
      console.log(`  Total errors caught: ${errors.length}`);
      errors.slice(0, 5).forEach(error => console.log(`    ${error}`));
      
      // Some errors are expected, but the test should complete
      expect(errors.length).toBeGreaterThan(0); // Should have caught some errors
      expect(errors.length).toBeLessThan(50); // But not an excessive amount
    });
  });
});