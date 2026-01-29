/**
 * JSON Reader Unit Tests
 *
 * Tests for reading data from JSON files:
 * - Initialization with file path validation
 * - Reading all records from various JSON structures
 * - Incremental reading by file modification time
 * - Record count operations
 * - Data extraction for different sources (Claude Flow, intelligence, daemon)
 * - Data transformation for cloud sync
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs');

// Mock secure-json-parse
vi.mock('secure-json-parse', () => ({
  default: {
    parse: vi.fn((content: string) => JSON.parse(content)),
  },
}));

import {
  JSONReader,
  createJSONReader,
  type JSONReaderConfig,
  type JSONRecord,
} from '../../../../src/sync/readers/json-reader.js';
import type { SyncSource } from '../../../../src/sync/interfaces.js';
import secureJsonParse from 'secure-json-parse';

describe('JSONReader', () => {
  const mockFs = fs as unknown as {
    existsSync: ReturnType<typeof vi.fn>;
    readFileSync: ReturnType<typeof vi.fn>;
    statSync: ReturnType<typeof vi.fn>;
  };

  const defaultSource: SyncSource = {
    name: 'test-json',
    type: 'json',
    path: 'test.json',
    targetTable: 'aqe.test_table',
    priority: 'high',
    mode: 'full',
    enabled: true,
  };

  const defaultConfig: JSONReaderConfig = {
    source: defaultSource,
    baseDir: '/test/base',
    environment: 'test-env',
  };

  let reader: JSONReader;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFs.existsSync = vi.fn().mockReturnValue(true);
    mockFs.readFileSync = vi.fn().mockReturnValue('{}');
    mockFs.statSync = vi.fn().mockReturnValue({
      mtime: new Date(),
      size: 1024,
    });

    (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockImplementation(
      (content: string) => JSON.parse(content)
    );

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create reader with config', () => {
      reader = new JSONReader(defaultConfig);

      expect(reader.name).toBe('test-json');
      expect(reader.type).toBe('json');
    });

    it('should resolve path relative to baseDir', () => {
      reader = new JSONReader(defaultConfig);

      const expectedPath = path.resolve('/test/base', 'test.json');
      const info = reader.getInfo();

      expect(info.path).toBe(expectedPath);
    });
  });

  describe('initialize', () => {
    it('should store file modification time', async () => {
      const modTime = new Date('2024-01-15');
      mockFs.statSync = vi.fn().mockReturnValue({
        mtime: modTime,
        size: 1024,
      });

      reader = new JSONReader(defaultConfig);
      await reader.initialize();

      const info = reader.getInfo();
      expect(info.modTime).toEqual(modTime);
    });

    it('should handle missing file gracefully', async () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);

      reader = new JSONReader(defaultConfig);
      await reader.initialize();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('File not found')
      );
    });

    it('should set empty data for missing file', async () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);

      reader = new JSONReader(defaultConfig);
      await reader.initialize();

      const records = await reader.readAll();
      expect(records).toEqual([]);
    });
  });

  describe('readAll', () => {
    beforeEach(async () => {
      reader = new JSONReader(defaultConfig);
      await reader.initialize();
    });

    it('should return empty array if file not found', async () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);

      const records = await reader.readAll();

      expect(records).toEqual([]);
    });

    it('should parse and return JSON data', async () => {
      const data = [{ id: '1', name: 'Test' }];
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      const records = await reader.readAll();

      expect(records.length).toBe(1);
      expect(records[0].id).toBe('1');
    });

    it('should add source_env to transformed records', async () => {
      const data = [{ id: '1' }];
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      const records = await reader.readAll();

      expect(records[0]).toHaveProperty('source_env', 'test-env');
    });

    it('should add created_at if missing', async () => {
      const data = [{ id: '1' }];
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      const records = await reader.readAll();

      expect(records[0]).toHaveProperty('created_at');
      expect(typeof records[0].created_at).toBe('string');
    });

    it('should handle parse errors gracefully', async () => {
      mockFs.readFileSync = vi.fn().mockReturnValue('invalid json');
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Parse error');
      });

      const records = await reader.readAll();

      expect(records).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should convert object to key-value array', async () => {
      const data = {
        key1: { value: 'v1' },
        key2: { value: 'v2' },
      };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      const records = await reader.readAll();

      expect(records.length).toBe(2);
      expect(records[0]).toHaveProperty('key', 'key1');
      expect(records[0]).toHaveProperty('value');
    });
  });

  describe('readChanged', () => {
    beforeEach(async () => {
      reader = new JSONReader(defaultConfig);
      await reader.initialize();
    });

    it('should return empty array if file not found', async () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);

      const records = await reader.readChanged(new Date());

      expect(records).toEqual([]);
    });

    it('should return empty array if file not modified since date', async () => {
      const oldModTime = new Date('2024-01-01');
      mockFs.statSync = vi.fn().mockReturnValue({
        mtime: oldModTime,
        size: 1024,
      });

      const since = new Date('2024-01-15');
      const records = await reader.readChanged(since);

      expect(records).toEqual([]);
    });

    it('should return all records if file modified after since date', async () => {
      const newModTime = new Date('2024-01-20');
      mockFs.statSync = vi.fn().mockReturnValue({
        mtime: newModTime,
        size: 1024,
      });

      const data = [{ id: '1' }];
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      const since = new Date('2024-01-15');
      const records = await reader.readChanged(since);

      expect(records.length).toBe(1);
    });
  });

  describe('count', () => {
    it('should return record count', async () => {
      const data = [{ id: '1' }, { id: '2' }, { id: '3' }];
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(defaultConfig);
      await reader.initialize();

      const count = await reader.count();

      expect(count).toBe(3);
    });
  });

  describe('close', () => {
    it('should clear internal data', async () => {
      reader = new JSONReader(defaultConfig);
      await reader.initialize();
      await reader.close();

      // After close, internal state should be cleared
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Closed')
      );
    });
  });

  describe('getInfo', () => {
    it('should return file info', async () => {
      const modTime = new Date('2024-01-15');
      mockFs.statSync = vi.fn().mockReturnValue({
        mtime: modTime,
        size: 2048,
      });

      reader = new JSONReader(defaultConfig);
      await reader.initialize();

      const info = reader.getInfo();

      expect(info.path).toBeDefined();
      expect(info.exists).toBe(true);
      expect(info.modTime).toEqual(modTime);
      expect(info.size).toBe(2048);
    });

    it('should handle missing file', () => {
      mockFs.existsSync = vi.fn().mockReturnValue(false);

      reader = new JSONReader(defaultConfig);
      const info = reader.getInfo();

      expect(info.exists).toBe(false);
      expect(info.modTime).toBeNull();
      expect(info.size).toBe(0);
    });
  });

  describe('JSON path extraction', () => {
    it('should extract records by JSON path', async () => {
      const configWithPath: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          jsonPath: '$.data.items',
        },
      };

      const data = {
        data: {
          items: [{ id: '1' }, { id: '2' }],
        },
      };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configWithPath);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records.length).toBe(2);
    });

    it('should handle nested JSON path', async () => {
      const configWithPath: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          jsonPath: '$.level1.level2.level3',
        },
      };

      const data = {
        level1: {
          level2: {
            level3: [{ id: '1' }],
          },
        },
      };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configWithPath);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records.length).toBe(1);
    });

    it('should return empty array for non-existent path', async () => {
      const configWithPath: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          jsonPath: '$.nonexistent.path',
        },
      };

      const data = { other: 'data' };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configWithPath);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records).toEqual([]);
    });

    it('should convert object to records for q-values path', async () => {
      const configWithPath: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          jsonPath: '$.qvalues',
        },
      };

      const data = {
        qvalues: {
          state1: { value: 0.5, visits: 10 },
          state2: { value: 0.8, visits: 20 },
        },
      };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configWithPath);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records.length).toBe(2);
      expect(records[0]).toHaveProperty('state', 'state1');
    });
  });

  describe('Claude Flow memory extraction', () => {
    it('should extract records from Claude Flow structure', async () => {
      const configClaudeFlow: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          name: 'claude-flow-memory',
        },
      };

      const data = {
        'adr-123': { analysis: 'test' },
        'agent-task-1': { status: 'complete' },
        'pattern-auth': { type: 'authentication' },
        'metric-coverage': { value: 0.85 },
        '_metadata': { version: '1.0' },
      };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configClaudeFlow);
      await reader.initialize();

      const records = await reader.readAll();

      // Should skip _metadata
      expect(records.length).toBe(4);

      // Check categories
      const adrRecord = records.find((r) => r.key === 'adr-123');
      expect(adrRecord?.category).toBe('adr-analysis');

      const agentRecord = records.find((r) => r.key === 'agent-task-1');
      expect(agentRecord?.category).toBe('agent-patterns');

      const patternRecord = records.find((r) => r.key === 'pattern-auth');
      expect(patternRecord?.category).toBe('patterns');

      const metricRecord = records.find((r) => r.key === 'metric-coverage');
      expect(metricRecord?.category).toBe('metrics');
    });

    it('should handle empty Claude Flow store', async () => {
      const configClaudeFlow: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          name: 'claude-flow-memory',
        },
      };

      mockFs.readFileSync = vi.fn().mockReturnValue('{}');
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue({});

      reader = new JSONReader(configClaudeFlow);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records).toEqual([]);
    });
  });

  describe('Intelligence JSON extraction', () => {
    it('should extract Q-values from intelligence file', async () => {
      const configIntel: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          name: 'intelligence-qlearning',
        },
      };

      const data = {
        qvalues: {
          state1: {
            action1: { value: 0.5, visits: 10 },
            action2: { value: 0.8, visits: 20 },
          },
        },
      };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configIntel);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records.length).toBe(2);
      expect(records[0]).toHaveProperty('state', 'state1');
      expect(records[0]).toHaveProperty('action');
      expect(records[0]).toHaveProperty('q_value');
      expect(records[0]).toHaveProperty('visits');
    });

    it('should extract memories with embeddings', async () => {
      const configIntel: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          name: 'intelligence-memories',
        },
      };

      const data = {
        memories: [
          {
            id: 'mem1',
            type: 'file_access',
            content: 'test content',
            embedding: [0.1, 0.2, 0.3],
            metadata: { key: 'value' },
            timestamp: Date.now(),
          },
        ],
      };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configIntel);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records.length).toBe(1);
      expect(records[0]).toHaveProperty('id', 'mem1');
      expect(records[0]).toHaveProperty('memory_type', 'file_access');
      expect(records[0]).toHaveProperty('embedding');
    });

    it('should generate id for memories without id', async () => {
      const configIntel: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          name: 'intelligence-memories',
        },
      };

      const data = {
        memories: [{ content: 'test', type: 'test_type' }],
      };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configIntel);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records[0].id).toMatch(/^mem_/);
    });
  });

  describe('Daemon state extraction', () => {
    it('should extract worker stats from daemon state', async () => {
      const configDaemon: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          name: 'daemon-state',
        },
      };

      const data = {
        workers: {
          audit: {
            runCount: 100,
            successCount: 95,
            failureCount: 5,
            avgDuration: 150,
            lastRun: Date.now(),
          },
          metrics: {
            runs: 50,
            successes: 48,
            failures: 2,
            averageDurationMs: 200,
          },
        },
      };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configDaemon);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records.length).toBe(2);

      const auditRecord = records.find((r) => r.worker_type === 'audit');
      expect(auditRecord?.run_count).toBe(100);
      expect(auditRecord?.success_count).toBe(95);

      const metricsRecord = records.find((r) => r.worker_type === 'metrics');
      expect(metricsRecord?.run_count).toBe(50);
    });

    it('should handle empty workers object', async () => {
      const configDaemon: JSONReaderConfig = {
        ...defaultConfig,
        source: {
          ...defaultSource,
          name: 'daemon-state',
        },
      };

      const data = { workers: {} };
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(configDaemon);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records).toEqual([]);
    });
  });

  describe('Timestamp transformation', () => {
    it('should convert numeric timestamps to ISO strings', async () => {
      const timestamp = Date.now();
      const data = [{ id: '1', timestamp: timestamp }];
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(defaultConfig);
      await reader.initialize();

      const records = await reader.readAll();

      expect(typeof records[0].timestamp).toBe('string');
      expect(records[0].timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('should convert _at fields to ISO strings', async () => {
      const timestamp = Date.now();
      const data = [{ id: '1', last_used_at: timestamp }];
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(defaultConfig);
      await reader.initialize();

      const records = await reader.readAll();

      expect(typeof records[0].last_used_at).toBe('string');
    });

    it('should convert string date to ISO string', async () => {
      const data = [{ id: '1', timestamp: '2024-01-15' }];
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(defaultConfig);
      await reader.initialize();

      const records = await reader.readAll();

      expect(records[0].timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('should handle last_update field', async () => {
      const timestamp = Date.now();
      const data = [{ id: '1', last_update: timestamp }];
      mockFs.readFileSync = vi.fn().mockReturnValue(JSON.stringify(data));
      (secureJsonParse.parse as ReturnType<typeof vi.fn>).mockReturnValue(data);

      reader = new JSONReader(defaultConfig);
      await reader.initialize();

      const records = await reader.readAll();

      expect(typeof records[0].last_update).toBe('string');
    });
  });
});

describe('createJSONReader', () => {
  it('should create JSONReader instance', () => {
    const config: JSONReaderConfig = {
      source: {
        name: 'test',
        type: 'json',
        path: 'test.json',
        targetTable: 'test_table',
        priority: 'high',
        mode: 'full',
      },
      baseDir: '/test',
      environment: 'test',
    };

    const reader = createJSONReader(config);

    expect(reader).toBeInstanceOf(JSONReader);
  });
});
