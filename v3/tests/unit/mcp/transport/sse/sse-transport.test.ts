/**
 * Agentic QE v3 - SSE Transport Unit Tests
 * Tests for the Server-Sent Events transport implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter, Readable, Writable } from 'stream';
import {
  SSETransport,
  createSSETransport,
  createSSEMiddleware,
  AGUIEventType,
  type AgentRequest,
  type AgentHandler,
  type AGUIEvent,
  type SSERequest,
  type SSEResponse,
} from '../../../../../src/mcp/transport/sse/index.js';

// ============================================================================
// Mock Request/Response
// ============================================================================

function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
}): SSERequest {
  const req = new Readable({
    read() {},
  }) as SSERequest;

  req.method = options.method ?? 'POST';
  req.url = options.url ?? '/agent/stream';
  req.headers = options.headers ?? { 'content-type': 'application/json' };

  if (options.body) {
    req.body = options.body as AgentRequest;
  }

  return req;
}

function createMockResponse(): SSEResponse & {
  getWrittenData: () => string;
  getHeaders: () => Record<string, string | string[] | undefined>;
  getStatusCode: () => number;
} {
  const chunks: string[] = [];
  const headers: Record<string, string | string[] | undefined> = {};
  let statusCode = 200;
  let headersSent = false;
  let ended = false;

  const res = new Writable({
    write(chunk, encoding, callback) {
      if (!ended) {
        chunks.push(chunk.toString());
      }
      callback();
    },
  }) as SSEResponse & {
    getWrittenData: () => string;
    getHeaders: () => Record<string, string | string[] | undefined>;
    getStatusCode: () => number;
  };

  res.setHeader = (name: string, value: string | string[]) => {
    headers[name.toLowerCase()] = value;
    return res;
  };

  res.getHeader = (name: string) => headers[name.toLowerCase()];

  Object.defineProperty(res, 'headersSent', {
    get: () => headersSent,
  });

  Object.defineProperty(res, 'statusCode', {
    get: () => statusCode,
    set: (code: number) => {
      statusCode = code;
    },
  });

  res.statusMessage = '';

  res.flushHeaders = () => {
    headersSent = true;
  };

  res.flush = () => {};

  Object.defineProperty(res, 'writableEnded', {
    get: () => ended,
  });

  const originalEnd = res.end.bind(res);
  res.end = ((chunk?: unknown, encoding?: unknown, callback?: unknown) => {
    ended = true;
    if (typeof chunk === 'string') {
      chunks.push(chunk);
    }
    return originalEnd(chunk as string | undefined, encoding as BufferEncoding | undefined, callback as (() => void) | undefined);
  }) as typeof res.end;

  res.getWrittenData = () => chunks.join('');
  res.getHeaders = () => headers;
  res.getStatusCode = () => statusCode;

  return res;
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseSSEEvents(data: string): Array<{ event: string; data: AGUIEvent }> {
  const events: Array<{ event: string; data: AGUIEvent }> = [];
  const blocks = data.split('\n\n').filter((b) => b.trim());

  for (const block of blocks) {
    // Skip keep-alive comments
    if (block.startsWith(':')) {
      continue;
    }

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

async function waitForResponse(res: ReturnType<typeof createMockResponse>, timeout = 100): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, timeout));
}

// ============================================================================
// Tests
// ============================================================================

describe('SSETransport', () => {
  let transport: SSETransport;

  beforeEach(() => {
    transport = createSSETransport({
      keepAliveInterval: 60000, // Disable keep-alive for tests
      flushInterval: 0, // Immediate flush
    });
  });

  afterEach(() => {
    transport.dispose();
  });

  describe('factory function', () => {
    it('should create transport with default config', () => {
      const t = createSSETransport();
      expect(t).toBeInstanceOf(SSETransport);
      t.dispose();
    });

    it('should create transport with custom config', () => {
      const t = createSSETransport({
        keepAliveInterval: 5000,
        maxBufferSize: 50,
        flushInterval: 100,
      });
      expect(t).toBeInstanceOf(SSETransport);
      t.dispose();
    });
  });

  describe('request handling', () => {
    it('should reject non-POST requests', async () => {
      const req = createMockRequest({ method: 'GET', body: { threadId: 'test' } });
      const res = createMockResponse();

      await transport.handleRequest(req, res);

      expect(res.getStatusCode()).toBe(405);
      const response = JSON.parse(res.getWrittenData());
      expect(response.error).toBe('Only POST is supported');
    });

    it('should reject requests without threadId', async () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      await transport.handleRequest(req, res);

      expect(res.getStatusCode()).toBe(400);
      const response = JSON.parse(res.getWrittenData());
      expect(response.error).toBe('Missing required field: threadId');
    });

    it('should reject requests when no handler is set', async () => {
      const req = createMockRequest({ body: { threadId: 'test-thread' } });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());
      expect(events.some((e) => e.event === 'RUN_ERROR')).toBe(true);
    });

    it('should set correct SSE headers', async () => {
      transport.setAgentHandler(async () => {});

      const req = createMockRequest({ body: { threadId: 'test-thread' } });
      const res = createMockResponse();

      await transport.handleRequest(req, res);

      const headers = res.getHeaders();
      expect(headers['content-type']).toBe('text/event-stream');
      expect(headers['cache-control']).toBe('no-cache');
      expect(headers['connection']).toBe('keep-alive');
    });

    it('should set custom headers when configured', async () => {
      const customTransport = createSSETransport({
        customHeaders: {
          'X-Custom-Header': 'test-value',
        },
        flushInterval: 0,
      });
      customTransport.setAgentHandler(async () => {});

      const req = createMockRequest({ body: { threadId: 'test-thread' } });
      const res = createMockResponse();

      await customTransport.handleRequest(req, res);

      const headers = res.getHeaders();
      expect(headers['x-custom-header']).toBe('test-value');
      customTransport.dispose();
    });

    it('should accept valid requests with threadId', async () => {
      transport.setAgentHandler(async () => {});

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());
      expect(events.length).toBeGreaterThan(0);
    });

    it('should use provided runId', async () => {
      transport.setAgentHandler(async () => {});

      const req = createMockRequest({
        body: { threadId: 'test-thread', runId: 'custom-run-id' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());
      const runStarted = events.find((e) => e.event === 'RUN_STARTED');
      expect(runStarted?.data.runId).toBe('custom-run-id');
    });

    it('should generate runId if not provided', async () => {
      transport.setAgentHandler(async () => {});

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());
      const runStarted = events.find((e) => e.event === 'RUN_STARTED');
      expect(runStarted?.data.runId).toBeDefined();
      expect(typeof runStarted?.data.runId).toBe('string');
    });
  });

  describe('event emission', () => {
    it('should emit RUN_STARTED on connection', async () => {
      transport.setAgentHandler(async () => {});

      const req = createMockRequest({
        body: { threadId: 'test-thread', runId: 'test-run' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());
      const runStarted = events.find((e) => e.event === 'RUN_STARTED');
      expect(runStarted).toBeDefined();
      expect(runStarted?.data.type).toBe(AGUIEventType.RUN_STARTED);
      expect(runStarted?.data.threadId).toBe('test-thread');
      expect(runStarted?.data.runId).toBe('test-run');
    });

    it('should emit RUN_FINISHED on success', async () => {
      transport.setAgentHandler(async () => {
        // Handler completes successfully
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread', runId: 'test-run' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());
      const runFinished = events.find((e) => e.event === 'RUN_FINISHED');
      expect(runFinished).toBeDefined();
      expect(runFinished?.data.type).toBe(AGUIEventType.RUN_FINISHED);
      expect(runFinished?.data.runId).toBe('test-run');
      expect(runFinished?.data.outcome).toBe('success');
    });

    it('should emit RUN_ERROR on handler error', async () => {
      transport.setAgentHandler(async () => {
        throw new Error('Test error');
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread', runId: 'test-run' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());
      const runError = events.find((e) => e.event === 'RUN_ERROR');
      expect(runError).toBeDefined();
      expect(runError?.data.type).toBe(AGUIEventType.RUN_ERROR);
      expect(runError?.data.message).toBe('Test error');
      expect(runError?.data.code).toBe('INTERNAL_ERROR');
    });

    it('should emit events from handler', async () => {
      transport.setAgentHandler(async (_request, emit) => {
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

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());

      const textStart = events.find((e) => e.event === 'TEXT_MESSAGE_START');
      expect(textStart?.data.messageId).toBe('msg-1');

      const textContent = events.filter((e) => e.event === 'TEXT_MESSAGE_CONTENT');
      expect(textContent.length).toBe(2);
      expect(textContent[0].data.delta).toBe('Hello, ');
      expect(textContent[1].data.delta).toBe('World!');

      const textEnd = events.find((e) => e.event === 'TEXT_MESSAGE_END');
      expect(textEnd?.data.messageId).toBe('msg-1');
    });

    it('should emit tool call events', async () => {
      transport.setAgentHandler(async (_request, emit) => {
        emit({
          type: AGUIEventType.TOOL_CALL_START,
          toolCallId: 'tool-1',
          toolCallName: 'search',
        });
        emit({
          type: AGUIEventType.TOOL_CALL_ARGS,
          toolCallId: 'tool-1',
          delta: '{"query":',
        });
        emit({
          type: AGUIEventType.TOOL_CALL_ARGS,
          toolCallId: 'tool-1',
          delta: '"test"}',
        });
        emit({
          type: AGUIEventType.TOOL_CALL_END,
          toolCallId: 'tool-1',
        });
        emit({
          type: AGUIEventType.TOOL_CALL_RESULT,
          toolCallId: 'tool-1',
          content: 'Search results...',
          messageId: 'msg-1',
        });
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());

      expect(events.some((e) => e.event === 'TOOL_CALL_START')).toBe(true);
      expect(events.some((e) => e.event === 'TOOL_CALL_ARGS')).toBe(true);
      expect(events.some((e) => e.event === 'TOOL_CALL_END')).toBe(true);
      expect(events.some((e) => e.event === 'TOOL_CALL_RESULT')).toBe(true);
    });

    it('should emit state events', async () => {
      transport.setAgentHandler(async (_request, emit) => {
        emit({
          type: AGUIEventType.STATE_SNAPSHOT,
          state: { counter: 0 },
        });
        emit({
          type: AGUIEventType.STATE_DELTA,
          delta: [{ op: 'replace', path: '/counter', value: 1 }],
        });
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());

      const snapshot = events.find((e) => e.event === 'STATE_SNAPSHOT');
      expect(snapshot?.data.state).toEqual({ counter: 0 });

      const delta = events.find((e) => e.event === 'STATE_DELTA');
      expect(delta?.data.delta).toEqual([{ op: 'replace', path: '/counter', value: 1 }]);
    });

    it('should emit step events', async () => {
      transport.setAgentHandler(async (_request, emit) => {
        emit({
          type: AGUIEventType.STEP_STARTED,
          stepId: 'step-1',
          name: 'Processing',
        });
        emit({
          type: AGUIEventType.STEP_FINISHED,
          stepId: 'step-1',
          result: { processed: true },
        });
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());

      const stepStarted = events.find((e) => e.event === 'STEP_STARTED');
      expect(stepStarted?.data.stepId).toBe('step-1');
      expect(stepStarted?.data.name).toBe('Processing');

      const stepFinished = events.find((e) => e.event === 'STEP_FINISHED');
      expect(stepFinished?.data.stepId).toBe('step-1');
      expect(stepFinished?.data.result).toEqual({ processed: true });
    });

    it('should emit custom events', async () => {
      transport.setAgentHandler(async (_request, emit) => {
        emit({
          type: AGUIEventType.CUSTOM,
          name: 'my-event',
          value: { foo: 'bar' },
        });
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const events = parseSSEEvents(res.getWrittenData());
      const custom = events.find((e) => e.event === 'CUSTOM');
      expect(custom?.data.name).toBe('my-event');
      expect(custom?.data.value).toEqual({ foo: 'bar' });
    });

    it('should add timestamp to events', async () => {
      const beforeTime = Date.now();

      transport.setAgentHandler(async (_request, emit) => {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_START,
          messageId: 'msg-1',
          role: 'assistant',
        });
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const afterTime = Date.now();

      const events = parseSSEEvents(res.getWrittenData());
      for (const event of events) {
        expect(event.data.timestamp).toBeDefined();
        expect(event.data.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(event.data.timestamp).toBeLessThanOrEqual(afterTime);
      }
    });
  });

  describe('event format', () => {
    it('should format events correctly with event type and data', async () => {
      transport.setAgentHandler(async (_request, emit) => {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'test',
        });
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const data = res.getWrittenData();
      expect(data).toContain('event: TEXT_MESSAGE_CONTENT');
      expect(data).toContain('data: {');
      expect(data).toContain('"type":"TEXT_MESSAGE_CONTENT"');
    });

    it('should separate events with double newlines', async () => {
      transport.setAgentHandler(async (_request, emit) => {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_START,
          messageId: 'msg-1',
          role: 'assistant',
        });
        emit({
          type: AGUIEventType.TEXT_MESSAGE_END,
          messageId: 'msg-1',
        });
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const data = res.getWrittenData();
      const blocks = data.split('\n\n').filter((b) => b.trim());
      expect(blocks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('abort controller', () => {
    it('should provide abort signal to handler', async () => {
      let receivedSignal: AbortSignal | undefined;

      transport.setAgentHandler(async (_request, _emit, signal) => {
        receivedSignal = signal;
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it('should abort on client disconnect', async () => {
      let signalAborted = false;

      transport.setAgentHandler(async (_request, _emit, signal) => {
        signal.addEventListener('abort', () => {
          signalAborted = true;
        });
        // Keep the handler running
        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      // Start request
      const promise = transport.handleRequest(req, res);

      // Simulate client disconnect
      await new Promise((resolve) => setTimeout(resolve, 50));
      req.emit('close');

      await promise;
      expect(signalAborted).toBe(true);
    });
  });

  describe('metrics', () => {
    it('should track metrics', async () => {
      transport.setAgentHandler(async (_request, emit) => {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'Hello',
        });
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);
      await waitForResponse(res);

      const metrics = transport.getMetrics();
      expect(metrics.totalConnections).toBe(1);
      expect(metrics.totalEventsSent).toBeGreaterThan(0);
      expect(metrics.totalBytesSent).toBeGreaterThan(0);
    });

    it('should track active connections', async () => {
      let resolveHandler: () => void;
      const handlerPromise = new Promise<void>((resolve) => {
        resolveHandler = resolve;
      });

      transport.setAgentHandler(async () => {
        await handlerPromise;
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      // Start request
      const requestPromise = transport.handleRequest(req, res);

      // Check active connections during request
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(transport.getActiveConnectionsCount()).toBe(1);

      // Complete handler
      resolveHandler!();
      await requestPromise;

      // Active connections should be 0 after completion
      expect(transport.getActiveConnectionsCount()).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should close all connections on dispose', async () => {
      let resolveHandler: () => void;
      const handlerPromise = new Promise<void>((resolve) => {
        resolveHandler = resolve;
      });

      transport.setAgentHandler(async () => {
        await handlerPromise;
      });

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      // Start request
      const requestPromise = transport.handleRequest(req, res);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Dispose transport
      transport.dispose();

      // Complete handler
      resolveHandler!();
      await requestPromise;

      // Should handle requests gracefully after dispose
      expect(transport.getActiveConnectionsCount()).toBe(0);
    });

    it('should reject new requests after dispose', async () => {
      transport.dispose();

      const req = createMockRequest({
        body: { threadId: 'test-thread' },
      });
      const res = createMockResponse();

      await transport.handleRequest(req, res);

      expect(res.getStatusCode()).toBe(503);
    });
  });

  describe('closeAllConnections', () => {
    it('should close all active connections', async () => {
      let resolveHandler: () => void;
      const handlerPromise = new Promise<void>((resolve) => {
        resolveHandler = resolve;
      });

      transport.setAgentHandler(async () => {
        await handlerPromise;
      });

      const req1 = createMockRequest({ body: { threadId: 'thread-1' } });
      const res1 = createMockResponse();

      const promise = transport.handleRequest(req1, res1);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transport.getActiveConnectionsCount()).toBe(1);

      transport.closeAllConnections('Test closure');
      resolveHandler!();
      await promise;

      expect(transport.getActiveConnectionsCount()).toBe(0);
    });
  });
});

describe('createSSEMiddleware', () => {
  it('should create middleware function', () => {
    const handler: AgentHandler = async () => {};
    const middleware = createSSEMiddleware(handler);
    expect(typeof middleware).toBe('function');
  });

  it('should call next() for non-matching paths', () => {
    const handler: AgentHandler = async () => {};
    const middleware = createSSEMiddleware(handler, { path: '/agent/stream' });

    const req = createMockRequest({ url: '/other/path' });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should handle matching path', async () => {
    const handler: AgentHandler = async () => {};
    const middleware = createSSEMiddleware(handler, { path: '/agent/stream' });

    const req = createMockRequest({
      url: '/agent/stream',
      body: { threadId: 'test' },
    });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);
    await waitForResponse(res);

    expect(next).not.toHaveBeenCalled();
    expect(res.getHeaders()['content-type']).toBe('text/event-stream');
  });

  it('should use custom path', () => {
    const handler: AgentHandler = async () => {};
    const middleware = createSSEMiddleware(handler, { path: '/custom/path' });

    const req = createMockRequest({ url: '/agent/stream' });
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
