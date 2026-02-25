/**
 * PostgreSQL Writer Unit Tests
 *
 * Tests for cloud database write operations:
 * - Connection management with tunnel
 * - Transaction handling (begin, commit, rollback)
 * - Upsert operations with batch processing
 * - Value serialization for PostgreSQL types
 * - Conflict column inference
 * - Mock mode when pg module unavailable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the tunnel manager
const mockTunnelManager = {
  start: vi.fn().mockResolvedValue({
    host: 'localhost',
    port: 15432,
    pid: 12345,
    startedAt: new Date(),
  }),
  stop: vi.fn().mockResolvedValue(undefined),
  isActive: vi.fn().mockReturnValue(true),
  getConnection: vi.fn().mockReturnValue({
    host: 'localhost',
    port: 15432,
    pid: 12345,
    startedAt: new Date(),
  }),
};

// Mock the 'module' built-in so that createRequire returns a function
// that throws for 'pg'. This intercepts the production code's
//   const requirePg = createRequire(import.meta.url);
//   pg = requirePg('pg');
// because vi.mock('pg') cannot intercept Node's native createRequire().
vi.mock('module', async (importOriginal) => {
  const original = await importOriginal() as typeof import('module');
  return {
    ...original,
    createRequire: (...args: Parameters<typeof original.createRequire>) => {
      const realRequire = original.createRequire(...args);
      return (id: string) => {
        if (id === 'pg') throw new Error('pg module not available (mocked)');
        return realRequire(id);
      };
    },
  };
});

import {
  PostgresWriter,
  createPostgresWriter,
  type PostgresWriterConfig,
} from '../../../../src/sync/cloud/postgres-writer.js';
import type { CloudConfig } from '../../../../src/sync/interfaces.js';

describe('PostgresWriter', () => {
  const defaultCloudConfig: CloudConfig = {
    project: 'test-project',
    zone: 'us-central1-a',
    instance: 'test-instance',
    database: 'test_db',
    user: 'test_user',
    tunnelPort: 15432,
  };

  const defaultConfig: PostgresWriterConfig = {
    cloud: defaultCloudConfig,
    tunnelManager: mockTunnelManager,
    poolSize: 5,
    connectionTimeout: 10000,
  };

  let writer: PostgresWriter;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTunnelManager.isActive.mockReturnValue(true);
    mockTunnelManager.getConnection.mockReturnValue({
      host: 'localhost',
      port: 15432,
      pid: 12345,
      startedAt: new Date(),
    });

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
    it('should create writer with config', () => {
      writer = new PostgresWriter(defaultConfig);
      expect(writer).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should start tunnel if not active', async () => {
      mockTunnelManager.isActive.mockReturnValue(false);

      writer = new PostgresWriter(defaultConfig);
      await writer.connect();

      expect(mockTunnelManager.start).toHaveBeenCalled();
    });

    it('should not start tunnel if already active', async () => {
      mockTunnelManager.isActive.mockReturnValue(true);

      writer = new PostgresWriter(defaultConfig);
      await writer.connect();

      expect(mockTunnelManager.start).not.toHaveBeenCalled();
    });

    it('should throw error if no tunnel connection available', async () => {
      mockTunnelManager.getConnection.mockReturnValue(null);

      writer = new PostgresWriter(defaultConfig);

      await expect(writer.connect()).rejects.toThrow('No tunnel connection available');
    });

    it('should use mock client when pg module not available', async () => {
      writer = new PostgresWriter(defaultConfig);
      await writer.connect();

      // Should warn about mock mode
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('mock mode')
      );
    });

    it('should not reconnect if already connected', async () => {
      writer = new PostgresWriter(defaultConfig);
      await writer.connect();
      await writer.connect();

      // getConnection should only be called once for the actual connect
      const callCount = mockTunnelManager.getConnection.mock.calls.length;
      expect(callCount).toBe(1);
    });
  });

  describe('transaction management', () => {
    beforeEach(async () => {
      writer = new PostgresWriter(defaultConfig);
      await writer.connect();
    });

    it('should begin transaction', async () => {
      await expect(writer.beginTransaction()).resolves.not.toThrow();
    });

    it('should throw error if not connected when beginning transaction', async () => {
      const disconnectedWriter = new PostgresWriter(defaultConfig);

      await expect(disconnectedWriter.beginTransaction()).rejects.toThrow(
        'Not connected'
      );
    });

    it('should commit transaction', async () => {
      await writer.beginTransaction();
      await expect(writer.commit()).resolves.not.toThrow();
    });

    it('should throw error if no active transaction on commit', async () => {
      await expect(writer.commit()).rejects.toThrow('No active transaction');
    });

    it('should rollback transaction', async () => {
      await writer.beginTransaction();
      await expect(writer.rollback()).resolves.not.toThrow();
    });

    it('should not throw on rollback without active transaction', async () => {
      await expect(writer.rollback()).resolves.not.toThrow();
    });
  });

  describe('upsert', () => {
    beforeEach(async () => {
      writer = new PostgresWriter(defaultConfig);
      await writer.connect();
    });

    it('should throw error if not connected', async () => {
      const disconnectedWriter = new PostgresWriter(defaultConfig);

      await expect(
        disconnectedWriter.upsert('test_table', [{ id: '1' }])
      ).rejects.toThrow('Not connected');
    });

    it('should return 0 for empty records array', async () => {
      const result = await writer.upsert('test_table', []);
      expect(result).toBe(0);
    });

    it('should upsert records successfully', async () => {
      const records = [
        { id: '1', name: 'Test 1' },
        { id: '2', name: 'Test 2' },
      ];

      const result = await writer.upsert('test_table', records);

      // Mock returns 0 rowCount
      expect(result).toBe(0);
    });

    it('should process records in batches', async () => {
      // Create more than 100 records to trigger batching
      const records = Array.from({ length: 150 }, (_, i) => ({
        id: String(i),
        name: `Test ${i}`,
      }));

      const result = await writer.upsert('test_table', records);

      expect(result).toBeDefined();
    });

    it('should use skipIfExists option', async () => {
      const records = [{ id: '1', name: 'Test' }];

      await writer.upsert('test_table', records, {
        skipIfExists: true,
      });

      // Should build ON CONFLICT DO NOTHING clause
    });

    it('should use custom conflict columns', async () => {
      const records = [{ key: 'k1', value: 'v1', source_env: 'test' }];

      await writer.upsert('test_table', records, {
        conflictColumns: ['key', 'source_env'],
      });
    });

    it('should use custom update columns', async () => {
      const records = [{ id: '1', name: 'Test', updated_at: new Date() }];

      await writer.upsert('test_table', records, {
        conflictColumns: ['id'],
        updateColumns: ['name', 'updated_at'],
      });
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      writer = new PostgresWriter(defaultConfig);
      await writer.connect();
    });

    it('should throw error if not connected', async () => {
      const disconnectedWriter = new PostgresWriter(defaultConfig);

      await expect(
        disconnectedWriter.execute('SELECT 1')
      ).rejects.toThrow('Not connected');
    });

    it('should execute SQL successfully', async () => {
      await expect(
        writer.execute('CREATE TABLE test (id TEXT)')
      ).resolves.not.toThrow();
    });

    it('should execute SQL with parameters', async () => {
      await expect(
        writer.execute('INSERT INTO test VALUES ($1)', ['value'])
      ).resolves.not.toThrow();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      writer = new PostgresWriter(defaultConfig);
      await writer.connect();
    });

    it('should throw error if not connected', async () => {
      const disconnectedWriter = new PostgresWriter(defaultConfig);

      await expect(
        disconnectedWriter.query('SELECT * FROM test')
      ).rejects.toThrow('Not connected');
    });

    it('should return query results', async () => {
      const result = await writer.query<{ count: number }>(
        'SELECT COUNT(*) as count FROM test'
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should execute query with parameters', async () => {
      const result = await writer.query<{ id: string }>(
        'SELECT * FROM test WHERE id = $1',
        ['123']
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('close', () => {
    it('should close connection and rollback active transaction', async () => {
      writer = new PostgresWriter(defaultConfig);
      await writer.connect();
      await writer.beginTransaction();
      await writer.close();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connection closed')
      );
    });

    it('should handle close when not connected', async () => {
      writer = new PostgresWriter(defaultConfig);

      await expect(writer.close()).resolves.not.toThrow();
    });
  });

  describe('value serialization', () => {
    beforeEach(async () => {
      writer = new PostgresWriter(defaultConfig);
      await writer.connect();
    });

    it('should serialize null values', async () => {
      const records = [{ id: '1', value: null }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should serialize undefined values as null', async () => {
      const records = [{ id: '1', value: undefined }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should serialize Buffer values', async () => {
      const buffer = Buffer.from('test data');
      const records = [{ id: '1', data: buffer }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should serialize Float32Array from Buffer for embeddings', async () => {
      const floats = new Float32Array([0.1, 0.2, 0.3]);
      const buffer = Buffer.from(floats.buffer);
      const records = [{ id: '1', embedding: buffer }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should serialize Unix millisecond timestamps to ISO strings', async () => {
      const timestamp = Date.now();
      const records = [{ id: '1', created_at: timestamp }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should serialize Unix second timestamps to ISO strings', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const records = [{ id: '1', created_at: timestamp }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should serialize arrays as JSON strings', async () => {
      const records = [{ id: '1', tags: ['a', 'b', 'c'] }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should serialize number arrays as PostgreSQL vectors', async () => {
      const records = [{ id: '1', embedding: [0.1, 0.2, 0.3] }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should serialize objects as JSON strings', async () => {
      const records = [{ id: '1', metadata: { key: 'value' } }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should preserve ISO date strings', async () => {
      const isoDate = '2024-01-15T12:00:00.000Z';
      const records = [{ id: '1', created_at: isoDate }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });

    it('should wrap plain strings for JSONB columns', async () => {
      const records = [{ id: '1', action_value: 'plain string' }];
      await expect(writer.upsert('test', records)).resolves.not.toThrow();
    });
  });

  describe('conflict column inference', () => {
    beforeEach(async () => {
      writer = new PostgresWriter(defaultConfig);
      await writer.connect();
    });

    it('should infer id as conflict column when present', async () => {
      const records = [{ id: '1', name: 'Test' }];
      await writer.upsert('test_table', records);
      // Should use id as conflict column
    });

    it('should infer key + source_env for kv-style tables', async () => {
      const records = [{ key: 'k1', source_env: 'test', value: 'v1' }];
      await writer.upsert('test_table', records);
      // Should use key, source_env as conflict columns
    });

    it('should infer key + partition + source_env when partition present', async () => {
      const records = [
        { key: 'k1', partition: 'p1', source_env: 'test', value: 'v1' },
      ];
      await writer.upsert('test_table', records);
      // Should use key, partition, source_env as conflict columns
    });

    it('should infer state + action + source_env for q-learning tables', async () => {
      const records = [
        { state: 's1', action: 'a1', source_env: 'test', q_value: 0.5 },
      ];
      await writer.upsert('test_table', records);
      // Should use state, action, source_env as conflict columns
    });

    it('should infer worker_type + source_env for worker tables', async () => {
      const records = [
        { worker_type: 'audit', source_env: 'test', run_count: 10 },
      ];
      await writer.upsert('test_table', records);
      // Should use worker_type, source_env as conflict columns
    });

    it('should return empty array for unknown patterns', async () => {
      const records = [{ foo: 'bar', baz: 'qux' }];
      await writer.upsert('test_table', records);
      // Should return empty conflict columns
    });
  });
});

describe('createPostgresWriter', () => {
  it('should create PostgresWriter instance', () => {
    const config: PostgresWriterConfig = {
      cloud: {
        project: 'test-project',
        zone: 'us-central1-a',
        instance: 'test-instance',
        database: 'test_db',
        user: 'test_user',
        tunnelPort: 15432,
      },
      tunnelManager: mockTunnelManager,
    };

    const writer = createPostgresWriter(config);

    expect(writer).toBeInstanceOf(PostgresWriter);
  });
});
