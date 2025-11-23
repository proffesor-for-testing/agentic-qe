/**
 * Memory Instrumentation Integration Tests
 *
 * Tests that SwarmMemoryManager properly integrates with OpenTelemetry
 * memory instrumentation for distributed tracing of memory operations.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { memorySpanManager } from '../../../src/telemetry/instrumentation/memory';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('Memory Instrumentation Integration', () => {
  let memoryManager: SwarmMemoryManager;
  let tempDbPath: string;

  beforeEach(async () => {
    // Create temporary database for testing
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-memory-test-'));
    tempDbPath = path.join(tempDir, 'test-memory.db');

    memoryManager = new SwarmMemoryManager(tempDbPath);
    await memoryManager.initialize();
  });

  afterEach(async () => {
    // Clean up
    await memoryManager.close();
    if (tempDbPath) {
      const tempDir = path.dirname(tempDbPath);
      await fs.remove(tempDir);
    }
  });

  describe('Store Operation Instrumentation', () => {
    it('should instrument memory store operations', async () => {
      const testData = { message: 'test value', timestamp: Date.now() };

      // Store should complete successfully with instrumentation
      await expect(
        memoryManager.store('test-key', testData, {
          partition: 'test-namespace',
          owner: 'test-agent',
          ttl: 300
        })
      ).resolves.not.toThrow();

      // Verify data was stored
      const retrieved = await memoryManager.retrieve('test-key', {
        partition: 'test-namespace'
      });

      expect(retrieved).toEqual(testData);
    });

    it('should record value size in instrumentation', async () => {
      const largeData = {
        items: Array(100).fill({ id: 1, name: 'test', data: 'x'.repeat(100) })
      };

      await memoryManager.store('large-key', largeData, {
        partition: 'test-namespace',
        owner: 'test-agent'
      });

      // Verify large data was stored correctly
      const retrieved = await memoryManager.retrieve('large-key', {
        partition: 'test-namespace'
      });

      expect(retrieved).toEqual(largeData);
    });

    it('should handle auto-initialization when storing after close', async () => {
      // Close the database
      await memoryManager.close();

      // Store should auto-initialize and succeed
      await expect(
        memoryManager.store('error-key', { test: 'data' }, {
          partition: 'test-namespace'
        })
      ).resolves.not.toThrow();

      // Verify data was stored
      const retrieved = await memoryManager.retrieve('error-key', {
        partition: 'test-namespace'
      });

      expect(retrieved).toEqual({ test: 'data' });
    });
  });

  describe('Retrieve Operation Instrumentation', () => {
    beforeEach(async () => {
      // Pre-populate test data
      await memoryManager.store('existing-key', { value: 'test' }, {
        partition: 'test-namespace',
        owner: 'test-agent'
      });
    });

    it('should instrument successful retrieve operations', async () => {
      const result = await memoryManager.retrieve('existing-key', {
        partition: 'test-namespace'
      });

      expect(result).toEqual({ value: 'test' });
    });

    it('should instrument retrieve operations for non-existent keys', async () => {
      const result = await memoryManager.retrieve('non-existent', {
        partition: 'test-namespace'
      });

      expect(result).toBeNull();
    });

    it('should record value size on successful retrieval', async () => {
      const largeValue = { data: 'x'.repeat(10000) };
      await memoryManager.store('large-value', largeValue, {
        partition: 'test-namespace'
      });

      const result = await memoryManager.retrieve('large-value', {
        partition: 'test-namespace'
      });

      expect(result).toEqual(largeValue);
    });
  });

  describe('Search Operation Instrumentation', () => {
    beforeEach(async () => {
      // Pre-populate test data with pattern
      await memoryManager.store('user-001', { name: 'Alice' }, {
        partition: 'users',
        owner: 'test-agent'
      });
      await memoryManager.store('user-002', { name: 'Bob' }, {
        partition: 'users',
        owner: 'test-agent'
      });
      await memoryManager.store('admin-001', { name: 'Admin' }, {
        partition: 'users',
        owner: 'test-agent'
      });
    });

    it('should instrument search operations', async () => {
      const results = await memoryManager.query('user-%', {
        partition: 'users'
      });

      expect(results).toHaveLength(2);
      expect(results.map(r => r.key)).toEqual(
        expect.arrayContaining(['user-001', 'user-002'])
      );
    });

    it('should record result count in instrumentation', async () => {
      const allResults = await memoryManager.query('%', {
        partition: 'users'
      });

      expect(allResults.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle empty search results', async () => {
      const results = await memoryManager.query('nonexistent-%', {
        partition: 'users'
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('Delete Operation Instrumentation', () => {
    beforeEach(async () => {
      // Pre-populate test data
      await memoryManager.store('delete-target', { value: 'delete-me' }, {
        partition: 'test-namespace',
        owner: 'test-agent'
      });
    });

    it('should instrument delete operations', async () => {
      await memoryManager.delete('delete-target', 'test-namespace');

      // Verify deletion
      const result = await memoryManager.retrieve('delete-target', {
        partition: 'test-namespace'
      });

      expect(result).toBeNull();
    });

    it('should handle deleting non-existent keys', async () => {
      // Should not throw error
      await expect(
        memoryManager.delete('non-existent', 'test-namespace')
      ).resolves.not.toThrow();
    });
  });

  describe('Error Handling in Instrumentation', () => {
    it('should handle operations with auto-initialization', async () => {
      await memoryManager.close();

      // Store should auto-initialize
      await expect(
        memoryManager.store('key', { data: 'test' }, {
          partition: 'test-namespace'
        })
      ).resolves.not.toThrow();

      // Retrieve should also auto-initialize
      await expect(
        memoryManager.retrieve('key', {
          partition: 'test-namespace'
        })
      ).resolves.toEqual({ data: 'test' });
    });
  });

  describe('Performance Tracking', () => {
    it('should track operation duration for all operations', async () => {
      // Operations should complete in reasonable time
      const startTime = Date.now();

      await memoryManager.store('perf-test', { data: 'test' }, {
        partition: 'performance'
      });

      const storeTime = Date.now() - startTime;
      expect(storeTime).toBeLessThan(100); // Should be fast (< 100ms)

      const retrieveStart = Date.now();
      await memoryManager.retrieve('perf-test', {
        partition: 'performance'
      });

      const retrieveTime = Date.now() - retrieveStart;
      expect(retrieveTime).toBeLessThan(100);
    });
  });
});
