/**
 * Memory Backup Handler Test Suite
 *
 * Tests for backup and restore operations for memory namespaces.
 * Follows TDD RED phase - tests written before implementation verification.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MemoryBackupHandler } from '@mcp/handlers/memory/memory-backup';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services to prevent heavy initialization (database, EventBus, etc.)
jest.mock('../../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../../src/mcp/services/HookExecutor.js');

describe('MemoryBackupHandler', () => {
  let handler: MemoryBackupHandler;
  let mockRegistry: any;
  let mockHookExecutor: any;
  let memoryStore: Map<string, any>;

  beforeEach(() => {
    mockRegistry = { getAgent: jest.fn(), listAgents: jest.fn().mockReturnValue([]) } as any;
    mockHookExecutor = { executePreTask: jest.fn().mockResolvedValue(undefined), executePostTask: jest.fn().mockResolvedValue(undefined), executePostEdit: jest.fn().mockResolvedValue(undefined), notify: jest.fn().mockResolvedValue(undefined) } as any;
    memoryStore = new Map();
    handler = new MemoryBackupHandler(mockRegistry, mockHookExecutor, memoryStore);
  });

  afterEach(async () => {
    memoryStore.clear();
  });

  describe('Happy Path - Create Backup', () => {
    it('should create backup of namespace successfully', async () => {
      // GIVEN: Memory records in a namespace
      memoryStore.set('aqe/test-plan:suite-1', {
        value: { tests: 50, coverage: 85 },
        partition: 'aqe/test-plan',
        createdAt: Date.now(),
        metadata: { agentId: 'qe-test-generator' }
      });
      memoryStore.set('aqe/test-plan:suite-2', {
        value: { tests: 30, coverage: 90 },
        partition: 'aqe/test-plan',
        createdAt: Date.now(),
        metadata: { agentId: 'qe-test-generator' }
      });

      // WHEN: Creating backup
      const response = await handler.handle({
        action: 'create',
        namespace: 'aqe/test-plan',
        backupId: 'backup-001'
      });

      // THEN: Backup created successfully
      expect(response.success).toBe(true);
      expect(response.data.created).toBe(true);
      expect(response.data.backupId).toBe('backup-001');
      expect(response.data.namespace).toBe('aqe/test-plan');
      expect(response.data.recordCount).toBe(2);
      expect(response.data.createdAt).toBeDefined();
    });

    it('should create empty backup for namespace with no data', async () => {
      // GIVEN: Empty namespace
      // WHEN: Creating backup
      const response = await handler.handle({
        action: 'create',
        namespace: 'empty-namespace',
        backupId: 'backup-empty'
      });

      // THEN: Empty backup created
      expect(response.success).toBe(true);
      expect(response.data.recordCount).toBe(0);
    });

    it('should preserve metadata in backup', async () => {
      // GIVEN: Records with rich metadata
      memoryStore.set('test:data-1', {
        value: { data: 'test' },
        partition: 'test',
        createdAt: Date.now(),
        ttl: 300,
        metadata: {
          agentId: 'qe-test-generator',
          version: '2.0.0',
          tags: ['critical', 'regression']
        }
      });

      // WHEN: Creating backup
      await handler.handle({
        action: 'create',
        namespace: 'test',
        backupId: 'backup-meta'
      });

      // THEN: Can restore with all metadata
      const restoreResponse = await handler.handle({
        action: 'restore',
        backupId: 'backup-meta'
      });

      expect(restoreResponse.success).toBe(true);
      const restored = memoryStore.get('test:data-1');
      expect(restored.metadata.version).toBe('2.0.0');
      expect(restored.metadata.tags).toContain('critical');
    });
  });

  describe('Happy Path - Restore Backup', () => {
    it('should restore backup to original namespace', async () => {
      // GIVEN: Backup exists
      memoryStore.set('backup:data', {
        value: { data: 'original' },
        partition: 'backup',
        createdAt: Date.now()
      });
      await handler.handle({
        action: 'create',
        namespace: 'backup',
        backupId: 'backup-restore-1'
      });

      // Clear the original data
      memoryStore.clear();

      // WHEN: Restoring backup
      const response = await handler.handle({
        action: 'restore',
        backupId: 'backup-restore-1'
      });

      // THEN: Data restored successfully
      expect(response.success).toBe(true);
      expect(response.data.restored).toBe(true);
      expect(response.data.backupId).toBe('backup-restore-1');
      expect(response.data.targetNamespace).toBe('backup');
      expect(response.data.restoredCount).toBe(1);
      expect(memoryStore.has('backup:data')).toBe(true);
    });

    it('should restore backup to different namespace', async () => {
      // GIVEN: Backup from production namespace
      memoryStore.set('production:config', {
        value: { apiUrl: 'https://api.prod.com' },
        partition: 'production',
        createdAt: Date.now()
      });
      await handler.handle({
        action: 'create',
        namespace: 'production',
        backupId: 'prod-backup'
      });

      // WHEN: Restoring to staging namespace
      const response = await handler.handle({
        action: 'restore',
        backupId: 'prod-backup',
        targetNamespace: 'staging'
      });

      // THEN: Data restored to staging namespace
      expect(response.success).toBe(true);
      expect(response.data.targetNamespace).toBe('staging');
      expect(memoryStore.has('staging:config')).toBe(true);
      const restored = memoryStore.get('staging:config');
      expect(restored.value.apiUrl).toBe('https://api.prod.com');
      expect(restored.partition).toBe('staging');
    });

    it('should restore multiple records correctly', async () => {
      // GIVEN: Namespace with multiple records
      for (let i = 0; i < 10; i++) {
        memoryStore.set(`bulk:record-${i}`, {
          value: { id: i, data: `data-${i}` },
          partition: 'bulk',
          createdAt: Date.now()
        });
      }
      await handler.handle({
        action: 'create',
        namespace: 'bulk',
        backupId: 'bulk-backup'
      });

      memoryStore.clear();

      // WHEN: Restoring bulk backup
      const response = await handler.handle({
        action: 'restore',
        backupId: 'bulk-backup'
      });

      // THEN: All records restored
      expect(response.data.restoredCount).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(memoryStore.has(`bulk:record-${i}`)).toBe(true);
      }
    });
  });

  describe('Happy Path - List Backups', () => {
    it('should list all backups', async () => {
      // GIVEN: Multiple backups exist
      memoryStore.set('ns1:data', { value: 'data', partition: 'ns1', createdAt: Date.now() });
      memoryStore.set('ns2:data', { value: 'data', partition: 'ns2', createdAt: Date.now() });

      await handler.handle({
        action: 'create',
        namespace: 'ns1',
        backupId: 'backup-1'
      });
      await handler.handle({
        action: 'create',
        namespace: 'ns2',
        backupId: 'backup-2'
      });

      // WHEN: Listing all backups
      const response = await handler.handle({
        action: 'list'
      });

      // THEN: All backups listed
      expect(response.success).toBe(true);
      expect(response.data.backups).toHaveLength(2);
      expect(response.data.backups.map((b: any) => b.backupId)).toContain('backup-1');
      expect(response.data.backups.map((b: any) => b.backupId)).toContain('backup-2');
    });

    it('should filter backups by namespace', async () => {
      // GIVEN: Backups from different namespaces
      memoryStore.set('aqe:data', { value: 'data', partition: 'aqe', createdAt: Date.now() });
      memoryStore.set('test:data', { value: 'data', partition: 'test', createdAt: Date.now() });

      await handler.handle({
        action: 'create',
        namespace: 'aqe',
        backupId: 'aqe-backup'
      });
      await handler.handle({
        action: 'create',
        namespace: 'test',
        backupId: 'test-backup'
      });

      // WHEN: Listing backups for specific namespace
      const response = await handler.handle({
        action: 'list',
        namespace: 'aqe'
      });

      // THEN: Only aqe backups listed
      expect(response.data.backups).toHaveLength(1);
      expect(response.data.backups[0].backupId).toBe('aqe-backup');
      expect(response.data.backups[0].namespace).toBe('aqe');
    });

    it('should include backup metadata in list', async () => {
      // GIVEN: Backup with metadata
      memoryStore.set('test:data', { value: 'data', partition: 'test', createdAt: Date.now() });
      await handler.handle({
        action: 'create',
        namespace: 'test',
        backupId: 'backup-with-meta'
      });

      // WHEN: Listing backups
      const response = await handler.handle({
        action: 'list'
      });

      // THEN: Metadata included
      const backup = response.data.backups[0];
      expect(backup.backupId).toBe('backup-with-meta');
      expect(backup.namespace).toBe('test');
      expect(backup.recordCount).toBe(1);
      expect(backup.createdAt).toBeDefined();
    });
  });

  describe('Happy Path - Delete Backup', () => {
    it('should delete backup successfully', async () => {
      // GIVEN: Backup exists
      memoryStore.set('test:data', { value: 'data', partition: 'test', createdAt: Date.now() });
      await handler.handle({
        action: 'create',
        namespace: 'test',
        backupId: 'backup-to-delete'
      });

      // WHEN: Deleting backup
      const response = await handler.handle({
        action: 'delete',
        backupId: 'backup-to-delete'
      });

      // THEN: Backup deleted
      expect(response.success).toBe(true);
      expect(response.data.deleted).toBe(true);
      expect(response.data.backupId).toBe('backup-to-delete');

      // Verify backup no longer in list
      const listResponse = await handler.handle({ action: 'list' });
      expect(listResponse.data.backups).toHaveLength(0);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing action', async () => {
      // GIVEN: Missing action parameter
      // WHEN: Handling request
      const response = await handler.handle({
        namespace: 'test',
        backupId: 'backup-1'
      } as any);

      // THEN: Returns success (action will be undefined and cause switch default)
      // This tests that the handler validates action in the switch statement
      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid action');
    });

    it('should reject create without namespace', async () => {
      // GIVEN: Create action without namespace
      // WHEN: Creating backup
      const response = await handler.handle({
        action: 'create',
        backupId: 'backup-1'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('namespace');
    });

    it('should reject create without backupId', async () => {
      // GIVEN: Create action without backupId
      // WHEN: Creating backup
      const response = await handler.handle({
        action: 'create',
        namespace: 'test'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('backupId');
    });

    it('should reject restore without backupId', async () => {
      // GIVEN: Restore action without backupId
      // WHEN: Restoring backup
      const response = await handler.handle({
        action: 'restore'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('backupId');
    });

    it('should reject delete without backupId', async () => {
      // GIVEN: Delete action without backupId
      // WHEN: Deleting backup
      const response = await handler.handle({
        action: 'delete'
      } as any);

      // THEN: Validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('backupId');
    });
  });

  describe('Error Handling', () => {
    it('should handle restore of non-existent backup', async () => {
      // GIVEN: Backup does not exist
      // WHEN: Attempting to restore
      const response = await handler.handle({
        action: 'restore',
        backupId: 'non-existent-backup'
      });

      // THEN: Error response
      expect(response.success).toBe(false);
      expect(response.error).toContain('Backup not found');
      expect(response.error).toContain('non-existent-backup');
    });

    it('should handle delete of non-existent backup', async () => {
      // GIVEN: Backup does not exist
      // WHEN: Attempting to delete
      const response = await handler.handle({
        action: 'delete',
        backupId: 'non-existent-backup'
      });

      // THEN: Error response
      expect(response.success).toBe(false);
      expect(response.error).toContain('Backup not found');
    });

    it('should handle invalid action', async () => {
      // GIVEN: Invalid action type
      // WHEN: Handling request
      const response = await handler.handle({
        action: 'invalid-action' as any,
        namespace: 'test',
        backupId: 'backup-1'
      });

      // THEN: Error response
      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid action');
    });
  });

  describe('Edge Cases', () => {
    it('should handle backup with special characters in backupId', async () => {
      // GIVEN: BackupId with special characters
      memoryStore.set('test:data', { value: 'data', partition: 'test', createdAt: Date.now() });

      const specialIds = [
        'backup-with-dashes',
        'backup_with_underscores',
        'backup.with.dots',
        'backup-2024-01-01'
      ];

      // WHEN: Creating backups with special IDs
      for (const backupId of specialIds) {
        const response = await handler.handle({
          action: 'create',
          namespace: 'test',
          backupId
        });

        // THEN: Backup created successfully
        expect(response.success).toBe(true);
      }
    });

    it('should handle namespace with forward slashes', async () => {
      // GIVEN: Namespace with path-like structure
      memoryStore.set('aqe/test-plan/integration:data', {
        value: 'test',
        partition: 'aqe/test-plan/integration',
        createdAt: Date.now()
      });

      // WHEN: Creating backup
      const response = await handler.handle({
        action: 'create',
        namespace: 'aqe/test-plan/integration',
        backupId: 'nested-ns-backup'
      });

      // THEN: Backup successful
      expect(response.success).toBe(true);
    });

    it('should handle large number of records in namespace', async () => {
      // GIVEN: 100 records in namespace
      for (let i = 0; i < 100; i++) {
        memoryStore.set(`large:record-${i}`, {
          value: { id: i, data: Array(100).fill('x').join('') },
          partition: 'large',
          createdAt: Date.now()
        });
      }

      // WHEN: Creating backup
      const response = await handler.handle({
        action: 'create',
        namespace: 'large',
        backupId: 'large-backup'
      });

      // THEN: All records backed up
      expect(response.success).toBe(true);
      expect(response.data.recordCount).toBe(100);
    });

    it('should handle restoring over existing data', async () => {
      // GIVEN: Backup and existing data in target namespace
      memoryStore.set('test:data', {
        value: { version: 1 },
        partition: 'test',
        createdAt: Date.now()
      });
      await handler.handle({
        action: 'create',
        namespace: 'test',
        backupId: 'overwrite-backup'
      });

      // Update the data
      memoryStore.set('test:data', {
        value: { version: 2 },
        partition: 'test',
        createdAt: Date.now()
      });

      // WHEN: Restoring backup (overwrites)
      const response = await handler.handle({
        action: 'restore',
        backupId: 'overwrite-backup'
      });

      // THEN: Old version restored
      expect(response.success).toBe(true);
      const restored = memoryStore.get('test:data');
      expect(restored.value.version).toBe(1);
    });

    it('should handle TTL preservation in backup/restore', async () => {
      // GIVEN: Record with TTL
      memoryStore.set('temp:session', {
        value: { sessionId: 'abc123' },
        partition: 'temp',
        createdAt: Date.now(),
        ttl: 300
      });

      // WHEN: Creating and restoring backup
      await handler.handle({
        action: 'create',
        namespace: 'temp',
        backupId: 'ttl-backup'
      });

      memoryStore.clear();

      await handler.handle({
        action: 'restore',
        backupId: 'ttl-backup'
      });

      // THEN: TTL preserved
      const restored = memoryStore.get('temp:session');
      expect(restored.ttl).toBe(300);
    });
  });

  describe('Performance', () => {
    it('should create backup within reasonable time', async () => {
      // GIVEN: 10 records
      for (let i = 0; i < 10; i++) {
        memoryStore.set(`perf:record-${i}`, {
          value: { id: i },
          partition: 'perf',
          createdAt: Date.now()
        });
      }

      // WHEN: Creating backup
      const startTime = Date.now();
      await handler.handle({
        action: 'create',
        namespace: 'perf',
        backupId: 'perf-backup'
      });
      const endTime = Date.now();

      // THEN: Completed within 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should restore backup within reasonable time', async () => {
      // GIVEN: Backup with 10 records
      for (let i = 0; i < 10; i++) {
        memoryStore.set(`perf:record-${i}`, {
          value: { id: i },
          partition: 'perf',
          createdAt: Date.now()
        });
      }
      await handler.handle({
        action: 'create',
        namespace: 'perf',
        backupId: 'restore-perf-backup'
      });

      memoryStore.clear();

      // WHEN: Restoring backup
      const startTime = Date.now();
      await handler.handle({
        action: 'restore',
        backupId: 'restore-perf-backup'
      });
      const endTime = Date.now();

      // THEN: Completed within 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
