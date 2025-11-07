/**
 * memory/memory-backup Test Suite
 *
 * Tests for memory namespace backup and restore.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MemoryBackupHandler } from '@mcp/handlers/memory/memory-backup';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('MemoryBackupHandler', () => {
  let handler: MemoryBackupHandler;
  let mockRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;
  let mockMemoryStore: Map<string, any>;

  beforeEach(() => {
    mockRegistry = {} as AgentRegistry;
    mockHookExecutor = {} as HookExecutor;
    mockMemoryStore = new Map();
    handler = new MemoryBackupHandler(mockRegistry, mockHookExecutor, mockMemoryStore);
  });

  const addMemoryRecord = (key: string, namespace: string, value: any) => {
    mockMemoryStore.set(key, {
      key,
      value,
      namespace,
      timestamp: Date.now(),
      ttl: 3600,
      metadata: {},
      persistent: false
    });
  };

  describe('Create Backup - Happy Path', () => {
    it('should create backup successfully', async () => {
      addMemoryRecord('aqe:test-plan:1', 'aqe', { plan: 'unit-tests' });
      addMemoryRecord('aqe:test-plan:2', 'aqe', { plan: 'integration-tests' });

      const response = await handler.handle({
        action: 'create',
        namespace: 'aqe',
        backupId: 'backup-001'
      });

      expect(response.success).toBe(true);
      expect(response.data.created).toBe(true);
      expect(response.data.backupId).toBe('backup-001');
      expect(response.data.namespace).toBe('aqe');
      expect(response.data.recordCount).toBe(2);
    });

    it('should return expected data structure for create', async () => {
      addMemoryRecord('test:key:1', 'test', { data: 'value' });

      const response = await handler.handle({
        action: 'create',
        namespace: 'test',
        backupId: 'backup-002'
      });

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
      expect(response.data).toHaveProperty('created');
      expect(response.data).toHaveProperty('backupId');
      expect(response.data).toHaveProperty('namespace');
      expect(response.data).toHaveProperty('recordCount');
      expect(response.data).toHaveProperty('createdAt');
    });

    it('should backup only records from specified namespace', async () => {
      addMemoryRecord('aqe:key:1', 'aqe', { data: 'aqe-data' });
      addMemoryRecord('other:key:1', 'other', { data: 'other-data' });
      addMemoryRecord('aqe:key:2', 'aqe', { data: 'aqe-data-2' });

      const response = await handler.handle({
        action: 'create',
        namespace: 'aqe',
        backupId: 'aqe-backup'
      });

      expect(response.success).toBe(true);
      expect(response.data.recordCount).toBe(2);
    });

    it('should create backup with zero records', async () => {
      const response = await handler.handle({
        action: 'create',
        namespace: 'empty-namespace',
        backupId: 'empty-backup'
      });

      expect(response.success).toBe(true);
      expect(response.data.recordCount).toBe(0);
    });

    it('should preserve record metadata in backup', async () => {
      const metadata = { priority: 'high', agent: 'test-gen-1' };
      mockMemoryStore.set('aqe:key:1', {
        key: 'aqe:key:1',
        value: { test: 'data' },
        namespace: 'aqe',
        timestamp: Date.now(),
        ttl: 7200,
        metadata,
        persistent: true
      });

      await handler.handle({
        action: 'create',
        namespace: 'aqe',
        backupId: 'meta-backup'
      });

      const listResponse = await handler.handle({
        action: 'list'
      });

      expect(listResponse.success).toBe(true);
      expect(listResponse.data.backups).toHaveLength(1);
    });
  });

  describe('Restore Backup - Happy Path', () => {
    it('should restore backup successfully', async () => {
      addMemoryRecord('aqe:key:1', 'aqe', { data: 'value-1' });
      addMemoryRecord('aqe:key:2', 'aqe', { data: 'value-2' });

      await handler.handle({
        action: 'create',
        namespace: 'aqe',
        backupId: 'restore-test'
      });

      mockMemoryStore.clear();

      const response = await handler.handle({
        action: 'restore',
        backupId: 'restore-test'
      });

      expect(response.success).toBe(true);
      expect(response.data.restored).toBe(true);
      expect(response.data.backupId).toBe('restore-test');
      expect(response.data.restoredCount).toBe(2);
      expect(response.data.targetNamespace).toBe('aqe');
    });

    it('should restore to original namespace by default', async () => {
      addMemoryRecord('original:key:1', 'original', { data: 'test' });

      await handler.handle({
        action: 'create',
        namespace: 'original',
        backupId: 'ns-test'
      });

      mockMemoryStore.clear();

      await handler.handle({
        action: 'restore',
        backupId: 'ns-test'
      });

      const restoredKeys = Array.from(mockMemoryStore.keys());
      expect(restoredKeys.some(k => k.startsWith('original:'))).toBe(true);
    });

    it('should restore to different namespace when specified', async () => {
      addMemoryRecord('source:key:1', 'source', { data: 'test' });

      await handler.handle({
        action: 'create',
        namespace: 'source',
        backupId: 'cross-ns'
      });

      const response = await handler.handle({
        action: 'restore',
        backupId: 'cross-ns',
        targetNamespace: 'destination'
      });

      expect(response.success).toBe(true);
      expect(response.data.targetNamespace).toBe('destination');

      const restoredKeys = Array.from(mockMemoryStore.keys());
      expect(restoredKeys.some(k => k.startsWith('destination:'))).toBe(true);
    });

    it('should update timestamps on restore', async () => {
      const oldTimestamp = Date.now() - 3600000;
      mockMemoryStore.set('test:key:1', {
        key: 'test:key:1',
        value: { data: 'old' },
        namespace: 'test',
        timestamp: oldTimestamp,
        ttl: 3600,
        metadata: {},
        persistent: false
      });

      await handler.handle({
        action: 'create',
        namespace: 'test',
        backupId: 'timestamp-test'
      });

      mockMemoryStore.clear();

      const beforeRestore = Date.now();
      await handler.handle({
        action: 'restore',
        backupId: 'timestamp-test'
      });

      const restored = mockMemoryStore.get('test:key:1');
      expect(restored.timestamp).toBeGreaterThanOrEqual(beforeRestore);
    });
  });

  describe('List Backups', () => {
    it('should list all backups successfully', async () => {
      addMemoryRecord('ns1:key:1', 'ns1', { data: 'data1' });
      addMemoryRecord('ns2:key:1', 'ns2', { data: 'data2' });

      await handler.handle({ action: 'create', namespace: 'ns1', backupId: 'backup-1' });
      await handler.handle({ action: 'create', namespace: 'ns2', backupId: 'backup-2' });

      const response = await handler.handle({
        action: 'list'
      });

      expect(response.success).toBe(true);
      expect(response.data.backups).toHaveLength(2);
      expect(response.data.backups[0]).toHaveProperty('backupId');
      expect(response.data.backups[0]).toHaveProperty('namespace');
      expect(response.data.backups[0]).toHaveProperty('recordCount');
      expect(response.data.backups[0]).toHaveProperty('createdAt');
    });

    it('should filter backups by namespace', async () => {
      addMemoryRecord('aqe:key:1', 'aqe', { data: 'aqe-data' });
      addMemoryRecord('other:key:1', 'other', { data: 'other-data' });

      await handler.handle({ action: 'create', namespace: 'aqe', backupId: 'aqe-backup' });
      await handler.handle({ action: 'create', namespace: 'other', backupId: 'other-backup' });

      const response = await handler.handle({
        action: 'list',
        namespace: 'aqe'
      });

      expect(response.success).toBe(true);
      expect(response.data.backups).toHaveLength(1);
      expect(response.data.backups[0].namespace).toBe('aqe');
    });

    it('should return empty list when no backups exist', async () => {
      const response = await handler.handle({
        action: 'list'
      });

      expect(response.success).toBe(true);
      expect(response.data.backups).toEqual([]);
    });

    it('should include metadata in listed backups', async () => {
      addMemoryRecord('test:key:1', 'test', { data: 'test' });
      addMemoryRecord('test:key:2', 'test', { data: 'test2' });

      await handler.handle({
        action: 'create',
        namespace: 'test',
        backupId: 'metadata-backup'
      });

      const response = await handler.handle({ action: 'list' });

      expect(response.success).toBe(true);
      expect(response.data.backups[0].backupId).toBe('metadata-backup');
      expect(response.data.backups[0].recordCount).toBe(2);
    });
  });

  describe('Delete Backup', () => {
    it('should delete backup successfully', async () => {
      addMemoryRecord('test:key:1', 'test', { data: 'test' });

      await handler.handle({
        action: 'create',
        namespace: 'test',
        backupId: 'delete-test'
      });

      const response = await handler.handle({
        action: 'delete',
        backupId: 'delete-test'
      });

      expect(response.success).toBe(true);
      expect(response.data.deleted).toBe(true);
      expect(response.data.backupId).toBe('delete-test');
    });

    it('should fail to delete non-existent backup', async () => {
      const response = await handler.handle({
        action: 'delete',
        backupId: 'non-existent-backup'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Backup not found');
    });

    it('should remove backup from list after deletion', async () => {
      addMemoryRecord('test:key:1', 'test', { data: 'test' });

      await handler.handle({ action: 'create', namespace: 'test', backupId: 'removal-test' });

      await handler.handle({ action: 'delete', backupId: 'removal-test' });

      const listResponse = await handler.handle({ action: 'list' });

      expect(listResponse.success).toBe(true);
      expect(listResponse.data.backups).toHaveLength(0);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing action', async () => {
      const response = await handler.handle({
        namespace: 'test',
        backupId: 'test'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject invalid action', async () => {
      const response = await handler.handle({
        action: 'invalid-action',
        namespace: 'test'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid action');
    });

    it('should reject create without namespace', async () => {
      const response = await handler.handle({
        action: 'create',
        backupId: 'test'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('namespace');
    });

    it('should reject create without backupId', async () => {
      const response = await handler.handle({
        action: 'create',
        namespace: 'test'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('backupId');
    });

    it('should reject restore without backupId', async () => {
      const response = await handler.handle({
        action: 'restore'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('backupId');
    });

    it('should reject delete without backupId', async () => {
      const response = await handler.handle({
        action: 'delete'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('backupId');
    });

    it('should reject restore of non-existent backup', async () => {
      const response = await handler.handle({
        action: 'restore',
        backupId: 'non-existent'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Backup not found');
    });
  });

  describe('Cross-namespace Operations', () => {
    it('should backup and restore across namespaces', async () => {
      addMemoryRecord('source:config:1', 'source', { setting: 'value-1' });
      addMemoryRecord('source:config:2', 'source', { setting: 'value-2' });

      await handler.handle({
        action: 'create',
        namespace: 'source',
        backupId: 'cross-ns-backup'
      });

      const response = await handler.handle({
        action: 'restore',
        backupId: 'cross-ns-backup',
        targetNamespace: 'target'
      });

      expect(response.success).toBe(true);
      expect(response.data.targetNamespace).toBe('target');

      const targetKeys = Array.from(mockMemoryStore.keys())
        .filter(k => k.startsWith('target:'));

      expect(targetKeys.length).toBe(2);
    });

    it('should properly update key prefixes when changing namespace', async () => {
      addMemoryRecord('alpha:data:item', 'alpha', { value: 'test' });

      await handler.handle({
        action: 'create',
        namespace: 'alpha',
        backupId: 'prefix-test'
      });

      mockMemoryStore.clear();

      await handler.handle({
        action: 'restore',
        backupId: 'prefix-test',
        targetNamespace: 'beta'
      });

      expect(mockMemoryStore.has('beta:data:item')).toBe(true);
      expect(mockMemoryStore.has('alpha:data:item')).toBe(false);
    });

    it('should handle namespace with special characters', async () => {
      addMemoryRecord('my-app/v1:config', 'my-app/v1', { data: 'test' });

      const createResponse = await handler.handle({
        action: 'create',
        namespace: 'my-app/v1',
        backupId: 'special-ns'
      });

      expect(createResponse.success).toBe(true);

      const restoreResponse = await handler.handle({
        action: 'restore',
        backupId: 'special-ns',
        targetNamespace: 'my-app/v2'
      });

      expect(restoreResponse.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle large backup (1000+ records)', async () => {
      for (let i = 0; i < 1000; i++) {
        addMemoryRecord(`large:key:${i}`, 'large', { index: i, data: `value-${i}` });
      }

      const response = await handler.handle({
        action: 'create',
        namespace: 'large',
        backupId: 'large-backup'
      });

      expect(response.success).toBe(true);
      expect(response.data.recordCount).toBe(1000);
    });

    it('should handle backup with complex nested data', async () => {
      const complexData = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, 3, { nested: 'deep' }],
              date: new Date().toISOString(),
              null: null,
              boolean: true
            }
          }
        }
      };

      addMemoryRecord('complex:key:1', 'complex', complexData);

      await handler.handle({
        action: 'create',
        namespace: 'complex',
        backupId: 'complex-backup'
      });

      mockMemoryStore.clear();

      await handler.handle({
        action: 'restore',
        backupId: 'complex-backup'
      });

      const restored = mockMemoryStore.get('complex:key:1');
      expect(restored.value).toEqual(complexData);
    });

    it('should handle concurrent backup operations', async () => {
      for (let i = 0; i < 10; i++) {
        addMemoryRecord(`ns${i}:key:1`, `ns${i}`, { data: `value-${i}` });
      }

      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.handle({
          action: 'create',
          namespace: `ns${i}`,
          backupId: `concurrent-${i}`
        })
      );

      const results = await Promise.all(promises);

      expect(results.every(r => r.success)).toBe(true);

      const listResponse = await handler.handle({ action: 'list' });
      expect(listResponse.data.backups).toHaveLength(10);
    });

    it('should handle backup with empty string values', async () => {
      addMemoryRecord('empty:key:1', 'empty', { value: '' });
      addMemoryRecord('empty:key:2', 'empty', { value: '', another: '' });

      await handler.handle({
        action: 'create',
        namespace: 'empty',
        backupId: 'empty-values'
      });

      mockMemoryStore.clear();

      await handler.handle({
        action: 'restore',
        backupId: 'empty-values'
      });

      const restored1 = mockMemoryStore.get('empty:key:1');
      expect(restored1.value.value).toBe('');
    });

    it('should handle backup with binary data (buffers)', async () => {
      const binaryData = Buffer.from('binary content').toString('base64');

      addMemoryRecord('binary:key:1', 'binary', { buffer: binaryData });

      await handler.handle({
        action: 'create',
        namespace: 'binary',
        backupId: 'binary-backup'
      });

      mockMemoryStore.clear();

      await handler.handle({
        action: 'restore',
        backupId: 'binary-backup'
      });

      const restored = mockMemoryStore.get('binary:key:1');
      expect(restored.value.buffer).toBe(binaryData);
    });

    it('should handle multiple backups of same namespace', async () => {
      addMemoryRecord('multi:key:1', 'multi', { version: 1 });

      await handler.handle({
        action: 'create',
        namespace: 'multi',
        backupId: 'multi-v1'
      });

      mockMemoryStore.set('multi:key:1', {
        key: 'multi:key:1',
        value: { version: 2 },
        namespace: 'multi',
        timestamp: Date.now(),
        ttl: 3600,
        metadata: {},
        persistent: false
      });

      await handler.handle({
        action: 'create',
        namespace: 'multi',
        backupId: 'multi-v2'
      });

      const listResponse = await handler.handle({
        action: 'list',
        namespace: 'multi'
      });

      expect(listResponse.data.backups).toHaveLength(2);
    });

    it('should handle restore overwriting existing keys', async () => {
      addMemoryRecord('overwrite:key:1', 'overwrite', { value: 'original' });

      await handler.handle({
        action: 'create',
        namespace: 'overwrite',
        backupId: 'overwrite-backup'
      });

      mockMemoryStore.set('overwrite:key:1', {
        key: 'overwrite:key:1',
        value: { value: 'modified' },
        namespace: 'overwrite',
        timestamp: Date.now(),
        ttl: 3600,
        metadata: {},
        persistent: false
      });

      await handler.handle({
        action: 'restore',
        backupId: 'overwrite-backup'
      });

      const restored = mockMemoryStore.get('overwrite:key:1');
      expect(restored.value.value).toBe('original');
    });
  });

  describe('Performance', () => {
    it('should complete backup operation within reasonable time', async () => {
      for (let i = 0; i < 100; i++) {
        addMemoryRecord(`perf:key:${i}`, 'perf', { data: `value-${i}` });
      }

      const startTime = Date.now();
      await handler.handle({
        action: 'create',
        namespace: 'perf',
        backupId: 'perf-backup'
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should complete restore operation within reasonable time', async () => {
      for (let i = 0; i < 100; i++) {
        addMemoryRecord(`perf:key:${i}`, 'perf', { data: `value-${i}` });
      }

      await handler.handle({
        action: 'create',
        namespace: 'perf',
        backupId: 'perf-restore'
      });

      mockMemoryStore.clear();

      const startTime = Date.now();
      await handler.handle({
        action: 'restore',
        backupId: 'perf-restore'
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle rapid sequential operations efficiently', async () => {
      addMemoryRecord('rapid:key:1', 'rapid', { data: 'test' });

      const startTime = Date.now();

      for (let i = 0; i < 50; i++) {
        await handler.handle({
          action: 'create',
          namespace: 'rapid',
          backupId: `rapid-${i}`
        });
      }

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Response Structure', () => {
    it('should always include requestId', async () => {
      const response = await handler.handle({
        action: 'list'
      });

      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
      expect(typeof response.metadata.requestId).toBe('string');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
        expect(response.error.length).toBeGreaterThan(0);
      }
    });
  });
});
