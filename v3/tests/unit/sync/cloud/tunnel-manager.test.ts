/**
 * Tunnel Manager Unit Tests
 *
 * Tests for secure IAP tunnel management:
 * - IAP tunnel start/stop lifecycle
 * - Port connectivity checking
 * - Connection info retrieval
 * - Direct connection manager for local development
 * - Factory function for appropriate manager selection
 * - Error handling and timeouts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// Create mock for child_process
const mockSpawn = vi.fn();
const mockCreateConnection = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

vi.mock('net', () => ({
  createConnection: (...args: unknown[]) => mockCreateConnection(...args),
}));

import {
  IAPTunnelManager,
  DirectConnectionManager,
  createTunnelManager,
  createConnectionManager,
  type TunnelManager,
} from '../../../../src/sync/cloud/tunnel-manager.js';
import type { CloudConfig, TunnelConnection } from '../../../../src/sync/interfaces.js';

// Helper to create mock child process
function createMockProcess(): ChildProcess & EventEmitter & {
  _mockStdout: EventEmitter;
  _mockStderr: EventEmitter;
} {
  const process = new EventEmitter() as ChildProcess & EventEmitter & {
    _mockStdout: EventEmitter;
    _mockStderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };

  process._mockStdout = new EventEmitter();
  process._mockStderr = new EventEmitter();
  process.kill = vi.fn();
  process.pid = 12345;

  Object.defineProperty(process, 'stdout', {
    get: () => process._mockStdout,
  });

  Object.defineProperty(process, 'stderr', {
    get: () => process._mockStderr,
  });

  return process;
}

// Helper to create mock socket
function createMockSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    destroy: ReturnType<typeof vi.fn>;
  };
  socket.destroy = vi.fn();
  return socket;
}

describe('IAPTunnelManager', () => {
  const defaultCloudConfig: CloudConfig = {
    project: 'test-project',
    zone: 'us-central1-a',
    instance: 'test-instance',
    database: 'test_db',
    user: 'test_user',
    tunnelPort: 15432,
  };

  let tunnelManager: IAPTunnelManager;
  let mockProcess: ReturnType<typeof createMockProcess>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess);

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    tunnelManager = new IAPTunnelManager(defaultCloudConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create tunnel manager with config', () => {
      expect(tunnelManager).toBeDefined();
    });
  });

  describe('start', () => {
    it('should spawn gcloud process with correct arguments', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setTimeout(() => mockSocket.emit('connect'), 10);
        return mockSocket;
      });

      const startPromise = tunnelManager.start();

      // Emit tunnel ready message
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port 15432'));

      // Advance timers for port check delay and retry
      await vi.advanceTimersByTimeAsync(3000);

      const connection = await startPromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'gcloud',
        expect.arrayContaining([
          'compute',
          'start-iap-tunnel',
          'test-instance',
          '5432',
          '--local-host-port=localhost:15432',
          '--zone=us-central1-a',
          '--project=test-project',
        ]),
        expect.any(Object)
      );

      expect(connection.host).toBe('localhost');
      expect(connection.port).toBe(15432);
    });

    it('should return existing connection if already running', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setTimeout(() => mockSocket.emit('connect'), 10);
        return mockSocket;
      });

      const startPromise1 = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));
      await vi.advanceTimersByTimeAsync(3000);
      const connection1 = await startPromise1;

      const connection2 = await tunnelManager.start();

      expect(connection1).toEqual(connection2);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('should handle "tunnel is running" message', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setTimeout(() => mockSocket.emit('connect'), 10);
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('tunnel is running'));
      await vi.advanceTimersByTimeAsync(3000);

      const connection = await startPromise;
      expect(connection).toBeDefined();
    });

    it('should handle "Testing if tunnel connection works" message', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setTimeout(() => mockSocket.emit('connect'), 10);
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit(
        'data',
        Buffer.from('Testing if tunnel connection works')
      );
      await vi.advanceTimersByTimeAsync(3000);

      const connection = await startPromise;
      expect(connection).toBeDefined();
    });

    it('should reject on process error before connection', async () => {
      const startPromise = tunnelManager.start();

      mockProcess.emit('error', new Error('Spawn failed'));

      await expect(startPromise).rejects.toThrow('Failed to start tunnel');
    });

    it('should reject on process close before connection', async () => {
      const startPromise = tunnelManager.start();

      mockProcess.emit('close', 1);

      await expect(startPromise).rejects.toThrow('Tunnel process exited');
    });

    it('should timeout after 60 seconds', async () => {
      // Catch any unhandled rejections that may occur during timer cleanup
      const unhandledRejections: Error[] = [];
      const rejectionHandler = (err: Error) => unhandledRejections.push(err);
      process.on('unhandledRejection', rejectionHandler);

      try {
        const startPromise = tunnelManager.start();

        // Advance past timeout
        await vi.advanceTimersByTimeAsync(61000);

        await expect(startPromise).rejects.toThrow('Tunnel connection timeout');

        // Clean up any pending timers
        await vi.runAllTimersAsync();
      } finally {
        process.off('unhandledRejection', rejectionHandler);
      }
    });

    it('should retry port connectivity check', async () => {
      const mockSocket = createMockSocket();
      let connectAttempts = 0;

      mockCreateConnection.mockImplementation(() => {
        connectAttempts++;
        if (connectAttempts < 3) {
          // Fail first two attempts
          setTimeout(() => mockSocket.emit('error', new Error('Connection refused')), 10);
        } else {
          // Succeed on third attempt
          setTimeout(() => mockSocket.emit('connect'), 10);
        }
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));

      // Advance through port check retries
      await vi.advanceTimersByTimeAsync(10000);

      const connection = await startPromise;
      expect(connection).toBeDefined();
      expect(connectAttempts).toBeGreaterThan(1);
    });
  });

  describe('stop', () => {
    it('should kill process with SIGTERM', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setImmediate(() => mockSocket.emit('connect'));
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));
      await vi.advanceTimersByTimeAsync(5000);
      await startPromise;

      // Start stop and advance timers to complete
      const stopPromise = tunnelManager.stop();
      await vi.advanceTimersByTimeAsync(2000);
      await stopPromise;

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should follow up with SIGKILL after delay', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setImmediate(() => mockSocket.emit('connect'));
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));
      await vi.advanceTimersByTimeAsync(5000);
      await startPromise;

      const stopPromise = tunnelManager.stop();
      await vi.advanceTimersByTimeAsync(2000);
      await stopPromise;

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('should handle stop when not running', async () => {
      await expect(tunnelManager.stop()).resolves.not.toThrow();
    });
  });

  describe('isActive', () => {
    it('should return false initially', () => {
      expect(tunnelManager.isActive()).toBe(false);
    });

    it('should return true after successful start', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setTimeout(() => mockSocket.emit('connect'), 10);
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));
      await vi.advanceTimersByTimeAsync(3000);
      await startPromise;

      expect(tunnelManager.isActive()).toBe(true);
    });

    it('should return false after stop', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setImmediate(() => mockSocket.emit('connect'));
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));
      await vi.advanceTimersByTimeAsync(5000);
      await startPromise;

      const stopPromise = tunnelManager.stop();
      await vi.advanceTimersByTimeAsync(2000);
      await stopPromise;

      expect(tunnelManager.isActive()).toBe(false);
    });
  });

  describe('getConnection', () => {
    it('should return null initially', () => {
      expect(tunnelManager.getConnection()).toBeNull();
    });

    it('should return connection info after start', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setImmediate(() => mockSocket.emit('connect'));
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));
      await vi.advanceTimersByTimeAsync(5000);
      await startPromise;

      const connection = tunnelManager.getConnection();

      expect(connection).toEqual({
        host: 'localhost',
        port: 15432,
        pid: 12345,
        startedAt: expect.any(Date),
      });
    });

    it('should return null after stop', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setImmediate(() => mockSocket.emit('connect'));
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));
      await vi.advanceTimersByTimeAsync(5000);
      await startPromise;

      const stopPromise = tunnelManager.stop();
      await vi.advanceTimersByTimeAsync(2000);
      await stopPromise;

      expect(tunnelManager.getConnection()).toBeNull();
    });
  });

  describe('getConnectionString', () => {
    it('should throw if tunnel not active', () => {
      expect(() => tunnelManager.getConnectionString()).toThrow('Tunnel not active');
    });

    it('should return PostgreSQL connection string when active', async () => {
      const mockSocket = createMockSocket();
      mockCreateConnection.mockImplementation(() => {
        setImmediate(() => mockSocket.emit('connect'));
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));
      await vi.advanceTimersByTimeAsync(5000);
      await startPromise;

      const connectionString = tunnelManager.getConnectionString();

      expect(connectionString).toMatch(/^postgresql:\/\//);
      expect(connectionString).toContain('localhost:15432');
      expect(connectionString).toContain('test_db');
    });
  });

  describe('port connectivity checking', () => {
    it('should check port with timeout', async () => {
      // Catch any unhandled rejections that may occur during timer cleanup
      const unhandledRejections: Error[] = [];
      const rejectionHandler = (err: Error) => unhandledRejections.push(err);
      process.on('unhandledRejection', rejectionHandler);

      try {
        const mockSocket = createMockSocket();
        mockCreateConnection.mockImplementation(() => {
          // Don't emit any event - let timeout happen
          return mockSocket;
        });

        const startPromise = tunnelManager.start();
        mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));

        // Advance through all port check attempts
        await vi.advanceTimersByTimeAsync(60000);

        await expect(startPromise).rejects.toThrow();

        // Clean up any pending timers
        await vi.runAllTimersAsync();
      } finally {
        process.off('unhandledRejection', rejectionHandler);
      }
    });

    it('should handle socket errors during port check', async () => {
      const mockSocket = createMockSocket();
      let attempts = 0;

      mockCreateConnection.mockImplementation(() => {
        attempts++;
        if (attempts < 5) {
          setTimeout(() => mockSocket.emit('error', new Error('ECONNREFUSED')), 10);
        } else {
          setTimeout(() => mockSocket.emit('connect'), 10);
        }
        return mockSocket;
      });

      const startPromise = tunnelManager.start();
      mockProcess._mockStderr.emit('data', Buffer.from('Listening on port'));
      await vi.advanceTimersByTimeAsync(15000);

      const connection = await startPromise;
      expect(connection).toBeDefined();
    });
  });
});

describe('DirectConnectionManager', () => {
  let manager: DirectConnectionManager;
  const connectionString = 'postgresql://user:pass@localhost:5432/testdb';

  beforeEach(() => {
    manager = new DirectConnectionManager(connectionString);
  });

  describe('constructor', () => {
    it('should create manager with connection string', () => {
      expect(manager).toBeDefined();
    });
  });

  describe('start', () => {
    it('should parse connection string and return connection info', async () => {
      const connection = await manager.start();

      expect(connection.host).toBe('localhost');
      expect(connection.port).toBe(5432);
      expect(connection.startedAt).toBeInstanceOf(Date);
    });

    it('should default port to 5432 if not specified', async () => {
      const managerNoPort = new DirectConnectionManager(
        'postgresql://user:pass@localhost/testdb'
      );
      const connection = await managerNoPort.start();

      expect(connection.port).toBe(5432);
    });
  });

  describe('stop', () => {
    it('should clear connection', async () => {
      await manager.start();
      await manager.stop();

      expect(manager.getConnection()).toBeNull();
    });
  });

  describe('isActive', () => {
    it('should return false initially', () => {
      expect(manager.isActive()).toBe(false);
    });

    it('should return true after start', async () => {
      await manager.start();
      expect(manager.isActive()).toBe(true);
    });

    it('should return false after stop', async () => {
      await manager.start();
      await manager.stop();
      expect(manager.isActive()).toBe(false);
    });
  });

  describe('getConnection', () => {
    it('should return null initially', () => {
      expect(manager.getConnection()).toBeNull();
    });

    it('should return connection after start', async () => {
      await manager.start();
      const connection = manager.getConnection();

      expect(connection).not.toBeNull();
      expect(connection?.host).toBe('localhost');
    });
  });

  describe('getConnectionString', () => {
    it('should return original connection string', () => {
      expect(manager.getConnectionString()).toBe(connectionString);
    });
  });
});

describe('Factory Functions', () => {
  describe('createTunnelManager', () => {
    it('should create IAPTunnelManager', () => {
      const config: CloudConfig = {
        project: 'test-project',
        zone: 'us-central1-a',
        instance: 'test-instance',
        database: 'test_db',
        user: 'test_user',
        tunnelPort: 15432,
      };

      const manager = createTunnelManager(config);

      expect(manager).toBeInstanceOf(IAPTunnelManager);
    });
  });

  describe('createConnectionManager', () => {
    it('should create DirectConnectionManager when connectionString provided', () => {
      const config: CloudConfig = {
        project: 'test-project',
        zone: 'us-central1-a',
        instance: 'test-instance',
        database: 'test_db',
        user: 'test_user',
        tunnelPort: 15432,
        connectionString: 'postgresql://localhost:5432/testdb',
      };

      const manager = createConnectionManager(config);

      expect(manager).toBeInstanceOf(DirectConnectionManager);
    });

    it('should create IAPTunnelManager when no connectionString', () => {
      const config: CloudConfig = {
        project: 'test-project',
        zone: 'us-central1-a',
        instance: 'test-instance',
        database: 'test_db',
        user: 'test_user',
        tunnelPort: 15432,
      };

      const manager = createConnectionManager(config);

      expect(manager).toBeInstanceOf(IAPTunnelManager);
    });
  });
});
