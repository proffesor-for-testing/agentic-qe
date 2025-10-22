/**
 * Unit tests for QUICTransport
 *
 * Tests cover:
 * - Connection establishment (QUIC and TCP)
 * - Message sending and receiving
 * - Channel-based routing
 * - Automatic fallback
 * - Error handling and retries
 * - Performance metrics
 * - Keep-alive functionality
 *
 * @module tests/transport/QUICTransport
 */

import { QUICTransport, createQUICTransport, TransportMode, ConnectionState } from '../../../src/transport/QUICTransport';
import * as dgram from 'dgram';
import * as net from 'net';
import * as tls from 'tls';

// Mock modules
jest.mock('dgram');
jest.mock('net');
jest.mock('tls');
jest.mock('fs/promises');

describe('QUICTransport', () => {
  let transport: QUICTransport;
  let mockUdpSocket: any;
  let mockTcpSocket: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock UDP socket
    mockUdpSocket = {
      bind: jest.fn((callback) => callback && callback()),
      send: jest.fn((msg, offset, length, port, host, callback) => callback && callback()),
      close: jest.fn(),
      on: jest.fn(),
      address: jest.fn(() => ({ address: '0.0.0.0', port: 12345 }))
    };

    // Mock TCP socket
    mockTcpSocket = {
      write: jest.fn((data, callback) => callback && callback()),
      destroy: jest.fn(),
      on: jest.fn(),
      destroyed: false
    };

    (dgram.createSocket as jest.Mock).mockReturnValue(mockUdpSocket);
    (tls.connect as jest.Mock).mockReturnValue(mockTcpSocket);

    // Mock fs/promises
    const fsMock = require('fs/promises');
    fsMock.readFile = jest.fn().mockResolvedValue(Buffer.from('mock-cert'));

    transport = new QUICTransport();
  });

  afterEach(async () => {
    if (transport.isConnected()) {
      await transport.close();
    }
  });

  describe('initialize', () => {
    it('should initialize with QUIC connection', async () => {
      const config = {
        host: 'localhost',
        port: 4433,
        enable0RTT: true
      };

      // Trigger bind callback
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      const initPromise = transport.initialize(config);

      // Wait for socket to be created and bound
      await new Promise(resolve => setImmediate(resolve));

      expect(dgram.createSocket).toHaveBeenCalledWith('udp4');
      expect(mockUdpSocket.bind).toHaveBeenCalled();

      // Complete initialization
      await initPromise;

      expect(transport.isConnected()).toBe(true);
      expect(transport.getMode()).toBe(TransportMode.QUIC);
    });

    it('should fallback to TCP when QUIC fails', async () => {
      const config = {
        host: 'localhost',
        port: 4433,
        enableTCPFallback: true
      };

      // Make UDP socket fail
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(() => {
          const errorCallback = mockUdpSocket.on.mock.calls.find(
            (call: any) => call[0] === 'error'
          )?.[1];
          errorCallback?.(new Error('UDP bind failed'));
        });
      });

      // Make TCP succeed
      mockTcpSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'secureConnect') {
          setImmediate(callback);
        }
      });

      await transport.initialize(config);

      expect(transport.isConnected()).toBe(true);
      expect(transport.getMode()).toBe(TransportMode.TCP);
    });

    it('should handle initialization failure', async () => {
      const config = {
        host: 'localhost',
        port: 4433,
        enableTCPFallback: false
      };

      // Make UDP socket fail
      mockUdpSocket.bind.mockImplementation(() => {
        throw new Error('Bind failed');
      });

      await expect(transport.initialize(config)).rejects.toThrow();
      expect(transport.getState()).toBe(ConnectionState.FAILED);
    });

    it('should load TLS credentials from files', async () => {
      const fsMock = require('fs/promises');
      const config = {
        host: 'localhost',
        port: 4433,
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem'
      };

      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      await transport.initialize(config);

      expect(fsMock.readFile).toHaveBeenCalledWith('/path/to/cert.pem');
      expect(fsMock.readFile).toHaveBeenCalledWith('/path/to/key.pem');
    });

    it('should generate self-signed cert when paths not provided', async () => {
      const config = {
        host: 'localhost',
        port: 4433
      };

      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      await transport.initialize(config);

      // Should not throw, cert should be generated
      expect(transport.isConnected()).toBe(true);
    });
  });

  describe('send', () => {
    beforeEach(async () => {
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      await transport.initialize({
        host: 'localhost',
        port: 4433
      });
    });

    it('should send message via QUIC', async () => {
      const channel = 'test-channel';
      const data = { message: 'test' };

      await transport.send(channel, data);

      expect(mockUdpSocket.send).toHaveBeenCalled();

      const sentMessage = mockUdpSocket.send.mock.calls[1][0]; // Skip handshake
      const envelope = JSON.parse(sentMessage.toString());

      expect(envelope.channel).toBe(channel);
      expect(envelope.data).toEqual(data);
    });

    it('should send message via TCP fallback', async () => {
      // Close QUIC transport
      await transport.close();

      // Initialize with TCP
      const config = {
        host: 'localhost',
        port: 4433,
        enableTCPFallback: true
      };

      mockUdpSocket.bind.mockImplementation(() => {
        throw new Error('UDP failed');
      });

      mockTcpSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'secureConnect') {
          setImmediate(callback);
        }
      });

      await transport.initialize(config);

      const channel = 'test-channel';
      const data = { message: 'test' };

      await transport.send(channel, data);

      expect(mockTcpSocket.write).toHaveBeenCalled();
    });

    it('should throw error when not connected', async () => {
      await transport.close();

      await expect(
        transport.send('test', {})
      ).rejects.toThrow('Cannot send: transport not connected');
    });

    it('should retry on send failure', async () => {
      const channel = 'test-channel';
      const data = { message: 'test' };

      // Make first send fail, second succeed
      mockUdpSocket.send
        .mockImplementationOnce((msg: any, offset: any, length: any, port: any, host: any, callback: any) => {
          callback(new Error('Send failed'));
        })
        .mockImplementationOnce((msg: any, offset: any, length: any, port: any, host: any, callback: any) => {
          callback();
        });

      await transport.send(channel, data);

      // Should have retried (handshake + 2 attempts)
      expect(mockUdpSocket.send).toHaveBeenCalledTimes(3);
    });

    it('should update metrics on send', async () => {
      await transport.send('test', { data: 'test' });

      const metrics = transport.getMetrics();
      expect(metrics.messagessent).toBeGreaterThan(0);
      expect(metrics.bytesTransferred).toBeGreaterThan(0);
    });
  });

  describe('receive', () => {
    beforeEach(async () => {
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      await transport.initialize({
        host: 'localhost',
        port: 4433
      });
    });

    it('should register channel callback', async () => {
      const channel = 'test-channel';
      const callback = jest.fn();

      await transport.receive(channel, callback);

      // Simulate receiving message
      const messageHandler = mockUdpSocket.on.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];

      const envelope = {
        channel,
        data: { test: 'data' },
        timestamp: Date.now(),
        messageId: 'test-id'
      };

      messageHandler?.(Buffer.from(JSON.stringify(envelope)), { address: 'localhost', port: 4433 });

      expect(callback).toHaveBeenCalledWith({ test: 'data' });
    });

    it('should support multiple callbacks per channel', async () => {
      const channel = 'test-channel';
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      await transport.receive(channel, callback1);
      await transport.receive(channel, callback2);

      // Simulate receiving message
      const messageHandler = mockUdpSocket.on.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];

      const envelope = {
        channel,
        data: { test: 'data' },
        timestamp: Date.now(),
        messageId: 'test-id'
      };

      messageHandler?.(Buffer.from(JSON.stringify(envelope)), { address: 'localhost', port: 4433 });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should update stream metrics', async () => {
      await transport.receive('test-channel', jest.fn());

      const metrics = transport.getMetrics();
      expect(metrics.activeStreams).toBe(1);
    });

    it('should handle message routing errors gracefully', async () => {
      const channel = 'test-channel';
      const callback = jest.fn(() => {
        throw new Error('Callback error');
      });

      await transport.receive(channel, callback);

      // Simulate receiving message
      const messageHandler = mockUdpSocket.on.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];

      const envelope = {
        channel,
        data: { test: 'data' },
        timestamp: Date.now(),
        messageId: 'test-id'
      };

      // Should not throw
      expect(() => {
        messageHandler?.(Buffer.from(JSON.stringify(envelope)), { address: 'localhost', port: 4433 });
      }).not.toThrow();
    });
  });

  describe('unsubscribe', () => {
    beforeEach(async () => {
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      await transport.initialize({
        host: 'localhost',
        port: 4433
      });
    });

    it('should remove channel callback', async () => {
      const channel = 'test-channel';
      const callback = jest.fn();

      await transport.receive(channel, callback);
      transport.unsubscribe(channel, callback);

      // Simulate receiving message
      const messageHandler = mockUdpSocket.on.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];

      const envelope = {
        channel,
        data: { test: 'data' },
        timestamp: Date.now(),
        messageId: 'test-id'
      };

      messageHandler?.(Buffer.from(JSON.stringify(envelope)), { address: 'localhost', port: 4433 });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should update stream metrics when last callback removed', async () => {
      const channel = 'test-channel';
      const callback = jest.fn();

      await transport.receive(channel, callback);
      expect(transport.getMetrics().activeStreams).toBe(1);

      transport.unsubscribe(channel, callback);
      expect(transport.getMetrics().activeStreams).toBe(0);
    });
  });

  describe('close', () => {
    beforeEach(async () => {
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      await transport.initialize({
        host: 'localhost',
        port: 4433
      });
    });

    it('should close QUIC connection', async () => {
      await transport.close();

      expect(mockUdpSocket.close).toHaveBeenCalled();
      expect(transport.isConnected()).toBe(false);
      expect(transport.getMode()).toBe(TransportMode.UNKNOWN);
    });

    it('should close TCP connection', async () => {
      // Switch to TCP mode
      await transport.close();

      mockTcpSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'secureConnect') {
          setImmediate(callback);
        }
      });

      await transport.initialize({
        host: 'localhost',
        port: 4433,
        enableTCPFallback: true
      });

      await transport.close();

      expect(mockTcpSocket.destroy).toHaveBeenCalled();
    });

    it('should clear all subscriptions', async () => {
      await transport.receive('channel1', jest.fn());
      await transport.receive('channel2', jest.fn());

      await transport.close();

      const metrics = transport.getMetrics();
      expect(metrics.activeStreams).toBe(0);
    });

    it('should emit disconnected event', async () => {
      const disconnectHandler = jest.fn();
      transport.on('disconnected', disconnectHandler);

      await transport.close();

      expect(disconnectHandler).toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    beforeEach(async () => {
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      await transport.initialize({
        host: 'localhost',
        port: 4433
      });
    });

    it('should return comprehensive metrics', async () => {
      await transport.send('test', { data: 'test' });

      const metrics = transport.getMetrics();

      expect(metrics).toMatchObject({
        mode: TransportMode.QUIC,
        state: ConnectionState.CONNECTED,
        messagessent: expect.any(Number),
        messagesReceived: expect.any(Number),
        bytesTransferred: expect.any(Number),
        connectionUptime: expect.any(Number),
        activeStreams: expect.any(Number),
        failedAttempts: expect.any(Number)
      });
    });

    it('should track average latency', async () => {
      // Simulate receiving messages
      const messageHandler = mockUdpSocket.on.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];

      for (let i = 0; i < 5; i++) {
        const envelope = {
          channel: 'test',
          data: { index: i },
          timestamp: Date.now() - 100, // 100ms ago
          messageId: `test-${i}`
        };

        messageHandler?.(Buffer.from(JSON.stringify(envelope)), { address: 'localhost', port: 4433 });
      }

      const metrics = transport.getMetrics();
      expect(metrics.averageLatency).toBeGreaterThan(0);
    });
  });

  describe('createQUICTransport', () => {
    it('should create and initialize transport', async () => {
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      const transport = await createQUICTransport({
        host: 'localhost',
        port: 4433
      });

      expect(transport.isConnected()).toBe(true);
      expect(transport.getMode()).toBe(TransportMode.QUIC);

      await transport.close();
    });
  });

  describe('keep-alive', () => {
    beforeEach(async () => {
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });
    });

    it('should send keep-alive messages', async () => {
      jest.useFakeTimers();

      await transport.initialize({
        host: 'localhost',
        port: 4433,
        keepAlive: true,
        keepAliveInterval: 1000
      });

      const initialCalls = mockUdpSocket.send.mock.calls.length;

      // Advance time
      jest.advanceTimersByTime(1000);

      expect(mockUdpSocket.send.mock.calls.length).toBeGreaterThan(initialCalls);

      jest.useRealTimers();
    });

    it('should handle keep-alive failures', async () => {
      jest.useFakeTimers();

      await transport.initialize({
        host: 'localhost',
        port: 4433,
        keepAlive: true,
        keepAliveInterval: 1000
      });

      // Make keep-alive fail
      mockUdpSocket.send.mockImplementation((msg: any, offset: any, length: any, port: any, host: any, callback: any) => {
        callback(new Error('Keep-alive failed'));
      });

      const stateChangeHandler = jest.fn();
      transport.on('stateChange', stateChangeHandler);

      // Advance time
      jest.advanceTimersByTime(1000);

      // Should trigger reconnect
      await new Promise(resolve => setImmediate(resolve));

      jest.useRealTimers();
    });
  });

  describe('performance', () => {
    it('should handle high message throughput', async () => {
      mockUdpSocket.bind.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      await transport.initialize({
        host: 'localhost',
        port: 4433
      });

      const messageCount = 1000;
      const startTime = Date.now();

      const sendPromises = [];
      for (let i = 0; i < messageCount; i++) {
        sendPromises.push(transport.send('perf-test', { index: i }));
      }

      await Promise.all(sendPromises);

      const duration = Date.now() - startTime;
      const throughput = messageCount / (duration / 1000);

      expect(throughput).toBeGreaterThan(100); // >100 msgs/sec
    });
  });
});
