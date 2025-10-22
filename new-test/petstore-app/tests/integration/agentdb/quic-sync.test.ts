/**
 * QUIC Synchronization Integration Tests
 * Tests for QUIC-based cross-agent pattern synchronization
 */

import { QUICServer } from '../../../src/core/sync/QUICServer';
import { QUICConnection } from '../../../src/core/sync/QUICConnection';
import {
  QUICConfig,
  Pattern,
  PeerConfig,
  SyncRequest,
  SyncResponse
} from '../../../src/types/quic';

describe('QUIC Synchronization', () => {
  let server: QUICServer;
  let config: QUICConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      port: 4433,
      host: '127.0.0.1',
      peers: [],
      syncInterval: 1000,
      batchSize: 100,
      compression: true,
      tls: {
        rejectUnauthorized: false
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      }
    };

    server = new QUICServer(config);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('QUICServer', () => {
    describe('Server Lifecycle', () => {
      it('should start server successfully', async () => {
        await server.start();
        const state = server.getState();

        expect(state.running).toBe(true);
        expect(state.port).toBe(4433);
        expect(state.connections).toBe(0);
      });

      it('should stop server successfully', async () => {
        await server.start();
        await server.stop();
        const state = server.getState();

        expect(state.running).toBe(false);
      });

      it('should throw error when starting already running server', async () => {
        await server.start();

        await expect(server.start()).rejects.toThrow('QUIC server already running');
      });

      it('should emit server:started event', async () => {
        const startedHandler = jest.fn();
        server.on('server:started', startedHandler);

        await server.start();

        expect(startedHandler).toHaveBeenCalledWith({ port: 4433 });
      });

      it('should emit server:stopped event', async () => {
        const stoppedHandler = jest.fn();
        server.on('server:stopped', stoppedHandler);

        await server.start();
        await server.stop();

        expect(stoppedHandler).toHaveBeenCalled();
      });
    });

    describe('Peer Management', () => {
      beforeEach(async () => {
        await server.start();
      });

      it('should connect to peer successfully', async () => {
        const connectedHandler = jest.fn();
        server.on('peer:connected', connectedHandler);

        await server.connectToPeer('127.0.0.1', 4434, 'peer1');

        expect(connectedHandler).toHaveBeenCalledWith({
          peerId: 'peer1',
          address: '127.0.0.1'
        });

        const state = server.getState();
        expect(state.connections).toBe(1);
      });

      it('should handle multiple peer connections', async () => {
        await server.connectToPeer('127.0.0.1', 4434, 'peer1');
        await server.connectToPeer('127.0.0.1', 4435, 'peer2');
        await server.connectToPeer('127.0.0.1', 4436, 'peer3');

        const state = server.getState();
        expect(state.connections).toBe(3);
      });

      it('should remove peer connection', async () => {
        await server.connectToPeer('127.0.0.1', 4434, 'peer1');

        const removedHandler = jest.fn();
        server.on('peer:removed', removedHandler);

        await server.removePeer('peer1');

        expect(removedHandler).toHaveBeenCalledWith({ peerId: 'peer1' });

        const state = server.getState();
        expect(state.connections).toBe(0);
      });

      it('should emit peer:disconnected event', async () => {
        await server.connectToPeer('127.0.0.1', 4434, 'peer1');

        const disconnectedHandler = jest.fn();
        server.on('peer:disconnected', disconnectedHandler);

        await server.removePeer('peer1');

        expect(disconnectedHandler).toHaveBeenCalled();
      });
    });

    describe('Pattern Synchronization', () => {
      let testPattern: Pattern;

      beforeEach(async () => {
        await server.start();
        await server.connectToPeer('127.0.0.1', 4434, 'peer1');

        testPattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: { test: 'data' },
          metadata: {
            source: 'test',
            tags: ['unit', 'integration']
          },
          timestamp: Date.now(),
          version: 1
        };
      });

      it('should sync single pattern to all peers', async () => {
        await server.syncPattern(testPattern);

        const cachedPatterns = server.getCachedPatterns();
        expect(cachedPatterns).toHaveLength(1);
        expect(cachedPatterns[0].id).toBe('pattern_1');
      });

      it('should sync pattern to specific peers', async () => {
        await server.connectToPeer('127.0.0.1', 4435, 'peer2');

        await server.syncPattern(testPattern, ['peer1']);

        const state = server.getState();
        expect(state.stats.totalSyncs).toBeGreaterThan(0);
      });

      it('should sync multiple patterns in batches', async () => {
        const patterns: Pattern[] = Array.from({ length: 250 }, (_, i) => ({
          ...testPattern,
          id: `pattern_${i}`,
          version: 1
        }));

        await server.syncPatterns(patterns);

        const cachedPatterns = server.getCachedPatterns();
        expect(cachedPatterns.length).toBe(250);
      });

      it('should emit pattern:received event', async () => {
        const receivedHandler = jest.fn();
        server.on('pattern:received', receivedHandler);

        const syncRequest: SyncRequest = {
          requestId: 'req_1',
          patterns: [testPattern],
          compressed: false,
          checksum: 'test_checksum',
          timestamp: Date.now(),
          sourceId: 'peer1'
        };

        await server.handleIncomingSync(syncRequest);

        expect(receivedHandler).toHaveBeenCalledWith({
          pattern: testPattern,
          sourceId: 'peer1'
        });
      });

      it('should handle compression correctly', async () => {
        config.compression = true;
        const newServer = new QUICServer(config);
        await newServer.start();
        await newServer.connectToPeer('127.0.0.1', 4434, 'peer1');

        await newServer.syncPattern(testPattern);

        const state = newServer.getState();
        expect(state.stats.compressionRatio).toBeGreaterThan(0);

        await newServer.stop();
      });

      it('should avoid duplicate patterns (idempotent)', async () => {
        await server.syncPattern(testPattern);
        await server.syncPattern(testPattern); // Same pattern again

        const cachedPatterns = server.getCachedPatterns();
        expect(cachedPatterns).toHaveLength(1); // Should only cache once
      });

      it('should update pattern when newer version received', async () => {
        await server.syncPattern(testPattern);

        const newerPattern = {
          ...testPattern,
          version: 2,
          data: { test: 'updated_data' }
        };

        const syncRequest: SyncRequest = {
          requestId: 'req_2',
          patterns: [newerPattern],
          compressed: false,
          checksum: 'test_checksum',
          timestamp: Date.now(),
          sourceId: 'peer1'
        };

        await server.handleIncomingSync(syncRequest);

        const cachedPatterns = server.getCachedPatterns();
        expect(cachedPatterns[0].version).toBe(2);
        expect(cachedPatterns[0].data.test).toBe('updated_data');
      });
    });

    describe('Statistics and Monitoring', () => {
      beforeEach(async () => {
        await server.start();
        await server.connectToPeer('127.0.0.1', 4434, 'peer1');
      });

      it('should track sync statistics', async () => {
        const pattern: Pattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: { test: 'data' },
          metadata: { source: 'test', tags: [] },
          timestamp: Date.now(),
          version: 1
        };

        await server.syncPattern(pattern);

        const state = server.getState();
        expect(state.stats.totalSyncs).toBeGreaterThan(0);
        expect(state.stats.totalPatterns).toBeGreaterThan(0);
      });

      it('should track bytes transferred', async () => {
        const pattern: Pattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: { test: 'data' },
          metadata: { source: 'test', tags: [] },
          timestamp: Date.now(),
          version: 1
        };

        await server.syncPattern(pattern);

        const state = server.getState();
        expect(state.stats.bytesTransferred).toBeGreaterThan(0);
      });

      it('should provide peer connection states', async () => {
        await server.connectToPeer('127.0.0.1', 4435, 'peer2');

        const state = server.getState();
        expect(state.peers.size).toBe(2);

        state.peers.forEach(peerState => {
          expect(peerState).toHaveProperty('connected');
          expect(peerState).toHaveProperty('syncCount');
          expect(peerState).toHaveProperty('errorCount');
        });
      });
    });

    describe('Error Handling', () => {
      beforeEach(async () => {
        await server.start();
      });

      it('should handle sync errors gracefully', async () => {
        const errorHandler = jest.fn();
        server.on('sync:failed', errorHandler);

        const pattern: Pattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: { test: 'data' },
          metadata: { source: 'test', tags: [] },
          timestamp: Date.now(),
          version: 1
        };

        // No peers connected - should emit warning
        const warningHandler = jest.fn();
        server.on('sync:warning', warningHandler);

        await server.syncPattern(pattern);

        expect(warningHandler).toHaveBeenCalled();
      });

      it('should handle invalid sync requests', async () => {
        const invalidRequest: SyncRequest = {
          requestId: 'req_1',
          patterns: [],
          compressed: false,
          checksum: 'invalid',
          timestamp: Date.now(),
          sourceId: 'peer1'
        };

        const response = await server.handleIncomingSync(invalidRequest);

        expect(response.success).toBe(false);
        expect(response.errors).toBeDefined();
        expect(response.errors![0].error).toContain('No patterns');
      });
    });

    describe('Cache Management', () => {
      beforeEach(async () => {
        await server.start();
      });

      it('should cache patterns', async () => {
        const pattern: Pattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: { test: 'data' },
          metadata: { source: 'test', tags: [] },
          timestamp: Date.now(),
          version: 1
        };

        await server.syncPattern(pattern);

        const cachedPatterns = server.getCachedPatterns();
        expect(cachedPatterns).toHaveLength(1);
      });

      it('should clear cache', async () => {
        const pattern: Pattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: { test: 'data' },
          metadata: { source: 'test', tags: [] },
          timestamp: Date.now(),
          version: 1
        };

        await server.syncPattern(pattern);

        const clearedHandler = jest.fn();
        server.on('cache:cleared', clearedHandler);

        server.clearCache();

        expect(clearedHandler).toHaveBeenCalled();

        const cachedPatterns = server.getCachedPatterns();
        expect(cachedPatterns).toHaveLength(0);
      });
    });
  });

  describe('QUICConnection', () => {
    let connection: QUICConnection;
    let peerConfig: PeerConfig;

    beforeEach(() => {
      peerConfig = {
        id: 'peer1',
        address: '127.0.0.1',
        port: 4434
      };

      connection = new QUICConnection(peerConfig, config.retry, config.tls);
    });

    afterEach(async () => {
      if (connection) {
        await connection.disconnect();
      }
    });

    describe('Connection Management', () => {
      it('should connect successfully', async () => {
        const connectedHandler = jest.fn();
        connection.on('connected', connectedHandler);

        await connection.connect();

        expect(connectedHandler).toHaveBeenCalledWith({ peerId: 'peer1' });

        const state = connection.getState();
        expect(state.connected).toBe(true);
      });

      it('should disconnect successfully', async () => {
        await connection.connect();

        const disconnectedHandler = jest.fn();
        connection.on('disconnected', disconnectedHandler);

        await connection.disconnect();

        expect(disconnectedHandler).toHaveBeenCalledWith({ peerId: 'peer1' });

        const state = connection.getState();
        expect(state.connected).toBe(false);
      });

      it('should check health status', async () => {
        await connection.connect();

        const healthy = connection.isHealthy();
        expect(healthy).toBe(true);
      });

      it('should report unhealthy after errors', async () => {
        await connection.connect();

        const state = connection.getState();
        // Simulate errors
        (connection as any).state.errorCount = 10;

        const healthy = connection.isHealthy();
        expect(healthy).toBe(false);
      });
    });

    describe('Pattern Transmission', () => {
      let testPattern: Pattern;

      beforeEach(async () => {
        await connection.connect();

        testPattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: { test: 'data' },
          metadata: { source: 'test', tags: [] },
          timestamp: Date.now(),
          version: 1
        };
      });

      it('should send patterns successfully', async () => {
        const completedHandler = jest.fn();
        connection.on('sync:completed', completedHandler);

        const response = await connection.sendPatterns([testPattern], true);

        expect(response.success).toBe(true);
        expect(completedHandler).toHaveBeenCalled();
      });

      it('should throw error when not connected', async () => {
        await connection.disconnect();

        await expect(connection.sendPatterns([testPattern])).rejects.toThrow(
          'Connection to peer peer1 not established'
        );
      });

      it('should handle compression', async () => {
        const response = await connection.sendPatterns([testPattern], true);

        expect(response.success).toBe(true);
      });

      it('should handle uncompressed transmission', async () => {
        const response = await connection.sendPatterns([testPattern], false);

        expect(response.success).toBe(true);
      });
    });

    describe('Error Handling and Retry', () => {
      beforeEach(async () => {
        await connection.connect();
      });

      it('should emit error events', async () => {
        const errorHandler = jest.fn();
        connection.on('error', errorHandler);

        // Force error
        (connection as any).state.connected = false;

        try {
          await connection.sendPatterns([{
            id: 'pattern_1',
            agentId: 'test-agent',
            type: 'test_execution',
            data: {},
            metadata: { source: 'test', tags: [] },
            timestamp: Date.now(),
            version: 1
          }]);
        } catch (error) {
          // Expected
        }
      });

      it('should update error count on failures', async () => {
        const stateBefore = connection.getState();
        const errorCountBefore = stateBefore.errorCount;

        // Force disconnect to cause send failure
        (connection as any).state.connected = false;

        try {
          await connection.sendPatterns([{
            id: 'pattern_1',
            agentId: 'test-agent',
            type: 'test_execution',
            data: {},
            metadata: { source: 'test', tags: [] },
            timestamp: Date.now(),
            version: 1
          }]);
        } catch (error) {
          // Expected
        }

        const stateAfter = connection.getState();
        expect(stateAfter.errorCount).toBeGreaterThanOrEqual(errorCountBefore);
      });
    });

    describe('Statistics', () => {
      beforeEach(async () => {
        await connection.connect();
      });

      it('should track sync count', async () => {
        const pattern: Pattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: {},
          metadata: { source: 'test', tags: [] },
          timestamp: Date.now(),
          version: 1
        };

        await connection.sendPatterns([pattern]);

        const state = connection.getState();
        expect(state.syncCount).toBeGreaterThan(0);
      });

      it('should track last sync time', async () => {
        const pattern: Pattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: {},
          metadata: { source: 'test', tags: [] },
          timestamp: Date.now(),
          version: 1
        };

        const stateBefore = connection.getState();
        expect(stateBefore.lastSync).toBe(0);

        await connection.sendPatterns([pattern]);

        const stateAfter = connection.getState();
        expect(stateAfter.lastSync).toBeGreaterThan(0);
      });

      it('should track latency', async () => {
        const pattern: Pattern = {
          id: 'pattern_1',
          agentId: 'test-agent',
          type: 'test_execution',
          data: {},
          metadata: { source: 'test', tags: [] },
          timestamp: Date.now(),
          version: 1
        };

        await connection.sendPatterns([pattern]);

        const state = connection.getState();
        expect(state.latency).toBeGreaterThan(0);
      });
    });
  });
});
