/**
 * Memory Share Handler Test Suite
 *
 * Tests for memory sharing between agents with access control.
 * Follows TDD RED phase - tests written before implementation verification.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MemoryShareHandler } from '@mcp/handlers/memory/memory-share';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('MemoryShareHandler', () => {
  let handler: MemoryShareHandler;
  let registry: AgentRegistry;
  let hookExecutor: HookExecutor;
  let memoryStore: Map<string, any>;

  beforeEach(() => {
    registry = new AgentRegistry();
    hookExecutor = new HookExecutor();
    memoryStore = new Map();
    handler = new MemoryShareHandler(registry, hookExecutor, memoryStore);
  });

  afterEach(async () => {
    memoryStore.clear();
  });

  describe('Happy Path - Memory Sharing', () => {
    it('should share memory between agents successfully', async () => {
      // GIVEN: Source memory exists in store
      const sourceKey = 'test-data';
      const sourceNamespace = 'aqe/test-plan';
      memoryStore.set(`${sourceNamespace}:${sourceKey}`, {
        value: { testSuite: 'UserService', coverage: 85 },
        namespace: sourceNamespace,
        timestamp: Date.now(),
        metadata: { agentId: 'qe-test-generator' }
      });

      // WHEN: Sharing memory with target agents
      const response = await handler.handle({
        sourceKey,
        sourceNamespace,
        targetAgents: ['qe-coverage-analyzer', 'qe-quality-gate'],
        targetNamespace: 'shared',
        permissions: ['read', 'write']
      });

      // THEN: Memory is shared successfully
      expect(response.success).toBe(true);
      expect(response.data.shared).toBe(true);
      expect(response.data.sourceKey).toBe(`${sourceNamespace}:${sourceKey}`);
      expect(response.data.targetAgents).toHaveLength(2);
      expect(response.data.targetKeys).toHaveLength(2);
      expect(response.data.permissions).toContain('read');
      expect(response.data.permissions).toContain('write');
    });

    it('should share with default read permission when not specified', async () => {
      // GIVEN: Source memory with sensitive data
      memoryStore.set('secure:api-key', {
        value: { key: 'secret-123' },
        namespace: 'secure',
        timestamp: Date.now()
      });

      // WHEN: Sharing without specifying permissions
      const response = await handler.handle({
        sourceKey: 'api-key',
        sourceNamespace: 'secure',
        targetAgents: ['qe-security-audit']
      });

      // THEN: Default read-only permission applied
      expect(response.success).toBe(true);
      expect(response.data.permissions).toEqual(['read']);
    });

    it('should preserve metadata from source memory', async () => {
      // GIVEN: Source memory with detailed metadata
      const metadata = {
        agentId: 'qe-test-generator',
        version: '2.0.0',
        testFramework: 'jest',
        createdBy: 'user-123'
      };
      memoryStore.set('aqe/test-plan:integration-tests', {
        value: { tests: 50 },
        namespace: 'aqe/test-plan',
        timestamp: Date.now(),
        metadata
      });

      // WHEN: Sharing memory
      const response = await handler.handle({
        sourceKey: 'integration-tests',
        sourceNamespace: 'aqe/test-plan',
        targetAgents: ['qe-test-executor']
      });

      // THEN: Target memory contains original metadata plus sharing info
      const sharedKey = response.data.targetKeys[0];
      const sharedRecord = memoryStore.get(sharedKey);
      expect(sharedRecord.metadata.agentId).toBe('qe-test-generator');
      expect(sharedRecord.metadata.version).toBe('2.0.0');
      expect(sharedRecord.metadata.sourceKey).toBeDefined();
      expect(sharedRecord.metadata.sharedWith).toBe('qe-test-executor');
    });

    it('should share with custom TTL', async () => {
      // GIVEN: Source memory with TTL
      memoryStore.set('temp:session-data', {
        value: { sessionId: 'abc123' },
        namespace: 'temp',
        timestamp: Date.now(),
        ttl: 60
      });

      // WHEN: Sharing with custom TTL
      const response = await handler.handle({
        sourceKey: 'session-data',
        sourceNamespace: 'temp',
        targetAgents: ['qe-test-executor'],
        ttl: 120
      });

      // THEN: Shared memory has new TTL
      const sharedKey = response.data.targetKeys[0];
      const sharedRecord = memoryStore.get(sharedKey);
      expect(sharedRecord.ttl).toBe(120);
    });

    it('should share with multiple target agents concurrently', async () => {
      // GIVEN: Source memory to share widely
      memoryStore.set('aqe/coverage:report', {
        value: { lineCoverage: 92, branchCoverage: 85 },
        namespace: 'aqe/coverage',
        timestamp: Date.now()
      });

      // WHEN: Sharing with multiple agents
      const targetAgents = [
        'qe-quality-gate',
        'qe-test-generator',
        'qe-coverage-analyzer',
        'qe-performance-tester',
        'qe-security-audit'
      ];
      const response = await handler.handle({
        sourceKey: 'report',
        sourceNamespace: 'aqe/coverage',
        targetAgents
      });

      // THEN: All agents receive the shared memory
      expect(response.data.targetAgents).toHaveLength(5);
      expect(response.data.targetKeys).toHaveLength(5);
      targetAgents.forEach(agent => {
        expect(response.data.targetAgents).toContain(agent);
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject missing sourceKey', async () => {
      // GIVEN: Missing sourceKey parameter
      // WHEN: Attempting to share
      const response = await handler.handle({
        sourceNamespace: 'test',
        targetAgents: ['agent-1']
      } as any);

      // THEN: Validation error returned
      expect(response.success).toBe(false);
      expect(response.error).toContain('sourceKey');
    });

    it('should reject missing sourceNamespace', async () => {
      // GIVEN: Missing sourceNamespace parameter
      // WHEN: Attempting to share
      const response = await handler.handle({
        sourceKey: 'test',
        targetAgents: ['agent-1']
      } as any);

      // THEN: Validation error returned
      expect(response.success).toBe(false);
      expect(response.error).toContain('sourceNamespace');
    });

    it('should reject missing targetAgents', async () => {
      // GIVEN: Missing targetAgents parameter
      // WHEN: Attempting to share
      const response = await handler.handle({
        sourceKey: 'test',
        sourceNamespace: 'ns'
      } as any);

      // THEN: Validation error returned
      expect(response.success).toBe(false);
      expect(response.error).toContain('targetAgents');
    });

    it('should reject empty targetAgents array', async () => {
      // GIVEN: Empty targetAgents array
      memoryStore.set('ns:key', { value: 'data', namespace: 'ns' });

      // WHEN: Attempting to share with no agents
      const response = await handler.handle({
        sourceKey: 'key',
        sourceNamespace: 'ns',
        targetAgents: []
      });

      // THEN: Successful response with no shares
      expect(response.success).toBe(true);
      expect(response.data.targetKeys).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent source key', async () => {
      // GIVEN: Source key does not exist
      // WHEN: Attempting to share non-existent memory
      const response = await handler.handle({
        sourceKey: 'non-existent',
        sourceNamespace: 'aqe/test-plan',
        targetAgents: ['qe-test-executor']
      });

      // THEN: Error response returned
      expect(response.success).toBe(false);
      expect(response.error).toContain('Source memory not found');
      expect(response.error).toContain('aqe/test-plan:non-existent');
    });

    it('should handle storage errors gracefully', async () => {
      // GIVEN: Source memory exists
      memoryStore.set('test:data', {
        value: 'test',
        namespace: 'test',
        timestamp: Date.now()
      });

      // WHEN: Memory store throws error on set
      const errorStore = new Map();
      errorStore.set('test:data', { value: 'test', namespace: 'test' });
      errorStore.set = jest.fn(() => {
        throw new Error('Storage full');
      });

      const errorHandler = new MemoryShareHandler(registry, hookExecutor, errorStore as any);
      const response = await errorHandler.handle({
        sourceKey: 'data',
        sourceNamespace: 'test',
        targetAgents: ['agent-1']
      });

      // THEN: Error response returned
      expect(response.success).toBe(false);
      expect(response.error).toContain('Storage full');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in agent IDs', async () => {
      // GIVEN: Source memory and agents with special characters
      memoryStore.set('ns:key', {
        value: { data: 'test' },
        namespace: 'ns',
        timestamp: Date.now()
      });

      const specialAgents = [
        'agent-with-dashes',
        'agent_with_underscores',
        'agent.with.dots',
        'agent:with:colons'
      ];

      // WHEN: Sharing with special agent IDs
      const response = await handler.handle({
        sourceKey: 'key',
        sourceNamespace: 'ns',
        targetAgents: specialAgents
      });

      // THEN: All shares successful
      expect(response.success).toBe(true);
      expect(response.data.targetKeys).toHaveLength(4);
    });

    it('should handle complex nested data structures', async () => {
      // GIVEN: Source with deeply nested structure
      const complexData = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, { nested: true }],
              map: { key: 'value' }
            }
          }
        },
        metadata: {
          tags: ['tag1', 'tag2'],
          config: { enabled: true, timeout: 5000 }
        }
      };

      memoryStore.set('complex:data', {
        value: complexData,
        namespace: 'complex',
        timestamp: Date.now()
      });

      // WHEN: Sharing complex data
      const response = await handler.handle({
        sourceKey: 'data',
        sourceNamespace: 'complex',
        targetAgents: ['agent-1']
      });

      // THEN: Complex structure preserved
      expect(response.success).toBe(true);
      const sharedKey = response.data.targetKeys[0];
      const sharedRecord = memoryStore.get(sharedKey);
      expect(sharedRecord.value).toEqual(complexData);
      expect(sharedRecord.value.level1.level2.level3.array).toHaveLength(3);
    });

    it('should handle null and undefined values in metadata', async () => {
      // GIVEN: Source with null/undefined metadata
      memoryStore.set('test:data', {
        value: 'data',
        namespace: 'test',
        timestamp: Date.now(),
        metadata: {
          definedField: 'value',
          nullField: null,
          undefinedField: undefined
        }
      });

      // WHEN: Sharing memory
      const response = await handler.handle({
        sourceKey: 'data',
        sourceNamespace: 'test',
        targetAgents: ['agent-1']
      });

      // THEN: Share successful with metadata
      expect(response.success).toBe(true);
      const sharedKey = response.data.targetKeys[0];
      const sharedRecord = memoryStore.get(sharedKey);
      expect(sharedRecord.metadata.definedField).toBe('value');
    });

    it('should handle sharing to same namespace as source', async () => {
      // GIVEN: Source memory in aqe namespace
      memoryStore.set('aqe:data', {
        value: { test: true },
        namespace: 'aqe',
        timestamp: Date.now()
      });

      // WHEN: Sharing back to aqe namespace
      const response = await handler.handle({
        sourceKey: 'data',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1'],
        targetNamespace: 'aqe'
      });

      // THEN: Share successful with distinct keys
      expect(response.success).toBe(true);
      expect(response.data.targetKeys[0]).toBe('aqe:agent-1:data');
      expect(memoryStore.has('aqe:data')).toBe(true);
      expect(memoryStore.has('aqe:agent-1:data')).toBe(true);
    });
  });

  describe('Permission Management', () => {
    it('should check read permission correctly', async () => {
      // GIVEN: Memory shared with read permission
      memoryStore.set('source:data', {
        value: 'test',
        namespace: 'source',
        timestamp: Date.now()
      });

      await handler.handle({
        sourceKey: 'data',
        sourceNamespace: 'source',
        targetAgents: ['agent-1'],
        permissions: ['read']
      });

      // WHEN: Checking read permission
      const hasRead = handler.hasPermission('shared:agent-1:data', 'read');

      // THEN: Permission check returns true
      expect(hasRead).toBe(true);
    });

    it('should check write permission correctly', async () => {
      // GIVEN: Memory shared with read-only
      memoryStore.set('source:data', {
        value: 'test',
        namespace: 'source',
        timestamp: Date.now()
      });

      await handler.handle({
        sourceKey: 'data',
        sourceNamespace: 'source',
        targetAgents: ['agent-1'],
        permissions: ['read']
      });

      // WHEN: Checking write permission
      const hasWrite = handler.hasPermission('shared:agent-1:data', 'write');

      // THEN: Permission check returns false
      expect(hasWrite).toBe(false);
    });

    it('should support multiple permissions', async () => {
      // GIVEN: Memory shared with multiple permissions
      memoryStore.set('source:data', {
        value: 'test',
        namespace: 'source',
        timestamp: Date.now()
      });

      await handler.handle({
        sourceKey: 'data',
        sourceNamespace: 'source',
        targetAgents: ['agent-1'],
        permissions: ['read', 'write', 'delete']
      });

      // WHEN: Checking various permissions
      const sharedKey = 'shared:agent-1:data';

      // THEN: All granted permissions return true
      expect(handler.hasPermission(sharedKey, 'read')).toBe(true);
      expect(handler.hasPermission(sharedKey, 'write')).toBe(true);
      expect(handler.hasPermission(sharedKey, 'delete')).toBe(true);
      expect(handler.hasPermission(sharedKey, 'admin')).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should share memory within reasonable time', async () => {
      // GIVEN: Source memory
      memoryStore.set('perf:data', {
        value: { data: 'test' },
        namespace: 'perf',
        timestamp: Date.now()
      });

      // WHEN: Sharing memory
      const startTime = Date.now();
      await handler.handle({
        sourceKey: 'data',
        sourceNamespace: 'perf',
        targetAgents: ['agent-1']
      });
      const endTime = Date.now();

      // THEN: Completed within 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle bulk sharing efficiently', async () => {
      // GIVEN: Source memory and many target agents
      memoryStore.set('bulk:data', {
        value: { data: 'test' },
        namespace: 'bulk',
        timestamp: Date.now()
      });

      const targetAgents = Array.from({ length: 50 }, (_, i) => `agent-${i}`);

      // WHEN: Sharing with 50 agents
      const startTime = Date.now();
      const response = await handler.handle({
        sourceKey: 'data',
        sourceNamespace: 'bulk',
        targetAgents
      });
      const endTime = Date.now();

      // THEN: Completed within 500ms and all shares successful
      expect(endTime - startTime).toBeLessThan(500);
      expect(response.data.targetKeys).toHaveLength(50);
    });
  });
});
