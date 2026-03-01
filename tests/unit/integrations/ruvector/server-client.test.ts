/**
 * Agentic QE v3 - RuVector Server Client Unit Tests
 *
 * Tests for RuVectorServerClient lifecycle management and operations.
 *
 * Note: These tests mock the child_process and fetch to avoid
 * actually starting the ruvector server during tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  RuVectorServerClient,
  createRuVectorServerClient,
  createRuVectorServerClientSync,
  getSharedServerClient,
  resetSharedServerClient,
  DEFAULT_SERVER_CONFIG,
  type RuVectorServerConfig,
  type ServerHealthResult,
  type VectorSearchResult,
} from '../../../../src/integrations/ruvector/server-client';
import type { QESONAPattern, QEPatternType } from '../../../../src/integrations/ruvector/sona-wrapper';
import type { DomainName } from '../../../../src/integrations/rl-suite/interfaces';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Get mocked spawn
import { spawn } from 'child_process';
const mockedSpawn = spawn as Mock;

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestConfig(overrides: Partial<RuVectorServerConfig> = {}): RuVectorServerConfig {
  return {
    httpPort: 18080, // Use non-standard port for tests
    grpcPort: 50152,
    dataDir: '/tmp/ruvector-test-data',
    autoStart: false, // Don't auto-start by default in tests
    cors: true,
    startTimeout: 5000,
    ...overrides,
  };
}

function createTestPattern(overrides: Partial<QESONAPattern> = {}): QESONAPattern {
  return {
    id: `pattern-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'test-generation' as QEPatternType,
    domain: 'test-generation' as DomainName,
    stateEmbedding: new Array(384).fill(0).map(() => Math.random()),
    action: {
      type: 'test-action',
      value: 'execute-test',
    },
    outcome: {
      reward: 0.8,
      success: true,
      quality: 0.9,
    },
    confidence: 0.85,
    usageCount: 5,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockProcess(): {
  stdout: { on: Mock };
  stderr: { on: Mock };
  on: Mock;
  kill: Mock;
} {
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('RuVectorServerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(async () => {
    await resetSharedServerClient();
  });

  describe('Vector Operations Capability', () => {
    it('should report vector operations as not supported (API coming soon)', () => {
      const client = new RuVectorServerClient(createTestConfig());
      expect(client.supportsVectorOperations()).toBe(false);
    });

    it('should provide unavailable reason when server not running', () => {
      const client = new RuVectorServerClient(createTestConfig());
      const reason = client.getVectorOperationsUnavailableReason();
      expect(reason).toContain('not running');
    });

    it('should provide unavailable reason when API not available', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const mockProcess = createMockProcess();
      mockedSpawn.mockReturnValueOnce(mockProcess);

      mockProcess.stdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Server started')), 10);
        }
      });

      const client = new RuVectorServerClient(createTestConfig());
      await client.startServer();

      const reason = client.getVectorOperationsUnavailableReason();
      expect(reason).toContain('not yet available');
      expect(reason).toContain('github.com/ruvnet/ruvector');
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when none provided', () => {
      const client = new RuVectorServerClient();
      const config = client.getConfig();

      expect(config.httpPort).toBe(DEFAULT_SERVER_CONFIG.httpPort);
      expect(config.grpcPort).toBe(DEFAULT_SERVER_CONFIG.grpcPort);
      expect(config.dataDir).toBe(DEFAULT_SERVER_CONFIG.dataDir);
      expect(config.autoStart).toBe(DEFAULT_SERVER_CONFIG.autoStart);
      expect(config.cors).toBe(DEFAULT_SERVER_CONFIG.cors);
      expect(config.startTimeout).toBe(DEFAULT_SERVER_CONFIG.startTimeout);
    });

    it('should merge custom configuration with defaults', () => {
      const config = createTestConfig({ httpPort: 9999, cors: false });
      const client = new RuVectorServerClient(config);
      const resultConfig = client.getConfig();

      expect(resultConfig.httpPort).toBe(9999);
      expect(resultConfig.cors).toBe(false);
      // Other values should be from test config or defaults
      expect(resultConfig.grpcPort).toBe(50152);
    });

    it('should return correct endpoints', () => {
      const client = new RuVectorServerClient(createTestConfig());

      expect(client.getHttpEndpoint()).toBe('http://localhost:18080');
      expect(client.getGrpcEndpoint()).toBe('localhost:50152');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when server responds OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const client = new RuVectorServerClient(createTestConfig());
      const health = await client.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.status).toBe('running');
      expect(health.httpEndpoint).toBe('http://localhost:18080');
      expect(health.lastChecked).toBeInstanceOf(Date);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:18080/health',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return unhealthy status when server returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const client = new RuVectorServerClient(createTestConfig());
      const health = await client.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.status).toBe('error');
      expect(health.error).toContain('500');
    });

    it('should return stopped status when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const client = new RuVectorServerClient(createTestConfig());
      const health = await client.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.status).toBe('stopped');
      expect(health.error).toBe('Connection refused');
    });

    it('should cache last health check result', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const client = new RuVectorServerClient(createTestConfig());
      await client.healthCheck();

      const cached = client.getLastHealthCheck();
      expect(cached).not.toBeNull();
      expect(cached?.healthy).toBe(true);
    });
  });

  describe('Server Lifecycle', () => {
    it('should report not running initially', () => {
      const client = new RuVectorServerClient(createTestConfig());
      expect(client.isServerRunning()).toBe(false);
    });

    it('should start server with correct arguments', async () => {
      const mockProcess = createMockProcess();
      mockedSpawn.mockReturnValueOnce(mockProcess);

      // Simulate server starting
      mockProcess.stdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Server started and listening')), 10);
        }
      });

      const client = new RuVectorServerClient(createTestConfig());

      // Don't await - just trigger start
      const startPromise = client.startServer();

      // Verify spawn was called with correct args
      expect(mockedSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining([
          'ruvector',
          'server',
          '--port', '18080',
          '--grpc-port', '50152',
          '--data-dir', '/tmp/ruvector-test-data',
          '--cors',
        ]),
        expect.any(Object)
      );

      await startPromise;
      expect(client.isServerRunning()).toBe(true);
    });

    it('should not include --cors when cors is disabled', async () => {
      const mockProcess = createMockProcess();
      mockedSpawn.mockReturnValueOnce(mockProcess);

      mockProcess.stdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Server started')), 10);
        }
      });

      const client = new RuVectorServerClient(createTestConfig({ cors: false }));
      await client.startServer();

      const spawnArgs = mockedSpawn.mock.calls[0][1];
      expect(spawnArgs).not.toContain('--cors');
    });

    it('should handle server start timeout', async () => {
      const mockProcess = createMockProcess();
      mockedSpawn.mockReturnValueOnce(mockProcess);

      // Never emit 'started' message
      mockProcess.stdout.on.mockImplementation(() => {});
      mockProcess.stderr.on.mockImplementation(() => {});
      mockProcess.on.mockImplementation(() => {});

      const client = new RuVectorServerClient(createTestConfig({ startTimeout: 100 }));

      await expect(client.startServer()).rejects.toThrow(/failed to start within/i);
    });

    it('should handle spawn error', async () => {
      const mockProcess = createMockProcess();
      mockedSpawn.mockReturnValueOnce(mockProcess);

      mockProcess.on.mockImplementation((event: string, callback: (err: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('spawn ENOENT')), 10);
        }
      });

      const client = new RuVectorServerClient(createTestConfig());

      await expect(client.startServer()).rejects.toThrow(/spawn ENOENT/i);
    });

    it('should stop server gracefully', async () => {
      const mockProcess = createMockProcess();
      mockedSpawn.mockReturnValueOnce(mockProcess);

      // Start server
      mockProcess.stdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Server started')), 10);
        }
      });

      const client = new RuVectorServerClient(createTestConfig());
      await client.startServer();
      expect(client.isServerRunning()).toBe(true);

      // Stop server
      mockProcess.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'exit') {
          setTimeout(() => callback(), 10);
        }
      });

      await client.stopServer();
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(client.isServerRunning()).toBe(false);
    });

    it('should skip start if already running', async () => {
      const mockProcess = createMockProcess();
      mockedSpawn.mockReturnValueOnce(mockProcess);

      mockProcess.stdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Server started')), 10);
        }
      });

      const client = new RuVectorServerClient(createTestConfig());
      await client.startServer();

      // Try to start again
      await client.startServer();

      // Should only have spawned once
      expect(mockedSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureServerRunning', () => {
    it('should start server if health check fails and autoStart is true', async () => {
      // First health check fails
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const mockProcess = createMockProcess();
      mockedSpawn.mockReturnValueOnce(mockProcess);

      mockProcess.stdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Server started')), 10);
        }
      });

      const client = new RuVectorServerClient(createTestConfig({ autoStart: true }));
      await client.ensureServerRunning();

      expect(mockedSpawn).toHaveBeenCalled();
    });

    it('should throw if server not running and autoStart is false', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const client = new RuVectorServerClient(createTestConfig({ autoStart: false }));

      await expect(client.ensureServerRunning()).rejects.toThrow(/autoStart is disabled/);
    });

    it('should not start server if already healthy', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const client = new RuVectorServerClient(createTestConfig({ autoStart: true }));
      await client.ensureServerRunning();

      expect(mockedSpawn).not.toHaveBeenCalled();
    });
  });

  describe('Vector Operations (Stubs)', () => {
    let client: RuVectorServerClient;

    beforeEach(() => {
      // Mock healthy server for all vector operations
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      client = new RuVectorServerClient(createTestConfig());
    });

    it('should log stub message for storeVector', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await client.storeVector('test-namespace', 'vec-1', [1.0, 2.0, 3.0], { key: 'value' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('STUB: storeVector'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });

    it('should return empty array for searchSimilar stub', async () => {
      const results = await client.searchSimilar('test-namespace', [1.0, 2.0, 3.0], 5);

      expect(results).toEqual([]);
    });

    it('should log stub message for deleteVector', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await client.deleteVector('test-namespace', 'vec-1');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('STUB: deleteVector')
      );

      consoleSpy.mockRestore();
    });

    it('should return mocked stats', async () => {
      const stats = await client.getServerStats();

      expect(stats.isMocked).toBe(true);
      expect(stats.totalVectors).toBe(0);
      expect(stats.vectorsByNamespace).toEqual({});
    });
  });

  describe('Pattern Sharing', () => {
    let client: RuVectorServerClient;

    beforeEach(() => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      client = new RuVectorServerClient(createTestConfig());
    });

    it('should share pattern by storing its embedding (stubbed)', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const pattern = createTestPattern();

      const result = await client.sharePattern(pattern);

      // Should return false because vector operations are not supported
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('STUB: storeVector'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });

    it('should skip sharing pattern without embedding', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const pattern = createTestPattern({ stateEmbedding: [] });

      const result = await client.sharePattern(pattern);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('no embedding')
      );

      consoleSpy.mockRestore();
    });

    it('should find similar patterns (returns empty for stub)', async () => {
      const pattern = createTestPattern();
      const results = await client.findSimilarPatterns(pattern, 5);

      expect(results).toEqual([]);
    });

    it('should return empty for patterns without embedding', async () => {
      const pattern = createTestPattern({ stateEmbedding: [] });
      const results = await client.findSimilarPatterns(pattern);

      expect(results).toEqual([]);
    });
  });

  describe('Factory Functions', () => {
    it('should create client with async factory', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const client = await createRuVectorServerClient(createTestConfig());

      expect(client).toBeInstanceOf(RuVectorServerClient);
    });

    it('should handle server start failure gracefully in async factory', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Should not throw, just warn
      const client = await createRuVectorServerClient(createTestConfig({ autoStart: true }));

      expect(client).toBeInstanceOf(RuVectorServerClient);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start server'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });

    it('should create client with sync factory', () => {
      const client = createRuVectorServerClientSync(createTestConfig());

      expect(client).toBeInstanceOf(RuVectorServerClient);
      expect(client.isServerRunning()).toBe(false);
    });

    it('should return same instance for shared client', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const client1 = await getSharedServerClient(createTestConfig());
      const client2 = await getSharedServerClient(createTestConfig());

      expect(client1).toBe(client2);
    });

    it('should reset shared client', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const client1 = await getSharedServerClient(createTestConfig());
      await resetSharedServerClient();
      const client2 = await getSharedServerClient(createTestConfig());

      expect(client1).not.toBe(client2);
    });
  });

  describe('Dispose', () => {
    it('should stop server on dispose', async () => {
      const mockProcess = createMockProcess();
      mockedSpawn.mockReturnValueOnce(mockProcess);

      mockProcess.stdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Server started')), 10);
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'exit') {
          setTimeout(() => callback(), 10);
        }
      });

      const client = new RuVectorServerClient(createTestConfig());
      await client.startServer();

      await client.dispose();

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(client.isServerRunning()).toBe(false);
    });
  });
});
