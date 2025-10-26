/**
 * Tests for Memory & Coordination Commands
 * Covers all 8 memory management commands
 */

import * as fs from 'fs-extra';
import { MemoryStoreCommand } from '@cli/commands/memory/store';
import { MemoryRetrieveCommand } from '@cli/commands/memory/retrieve';
import { MemoryQueryCommand } from '@cli/commands/memory/query';
import { MemoryBackupCommand } from '@cli/commands/memory/backup';
import { MemoryRestoreCommand } from '@cli/commands/memory/restore';
import { MemoryListCommand } from '@cli/commands/memory/list';
import { MemoryClearCommand } from '@cli/commands/memory/clear';
import { MemoryStatsCommand } from '@cli/commands/memory/stats';

jest.mock('fs-extra');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Memory & Coordination Commands', () => {
  beforeEach(() => {
    // Mock process.exit to prevent test interruption
    jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process.exit called with code ${code}`);
    });

    jest.clearAllMocks();
    mockedFs.pathExists.mockResolvedValue(true);
    mockedFs.readJson.mockResolvedValue({});
    mockedFs.writeJson.mockResolvedValue();
  });

  describe('memory store', () => {
    it('should store key-value pair', async () => {
      await MemoryStoreCommand.execute({
        key: 'aqe/test/config',
        value: '{"setting":"value"}',
        ttl: 3600
      });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('memory'),
        expect.objectContaining({
          'aqe/test/config': expect.objectContaining({ value: '{"setting":"value"}' })
        }),
        expect.any(Object)
      );
    });

    it('should validate key format', async () => {
      await expect(
        MemoryStoreCommand.execute({ key: 'invalid key!', value: 'test' })
      ).rejects.toThrow('Invalid key format');
    });

    it('should support namespaces', async () => {
      await MemoryStoreCommand.execute({
        key: 'test-key',
        value: 'test-value',
        namespace: 'aqe'
      });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          'aqe/test-key': expect.any(Object)
        }),
        expect.any(Object)
      );
    });
  });

  describe('memory retrieve', () => {
    it('should retrieve stored value', async () => {
      mockedFs.readJson.mockResolvedValue({
        'aqe/test/config': {
          value: '{"setting":"value"}',
          timestamp: Date.now()
        }
      });

      const value = await MemoryRetrieveCommand.execute({
        key: 'aqe/test/config'
      });

      expect(value).toBe('{"setting":"value"}');
    });

    it('should handle missing keys', async () => {
      mockedFs.readJson.mockResolvedValue({});

      await expect(
        MemoryRetrieveCommand.execute({ key: 'missing/key' })
      ).rejects.toThrow('Key not found');
    });

    it('should handle expired TTL', async () => {
      mockedFs.readJson.mockResolvedValue({
        'aqe/test/config': {
          value: 'test',
          timestamp: Date.now() - 7200000, // 2 hours ago
          ttl: 3600 // 1 hour
        }
      });

      await expect(
        MemoryRetrieveCommand.execute({ key: 'aqe/test/config' })
      ).rejects.toThrow('Key expired');
    });
  });

  describe('memory query', () => {
    it('should query by pattern', async () => {
      mockedFs.readJson.mockResolvedValue({
        'aqe/test/config1': { value: 'value1' },
        'aqe/test/config2': { value: 'value2' },
        'aqe/other/data': { value: 'value3' }
      });

      const results = await MemoryQueryCommand.execute({
        pattern: 'aqe/test/*'
      });

      expect(results).toHaveLength(2);
    });

    it('should support regex queries', async () => {
      const results = await MemoryQueryCommand.execute({
        pattern: '^aqe/.*config.*$',
        regex: true
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter by TTL status', async () => {
      mockedFs.readJson.mockResolvedValue({
        'key1': { value: 'v1', ttl: 3600, timestamp: Date.now() },
        'key2': { value: 'v2', ttl: 3600, timestamp: Date.now() - 7200000 }
      });

      const results = await MemoryQueryCommand.execute({
        pattern: '*',
        filterExpired: true
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('memory backup', () => {
    it('should backup memory data', async () => {
      mockedFs.readJson.mockResolvedValue({
        'key1': { value: 'value1' },
        'key2': { value: 'value2' }
      });

      await MemoryBackupCommand.execute({ output: 'backup.json' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        'backup.json',
        expect.objectContaining({
          timestamp: expect.any(Number),
          data: expect.any(Object)
        }),
        expect.any(Object)
      );
    });

    it('should compress backup', async () => {
      await MemoryBackupCommand.execute({
        output: 'backup.json.gz',
        compress: true
      });

      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it('should backup specific namespace', async () => {
      await MemoryBackupCommand.execute({
        output: 'backup.json',
        namespace: 'aqe'
      });

      expect(mockedFs.readJson).toHaveBeenCalled();
    });
  });

  describe('memory restore', () => {
    it('should restore from backup', async () => {
      mockedFs.readJson.mockResolvedValue({
        timestamp: Date.now(),
        data: {
          'key1': { value: 'value1' },
          'key2': { value: 'value2' }
        }
      });

      await MemoryRestoreCommand.execute({ input: 'backup.json' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('memory'),
        expect.objectContaining({
          'key1': expect.any(Object),
          'key2': expect.any(Object)
        }),
        expect.any(Object)
      );
    });

    it('should validate backup format', async () => {
      mockedFs.readJson.mockResolvedValue({ invalid: 'format' });

      await expect(
        MemoryRestoreCommand.execute({ input: 'backup.json' })
      ).rejects.toThrow('Invalid backup format');
    });

    it('should merge with existing data', async () => {
      await MemoryRestoreCommand.execute({
        input: 'backup.json',
        merge: true
      });

      expect(mockedFs.readJson).toHaveBeenCalledTimes(2); // Read backup + existing
    });
  });

  describe('memory list', () => {
    it('should list all keys', async () => {
      mockedFs.readJson.mockResolvedValue({
        'key1': { value: 'v1', timestamp: Date.now() },
        'key2': { value: 'v2', timestamp: Date.now() }
      });

      const keys = await MemoryListCommand.execute({});

      expect(keys).toHaveLength(2);
    });

    it('should filter by namespace', async () => {
      mockedFs.readJson.mockResolvedValue({
        'aqe/key1': { value: 'v1' },
        'aqe/key2': { value: 'v2' },
        'other/key3': { value: 'v3' }
      });

      const keys = await MemoryListCommand.execute({ namespace: 'aqe' });

      expect(keys).toHaveLength(2);
      expect(keys.every(k => k.startsWith('aqe/'))).toBe(true);
    });

    it('should sort keys', async () => {
      const keys = await MemoryListCommand.execute({
        sortBy: 'timestamp',
        order: 'desc'
      });

      expect(Array.isArray(keys)).toBe(true);
    });
  });

  describe('memory clear', () => {
    it('should clear all memory', async () => {
      await MemoryClearCommand.execute({ confirm: true });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('memory'),
        {},
        expect.any(Object)
      );
    });

    it('should require confirmation', async () => {
      await expect(
        MemoryClearCommand.execute({})
      ).rejects.toThrow('Confirmation required');
    });

    it('should clear specific namespace', async () => {
      mockedFs.readJson.mockResolvedValue({
        'aqe/key1': { value: 'v1' },
        'other/key2': { value: 'v2' }
      });

      await MemoryClearCommand.execute({
        namespace: 'aqe',
        confirm: true
      });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.anything(),
        { 'other/key2': { value: 'v2' } },
        expect.any(Object)
      );
    });

    it('should clear expired keys only', async () => {
      mockedFs.readJson.mockResolvedValue({
        'key1': { value: 'v1', ttl: 3600, timestamp: Date.now() },
        'key2': { value: 'v2', ttl: 3600, timestamp: Date.now() - 7200000 }
      });

      await MemoryClearCommand.execute({ expiredOnly: true, confirm: true });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ 'key1': expect.any(Object) }),
        expect.any(Object)
      );
    });
  });

  describe('memory stats', () => {
    it('should display memory statistics', async () => {
      mockedFs.readJson.mockResolvedValue({
        'key1': { value: 'v1', timestamp: Date.now() },
        'key2': { value: 'v2', timestamp: Date.now() },
        'key3': { value: 'v3', ttl: 3600, timestamp: Date.now() - 7200000 }
      });

      const stats = await MemoryStatsCommand.execute({});

      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('expiredKeys');
      expect(stats).toHaveProperty('namespaces');
    });

    it('should calculate memory usage', async () => {
      const stats = await MemoryStatsCommand.execute({ includeSize: true });

      expect(stats).toHaveProperty('totalSizeBytes');
    });

    it('should group by namespace', async () => {
      mockedFs.readJson.mockResolvedValue({
        'aqe/key1': { value: 'v1' },
        'aqe/key2': { value: 'v2' },
        'other/key3': { value: 'v3' }
      });

      const stats = await MemoryStatsCommand.execute({ groupByNamespace: true });

      expect(stats.namespaces).toHaveProperty('aqe');
      expect(stats.namespaces).toHaveProperty('other');
    });
  });
});
