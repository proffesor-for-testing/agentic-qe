/**
 * QUIC Transport Tests
 *
 * Tests for the QUIC/WebSocket transport layer with automatic fallback.
 */

import {
  loadQuicTransport,
  isQuicAvailable,
  getTransportCapabilities,
  WebSocketFallbackTransport,
} from '../../../src/core/transport';
import type {
  Transport,
  QuicTransportConfig,
  AgentMessage,
  PoolStatistics,
} from '../../../src/core/transport';

describe('QUIC Transport', () => {
  describe('Transport Loader', () => {
    it('should load transport (QUIC or WebSocket fallback)', async () => {
      const transport = await loadQuicTransport();
      expect(transport).toBeDefined();
      expect(transport.send).toBeDefined();
      expect(transport.receive).toBeDefined();
      expect(transport.close).toBeDefined();
    });

    it('should load transport with custom configuration', async () => {
      const config: QuicTransportConfig = {
        serverName: 'test-server.local',
        maxIdleTimeoutMs: 60000,
        maxConcurrentStreams: 200,
        enable0Rtt: false,
      };

      const transport = await loadQuicTransport(config);
      expect(transport).toBeDefined();
      await transport.close();
    });

    it('should provide transport capabilities info', async () => {
      const capabilities = await getTransportCapabilities();

      expect(capabilities).toHaveProperty('quic');
      expect(capabilities).toHaveProperty('websocket');
      expect(capabilities).toHaveProperty('recommended');
      expect(capabilities).toHaveProperty('performance');
      expect(capabilities.websocket).toBe(true);
      expect(['quic', 'websocket']).toContain(capabilities.recommended);
    });

    it('should check QUIC availability', async () => {
      const available = await isQuicAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('WebSocket Fallback Transport', () => {
    let transport: WebSocketFallbackTransport;

    beforeEach(async () => {
      transport = await WebSocketFallbackTransport.create({
        serverName: 'localhost',
        maxIdleTimeoutMs: 30000,
        maxConcurrentStreams: 100,
      });
    });

    afterEach(async () => {
      await transport.close();
    });

    it('should create fallback transport', () => {
      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(WebSocketFallbackTransport);
    });

    it('should have required methods', () => {
      expect(transport.send).toBeDefined();
      expect(transport.receive).toBeDefined();
      expect(transport.getStats).toBeDefined();
      expect(transport.close).toBeDefined();
      expect(transport.request).toBeDefined();
      expect(transport.sendBatch).toBeDefined();
    });

    it('should return pool statistics', async () => {
      const stats = await transport.getStats();

      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('idle');
      expect(stats).toHaveProperty('created');
      expect(stats).toHaveProperty('closed');
      expect(typeof stats.active).toBe('number');
    });

    it('should handle close gracefully', async () => {
      await transport.close();
      const stats = await transport.getStats();
      expect(stats.active).toBe(0);
    });
  });

  describe('Agent Message Format', () => {
    it('should accept valid agent message', async () => {
      const message: AgentMessage = {
        id: 'msg-001',
        type: 'task',
        payload: { action: 'run-tests', target: 'unit' },
        metadata: { priority: 'high' },
      };

      expect(message.id).toBe('msg-001');
      expect(message.type).toBe('task');
      expect(message.payload).toBeDefined();
      expect(message.metadata).toBeDefined();
    });

    it('should accept message without metadata', () => {
      const message: AgentMessage = {
        id: 'msg-002',
        type: 'heartbeat',
        payload: { timestamp: Date.now() },
      };

      expect(message.metadata).toBeUndefined();
    });

    it('should support various message types', () => {
      const types = ['task', 'result', 'status', 'coordination', 'heartbeat', 'custom-type'];

      types.forEach(type => {
        const message: AgentMessage = {
          id: `msg-${type}`,
          type,
          payload: {},
        };
        expect(message.type).toBe(type);
      });
    });
  });

  describe('Transport Capabilities', () => {
    it('should report performance characteristics', async () => {
      const capabilities = await getTransportCapabilities();

      expect(capabilities.performance.quic).toHaveProperty('latency');
      expect(capabilities.performance.quic).toHaveProperty('throughput');
      expect(capabilities.performance.quic).toHaveProperty('multiplexing');
      expect(capabilities.performance.quic).toHaveProperty('encryption');

      expect(capabilities.performance.websocket).toHaveProperty('latency');
      expect(capabilities.performance.websocket).toHaveProperty('throughput');
      expect(capabilities.performance.websocket).toHaveProperty('multiplexing');
      expect(capabilities.performance.websocket).toHaveProperty('encryption');
    });

    it('should indicate QUIC has better performance when available', async () => {
      const capabilities = await getTransportCapabilities();

      if (capabilities.quic) {
        expect(capabilities.recommended).toBe('quic');
        expect(capabilities.performance.quic.multiplexing).toBe(true);
      } else {
        expect(capabilities.recommended).toBe('websocket');
      }
    });
  });

  describe('Configuration Validation', () => {
    it('should use default configuration when not provided', async () => {
      const transport = await loadQuicTransport();
      expect(transport).toBeDefined();
      await transport.close();
    });

    it('should accept partial configuration', async () => {
      const transport = await loadQuicTransport({
        serverName: 'custom-server',
      });
      expect(transport).toBeDefined();
      await transport.close();
    });

    it('should use sensible defaults', async () => {
      // This test verifies that the transport works with minimal config
      const transport = await WebSocketFallbackTransport.create({});
      const stats = await transport.getStats();
      expect(stats).toBeDefined();
      await transport.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle connection timeout', async () => {
      const transport = await WebSocketFallbackTransport.create({
        maxIdleTimeoutMs: 100, // Very short timeout
      });

      // The transport should be created even with short timeout
      expect(transport).toBeDefined();
      await transport.close();
    });

    it('should handle close on already closed transport', async () => {
      const transport = await WebSocketFallbackTransport.create();
      await transport.close();

      // Second close should not throw
      await expect(transport.close()).resolves.not.toThrow();
    });
  });
});

describe('Integration Tests', () => {
  describe('Memory Module Exports', () => {
    it('should export transport components from memory module', () => {
      const memory = require('../../../src/core/memory');

      expect(memory.loadQuicTransport).toBeDefined();
      expect(memory.isQuicAvailable).toBeDefined();
      expect(memory.getTransportCapabilities).toBeDefined();
      expect(memory.WebSocketFallbackTransport).toBeDefined();
    });

    it('should export AgentDB integration components', () => {
      const memory = require('../../../src/core/memory');

      expect(memory.QUICTransportWrapper).toBeDefined();
      expect(memory.createDefaultQUICConfig).toBeDefined();
      expect(memory.initializeAgentDBWithQUIC).toBeDefined();
    });
  });

  describe('Transport Module Direct Import', () => {
    it('should allow direct import from transport module', async () => {
      const transport = await import('../../../src/core/transport');

      expect(transport.loadQuicTransport).toBeDefined();
      expect(transport.isQuicAvailable).toBeDefined();
      expect(transport.getTransportCapabilities).toBeDefined();
      expect(transport.WebSocketFallbackTransport).toBeDefined();
    });
  });
});
