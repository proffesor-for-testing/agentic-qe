/**
 * memory/memory-query Test Suite
 *
 * Tests for memory system queries with pattern matching, time filtering, and pagination.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MemoryQueryHandler } from '@mcp/handlers/memory/memory-query';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services to prevent heavy initialization (database, EventBus, etc.)
jest.mock('../../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../../src/mcp/services/HookExecutor.js');

describe('MemoryQueryHandler', () => {
  let handler: MemoryQueryHandler;
  let mockRegistry: any;
  let mockHookExecutor: any;
  let memoryStore: Map<string, any>;

  beforeEach(() => {
    mockRegistry = { getAgent: jest.fn(), listAgents: jest.fn().mockReturnValue([]) } as any;
    mockHookExecutor = { executePreTask: jest.fn().mockResolvedValue(undefined), executePostTask: jest.fn().mockResolvedValue(undefined), executePostEdit: jest.fn().mockResolvedValue(undefined), notify: jest.fn().mockResolvedValue(undefined) } as any;
    memoryStore = new Map();
    handler = new MemoryQueryHandler(mockRegistry, mockHookExecutor, memoryStore);

    // Populate with test data
    const now = Date.now();
    memoryStore.set('test:item1', {
      key: 'test:item1',
      value: 'value1',
      namespace: 'test',
      timestamp: now - 5000,
      ttl: 0,
      metadata: { type: 'test' }
    });

    memoryStore.set('test:item2', {
      key: 'test:item2',
      value: 'value2',
      namespace: 'test',
      timestamp: now - 3000,
      ttl: 0,
      metadata: { type: 'test' }
    });

    memoryStore.set('prod:config', {
      key: 'prod:config',
      value: { env: 'production' },
      namespace: 'prod',
      timestamp: now - 1000,
      ttl: 0,
      metadata: { type: 'config' }
    });
  });

  describe('Happy Path', () => {
    it('should query all records successfully', async () => {
      const response = await handler.handle({});

      expect(response.success).toBe(true);
      expect(response.data.records).toBeDefined();
      expect(response.data.records.length).toBeGreaterThan(0);
      expect(response.data.pagination).toBeDefined();
    });

    it('should filter by namespace', async () => {
      const response = await handler.handle({
        namespace: 'test'
      });

      expect(response.success).toBe(true);
      expect(response.data.records).toHaveLength(2);
      response.data.records.forEach((r: any) => {
        expect(r.namespace).toBe('test');
      });
    });

    it('should filter by pattern', async () => {
      const response = await handler.handle({
        pattern: 'test:item*'
      });

      expect(response.success).toBe(true);
      expect(response.data.records.length).toBeGreaterThanOrEqual(2);
      response.data.records.forEach((r: any) => {
        expect(r.key).toMatch(/^test:item/);
      });
    });

    it('should apply time range filter', async () => {
      const now = Date.now();
      const response = await handler.handle({
        startTime: now - 4000,
        endTime: now
      });

      expect(response.success).toBe(true);
      response.data.records.forEach((r: any) => {
        expect(r.timestamp).toBeGreaterThanOrEqual(now - 4000);
        expect(r.timestamp).toBeLessThanOrEqual(now);
      });
    });

    it('should paginate results', async () => {
      const response = await handler.handle({
        limit: 1,
        offset: 0
      });

      expect(response.success).toBe(true);
      expect(response.data.records).toHaveLength(1);
      expect(response.data.pagination.limit).toBe(1);
      expect(response.data.pagination.offset).toBe(0);
    });

    it('should return sorted records by timestamp', async () => {
      const response = await handler.handle({
        namespace: 'test'
      });

      expect(response.success).toBe(true);
      const timestamps = response.data.records.map((r: any) => r.timestamp);

      // Should be sorted newest first
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i-1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    });
  });

  describe('Pattern Matching', () => {
    beforeEach(() => {
      memoryStore.clear();
      memoryStore.set('users:john', { key: 'users:john', value: 'John', namespace: 'users', timestamp: Date.now(), ttl: 0, metadata: {} });
      memoryStore.set('users:jane', { key: 'users:jane', value: 'Jane', namespace: 'users', timestamp: Date.now(), ttl: 0, metadata: {} });
      memoryStore.set('posts:post1', { key: 'posts:post1', value: 'Post 1', namespace: 'posts', timestamp: Date.now(), ttl: 0, metadata: {} });
    });

    it('should handle wildcard patterns', async () => {
      const response = await handler.handle({
        pattern: 'users:*'
      });

      expect(response.success).toBe(true);
      expect(response.data.records).toHaveLength(2);
      response.data.records.forEach((r: any) => {
        expect(r.key).toMatch(/^users:/);
      });
    });

    it('should handle multiple wildcards', async () => {
      memoryStore.set('test:a:b:c', { key: 'test:a:b:c', value: 'nested', namespace: 'test', timestamp: Date.now(), ttl: 0, metadata: {} });

      const response = await handler.handle({
        pattern: 'test:*:*:*'
      });

      expect(response.success).toBe(true);
      expect(response.data.records.length).toBeGreaterThan(0);
    });

    it('should handle partial patterns', async () => {
      const response = await handler.handle({
        pattern: '*:john'
      });

      expect(response.success).toBe(true);
      expect(response.data.records.some((r: any) => r.key === 'users:john')).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should use default values for optional params', async () => {
      const response = await handler.handle({});

      expect(response.success).toBe(true);
      expect(response.data.pagination.limit).toBe(100);
      expect(response.data.pagination.offset).toBe(0);
    });

    it('should respect custom limit', async () => {
      const response = await handler.handle({
        limit: 5
      });

      expect(response.success).toBe(true);
      expect(response.data.pagination.limit).toBe(5);
      expect(response.data.records.length).toBeLessThanOrEqual(5);
    });

    it('should respect custom offset', async () => {
      const allResponse = await handler.handle({});
      const offsetResponse = await handler.handle({
        offset: 1
      });

      expect(offsetResponse.success).toBe(true);
      expect(offsetResponse.data.pagination.offset).toBe(1);

      if (allResponse.data.records.length > 1) {
        expect(offsetResponse.data.records[0].key).not.toBe(allResponse.data.records[0].key);
      }
    });
  });

  describe('Expired Records', () => {
    beforeEach(() => {
      const now = Date.now();
      memoryStore.set('temp:expired', {
        key: 'temp:expired',
        value: 'expired',
        namespace: 'temp',
        timestamp: now - 10000,
        ttl: 5, // 5 seconds, already expired
        metadata: {}
      });

      memoryStore.set('temp:valid', {
        key: 'temp:valid',
        value: 'valid',
        namespace: 'temp',
        timestamp: now,
        ttl: 3600,
        metadata: {}
      });
    });

    it('should exclude expired records by default', async () => {
      const response = await handler.handle({
        namespace: 'temp',
        includeExpired: false
      });

      expect(response.success).toBe(true);
      expect(response.data.records.some((r: any) => r.key === 'temp:expired')).toBe(false);
      expect(response.data.records.some((r: any) => r.key === 'temp:valid')).toBe(true);
    });

    it('should include expired records when requested', async () => {
      const response = await handler.handle({
        namespace: 'temp',
        includeExpired: true
      });

      expect(response.success).toBe(true);
      expect(response.data.records.some((r: any) => r.key === 'temp:expired')).toBe(true);
      expect(response.data.records.some((r: any) => r.key === 'temp:valid')).toBe(true);
    });

    it('should not filter records with ttl=0', async () => {
      const response = await handler.handle({
        namespace: 'test'
      });

      expect(response.success).toBe(true);
      // All test records have ttl=0, should all be included
      expect(response.data.records.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      const errorStore = {
        entries: jest.fn(() => { throw new Error('Query error'); })
      } as any;

      const errorHandler = new MemoryQueryHandler(mockRegistry, mockHookExecutor, errorStore);

      const response = await errorHandler.handle({});

      expect(response.success).toBe(false);
      expect(response.error).toContain('Query error');
    });

    it('should provide meaningful error messages', async () => {
      const errorStore = new Map();
      const errorHandler = new MemoryQueryHandler(mockRegistry, mockHookExecutor, errorStore);

      // Mock the entries method to throw
      Object.defineProperty(errorStore, 'entries', {
        value: () => { throw new Error('Custom error'); }
      });

      const response = await errorHandler.handle({});

      expect(response.success).toBe(false);
      expect(typeof response.error).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty memory store', async () => {
      memoryStore.clear();

      const response = await handler.handle({});

      expect(response.success).toBe(true);
      expect(response.data.records).toHaveLength(0);
      expect(response.data.pagination.total).toBe(0);
    });

    it('should handle concurrent queries', async () => {
      const promises = Array.from({ length: 10 }, () =>
        handler.handle({ namespace: 'test' })
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.records).toBeDefined();
      });
    });

    it('should handle very large result sets with pagination', async () => {
      // Add many records
      for (let i = 0; i < 200; i++) {
        memoryStore.set(`bulk:item${i}`, {
          key: `bulk:item${i}`,
          value: `value${i}`,
          namespace: 'bulk',
          timestamp: Date.now(),
          ttl: 0,
          metadata: {}
        });
      }

      const response = await handler.handle({
        namespace: 'bulk',
        limit: 50
      });

      expect(response.success).toBe(true);
      expect(response.data.records).toHaveLength(50);
      expect(response.data.pagination.total).toBe(200);
      expect(response.data.pagination.hasMore).toBe(true);
    });

    it('should handle special characters in patterns', async () => {
      memoryStore.set('special:key.with.dots', {
        key: 'special:key.with.dots',
        value: 'data',
        namespace: 'special',
        timestamp: Date.now(),
        ttl: 0,
        metadata: {}
      });

      const response = await handler.handle({
        pattern: 'special:key*'
      });

      expect(response.success).toBe(true);
      expect(response.data.records.some((r: any) => r.key === 'special:key.with.dots')).toBe(true);
    });
  });

  describe('QE Agent Coordination Queries', () => {
    beforeEach(() => {
      memoryStore.clear();
      const now = Date.now();

      // Test plan data
      memoryStore.set('aqe/test-plan:suite1', {
        key: 'aqe/test-plan:suite1',
        value: { suite: 'UserService', tests: 15 },
        namespace: 'aqe/test-plan',
        timestamp: now - 1000,
        ttl: 0,
        metadata: { agentId: 'qe-test-generator' }
      });

      // Coverage data
      memoryStore.set('aqe/coverage:report', {
        key: 'aqe/coverage:report',
        value: { lines: 85.5, branches: 72.3 },
        namespace: 'aqe/coverage',
        timestamp: now - 500,
        ttl: 0,
        metadata: { agentId: 'qe-coverage-analyzer' }
      });

      // Quality data
      memoryStore.set('aqe/quality:metrics', {
        key: 'aqe/quality:metrics',
        value: { score: 92.5 },
        namespace: 'aqe/quality',
        timestamp: now,
        ttl: 0,
        metadata: { agentId: 'qe-quality-gate' }
      });
    });

    it('should query QE coordination data', async () => {
      const response = await handler.handle({
        pattern: 'aqe/*'
      });

      expect(response.success).toBe(true);
      expect(response.data.records.length).toBeGreaterThanOrEqual(3);
      response.data.records.forEach((r: any) => {
        expect(r.key).toMatch(/^aqe\//);
      });
    });

    it('should filter by QE namespace', async () => {
      const response = await handler.handle({
        namespace: 'aqe/coverage'
      });

      expect(response.success).toBe(true);
      expect(response.data.records).toHaveLength(1);
      expect(response.data.records[0].key).toBe('aqe/coverage:report');
      expect(response.data.records[0].value.lines).toBe(85.5);
    });

    it('should support recent coordination queries', async () => {
      const now = Date.now();
      const response = await handler.handle({
        pattern: 'aqe/*',
        startTime: now - 2000
      });

      expect(response.success).toBe(true);
      expect(response.data.records.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const startTime = Date.now();
      await handler.handle({ namespace: 'test' });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle large queries efficiently', async () => {
      // Add 1000 records
      for (let i = 0; i < 1000; i++) {
        memoryStore.set(`perf:item${i}`, {
          key: `perf:item${i}`,
          value: `value${i}`,
          namespace: 'perf',
          timestamp: Date.now(),
          ttl: 0,
          metadata: {}
        });
      }

      const startTime = Date.now();
      await handler.handle({
        namespace: 'perf',
        limit: 100
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe('Pagination Edge Cases', () => {
    it('should indicate hasMore correctly', async () => {
      const response1 = await handler.handle({
        namespace: 'test',
        limit: 1
      });

      expect(response1.data.pagination.hasMore).toBe(true);

      const response2 = await handler.handle({
        namespace: 'test',
        limit: 100
      });

      expect(response2.data.pagination.hasMore).toBe(false);
    });

    it('should handle offset beyond total', async () => {
      const response = await handler.handle({
        namespace: 'test',
        offset: 1000
      });

      expect(response.success).toBe(true);
      expect(response.data.records).toHaveLength(0);
      expect(response.data.pagination.hasMore).toBe(false);
    });
  });
});
