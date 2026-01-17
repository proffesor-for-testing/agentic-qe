/**
 * memory/memory-retrieve Test Suite
 *
 * Tests for memory data retrieval with expiration checking.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MemoryRetrieveHandler } from '@mcp/handlers/memory/memory-retrieve';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services to prevent heavy initialization (database, EventBus, etc.)
jest.mock('../../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../../src/mcp/services/HookExecutor.js');

describe('MemoryRetrieveHandler', () => {
  let handler: MemoryRetrieveHandler;
  let mockRegistry: any;
  let mockHookExecutor: any;
  let memoryStore: Map<string, any>;

  beforeEach(() => {
    mockRegistry = { getAgent: jest.fn(), listAgents: jest.fn().mockReturnValue([]) } as any;
    mockHookExecutor = { executePreTask: jest.fn().mockResolvedValue(undefined), executePostTask: jest.fn().mockResolvedValue(undefined), executePostEdit: jest.fn().mockResolvedValue(undefined), notify: jest.fn().mockResolvedValue(undefined) } as any;
    memoryStore = new Map();
    handler = new MemoryRetrieveHandler(mockRegistry, mockHookExecutor, memoryStore);
  });

  describe('Happy Path', () => {
    it('should retrieve stored value successfully', async () => {
      // Store test data
      memoryStore.set('default:test-key', {
        key: 'default:test-key',
        value: 'test-value',
        namespace: 'default',
        timestamp: Date.now(),
        ttl: 0,
        metadata: {},
        persistent: false
      });

      const response = await handler.handle({
        key: 'test-key',
        namespace: 'default'
      });

      expect(response.success).toBe(true);
      expect(response.data.found).toBe(true);
      expect(response.data.value).toBe('test-value');
      expect(response.data.key).toBe('default:test-key');
    });

    it('should retrieve complex object', async () => {
      const testData = {
        testSuite: 'UserService',
        tests: [
          { name: 'should create user', status: 'pass' },
          { name: 'should update user', status: 'pass' }
        ],
        coverage: 85.5
      };

      memoryStore.set('aqe/test-plan:generated', {
        key: 'aqe/test-plan:generated',
        value: testData,
        namespace: 'aqe/test-plan',
        timestamp: Date.now(),
        ttl: 0,
        metadata: { agentId: 'qe-test-generator' },
        persistent: false
      });

      const response = await handler.handle({
        key: 'generated',
        namespace: 'aqe/test-plan'
      });

      expect(response.success).toBe(true);
      expect(response.data.value.testSuite).toBe('UserService');
      expect(response.data.value.tests).toHaveLength(2);
      expect(response.data.value.coverage).toBe(85.5);
    });

    it('should retrieve with metadata when requested', async () => {
      const now = Date.now();
      memoryStore.set('users:profile', {
        key: 'users:profile',
        value: { name: 'John Doe' },
        namespace: 'users',
        timestamp: now,
        ttl: 3600,
        metadata: { agentId: 'qe-test-executor', version: '1.0.0' },
        persistent: true
      });

      const response = await handler.handle({
        key: 'profile',
        namespace: 'users',
        includeMetadata: true
      });

      expect(response.success).toBe(true);
      expect(response.data.metadata).toBeDefined();
      expect(response.data.metadata.timestamp).toBe(now);
      expect(response.data.metadata.ttl).toBe(3600);
      expect(response.data.metadata.persistent).toBe(true);
      expect(response.data.metadata.agentId).toBe('qe-test-executor');
    });

    it('should not include metadata when not requested', async () => {
      memoryStore.set('test:data', {
        key: 'test:data',
        value: 'value',
        namespace: 'test',
        timestamp: Date.now(),
        ttl: 0,
        metadata: { secret: 'hidden' },
        persistent: false
      });

      const response = await handler.handle({
        key: 'data',
        namespace: 'test',
        includeMetadata: false
      });

      expect(response.success).toBe(true);
      expect(response.data.metadata).toBeUndefined();
    });
  });

  describe('Input Validation', () => {
    it('should reject missing key', async () => {
      const response = await handler.handle({
        namespace: 'default'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('key');
    });

    it('should use default namespace when not provided', async () => {
      memoryStore.set('default:test', {
        key: 'default:test',
        value: 'data',
        namespace: 'default',
        timestamp: Date.now(),
        ttl: 0,
        metadata: {},
        persistent: false
      });

      const response = await handler.handle({
        key: 'test'
      });

      expect(response.success).toBe(true);
      expect(response.data.namespace).toBe('default');
    });
  });

  describe('Not Found Cases', () => {
    it('should return not found for non-existent key', async () => {
      const response = await handler.handle({
        key: 'non-existent',
        namespace: 'test'
      });

      expect(response.success).toBe(true);
      expect(response.data.found).toBe(false);
      expect(response.data.value).toBeNull();
    });

    it('should return not found for wrong namespace', async () => {
      memoryStore.set('ns1:key', {
        key: 'ns1:key',
        value: 'data',
        namespace: 'ns1',
        timestamp: Date.now(),
        ttl: 0,
        metadata: {},
        persistent: false
      });

      const response = await handler.handle({
        key: 'key',
        namespace: 'ns2' // Different namespace
      });

      expect(response.success).toBe(true);
      expect(response.data.found).toBe(false);
    });
  });

  describe('TTL and Expiration', () => {
    it('should detect expired data', async () => {
      const pastTimestamp = Date.now() - 10000; // 10 seconds ago

      memoryStore.set('temp:expired', {
        key: 'temp:expired',
        value: 'should-be-expired',
        namespace: 'temp',
        timestamp: pastTimestamp,
        ttl: 5, // 5 seconds TTL
        metadata: {},
        persistent: false
      });

      const response = await handler.handle({
        key: 'expired',
        namespace: 'temp'
      });

      expect(response.success).toBe(true);
      expect(response.data.found).toBe(false);
      expect(response.data.expired).toBe(true);

      // Should be removed from store
      expect(memoryStore.has('temp:expired')).toBe(false);
    });

    it('should not expire data with ttl=0', async () => {
      const oldTimestamp = Date.now() - 100000; // Very old

      memoryStore.set('perm:data', {
        key: 'perm:data',
        value: 'permanent',
        namespace: 'perm',
        timestamp: oldTimestamp,
        ttl: 0, // No expiration
        metadata: {},
        persistent: true
      });

      const response = await handler.handle({
        key: 'data',
        namespace: 'perm'
      });

      expect(response.success).toBe(true);
      expect(response.data.found).toBe(true);
      expect(response.data.value).toBe('permanent');
      expect(response.data.expired).toBeUndefined();
    });

    it('should retrieve data before expiration', async () => {
      const now = Date.now();

      memoryStore.set('temp:valid', {
        key: 'temp:valid',
        value: 'still-valid',
        namespace: 'temp',
        timestamp: now,
        ttl: 3600, // 1 hour
        metadata: {},
        persistent: false
      });

      const response = await handler.handle({
        key: 'valid',
        namespace: 'temp'
      });

      expect(response.success).toBe(true);
      expect(response.data.found).toBe(true);
      expect(response.data.value).toBe('still-valid');
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      const errorStore = {
        get: jest.fn(() => { throw new Error('Read error'); })
      } as any;

      const errorHandler = new MemoryRetrieveHandler(mockRegistry, mockHookExecutor, errorStore);

      const response = await errorHandler.handle({
        key: 'test'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Read error');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
      expect(typeof response.error).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', async () => {
      memoryStore.set('test:null', {
        key: 'test:null',
        value: null,
        namespace: 'test',
        timestamp: Date.now(),
        ttl: 0,
        metadata: {},
        persistent: false
      });

      const response = await handler.handle({
        key: 'null',
        namespace: 'test'
      });

      expect(response.success).toBe(true);
      expect(response.data.found).toBe(true);
      expect(response.data.value).toBeNull();
    });

    it('should handle concurrent requests', async () => {
      memoryStore.set('shared:data', {
        key: 'shared:data',
        value: 'shared-value',
        namespace: 'shared',
        timestamp: Date.now(),
        ttl: 0,
        metadata: {},
        persistent: false
      });

      const promises = Array.from({ length: 10 }, () =>
        handler.handle({
          key: 'data',
          namespace: 'shared'
        })
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.found).toBe(true);
        expect(result.data.value).toBe('shared-value');
      });
    });

    it('should handle very large objects', async () => {
      const largeObject = {
        items: Array.from({ length: 1000 }, (_, i) => ({ id: i, data: `item-${i}` }))
      };

      memoryStore.set('bulk:large', {
        key: 'bulk:large',
        value: largeObject,
        namespace: 'bulk',
        timestamp: Date.now(),
        ttl: 0,
        metadata: {},
        persistent: false
      });

      const response = await handler.handle({
        key: 'large',
        namespace: 'bulk'
      });

      expect(response.success).toBe(true);
      expect(response.data.value.items).toHaveLength(1000);
    });
  });

  describe('Agent Coordination', () => {
    it('should support QE agent coordination patterns', async () => {
      const coordinationData = {
        agentId: 'qe-coverage-analyzer',
        status: 'analyzing',
        coverage: {
          lines: 85.5,
          branches: 72.3,
          functions: 90.1
        },
        gaps: [
          { file: 'UserService.ts', lines: [45, 67, 89] },
          { file: 'AuthService.ts', lines: [12, 34] }
        ]
      };

      memoryStore.set('aqe/coverage:results', {
        key: 'aqe/coverage:results',
        value: coordinationData,
        namespace: 'aqe/coverage',
        timestamp: Date.now(),
        ttl: 3600,
        metadata: { agentId: 'qe-coverage-analyzer', priority: 'high' },
        persistent: false
      });

      const response = await handler.handle({
        key: 'results',
        namespace: 'aqe/coverage',
        agentId: 'qe-test-executor',
        includeMetadata: true
      });

      expect(response.success).toBe(true);
      expect(response.data.value.agentId).toBe('qe-coverage-analyzer');
      expect(response.data.value.gaps).toHaveLength(2);
      expect(response.data.metadata.priority).toBe('high');
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      memoryStore.set('perf:test', {
        key: 'perf:test',
        value: 'data',
        namespace: 'perf',
        timestamp: Date.now(),
        ttl: 0,
        metadata: {},
        persistent: false
      });

      const startTime = Date.now();
      await handler.handle({
        key: 'test',
        namespace: 'perf'
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
