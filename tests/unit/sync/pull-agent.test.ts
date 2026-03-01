/**
 * Pull Sync Agent Unit Tests
 *
 * Tests for cloud → local pull orchestration:
 * - Full pull workflow
 * - Incremental pull workflow
 * - Dry-run mode (no writes)
 * - Table filtering
 * - Error handling and partial results
 * - Verify (cloud vs local count comparison)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing
vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));
// Track mock state
let mockCloudRecords: Record<string, Record<string, unknown>[]> = {};
let mockLocalCounts: Record<string, number> = {};
let mockLocalWritten: Record<string, number> = {};

// Mock the cloud connection modules — paths relative to the source file that imports them
vi.mock('../../../src/sync/cloud/tunnel-manager.js', () => ({
  createConnectionManager: vi.fn(() => ({
    start: vi.fn().mockResolvedValue({ host: 'localhost', port: 15432, startedAt: new Date() }),
    stop: vi.fn(),
    isActive: vi.fn().mockReturnValue(true),
    getConnection: vi.fn().mockReturnValue({ host: 'localhost', port: 15432, startedAt: new Date() }),
  })),
}));

vi.mock('../../../src/sync/cloud/postgres-writer.js', () => ({
  createPostgresWriter: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    upsert: vi.fn().mockResolvedValue(0),
    execute: vi.fn(),
  })),
}));

vi.mock('../../../src/sync/cloud/postgres-reader.js', () => ({
  PostgresReader: vi.fn(),
  createPostgresReader: vi.fn(() => ({
    readAll: vi.fn().mockImplementation(async (source: { cloudTable: string }) => {
      return mockCloudRecords[source.cloudTable] || [];
    }),
    readChanged: vi.fn().mockImplementation(async (source: { cloudTable: string }) => {
      return mockCloudRecords[source.cloudTable] || [];
    }),
    count: vi.fn().mockImplementation(async (source: { cloudTable: string }) => {
      const records = mockCloudRecords[source.cloudTable];
      return records ? records.length : 0;
    }),
  })),
}));

vi.mock('../../../src/sync/writers/sqlite-writer.js', () => ({
  SQLiteWriter: vi.fn(),
  createSQLiteWriter: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockImplementation(async (table: string, records: unknown[]) => {
      const written = records.length;
      mockLocalWritten[table] = (mockLocalWritten[table] || 0) + written;
      return written;
    }),
    count: vi.fn().mockImplementation(async (table: string) => {
      return mockLocalCounts[table] || mockLocalWritten[table] || 0;
    }),
  })),
}));

// Mock fs for backup check (existsSync returns true, copyFileSync is a no-op)
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    copyFileSync: vi.fn(),
  };
});

import {
  PullSyncAgent,
  createPullSyncAgent,
  pullFromCloud,
  type PullAgentConfig,
} from '../../../src/sync/pull-agent.js';
import type { PullSource } from '../../../src/sync/interfaces.js';

describe('PullSyncAgent', () => {
  const testSources: PullSource[] = [
    {
      name: 'goap-actions',
      cloudTable: 'aqe.goap_actions',
      localTable: 'goap_actions',
      enabled: true,
      priority: 'high',
      mode: 'incremental',
      dropColumns: ['source_env'],
    },
    {
      name: 'dream-insights',
      cloudTable: 'aqe.dream_insights',
      localTable: 'dream_insights',
      enabled: true,
      priority: 'low',
      mode: 'append',
      dropColumns: ['source_env'],
    },
    {
      name: 'disabled-source',
      cloudTable: 'aqe.disabled',
      localTable: 'disabled',
      enabled: false,
      priority: 'low',
      mode: 'full',
    },
  ];

  beforeEach(() => {
    mockCloudRecords = {};
    mockLocalCounts = {};
    mockLocalWritten = {};
  });

  describe('pullAll', () => {
    it('should pull all enabled sources and report results', async () => {
      mockCloudRecords = {
        'aqe.goap_actions': [
          { id: '1', name: 'action1' },
          { id: '2', name: 'action2' },
        ],
        'aqe.dream_insights': [
          { id: 'd1', insight: 'test' },
        ],
      };

      const agent = createPullSyncAgent({
        sources: testSources,
        verbose: false,
      });
      await agent.initialize();
      const report = await agent.pullAll();
      await agent.close();

      expect(report.status).toBe('completed');
      expect(report.results).toHaveLength(2); // Only enabled sources
      expect(report.totalRecordsSynced).toBe(3);
      expect(report.results[0].source).toBe('goap-actions'); // high priority first
      expect(report.results[0].recordsSynced).toBe(2);
      expect(report.results[1].source).toBe('dream-insights'); // low priority second
      expect(report.results[1].recordsSynced).toBe(1);
    });

    it('should skip disabled sources', async () => {
      const agent = createPullSyncAgent({
        sources: testSources,
        verbose: false,
      });
      await agent.initialize();
      const report = await agent.pullAll();
      await agent.close();

      const sourceNames = report.results.map(r => r.source);
      expect(sourceNames).not.toContain('disabled-source');
    });

    it('should report 0 records for empty cloud tables', async () => {
      mockCloudRecords = {};

      const agent = createPullSyncAgent({
        sources: testSources,
        verbose: false,
      });
      await agent.initialize();
      const report = await agent.pullAll();
      await agent.close();

      expect(report.status).toBe('completed');
      expect(report.totalRecordsSynced).toBe(0);
    });
  });

  describe('dry run', () => {
    it('should not write to local DB in dry-run mode', async () => {
      mockCloudRecords = {
        'aqe.goap_actions': [{ id: '1', name: 'action1' }],
      };

      const agent = createPullSyncAgent({
        sources: testSources,
        dryRun: true,
        verbose: false,
      });
      await agent.initialize();
      const report = await agent.pullAll();
      await agent.close();

      expect(report.status).toBe('completed');
      expect(report.results[0].recordsSynced).toBe(1); // Counted but not written
      expect(mockLocalWritten).toEqual({}); // Nothing actually written
    });
  });

  describe('table filtering', () => {
    it('should only pull specified tables', async () => {
      mockCloudRecords = {
        'aqe.goap_actions': [{ id: '1' }],
        'aqe.dream_insights': [{ id: 'd1' }],
      };

      const agent = createPullSyncAgent({
        sources: testSources,
        tables: ['goap_actions'],
        verbose: false,
      });
      await agent.initialize();
      const report = await agent.pullAll();
      await agent.close();

      expect(report.results).toHaveLength(1);
      expect(report.results[0].table).toBe('goap_actions');
    });

    it('should support filtering by source name', async () => {
      mockCloudRecords = {
        'aqe.dream_insights': [{ id: 'd1' }],
      };

      const agent = createPullSyncAgent({
        sources: testSources,
        tables: ['dream-insights'], // by name, not table
        verbose: false,
      });
      await agent.initialize();
      const report = await agent.pullAll();
      await agent.close();

      expect(report.results).toHaveLength(1);
      expect(report.results[0].source).toBe('dream-insights');
    });
  });

  describe('verify', () => {
    it('should compare cloud and local counts', async () => {
      mockCloudRecords = {
        'aqe.goap_actions': [{ id: '1' }, { id: '2' }],
        'aqe.dream_insights': [{ id: 'd1' }],
      };
      mockLocalCounts = {
        'goap_actions': 2,
        'dream_insights': 0,
      };

      const agent = createPullSyncAgent({
        sources: testSources,
        verbose: false,
      });
      await agent.initialize();
      const result = await agent.verify();
      await agent.close();

      expect(result.results).toHaveLength(2);
      const goap = result.results.find(r => r.localTable === 'goap_actions')!;
      expect(goap.match).toBe(true);
      expect(goap.cloudCount).toBe(2);
      expect(goap.localCount).toBe(2);

      const dreams = result.results.find(r => r.localTable === 'dream_insights')!;
      expect(dreams.match).toBe(false);
      expect(dreams.diff).toBe(-1); // local 0 - cloud 1
    });
  });

  describe('error handling', () => {
    it('should throw if not initialized', async () => {
      const agent = createPullSyncAgent({ sources: testSources });
      // pullAll without initialize
      const report = await agent.pullAll();
      expect(report.status).toBe('failed');
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]).toContain('not initialized');
    });
  });

  describe('priority ordering', () => {
    it('should process high priority sources before low', async () => {
      mockCloudRecords = {
        'aqe.goap_actions': [{ id: '1' }],
        'aqe.dream_insights': [{ id: 'd1' }],
      };

      const agent = createPullSyncAgent({
        sources: testSources,
        verbose: false,
      });
      await agent.initialize();
      const report = await agent.pullAll();
      await agent.close();

      // high priority (goap-actions) should come before low (dream-insights)
      expect(report.results[0].source).toBe('goap-actions');
      expect(report.results[1].source).toBe('dream-insights');
    });
  });
});
