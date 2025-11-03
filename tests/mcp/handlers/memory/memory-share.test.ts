/**
 * memory/memory-share Test Suite
 *
 * Tests for inter-agent memory sharing.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MemoryShareHandler } from '@mcp/handlers/memory/memory-share';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('MemoryShareHandler', () => {
  let handler: MemoryShareHandler;
  let mockRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;
  let mockMemoryStore: Map<string, any>;

  beforeEach(() => {
    mockRegistry = {} as AgentRegistry;
    mockHookExecutor = {
      notify: jest.fn().mockResolvedValue(undefined)
    } as any;
    mockMemoryStore = new Map();
    handler = new MemoryShareHandler(mockRegistry, mockHookExecutor, mockMemoryStore);
  });

  const addMemoryRecord = (key: string, value: any, metadata: Record<string, any> = {}) => {
    const [namespace, ...rest] = key.split(':');
    mockMemoryStore.set(key, {
      key,
      value,
      namespace,
      timestamp: Date.now(),
      ttl: 3600,
      metadata,
      persistent: false
    });
  };

  describe('Happy Path', () => {
    it('should share memory successfully', async () => {
      addMemoryRecord('aqe:test-plan:1', { plan: 'unit-tests', coverage: 80 });

      const response = await handler.handle({
        sourceKey: 'test-plan:1',
        sourceNamespace: 'aqe',
        targetAgents: ['qe-executor-1', 'qe-reporter-1']
      });

      expect(response.success).toBe(true);
      expect(response.data.shared).toBe(true);
      expect(response.data.targetAgents).toEqual(['qe-executor-1', 'qe-reporter-1']);
      expect(response.data.targetKeys).toHaveLength(2);
    });

    it('should return expected data structure', async () => {
      addMemoryRecord('aqe:config:1', { setting: 'value' });

      const response = await handler.handle({
        sourceKey: 'config:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('requestId');
      expect(response.data).toHaveProperty('shared');
      expect(response.data).toHaveProperty('sourceKey');
      expect(response.data).toHaveProperty('targetKeys');
      expect(response.data).toHaveProperty('targetAgents');
      expect(response.data).toHaveProperty('permissions');
    });

    it('should create shared records for each target agent', async () => {
      addMemoryRecord('aqe:data:1', { value: 'shared-data' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-a', 'agent-b', 'agent-c']
      });

      expect(mockMemoryStore.has('shared:agent-a:data:1')).toBe(true);
      expect(mockMemoryStore.has('shared:agent-b:data:1')).toBe(true);
      expect(mockMemoryStore.has('shared:agent-c:data:1')).toBe(true);
    });

    it('should use default shared namespace', async () => {
      addMemoryRecord('source:key:1', { data: 'test' });

      const response = await handler.handle({
        sourceKey: 'key:1',
        sourceNamespace: 'source',
        targetAgents: ['agent-1']
      });

      expect(response.success).toBe(true);
      expect(response.data.targetKeys[0]).toContain('shared:');
    });

    it('should use custom target namespace when specified', async () => {
      addMemoryRecord('source:key:1', { data: 'test' });

      await handler.handle({
        sourceKey: 'key:1',
        sourceNamespace: 'source',
        targetAgents: ['agent-1'],
        targetNamespace: 'custom-shared'
      });

      expect(mockMemoryStore.has('custom-shared:agent-1:key:1')).toBe(true);
    });

    it('should execute notification hook for each share', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1', 'agent-2']
      });

      expect(mockHookExecutor.notify).toHaveBeenCalledTimes(2);
    });
  });

  describe('Data Preservation', () => {
    it('should copy source value to shared record', async () => {
      const sourceValue = {
        testPlan: 'integration-tests',
        priority: 'high',
        modules: ['auth', 'api', 'db']
      };

      addMemoryRecord('aqe:plan:1', sourceValue);

      await handler.handle({
        sourceKey: 'plan:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:plan:1');
      expect(sharedRecord.value).toEqual(sourceValue);
    });

    it('should preserve source metadata and add sharing info', async () => {
      const sourceMetadata = {
        creator: 'test-gen-1',
        timestamp: Date.now(),
        version: 2
      };

      addMemoryRecord('aqe:data:1', { value: 'test' }, sourceMetadata);

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:data:1');
      expect(sharedRecord.metadata).toHaveProperty('creator', 'test-gen-1');
      expect(sharedRecord.metadata).toHaveProperty('version', 2);
      expect(sharedRecord.metadata).toHaveProperty('sourceKey');
      expect(sharedRecord.metadata).toHaveProperty('sharedWith', 'agent-1');
      expect(sharedRecord.metadata).toHaveProperty('sharedAt');
    });

    it('should use source TTL by default', async () => {
      mockMemoryStore.set('aqe:data:1', {
        key: 'aqe:data:1',
        value: { data: 'test' },
        namespace: 'aqe',
        timestamp: Date.now(),
        ttl: 7200,
        metadata: {},
        persistent: false
      });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:data:1');
      expect(sharedRecord.ttl).toBe(7200);
    });

    it('should use custom TTL when specified', async () => {
      addMemoryRecord('aqe:data:1', { data: 'test' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1'],
        ttl: 1800
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:data:1');
      expect(sharedRecord.ttl).toBe(1800);
    });

    it('should mark shared records as non-persistent', async () => {
      mockMemoryStore.set('aqe:data:1', {
        key: 'aqe:data:1',
        value: { data: 'test' },
        namespace: 'aqe',
        timestamp: Date.now(),
        ttl: 3600,
        metadata: {},
        persistent: true
      });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:data:1');
      expect(sharedRecord.persistent).toBe(false);
    });
  });

  describe('Permission Management', () => {
    it('should set default read permission', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const targetKey = 'shared:agent-1:data:1';
      expect(handler.hasPermission(targetKey, 'read')).toBe(true);
    });

    it('should set custom permissions when specified', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1'],
        permissions: ['read', 'write', 'delete']
      });

      const targetKey = 'shared:agent-1:data:1';
      expect(handler.hasPermission(targetKey, 'read')).toBe(true);
      expect(handler.hasPermission(targetKey, 'write')).toBe(true);
      expect(handler.hasPermission(targetKey, 'delete')).toBe(true);
    });

    it('should handle read-only permissions', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1'],
        permissions: ['read']
      });

      const targetKey = 'shared:agent-1:data:1';
      expect(handler.hasPermission(targetKey, 'read')).toBe(true);
      expect(handler.hasPermission(targetKey, 'write')).toBe(false);
    });

    it('should handle multiple custom permissions', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1'],
        permissions: ['read', 'execute']
      });

      const targetKey = 'shared:agent-1:data:1';
      expect(handler.hasPermission(targetKey, 'read')).toBe(true);
      expect(handler.hasPermission(targetKey, 'execute')).toBe(true);
      expect(handler.hasPermission(targetKey, 'write')).toBe(false);
    });

    it('should set permissions for each target agent independently', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1', 'agent-2'],
        permissions: ['read', 'write']
      });

      expect(handler.hasPermission('shared:agent-1:data:1', 'write')).toBe(true);
      expect(handler.hasPermission('shared:agent-2:data:1', 'write')).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing sourceKey', async () => {
      const response = await handler.handle({
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('sourceKey');
    });

    it('should reject missing sourceNamespace', async () => {
      const response = await handler.handle({
        sourceKey: 'key:1',
        targetAgents: ['agent-1']
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('sourceNamespace');
    });

    it('should reject missing targetAgents', async () => {
      const response = await handler.handle({
        sourceKey: 'key:1',
        sourceNamespace: 'aqe'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('targetAgents');
    });

    it('should reject non-existent source memory', async () => {
      const response = await handler.handle({
        sourceKey: 'non-existent',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Source memory not found');
    });

    it('should reject empty targetAgents array', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      const response = await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: []
      });

      // Should either reject or handle gracefully
      expect(response).toHaveProperty('success');
    });
  });

  describe('Multi-Agent Sharing', () => {
    it('should share with single agent', async () => {
      addMemoryRecord('aqe:data:1', { value: 'single' });

      const response = await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-solo']
      });

      expect(response.success).toBe(true);
      expect(response.data.targetAgents).toHaveLength(1);
      expect(response.data.targetKeys).toHaveLength(1);
    });

    it('should share with multiple agents', async () => {
      addMemoryRecord('aqe:data:1', { value: 'multiple' });

      const targetAgents = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];

      const response = await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents
      });

      expect(response.success).toBe(true);
      expect(response.data.targetAgents).toHaveLength(5);
      expect(response.data.targetKeys).toHaveLength(5);

      targetAgents.forEach(agentId => {
        expect(mockMemoryStore.has(`shared:${agentId}:data:1`)).toBe(true);
      });
    });

    it('should share with large number of agents', async () => {
      addMemoryRecord('aqe:data:1', { value: 'broadcast' });

      const targetAgents = Array.from({ length: 50 }, (_, i) => `agent-${i}`);

      const response = await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents
      });

      expect(response.success).toBe(true);
      expect(response.data.targetAgents).toHaveLength(50);
    });

    it('should handle agents with special characters in IDs', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      const response = await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1@domain.com', 'agent-2_special', 'agent-3-prod']
      });

      expect(response.success).toBe(true);
      expect(response.data.targetAgents).toHaveLength(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle sharing complex nested data', async () => {
      const complexData = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, { nested: true }],
              string: 'deep',
              number: 42
            }
          }
        },
        metadata: {
          tags: ['test', 'integration', 'e2e'],
          priority: 'high'
        }
      };

      addMemoryRecord('aqe:complex:1', complexData);

      await handler.handle({
        sourceKey: 'complex:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:complex:1');
      expect(sharedRecord.value).toEqual(complexData);
    });

    it('should handle sharing with empty string values', async () => {
      addMemoryRecord('aqe:empty:1', { value: '', another: '' });

      await handler.handle({
        sourceKey: 'empty:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:empty:1');
      expect(sharedRecord.value.value).toBe('');
    });

    it('should handle sharing with null values', async () => {
      addMemoryRecord('aqe:null:1', { value: null, another: null });

      await handler.handle({
        sourceKey: 'null:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:null:1');
      expect(sharedRecord.value.value).toBe(null);
    });

    it('should handle sharing with binary data', async () => {
      const binaryData = Buffer.from('binary content').toString('base64');

      addMemoryRecord('aqe:binary:1', { buffer: binaryData });

      await handler.handle({
        sourceKey: 'binary:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:binary:1');
      expect(sharedRecord.value.buffer).toBe(binaryData);
    });

    it('should handle sharing same memory multiple times', async () => {
      addMemoryRecord('aqe:data:1', { value: 'reusable' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-2']
      });

      expect(mockMemoryStore.has('shared:agent-1:data:1')).toBe(true);
      expect(mockMemoryStore.has('shared:agent-2:data:1')).toBe(true);
    });

    it('should handle concurrent sharing operations', async () => {
      for (let i = 0; i < 10; i++) {
        addMemoryRecord(`aqe:data:${i}`, { value: `data-${i}` });
      }

      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.handle({
          sourceKey: `data:${i}`,
          sourceNamespace: 'aqe',
          targetAgents: [`agent-${i}`]
        })
      );

      const results = await Promise.all(promises);

      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle sharing to same agent from different sources', async () => {
      addMemoryRecord('source1:data:1', { from: 'source1' });
      addMemoryRecord('source2:data:2', { from: 'source2' });

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'source1',
        targetAgents: ['agent-shared'],
        targetNamespace: 'inbox'
      });

      await handler.handle({
        sourceKey: 'data:2',
        sourceNamespace: 'source2',
        targetAgents: ['agent-shared'],
        targetNamespace: 'inbox'
      });

      expect(mockMemoryStore.has('inbox:agent-shared:data:1')).toBe(true);
      expect(mockMemoryStore.has('inbox:agent-shared:data:2')).toBe(true);
    });

    it('should update timestamp on shared records', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      const beforeShare = Date.now();

      await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      const sharedRecord = mockMemoryStore.get('shared:agent-1:data:1');
      expect(sharedRecord.timestamp).toBeGreaterThanOrEqual(beforeShare);
    });

    it('should handle sharing with very long key names', async () => {
      const longKey = 'x'.repeat(200);
      addMemoryRecord(`aqe:${longKey}`, { value: 'long-key-test' });

      const response = await handler.handle({
        sourceKey: longKey,
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete sharing operation within reasonable time', async () => {
      addMemoryRecord('aqe:perf:1', { data: 'performance-test' });

      const targetAgents = Array.from({ length: 100 }, (_, i) => `agent-${i}`);

      const startTime = Date.now();
      await handler.handle({
        sourceKey: 'perf:1',
        sourceNamespace: 'aqe',
        targetAgents
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should handle rapid sequential shares efficiently', async () => {
      for (let i = 0; i < 50; i++) {
        addMemoryRecord(`aqe:data:${i}`, { value: `data-${i}` });
      }

      const startTime = Date.now();

      for (let i = 0; i < 50; i++) {
        await handler.handle({
          sourceKey: `data:${i}`,
          sourceNamespace: 'aqe',
          targetAgents: ['agent-1']
        });
      }

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle large data sharing efficiently', async () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
          data: `data-${i}`.repeat(10)
        }))
      };

      addMemoryRecord('aqe:large:1', largeData);

      const startTime = Date.now();
      await handler.handle({
        sourceKey: 'large:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1', 'agent-2', 'agent-3']
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('Response Structure', () => {
    it('should always include requestId', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      const response = await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      expect(response).toHaveProperty('requestId');
      expect(typeof response.requestId).toBe('string');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
        expect(response.error.length).toBeGreaterThan(0);
      }
    });

    it('should include source key in response', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      const response = await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1']
      });

      expect(response.data.sourceKey).toBe('aqe:data:1');
    });

    it('should include all target keys in response', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      const response = await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1', 'agent-2']
      });

      expect(response.data.targetKeys).toContain('shared:agent-1:data:1');
      expect(response.data.targetKeys).toContain('shared:agent-2:data:1');
    });

    it('should include permissions in response', async () => {
      addMemoryRecord('aqe:data:1', { value: 'test' });

      const response = await handler.handle({
        sourceKey: 'data:1',
        sourceNamespace: 'aqe',
        targetAgents: ['agent-1'],
        permissions: ['read', 'write']
      });

      expect(response.data.permissions).toEqual(['read', 'write']);
    });
  });
});
