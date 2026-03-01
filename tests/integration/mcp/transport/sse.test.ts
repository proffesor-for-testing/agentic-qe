/**
 * Agentic QE v3 - SSE Transport Integration Tests
 * End-to-end tests with actual HTTP requests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import {
  SSETransport,
  createSSETransport,
  createSSEMiddleware,
  AGUIEventType,
  type AgentRequest,
  type AgentHandler,
  type EventEmitter,
  type AGUIEvent,
} from '../../../../src/mcp/transport/sse/index.js';

// ============================================================================
// Test Server Setup
// ============================================================================

interface TestServer {
  server: http.Server;
  transport: SSETransport;
  port: number;
  url: string;
}

async function createTestServer(handler?: AgentHandler): Promise<TestServer> {
  const transport = createSSETransport({
    keepAliveInterval: 60000, // Long interval for tests
    flushInterval: 0, // Immediate flush
  });

  if (handler) {
    transport.setAgentHandler(handler);
  }

  const server = http.createServer((req, res) => {
    // Route to transport for /agent/stream path (any method)
    const urlPath = (req.url || '').split('?')[0];
    if (urlPath === '/agent/stream') {
      transport.handleRequest(req, res).catch(() => {});
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const port = address.port;
  const url = `http://127.0.0.1:${port}`;

  return { server, transport, port, url };
}

async function closeTestServer(testServer: TestServer): Promise<void> {
  testServer.transport.dispose();
  await new Promise<void>((resolve) => {
    testServer.server.close(() => resolve());
  });
}

// ============================================================================
// HTTP Request Helper
// ============================================================================

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

interface SSEEvent {
  event: string;
  data: AGUIEvent;
}

async function makeSSERequest(
  url: string,
  options: RequestOptions = {}
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  events: SSEEvent[];
  raw: string;
}> {
  const { method = 'POST', body, headers = {}, timeout = 5000 } = options;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyStr ? Buffer.byteLength(bodyStr) : 0,
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          const events = parseSSEEvents(raw);

          resolve({
            statusCode: res.statusCode!,
            headers: res.headers,
            events,
            raw,
          });
        });

        res.on('error', reject);
      }
    );

    req.setTimeout(timeout, () => {
      req.destroy(new Error('Request timeout'));
    });

    req.on('error', reject);

    if (bodyStr) {
      req.write(bodyStr);
    }

    req.end();
  });
}

function parseSSEEvents(data: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = data.split('\n\n').filter((b) => b.trim());

  for (const block of blocks) {
    if (block.startsWith(':')) continue;

    const lines = block.split('\n');
    let eventType = '';
    let eventData = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.substring(7);
      } else if (line.startsWith('data: ')) {
        eventData = line.substring(6);
      }
    }

    if (eventType && eventData) {
      try {
        events.push({
          event: eventType,
          data: JSON.parse(eventData),
        });
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return events;
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('SSE Transport Integration', () => {
  let testServer: TestServer;

  afterEach(async () => {
    if (testServer) {
      await closeTestServer(testServer);
    }
  });

  describe('HTTP endpoint', () => {
    it('should return 405 for non-POST requests', async () => {
      testServer = await createTestServer(async () => {});

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        method: 'GET',
        body: { threadId: 'test' },
      });

      expect(response.statusCode).toBe(405);
    });

    it('should return 400 for missing threadId', async () => {
      testServer = await createTestServer(async () => {});

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.raw).toContain('Missing required field: threadId');
    });

    it('should return 400 for invalid JSON', async () => {
      testServer = await createTestServer(async () => {});

      const urlObj = new URL(`${testServer.url}/agent/stream`);

      const response = await new Promise<{ statusCode: number; raw: string }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': 12,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              resolve({ statusCode: res.statusCode!, raw: data });
            });
          }
        );

        req.on('error', reject);
        req.write('invalid json');
        req.end();
      });

      expect(response.statusCode).toBe(400);
      expect(response.raw).toContain('Invalid JSON');
    });

    it('should set correct SSE headers', async () => {
      testServer = await createTestServer(async () => {});

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });
  });

  describe('event lifecycle', () => {
    it('should emit RUN_STARTED and RUN_FINISHED events', async () => {
      testServer = await createTestServer(async () => {
        // Simple handler that does nothing
      });

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread', runId: 'test-run' },
      });

      expect(response.events.length).toBeGreaterThanOrEqual(2);

      const runStarted = response.events.find((e) => e.event === 'RUN_STARTED');
      expect(runStarted).toBeDefined();
      expect(runStarted?.data.threadId).toBe('test-thread');
      expect(runStarted?.data.runId).toBe('test-run');

      const runFinished = response.events.find((e) => e.event === 'RUN_FINISHED');
      expect(runFinished).toBeDefined();
      expect(runFinished?.data.outcome).toBe('success');
    });

    it('should emit RUN_ERROR on handler failure', async () => {
      testServer = await createTestServer(async () => {
        throw new Error('Test error message');
      });

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread', runId: 'test-run' },
      });

      const runError = response.events.find((e) => e.event === 'RUN_ERROR');
      expect(runError).toBeDefined();
      expect(runError?.data.message).toBe('Test error message');
      expect(runError?.data.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('text streaming', () => {
    it('should stream text message events', async () => {
      testServer = await createTestServer(async (_request, emit) => {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_START,
          messageId: 'msg-1',
          role: 'assistant',
        });

        emit({
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'Hello, ',
        });

        emit({
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'World!',
        });

        emit({
          type: AGUIEventType.TEXT_MESSAGE_END,
          messageId: 'msg-1',
        });
      });

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      const textStart = response.events.find((e) => e.event === 'TEXT_MESSAGE_START');
      expect(textStart).toBeDefined();
      expect(textStart?.data.messageId).toBe('msg-1');
      expect(textStart?.data.role).toBe('assistant');

      const textContent = response.events.filter((e) => e.event === 'TEXT_MESSAGE_CONTENT');
      expect(textContent.length).toBe(2);
      expect(textContent[0].data.delta).toBe('Hello, ');
      expect(textContent[1].data.delta).toBe('World!');

      const textEnd = response.events.find((e) => e.event === 'TEXT_MESSAGE_END');
      expect(textEnd).toBeDefined();
    });
  });

  describe('tool call events', () => {
    it('should stream tool call events', async () => {
      testServer = await createTestServer(async (_request, emit) => {
        emit({
          type: AGUIEventType.TOOL_CALL_START,
          toolCallId: 'tool-1',
          toolCallName: 'search',
        });

        emit({
          type: AGUIEventType.TOOL_CALL_ARGS,
          toolCallId: 'tool-1',
          delta: '{"query":"test"}',
        });

        emit({
          type: AGUIEventType.TOOL_CALL_END,
          toolCallId: 'tool-1',
        });

        emit({
          type: AGUIEventType.TOOL_CALL_RESULT,
          toolCallId: 'tool-1',
          content: 'Search results here',
          messageId: 'msg-1',
        });
      });

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      expect(response.events.some((e) => e.event === 'TOOL_CALL_START')).toBe(true);
      expect(response.events.some((e) => e.event === 'TOOL_CALL_ARGS')).toBe(true);
      expect(response.events.some((e) => e.event === 'TOOL_CALL_END')).toBe(true);
      expect(response.events.some((e) => e.event === 'TOOL_CALL_RESULT')).toBe(true);
    });
  });

  describe('state synchronization', () => {
    it('should emit state snapshot and delta events', async () => {
      testServer = await createTestServer(async (_request, emit) => {
        emit({
          type: AGUIEventType.STATE_SNAPSHOT,
          state: { counter: 0, items: [] },
        });

        emit({
          type: AGUIEventType.STATE_DELTA,
          delta: [
            { op: 'replace' as const, path: '/counter', value: 1 },
            { op: 'add' as const, path: '/items/-', value: 'item1' },
          ],
        });
      });

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      const snapshot = response.events.find((e) => e.event === 'STATE_SNAPSHOT');
      expect(snapshot).toBeDefined();
      expect(snapshot?.data.state).toEqual({ counter: 0, items: [] });

      const delta = response.events.find((e) => e.event === 'STATE_DELTA');
      expect(delta).toBeDefined();
      expect(delta?.data.delta).toHaveLength(2);
    });
  });

  describe('step events', () => {
    it('should emit step lifecycle events', async () => {
      testServer = await createTestServer(async (_request, emit) => {
        emit({
          type: AGUIEventType.STEP_STARTED,
          stepId: 'step-1',
          name: 'Analysis',
        });

        emit({
          type: AGUIEventType.STEP_FINISHED,
          stepId: 'step-1',
          result: { score: 0.95 },
        });
      });

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      const stepStarted = response.events.find((e) => e.event === 'STEP_STARTED');
      expect(stepStarted?.data.stepId).toBe('step-1');
      expect(stepStarted?.data.name).toBe('Analysis');

      const stepFinished = response.events.find((e) => e.event === 'STEP_FINISHED');
      expect(stepFinished?.data.stepId).toBe('step-1');
      expect(stepFinished?.data.result).toEqual({ score: 0.95 });
    });
  });

  describe('request body', () => {
    it('should pass request data to handler', async () => {
      let receivedRequest: AgentRequest | undefined;

      testServer = await createTestServer(async (request) => {
        receivedRequest = request;
      });

      await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: {
          threadId: 'test-thread',
          runId: 'test-run',
          messages: [{ role: 'user', content: 'Hello' }],
          state: { key: 'value' },
        },
      });

      expect(receivedRequest).toBeDefined();
      expect(receivedRequest?.threadId).toBe('test-thread');
      expect(receivedRequest?.runId).toBe('test-run');
      expect(receivedRequest?.messages).toHaveLength(1);
      expect(receivedRequest?.state).toEqual({ key: 'value' });
    });
  });

  describe('abort handling', () => {
    it('should provide abort signal to handler for cancellation', async () => {
      // Note: Node.js HTTP client disconnect may not always propagate to server
      // This test verifies the abort signal is available and usable
      let receivedSignal: AbortSignal | undefined;

      testServer = await createTestServer(async (_request, _emit, signal) => {
        receivedSignal = signal;
        // Handler can use signal for cancellation
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
      });

      await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it('should abort signal when transport closes connection', async () => {
      let receivedSignal: AbortSignal | undefined;

      testServer = await createTestServer(async (_request, _emit, signal) => {
        receivedSignal = signal;
        // Wait a bit then let handler complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      // After request completes, signal should be aborted (connection closed)
      // Give it a moment for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(receivedSignal?.aborted).toBe(true);
    });
  });

  describe('concurrent connections', () => {
    it('should handle multiple concurrent requests', async () => {
      testServer = await createTestServer(async (_request, emit) => {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'Response',
        });
      });

      // Make 5 concurrent requests
      const promises = Array.from({ length: 5 }, (_, i) =>
        makeSSERequest(`${testServer.url}/agent/stream`, {
          body: { threadId: `thread-${i}`, runId: `run-${i}` },
        })
      );

      const responses = await Promise.all(promises);

      for (let i = 0; i < 5; i++) {
        expect(responses[i].statusCode).toBe(200);
        expect(responses[i].events.some((e) => e.event === 'RUN_STARTED')).toBe(true);
        expect(responses[i].events.some((e) => e.event === 'RUN_FINISHED')).toBe(true);
      }
    });
  });

  describe('metrics', () => {
    it('should track connection metrics', async () => {
      testServer = await createTestServer(async (_request, emit) => {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'Hello',
        });
      });

      await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      const metrics = testServer.transport.getMetrics();

      expect(metrics.totalConnections).toBeGreaterThanOrEqual(1);
      expect(metrics.totalEventsSent).toBeGreaterThan(0);
      expect(metrics.totalBytesSent).toBeGreaterThan(0);
    });
  });

  describe('event format compliance', () => {
    it('should format events according to SSE specification', async () => {
      testServer = await createTestServer(async (_request, emit) => {
        emit({
          type: AGUIEventType.CUSTOM,
          name: 'test-event',
          value: { data: 'value' },
        });
      });

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      // Check raw format includes event: and data: lines
      expect(response.raw).toContain('event: RUN_STARTED');
      expect(response.raw).toContain('event: CUSTOM');
      expect(response.raw).toContain('event: RUN_FINISHED');
      expect(response.raw).toContain('data: {');

      // Check double newline separators
      const eventBlocks = response.raw.split('\n\n').filter((b) => b.trim() && !b.startsWith(':'));
      expect(eventBlocks.length).toBeGreaterThanOrEqual(3);
    });

    it('should include timestamps in all events', async () => {
      testServer = await createTestServer(async (_request, emit) => {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'test',
        });
      });

      const response = await makeSSERequest(`${testServer.url}/agent/stream`, {
        body: { threadId: 'test-thread' },
      });

      for (const event of response.events) {
        expect(event.data.timestamp).toBeDefined();
        expect(typeof event.data.timestamp).toBe('number');
      }
    });
  });
});

describe('SSE Middleware Integration', () => {
  let server: http.Server;
  let port: number;
  let url: string;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('should integrate with standard HTTP server', async () => {
    const middleware = createSSEMiddleware(
      async (_request, emit) => {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'Middleware response',
        });
      },
      { path: '/api/agent', flushInterval: 0 }
    );

    server = http.createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end('Not found');
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    port = address.port;
    url = `http://127.0.0.1:${port}`;

    // Test non-matching path calls next()
    const notFoundResponse = await makeSSERequest(`${url}/other/path`, {
      body: { threadId: 'test' },
    });
    expect(notFoundResponse.statusCode).toBe(404);
    expect(notFoundResponse.raw).toBe('Not found');

    // Test matching path handles SSE
    const sseResponse = await makeSSERequest(`${url}/api/agent`, {
      body: { threadId: 'test-thread' },
    });
    expect(sseResponse.statusCode).toBe(200);
    expect(sseResponse.headers['content-type']).toBe('text/event-stream');
    expect(sseResponse.events.some((e) => e.event === 'TEXT_MESSAGE_CONTENT')).toBe(true);
  });
});
