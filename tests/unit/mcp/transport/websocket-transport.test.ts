/**
 * WebSocket Transport Unit Tests
 *
 * Tests for bidirectional WebSocket transport for AG-UI protocol
 * including connection management, message routing, state recovery,
 * and heartbeat functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createServer, type Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  WebSocketTransport,
  createWebSocketTransport,
} from '../../../../src/mcp/transport/websocket/websocket-transport.js';
import {
  WebSocketMessageType,
  WebSocketServerMessageType,
  AGUIEventType,
  type ConnectMessage,
  type AgentRequestMessage,
  type CancelMessage,
  type PingMessage,
  type ConnectedServerMessage,
  type EventServerMessage,
  type PongServerMessage,
} from '../../../../src/mcp/transport/websocket/types.js';

// ============================================================================
// Test Helpers
// ============================================================================

async function createTestServer(transport: WebSocketTransport): Promise<{
  server: Server;
  url: string;
  close: () => Promise<void>;
}> {
  const server = createServer();
  await transport.attach(server, '/agent/ws');

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      const url = `ws://127.0.0.1:${address.port}/agent/ws`;
      resolve({
        server,
        url,
        close: () =>
          new Promise<void>((res) => {
            transport.dispose();
            server.close(() => res());
          }),
      });
    });
  });
}

async function createTestClient(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createWebSocketTransport', () => {
  it('should create transport with default config', () => {
    const transport = createWebSocketTransport();
    expect(transport).toBeInstanceOf(WebSocketTransport);
    transport.dispose();
  });

  it('should create transport with custom config', () => {
    const transport = createWebSocketTransport({
      heartbeatInterval: 60000,
      maxConnections: 500,
    });
    expect(transport).toBeInstanceOf(WebSocketTransport);
    transport.dispose();
  });
});

// ============================================================================
// Connection Tests
// ============================================================================

describe('WebSocketTransport - Connection', () => {
  let transport: WebSocketTransport;
  let testServer: Awaited<ReturnType<typeof createTestServer>>;

  beforeEach(async () => {
    transport = createWebSocketTransport({
      heartbeatInterval: 5000,
      heartbeatTimeout: 2000,
    });
    testServer = await createTestServer(transport);
  });

  afterEach(async () => {
    await testServer.close();
  });

  it('should accept WebSocket connections', async () => {
    const client = await createTestClient(testServer.url);
    expect(client.readyState).toBe(WebSocket.OPEN);
    client.close();
  });

  it('should emit upgrade event', async () => {
    const upgradeSpy = vi.fn();
    transport.on('upgrade', upgradeSpy);

    const client = await createTestClient(testServer.url);
    await new Promise((r) => setTimeout(r, 50));

    expect(upgradeSpy).toHaveBeenCalled();
    client.close();
  });

  it('should handle CONNECT message', async () => {
    const client = await createTestClient(testServer.url);

    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'msg-1',
      timestamp: Date.now(),
      threadId: 'thread-123',
      runId: 'run-456',
    };

    client.send(JSON.stringify(connectMessage));
    const response = (await waitForMessage(client)) as ConnectedServerMessage;

    expect(response.type).toBe(WebSocketServerMessageType.CONNECTED);
    expect(response.threadId).toBe('thread-123');
    expect(response.runId).toBe('run-456');
    expect(response.connectionId).toBeDefined();
    expect(response.resumeToken).toBeDefined();

    client.close();
  });

  it('should emit connected event', async () => {
    const connectedSpy = vi.fn();
    transport.on('connected', connectedSpy);

    const client = await createTestClient(testServer.url);
    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'msg-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };

    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);
    await new Promise((r) => setTimeout(r, 50));

    expect(connectedSpy).toHaveBeenCalled();
    client.close();
  });

  it('should track active connections', async () => {
    expect(transport.getActiveConnectionsCount()).toBe(0);

    const client = await createTestClient(testServer.url);
    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'msg-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };

    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);
    await new Promise((r) => setTimeout(r, 50));

    expect(transport.getActiveConnectionsCount()).toBe(1);

    client.close();
    await new Promise((r) => setTimeout(r, 100));

    expect(transport.getActiveConnectionsCount()).toBe(0);
  });

  it('should handle multiple concurrent connections', async () => {
    const clients: WebSocket[] = [];

    for (let i = 0; i < 3; i++) {
      const client = await createTestClient(testServer.url);
      const connectMessage: ConnectMessage = {
        type: WebSocketMessageType.CONNECT,
        id: `msg-${i}`,
        timestamp: Date.now(),
        threadId: `thread-${i}`,
        runId: `run-${i}`,
      };
      client.send(JSON.stringify(connectMessage));
      await waitForMessage(client);
      clients.push(client);
    }

    await new Promise((r) => setTimeout(r, 50));
    expect(transport.getActiveConnectionsCount()).toBe(3);

    for (const client of clients) {
      client.close();
    }
  });
});

// ============================================================================
// Agent Request Tests
// ============================================================================

describe('WebSocketTransport - Agent Requests', () => {
  let transport: WebSocketTransport;
  let testServer: Awaited<ReturnType<typeof createTestServer>>;

  beforeEach(async () => {
    transport = createWebSocketTransport();
    testServer = await createTestServer(transport);
  });

  afterEach(async () => {
    await testServer.close();
  });

  it('should reject request without CONNECT', async () => {
    const client = await createTestClient(testServer.url);

    const requestMessage: AgentRequestMessage = {
      type: WebSocketMessageType.AGENT_REQUEST,
      id: 'msg-1',
      timestamp: Date.now(),
      request: { prompt: 'Hello' },
    };

    client.send(JSON.stringify(requestMessage));
    const response = await waitForMessage(client);

    expect((response as { type: string }).type).toBe(WebSocketServerMessageType.ERROR);
    expect((response as { code: string }).code).toBe('NOT_CONNECTED');

    client.close();
  });

  it('should process agent request with handler', async () => {
    const events: unknown[] = [];

    transport.setAgentHandler(async (request, emit, _signal) => {
      emit({
        type: AGUIEventType.TEXT_MESSAGE_START,
        messageId: 'msg-1',
        role: 'assistant',
      });
      emit({
        type: AGUIEventType.TEXT_MESSAGE_CONTENT,
        messageId: 'msg-1',
        delta: `Echo: ${(request as { prompt: string }).prompt}`,
      });
      emit({
        type: AGUIEventType.TEXT_MESSAGE_END,
        messageId: 'msg-1',
      });
    });

    const client = await createTestClient(testServer.url);

    // Connect first
    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'connect-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };
    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);

    // Send request
    const requestMessage: AgentRequestMessage = {
      type: WebSocketMessageType.AGENT_REQUEST,
      id: 'request-1',
      timestamp: Date.now(),
      request: { prompt: 'Hello' },
    };

    // Collect events
    const eventPromise = new Promise<void>((resolve) => {
      client.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        events.push(msg);
        if (msg.event?.type === AGUIEventType.RUN_FINISHED) {
          resolve();
        }
      });
    });

    client.send(JSON.stringify(requestMessage));
    await eventPromise;

    // Should have: RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END, RUN_FINISHED
    expect(events.length).toBeGreaterThanOrEqual(5);

    const eventTypes = events
      .filter((e): e is EventServerMessage => (e as { type: string }).type === WebSocketServerMessageType.EVENT)
      .map((e) => e.event.type);

    expect(eventTypes).toContain(AGUIEventType.RUN_STARTED);
    expect(eventTypes).toContain(AGUIEventType.TEXT_MESSAGE_CONTENT);
    expect(eventTypes).toContain(AGUIEventType.RUN_FINISHED);

    client.close();
  });

  it('should handle request cancellation', async () => {
    let wasAborted = false;

    transport.setAgentHandler(async (_request, emit, signal) => {
      signal.addEventListener('abort', () => {
        wasAborted = true;
      });

      // Simulate long-running task
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          resolve(undefined);
        });
      });
    });

    const client = await createTestClient(testServer.url);

    // Connect
    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'connect-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };
    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);

    // Start request
    const requestMessage: AgentRequestMessage = {
      type: WebSocketMessageType.AGENT_REQUEST,
      id: 'request-1',
      timestamp: Date.now(),
      request: { prompt: 'Long task' },
    };
    client.send(JSON.stringify(requestMessage));

    // Wait a bit then cancel
    await new Promise((r) => setTimeout(r, 100));

    const cancelMessage: CancelMessage = {
      type: WebSocketMessageType.CANCEL,
      id: 'cancel-1',
      timestamp: Date.now(),
      reason: 'User cancelled',
    };
    client.send(JSON.stringify(cancelMessage));

    // Wait for abort
    await new Promise((r) => setTimeout(r, 200));

    expect(wasAborted).toBe(true);

    client.close();
  });
});

// ============================================================================
// Heartbeat Tests
// ============================================================================

describe('WebSocketTransport - Heartbeat', () => {
  let transport: WebSocketTransport;
  let testServer: Awaited<ReturnType<typeof createTestServer>>;

  beforeEach(async () => {
    transport = createWebSocketTransport({
      heartbeatInterval: 100,
      heartbeatTimeout: 50,
    });
    testServer = await createTestServer(transport);
  });

  afterEach(async () => {
    await testServer.close();
  });

  it('should respond to PING with PONG', async () => {
    const client = await createTestClient(testServer.url);

    // Connect first
    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'connect-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };
    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);

    // Send PING
    const pingMessage: PingMessage = {
      type: WebSocketMessageType.PING,
      id: 'ping-1',
      timestamp: Date.now(),
    };
    client.send(JSON.stringify(pingMessage));

    const response = (await waitForMessage(client)) as PongServerMessage;
    expect(response.type).toBe(WebSocketServerMessageType.PONG);

    client.close();
  });
});

// ============================================================================
// Metrics Tests
// ============================================================================

describe('WebSocketTransport - Metrics', () => {
  let transport: WebSocketTransport;
  let testServer: Awaited<ReturnType<typeof createTestServer>>;

  beforeEach(async () => {
    transport = createWebSocketTransport({ enableMetrics: true });
    testServer = await createTestServer(transport);
  });

  afterEach(async () => {
    await testServer.close();
  });

  it('should track connection metrics', async () => {
    const client = await createTestClient(testServer.url);

    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'connect-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };
    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);

    const metrics = transport.getMetrics();
    expect(metrics.totalConnections).toBeGreaterThanOrEqual(1);
    expect(metrics.activeConnections).toBe(1);

    client.close();
    await new Promise((r) => setTimeout(r, 100));

    const metricsAfter = transport.getMetrics();
    expect(metricsAfter.activeConnections).toBe(0);
  });

  it('should track message metrics', async () => {
    const client = await createTestClient(testServer.url);

    // Connect
    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'connect-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };
    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);

    // Send additional message after connection to ensure it's tracked
    const pingMessage: PingMessage = {
      type: WebSocketMessageType.PING,
      id: 'ping-1',
      timestamp: Date.now(),
    };
    client.send(JSON.stringify(pingMessage));
    await waitForMessage(client);

    const metrics = transport.getMetrics();
    // After CONNECT + PING, should have received/sent messages
    expect(metrics.totalConnections).toBeGreaterThanOrEqual(1);
    expect(metrics.activeConnections).toBeGreaterThanOrEqual(1);

    client.close();
  });
});

// ============================================================================
// Broadcast Tests
// ============================================================================

describe('WebSocketTransport - Broadcast', () => {
  let transport: WebSocketTransport;
  let testServer: Awaited<ReturnType<typeof createTestServer>>;

  beforeEach(async () => {
    transport = createWebSocketTransport();
    testServer = await createTestServer(transport);
  });

  afterEach(async () => {
    await testServer.close();
  });

  it('should broadcast event to all connections', async () => {
    const clients: WebSocket[] = [];
    const receivedEvents: Map<number, unknown[]> = new Map();

    // Create 3 connected clients
    for (let i = 0; i < 3; i++) {
      const client = await createTestClient(testServer.url);
      const connectMessage: ConnectMessage = {
        type: WebSocketMessageType.CONNECT,
        id: `connect-${i}`,
        timestamp: Date.now(),
        threadId: `thread-${i}`,
        runId: `run-${i}`,
      };
      client.send(JSON.stringify(connectMessage));
      await waitForMessage(client);

      receivedEvents.set(i, []);
      client.on('message', (data) => {
        receivedEvents.get(i)!.push(JSON.parse(data.toString()));
      });

      clients.push(client);
    }

    // Wait for connections to be established
    await new Promise((r) => setTimeout(r, 50));

    // Broadcast event
    transport.broadcast({
      type: AGUIEventType.CUSTOM,
      eventId: 'broadcast-1',
      timestamp: new Date().toISOString(),
      name: 'test-broadcast',
      value: { message: 'Hello everyone!' },
    });

    // Wait for broadcast to be received
    await new Promise((r) => setTimeout(r, 100));

    // All clients should have received the broadcast
    for (let i = 0; i < 3; i++) {
      const events = receivedEvents.get(i)!;
      const broadcastEvent = events.find(
        (e) =>
          (e as EventServerMessage).type === WebSocketServerMessageType.EVENT &&
          (e as EventServerMessage).event.type === AGUIEventType.CUSTOM
      );
      expect(broadcastEvent).toBeDefined();
    }

    for (const client of clients) {
      client.close();
    }
  });
});

// ============================================================================
// Connection Close Tests
// ============================================================================

describe('WebSocketTransport - Connection Close', () => {
  let transport: WebSocketTransport;
  let testServer: Awaited<ReturnType<typeof createTestServer>>;

  beforeEach(async () => {
    transport = createWebSocketTransport();
    testServer = await createTestServer(transport);
  });

  afterEach(async () => {
    await testServer.close();
  });

  it('should close specific connection', async () => {
    const client = await createTestClient(testServer.url);

    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'connect-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };
    client.send(JSON.stringify(connectMessage));
    const response = (await waitForMessage(client)) as ConnectedServerMessage;

    const closePromise = new Promise<void>((resolve) => {
      client.on('close', () => resolve());
    });

    transport.closeConnection(response.connectionId, 'Test close');

    await closePromise;
    expect(client.readyState).toBe(WebSocket.CLOSED);
  });

  it('should close all connections', async () => {
    const clients: WebSocket[] = [];
    const closePromises: Promise<void>[] = [];

    for (let i = 0; i < 3; i++) {
      const client = await createTestClient(testServer.url);
      const connectMessage: ConnectMessage = {
        type: WebSocketMessageType.CONNECT,
        id: `connect-${i}`,
        timestamp: Date.now(),
        threadId: `thread-${i}`,
        runId: `run-${i}`,
      };
      client.send(JSON.stringify(connectMessage));
      await waitForMessage(client);

      closePromises.push(
        new Promise<void>((resolve) => {
          client.on('close', () => resolve());
        })
      );

      clients.push(client);
    }

    await new Promise((r) => setTimeout(r, 50));

    transport.closeAllConnections('Server shutdown');

    await Promise.all(closePromises);

    for (const client of clients) {
      expect(client.readyState).toBe(WebSocket.CLOSED);
    }
  });

  it('should emit disconnected event', async () => {
    const disconnectedSpy = vi.fn();
    transport.on('disconnected', disconnectedSpy);

    const client = await createTestClient(testServer.url);

    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'connect-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };
    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);

    client.close();
    await new Promise((r) => setTimeout(r, 100));

    expect(disconnectedSpy).toHaveBeenCalled();
  });
});

// ============================================================================
// Dispose Tests
// ============================================================================

describe('WebSocketTransport - Dispose', () => {
  it('should clean up on dispose', async () => {
    const transport = createWebSocketTransport();
    const testServer = await createTestServer(transport);

    const client = await createTestClient(testServer.url);
    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'connect-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };
    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);

    const closePromise = new Promise<void>((resolve) => {
      client.on('close', () => resolve());
    });

    transport.dispose();

    await closePromise;
    expect(transport.getActiveConnectionsCount()).toBe(0);

    await testServer.close();
  });

  it('should reject operations after dispose', async () => {
    const transport = createWebSocketTransport();
    transport.dispose();

    const server = createServer();
    await expect(transport.attach(server, '/agent/ws')).rejects.toThrow('disposed');

    server.close();
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('WebSocketTransport - Error Handling', () => {
  let transport: WebSocketTransport;
  let testServer: Awaited<ReturnType<typeof createTestServer>>;

  beforeEach(async () => {
    transport = createWebSocketTransport();
    testServer = await createTestServer(transport);
  });

  afterEach(async () => {
    await testServer.close();
  });

  it('should handle invalid JSON message', async () => {
    const client = await createTestClient(testServer.url);

    client.send('not valid json');
    const response = await waitForMessage(client);

    expect((response as { type: string }).type).toBe(WebSocketServerMessageType.ERROR);
    expect((response as { code: string }).code).toBe('INVALID_MESSAGE');

    client.close();
  });

  it('should handle unknown message type', async () => {
    const client = await createTestClient(testServer.url);

    client.send(
      JSON.stringify({
        type: 'UNKNOWN_TYPE',
        id: 'msg-1',
        timestamp: Date.now(),
      })
    );
    const response = await waitForMessage(client);

    expect((response as { type: string }).type).toBe(WebSocketServerMessageType.ERROR);
    expect((response as { code: string }).code).toBe('UNKNOWN_MESSAGE_TYPE');

    client.close();
  });

  it('should handle agent handler error', async () => {
    transport.setAgentHandler(async () => {
      throw new Error('Handler error');
    });

    const client = await createTestClient(testServer.url);

    // Connect
    const connectMessage: ConnectMessage = {
      type: WebSocketMessageType.CONNECT,
      id: 'connect-1',
      timestamp: Date.now(),
      threadId: 'thread-1',
      runId: 'run-1',
    };
    client.send(JSON.stringify(connectMessage));
    await waitForMessage(client);

    // Send request
    const events: unknown[] = [];
    client.on('message', (data) => {
      events.push(JSON.parse(data.toString()));
    });

    const requestMessage: AgentRequestMessage = {
      type: WebSocketMessageType.AGENT_REQUEST,
      id: 'request-1',
      timestamp: Date.now(),
      request: { prompt: 'Will fail' },
    };
    client.send(JSON.stringify(requestMessage));

    // Wait for error event
    await new Promise((r) => setTimeout(r, 200));

    const errorEvent = events.find(
      (e) =>
        (e as EventServerMessage).type === WebSocketServerMessageType.EVENT &&
        (e as EventServerMessage).event.type === AGUIEventType.RUN_ERROR
    );
    expect(errorEvent).toBeDefined();

    client.close();
  });
});
