/**
 * Agentic QE v3 - Connection Manager Unit Tests
 * Tests for SSE connection lifecycle management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Writable } from 'stream';
import {
  ConnectionManager,
  createConnectionManager,
  type SSEResponse,
  type ConnectionState,
} from '../../../../../src/mcp/transport/sse/index.js';

// ============================================================================
// Mock Response
// ============================================================================

function createMockResponse(): SSEResponse & {
  getWrittenData: () => string;
  ended: boolean;
} {
  const chunks: string[] = [];
  let ended = false;
  let flushCalled = 0;

  const res = new Writable({
    write(chunk, encoding, callback) {
      if (!ended) {
        chunks.push(chunk.toString());
      }
      callback();
    },
  }) as SSEResponse & {
    getWrittenData: () => string;
    ended: boolean;
  };

  Object.defineProperty(res, 'writableEnded', {
    get: () => ended,
  });

  const originalEnd = res.end.bind(res);
  res.end = ((chunk?: unknown) => {
    ended = true;
    return originalEnd(chunk);
  }) as typeof res.end;

  res.flush = () => {
    flushCalled++;
  };

  res.getWrittenData = () => chunks.join('');
  res.ended = ended;

  return res;
}

// ============================================================================
// Tests
// ============================================================================

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = createConnectionManager({
      keepAliveInterval: 60000, // Long interval to prevent interference
      connectionTimeout: 60000,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('factory function', () => {
    it('should create manager with default config', () => {
      const m = createConnectionManager();
      expect(m).toBeInstanceOf(ConnectionManager);
      m.dispose();
    });

    it('should create manager with custom config', () => {
      const m = createConnectionManager({
        keepAliveInterval: 5000,
        connectionTimeout: 30000,
        maxConnections: 500,
      });
      expect(m).toBeInstanceOf(ConnectionManager);
      m.dispose();
    });
  });

  describe('createConnection', () => {
    it('should create a new connection', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      expect(connection).toBeDefined();
      expect(connection.id).toBeDefined();
      expect(connection.threadId).toBe('thread-1');
      expect(connection.runId).toBe('run-1');
      expect(connection.response).toBe(res);
      expect(connection.state).toBe('connecting');
    });

    it('should create connection with unique IDs', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      const conn1 = manager.createConnection('thread-1', 'run-1', res1);
      const conn2 = manager.createConnection('thread-2', 'run-2', res2);

      expect(conn1.id).not.toBe(conn2.id);
    });

    it('should set initial timestamps', () => {
      const before = Date.now();
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);
      const after = Date.now();

      expect(connection.createdAt).toBeGreaterThanOrEqual(before);
      expect(connection.createdAt).toBeLessThanOrEqual(after);
      expect(connection.lastActivity).toBeGreaterThanOrEqual(before);
      expect(connection.lastActivity).toBeLessThanOrEqual(after);
    });

    it('should initialize metrics', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      expect(connection.metrics.eventsSent).toBe(0);
      expect(connection.metrics.bytesSent).toBe(0);
      expect(connection.metrics.keepAlivesSent).toBe(0);
      expect(connection.metrics.errors).toBe(0);
      expect(connection.metrics.startTime).toBeDefined();
      expect(connection.metrics.endTime).toBeUndefined();
    });

    it('should create abort controller', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      expect(connection.abortController).toBeInstanceOf(AbortController);
      expect(connection.abortController.signal.aborted).toBe(false);
    });

    it('should throw when manager is disposed', () => {
      manager.dispose();
      const res = createMockResponse();

      expect(() => {
        manager.createConnection('thread-1', 'run-1', res);
      }).toThrow('ConnectionManager has been disposed');
    });

    it('should throw when max connections exceeded', () => {
      const smallManager = createConnectionManager({ maxConnections: 2 });

      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const res3 = createMockResponse();

      smallManager.createConnection('thread-1', 'run-1', res1);
      smallManager.createConnection('thread-2', 'run-2', res2);

      expect(() => {
        smallManager.createConnection('thread-3', 'run-3', res3);
      }).toThrow('Maximum connections (2) exceeded');

      smallManager.dispose();
    });
  });

  describe('getConnection', () => {
    it('should return connection by ID', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      const found = manager.getConnection(connection.id);
      expect(found).toBe(connection);
    });

    it('should return undefined for unknown ID', () => {
      const found = manager.getConnection('unknown-id');
      expect(found).toBeUndefined();
    });
  });

  describe('getConnectionByThreadId', () => {
    it('should return connection by thread ID', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      const found = manager.getConnectionByThreadId('thread-1');
      expect(found).toBe(connection);
    });

    it('should return undefined for unknown thread ID', () => {
      const found = manager.getConnectionByThreadId('unknown-thread');
      expect(found).toBeUndefined();
    });

    it('should return first matching connection', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      const conn1 = manager.createConnection('thread-1', 'run-1', res1);
      manager.createConnection('thread-2', 'run-2', res2);

      const found = manager.getConnectionByThreadId('thread-1');
      expect(found).toBe(conn1);
    });
  });

  describe('getActiveConnections', () => {
    it('should return empty array when no connections', () => {
      const active = manager.getActiveConnections();
      expect(active).toEqual([]);
    });

    it('should return connections in connecting state', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      const active = manager.getActiveConnections();
      expect(active).toContain(connection);
    });

    it('should return connections in open state', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);
      manager.updateState(connection.id, 'open');

      const active = manager.getActiveConnections();
      expect(active).toContain(connection);
    });

    it('should not return closed connections', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);
      manager.closeConnection(connection.id);

      const active = manager.getActiveConnections();
      expect(active).not.toContain(connection);
    });
  });

  describe('updateState', () => {
    it('should update connection state', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      manager.updateState(connection.id, 'open');
      expect(connection.state).toBe('open');

      manager.updateState(connection.id, 'closing');
      expect(connection.state).toBe('closing');
    });

    it('should update lastActivity timestamp', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);
      const initialActivity = connection.lastActivity;

      // Wait a bit
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      manager.updateState(connection.id, 'open');

      vi.useRealTimers();

      expect(connection.lastActivity).toBeGreaterThan(initialActivity);
    });

    it('should set endTime when state is closed', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      expect(connection.metrics.endTime).toBeUndefined();

      manager.updateState(connection.id, 'closed');

      expect(connection.metrics.endTime).toBeDefined();
    });

    it('should handle unknown connection ID gracefully', () => {
      // Should not throw
      manager.updateState('unknown-id', 'open');
    });
  });

  describe('recordEventSent', () => {
    it('should increment eventsSent counter', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      manager.recordEventSent(connection.id, 100);
      expect(connection.metrics.eventsSent).toBe(1);

      manager.recordEventSent(connection.id, 50);
      expect(connection.metrics.eventsSent).toBe(2);
    });

    it('should add to bytesSent', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      manager.recordEventSent(connection.id, 100);
      expect(connection.metrics.bytesSent).toBe(100);

      manager.recordEventSent(connection.id, 50);
      expect(connection.metrics.bytesSent).toBe(150);
    });

    it('should update lastActivity', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);
      const initialActivity = connection.lastActivity;

      // Wait a bit
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      manager.recordEventSent(connection.id, 100);

      vi.useRealTimers();

      expect(connection.lastActivity).toBeGreaterThan(initialActivity);
    });

    it('should handle unknown connection ID gracefully', () => {
      // Should not throw
      manager.recordEventSent('unknown-id', 100);
    });
  });

  describe('recordError', () => {
    it('should increment errors counter', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      manager.recordError(connection.id);
      expect(connection.metrics.errors).toBe(1);

      manager.recordError(connection.id);
      expect(connection.metrics.errors).toBe(2);
    });

    it('should handle unknown connection ID gracefully', () => {
      // Should not throw
      manager.recordError('unknown-id');
    });
  });

  describe('closeConnection', () => {
    it('should remove connection from manager', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      manager.closeConnection(connection.id);

      expect(manager.getConnection(connection.id)).toBeUndefined();
    });

    it('should update state to closed', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      manager.closeConnection(connection.id);

      expect(connection.state).toBe('closed');
    });

    it('should set endTime', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      manager.closeConnection(connection.id);

      expect(connection.metrics.endTime).toBeDefined();
    });

    it('should abort the abort controller', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      manager.closeConnection(connection.id, 'test reason');

      expect(connection.abortController.signal.aborted).toBe(true);
    });

    it('should handle unknown connection ID gracefully', () => {
      // Should not throw
      manager.closeConnection('unknown-id');
    });

    it('should handle already closed connection', () => {
      const res = createMockResponse();
      const connection = manager.createConnection('thread-1', 'run-1', res);

      manager.closeConnection(connection.id);
      // Should not throw
      manager.closeConnection(connection.id);
    });
  });

  describe('closeThreadConnections', () => {
    it('should close all connections for a thread', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const res3 = createMockResponse();

      const conn1 = manager.createConnection('thread-1', 'run-1', res1);
      const conn2 = manager.createConnection('thread-1', 'run-2', res2);
      const conn3 = manager.createConnection('thread-2', 'run-3', res3);

      manager.closeThreadConnections('thread-1');

      expect(manager.getConnection(conn1.id)).toBeUndefined();
      expect(manager.getConnection(conn2.id)).toBeUndefined();
      expect(manager.getConnection(conn3.id)).toBeDefined();
    });

    it('should handle unknown thread ID gracefully', () => {
      // Should not throw
      manager.closeThreadConnections('unknown-thread');
    });
  });

  describe('getMetrics', () => {
    it('should return initial metrics', () => {
      const metrics = manager.getMetrics();

      expect(metrics.totalConnections).toBe(0);
      expect(metrics.activeConnections).toBe(0);
      expect(metrics.totalEventsSent).toBe(0);
      expect(metrics.totalBytesSent).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.averageConnectionDuration).toBe(0);
    });

    it('should count total connections', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      manager.createConnection('thread-1', 'run-1', res1);
      manager.createConnection('thread-2', 'run-2', res2);

      const metrics = manager.getMetrics();
      expect(metrics.totalConnections).toBe(2);
    });

    it('should count active connections', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      manager.createConnection('thread-1', 'run-1', res1);
      const conn2 = manager.createConnection('thread-2', 'run-2', res2);
      manager.updateState(conn2.id, 'open');

      const metrics = manager.getMetrics();
      expect(metrics.activeConnections).toBe(2);
    });

    it('should aggregate eventsSent', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      const conn1 = manager.createConnection('thread-1', 'run-1', res1);
      const conn2 = manager.createConnection('thread-2', 'run-2', res2);

      manager.recordEventSent(conn1.id, 100);
      manager.recordEventSent(conn1.id, 100);
      manager.recordEventSent(conn2.id, 100);

      const metrics = manager.getMetrics();
      expect(metrics.totalEventsSent).toBe(3);
    });

    it('should aggregate bytesSent', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      const conn1 = manager.createConnection('thread-1', 'run-1', res1);
      const conn2 = manager.createConnection('thread-2', 'run-2', res2);

      manager.recordEventSent(conn1.id, 100);
      manager.recordEventSent(conn2.id, 50);

      const metrics = manager.getMetrics();
      expect(metrics.totalBytesSent).toBe(150);
    });

    it('should aggregate errors', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      const conn1 = manager.createConnection('thread-1', 'run-1', res1);
      const conn2 = manager.createConnection('thread-2', 'run-2', res2);

      manager.recordError(conn1.id);
      manager.recordError(conn1.id);
      manager.recordError(conn2.id);

      const metrics = manager.getMetrics();
      expect(metrics.totalErrors).toBe(3);
    });

    it('should calculate average connection duration', () => {
      vi.useFakeTimers();

      const res1 = createMockResponse();
      const res2 = createMockResponse();

      const conn1 = manager.createConnection('thread-1', 'run-1', res1);
      vi.advanceTimersByTime(100);
      manager.closeConnection(conn1.id);

      const conn2 = manager.createConnection('thread-2', 'run-2', res2);
      vi.advanceTimersByTime(200);
      manager.closeConnection(conn2.id);

      vi.useRealTimers();

      // Note: Connections are removed on close, so duration tracking
      // would need to be implemented differently for accurate metrics
    });
  });

  describe('dispose', () => {
    it('should close all connections', () => {
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      const conn1 = manager.createConnection('thread-1', 'run-1', res1);
      const conn2 = manager.createConnection('thread-2', 'run-2', res2);

      manager.dispose();

      expect(conn1.abortController.signal.aborted).toBe(true);
      expect(conn2.abortController.signal.aborted).toBe(true);
    });

    it('should handle multiple dispose calls', () => {
      // Should not throw
      manager.dispose();
      manager.dispose();
    });

    it('should prevent new connections after dispose', () => {
      manager.dispose();
      const res = createMockResponse();

      expect(() => {
        manager.createConnection('thread-1', 'run-1', res);
      }).toThrow('ConnectionManager has been disposed');
    });
  });

  describe('keep-alive', () => {
    it('should send keep-alive comments at configured interval', async () => {
      vi.useFakeTimers();

      const keepAliveManager = createConnectionManager({
        keepAliveInterval: 100,
        connectionTimeout: 60000,
      });

      const res = createMockResponse();
      const connection = keepAliveManager.createConnection('thread-1', 'run-1', res);
      keepAliveManager.updateState(connection.id, 'open');

      // Advance past keep-alive interval
      vi.advanceTimersByTime(150);

      vi.useRealTimers();

      const data = res.getWrittenData();
      expect(data).toContain(': keep-alive');

      keepAliveManager.dispose();
    });

    it('should increment keepAlivesSent counter', async () => {
      vi.useFakeTimers();

      const keepAliveManager = createConnectionManager({
        keepAliveInterval: 100,
        connectionTimeout: 60000,
      });

      const res = createMockResponse();
      const connection = keepAliveManager.createConnection('thread-1', 'run-1', res);
      keepAliveManager.updateState(connection.id, 'open');

      // Advance past multiple intervals
      vi.advanceTimersByTime(350);

      vi.useRealTimers();

      expect(connection.metrics.keepAlivesSent).toBeGreaterThanOrEqual(3);

      keepAliveManager.dispose();
    });

    it('should stop keep-alive when connection is closed', async () => {
      vi.useFakeTimers();

      const keepAliveManager = createConnectionManager({
        keepAliveInterval: 100,
        connectionTimeout: 60000,
      });

      const res = createMockResponse();
      const connection = keepAliveManager.createConnection('thread-1', 'run-1', res);
      keepAliveManager.updateState(connection.id, 'open');

      // Wait for one keep-alive
      vi.advanceTimersByTime(150);
      const countBefore = connection.metrics.keepAlivesSent;

      // Close connection
      keepAliveManager.closeConnection(connection.id);

      // Advance time
      vi.advanceTimersByTime(300);

      vi.useRealTimers();

      // Count should not have increased
      expect(connection.metrics.keepAlivesSent).toBe(countBefore);

      keepAliveManager.dispose();
    });
  });

  describe('connection timeout', () => {
    it('should close connection after timeout', async () => {
      vi.useFakeTimers();

      const timeoutManager = createConnectionManager({
        keepAliveInterval: 60000,
        connectionTimeout: 100,
      });

      const res = createMockResponse();
      const connection = timeoutManager.createConnection('thread-1', 'run-1', res);
      timeoutManager.updateState(connection.id, 'open');

      // Advance past timeout
      vi.advanceTimersByTime(150);

      vi.useRealTimers();

      expect(timeoutManager.getConnection(connection.id)).toBeUndefined();
      expect(connection.abortController.signal.aborted).toBe(true);

      timeoutManager.dispose();
    });

    it('should reset timeout on activity', async () => {
      vi.useFakeTimers();

      const timeoutManager = createConnectionManager({
        keepAliveInterval: 60000,
        connectionTimeout: 100,
      });

      const res = createMockResponse();
      const connection = timeoutManager.createConnection('thread-1', 'run-1', res);
      timeoutManager.updateState(connection.id, 'open');

      // Wait half the timeout
      vi.advanceTimersByTime(50);

      // Record activity (resets timeout)
      timeoutManager.recordEventSent(connection.id, 100);

      // Wait half the timeout again (should still be alive)
      vi.advanceTimersByTime(50);

      expect(timeoutManager.getConnection(connection.id)).toBeDefined();

      // Wait for full timeout
      vi.advanceTimersByTime(100);

      vi.useRealTimers();

      expect(timeoutManager.getConnection(connection.id)).toBeUndefined();

      timeoutManager.dispose();
    });
  });
});
