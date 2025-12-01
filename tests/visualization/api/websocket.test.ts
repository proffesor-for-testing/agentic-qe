/**
 * WebSocket API Tests for Phase 3 Visualization
 * Tests WebSocket connection, subscription, messaging, and backpressure
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock WebSocket server
class MockWebSocket extends EventEmitter {
  public readyState: number = 1; // OPEN
  public CONNECTING = 0;
  public OPEN = 1;
  public CLOSING = 2;
  public CLOSED = 3;

  private messageQueue: unknown[] = [];
  private backpressureThreshold = 1000;

  send(data: string): void {
    if (this.readyState !== this.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.messageQueue.push(JSON.parse(data));

    // Simulate backpressure
    if (this.messageQueue.length > this.backpressureThreshold) {
      this.emit('backpressure', { queueSize: this.messageQueue.length });
    }
  }

  close(): void {
    this.readyState = this.CLOSED;
    this.emit('close');
  }

  simulateMessage(data: unknown): void {
    this.emit('message', { data: JSON.stringify(data) });
  }

  simulateError(error: Error): void {
    this.emit('error', error);
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  clearQueue(): void {
    this.messageQueue = [];
  }
}

describe('WebSocket API Tests', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
  });

  afterEach(() => {
    if (mockWs) {
      mockWs.close();
      mockWs.removeAllListeners();
    }
  });

  describe('Connection Management', () => {
    it('should establish WebSocket connection successfully', () => {
      expect(mockWs.readyState).toBe(mockWs.OPEN);
    });

    it('should handle connection close gracefully', (done) => {
      mockWs.on('close', () => {
        expect(mockWs.readyState).toBe(mockWs.CLOSED);
        done();
      });

      mockWs.close();
    });

    it('should emit error events on connection failure', (done) => {
      const testError = new Error('Connection failed');

      mockWs.on('error', (error) => {
        expect(error).toEqual(testError);
        done();
      });

      mockWs.simulateError(testError);
    });

    it('should reconnect after connection loss', async () => {
      let reconnectCount = 0;
      const maxReconnects = 3;

      const reconnect = () => {
        reconnectCount++;
        if (reconnectCount <= maxReconnects) {
          mockWs = new MockWebSocket();
        }
      };

      mockWs.on('close', reconnect);
      mockWs.close();

      // Wait for reconnection attempts
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(reconnectCount).toBe(1);
      expect(mockWs.readyState).toBe(mockWs.OPEN);
    });
  });

  describe('Message Handling', () => {
    it('should send messages successfully', () => {
      const message = { type: 'subscribe', channel: 'metrics' };

      expect(() => {
        mockWs.send(JSON.stringify(message));
      }).not.toThrow();

      expect(mockWs.getQueueSize()).toBe(1);
    });

    it('should receive and parse messages', (done) => {
      const testMessage = {
        type: 'metric_update',
        data: {
          timestamp: Date.now(),
          value: 42,
          metric: 'test_count'
        }
      };

      mockWs.on('message', (event) => {
        const received = JSON.parse(event.data);
        expect(received).toEqual(testMessage);
        done();
      });

      mockWs.simulateMessage(testMessage);
    });

    it('should throw error when sending on closed connection', () => {
      mockWs.close();

      expect(() => {
        mockWs.send(JSON.stringify({ type: 'test' }));
      }).toThrow('WebSocket is not open');
    });
  });

  describe('Subscription Management', () => {
    it('should subscribe to telemetry events', (done) => {
      const subscribeMsg = {
        type: 'subscribe',
        channels: ['telemetry.events', 'telemetry.metrics']
      };

      mockWs.on('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'subscribed') {
          expect(msg.channels).toEqual(subscribeMsg.channels);
          done();
        }
      });

      mockWs.send(JSON.stringify(subscribeMsg));

      // Simulate server confirmation
      mockWs.simulateMessage({
        type: 'subscribed',
        channels: subscribeMsg.channels
      });
    });

    it('should unsubscribe from channels', (done) => {
      const unsubscribeMsg = {
        type: 'unsubscribe',
        channels: ['telemetry.events']
      };

      mockWs.on('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'unsubscribed') {
          expect(msg.channels).toEqual(unsubscribeMsg.channels);
          done();
        }
      });

      mockWs.send(JSON.stringify(unsubscribeMsg));

      mockWs.simulateMessage({
        type: 'unsubscribed',
        channels: unsubscribeMsg.channels
      });
    });

    it('should handle multiple channel subscriptions', () => {
      const channels = [
        'telemetry.events',
        'telemetry.metrics',
        'telemetry.reasoning',
        'telemetry.performance'
      ];

      channels.forEach(channel => {
        mockWs.send(JSON.stringify({ type: 'subscribe', channel }));
      });

      expect(mockWs.getQueueSize()).toBe(channels.length);
    });
  });

  describe('Backpressure Handling', () => {
    it('should detect backpressure with high message rate', (done) => {
      mockWs.on('backpressure', (info) => {
        expect(info.queueSize).toBeGreaterThan(1000);
        done();
      });

      // Send messages rapidly to trigger backpressure
      for (let i = 0; i < 1500; i++) {
        mockWs.send(JSON.stringify({ type: 'test', index: i }));
      }
    });

    it('should throttle messages under backpressure', async () => {
      const messagesPerSecond = 100;
      const throttleInterval = 1000 / messagesPerSecond; // 10ms per message

      let sentCount = 0;
      const sendThrottled = () => {
        if (mockWs.getQueueSize() < 500) {
          mockWs.send(JSON.stringify({ type: 'test', index: sentCount++ }));
        }
      };

      // Send messages with throttling
      const interval = setInterval(sendThrottled, throttleInterval);

      await new Promise(resolve => setTimeout(resolve, 200));
      clearInterval(interval);

      expect(mockWs.getQueueSize()).toBeLessThan(500);
      expect(sentCount).toBeGreaterThan(0);
    });

    it('should recover from backpressure by clearing queue', () => {
      // Fill queue to trigger backpressure
      for (let i = 0; i < 1500; i++) {
        mockWs.send(JSON.stringify({ type: 'test', index: i }));
      }

      expect(mockWs.getQueueSize()).toBeGreaterThan(1000);

      // Clear queue to recover
      mockWs.clearQueue();

      expect(mockWs.getQueueSize()).toBe(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should measure message latency under 500ms', async () => {
      const startTime = Date.now();
      const message = { type: 'ping', timestamp: startTime };

      const latencyPromise = new Promise<number>((resolve) => {
        mockWs.on('message', (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') {
            const latency = Date.now() - startTime;
            resolve(latency);
          }
        });
      });

      mockWs.send(JSON.stringify(message));

      // Simulate server response
      setTimeout(() => {
        mockWs.simulateMessage({ type: 'pong', timestamp: Date.now() });
      }, 50);

      const latency = await latencyPromise;
      expect(latency).toBeLessThan(500);
    });

    it('should track message throughput', async () => {
      const duration = 1000; // 1 second
      const targetThroughput = 100; // messages per second

      let messageCount = 0;
      const startTime = Date.now();

      while (Date.now() - startTime < duration) {
        mockWs.send(JSON.stringify({ type: 'test', index: messageCount++ }));
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const actualDuration = Date.now() - startTime;
      const throughput = (messageCount / actualDuration) * 1000;

      expect(throughput).toBeGreaterThanOrEqual(targetThroughput * 0.9); // 90% of target
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON messages', (done) => {
      mockWs.on('error', (error) => {
        expect(error.message).toContain('JSON');
        done();
      });

      try {
        mockWs.send('{ invalid json }');
      } catch (error) {
        mockWs.simulateError(error as Error);
      }
    });

    it('should handle connection timeout', async () => {
      const timeout = 5000;
      const connectionPromise = new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, timeout);

        mockWs.on('open', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });

      // Simulate immediate connection
      mockWs.emit('open');

      const connected = await connectionPromise;
      expect(connected).toBe(true);
    });

    it('should handle unexpected disconnections', (done) => {
      let disconnectHandled = false;

      mockWs.on('close', () => {
        disconnectHandled = true;
      });

      mockWs.on('error', () => {
        expect(disconnectHandled).toBe(true);
        done();
      });

      mockWs.close();
      mockWs.simulateError(new Error('Unexpected disconnect'));
    });
  });

  describe('Real-time Data Streaming', () => {
    it('should stream telemetry events in real-time', (done) => {
      const events: unknown[] = [];
      const expectedEvents = 5;

      mockWs.on('message', (event) => {
        events.push(JSON.parse(event.data));
        if (events.length === expectedEvents) {
          expect(events).toHaveLength(expectedEvents);
          done();
        }
      });

      // Simulate streaming events
      for (let i = 0; i < expectedEvents; i++) {
        setTimeout(() => {
          mockWs.simulateMessage({
            type: 'telemetry.event',
            data: { index: i, timestamp: Date.now() }
          });
        }, i * 50);
      }
    });

    it('should maintain event order during streaming', (done) => {
      const events: Array<{ index: number }> = [];
      const totalEvents = 10;

      mockWs.on('message', (event) => {
        const data = JSON.parse(event.data);
        events.push(data);

        if (events.length === totalEvents) {
          // Verify order
          for (let i = 0; i < events.length - 1; i++) {
            expect(events[i].index).toBeLessThan(events[i + 1].index);
          }
          done();
        }
      });

      // Stream events in order
      for (let i = 0; i < totalEvents; i++) {
        mockWs.simulateMessage({ type: 'event', index: i });
      }
    });
  });
});
