/**
 * ADR-064 Fix Tests: Adapter Tracing Integration + Latency Benchmark
 *
 * Verifies:
 * 1. sendMessage() encodes TraceContext into correlationId when provided
 * 2. broadcast() encodes TraceContext into correlationId when provided
 * 3. extractTraceContext() can decode the correlationId back
 * 4. Adapter round-trip latency is <500ms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentTeamsAdapter } from '../../src/coordination/agent-teams/adapter.js';
import {
  extractTraceContext,
  encodeTraceContext,
  type TraceContext,
} from '../../src/coordination/agent-teams/tracing.js';

describe('ADR-064: Adapter Tracing Integration', () => {
  let adapter: AgentTeamsAdapter;

  beforeEach(() => {
    adapter = new AgentTeamsAdapter();
    adapter.initialize();
    adapter.registerAgent('agent-a', 'test-generation');
    adapter.registerAgent('agent-b', 'test-generation');
  });

  it('sendMessage() encodes TraceContext into correlationId', () => {
    const traceCtx: TraceContext = {
      traceId: 'trace-001',
      spanId: 'span-001',
      parentSpanId: 'span-000',
    };

    const msg = adapter.sendMessage(
      'agent-a', 'agent-b', 'task-assignment', { data: 'test' },
      { traceContext: traceCtx },
    );

    expect(msg.correlationId).toBeDefined();
    expect(msg.correlationId!.startsWith('trace:')).toBe(true);

    const extracted = extractTraceContext(msg.correlationId);
    expect(extracted).toBeDefined();
    expect(extracted!.traceId).toBe('trace-001');
    expect(extracted!.spanId).toBe('span-001');
    expect(extracted!.parentSpanId).toBe('span-000');
  });

  it('sendMessage() uses plain correlationId when no traceContext provided', () => {
    const msg = adapter.sendMessage(
      'agent-a', 'agent-b', 'finding', { data: 'test' },
      { correlationId: 'plain-id' },
    );

    expect(msg.correlationId).toBe('plain-id');
    expect(extractTraceContext(msg.correlationId)).toBeUndefined();
  });

  it('sendMessage() traceContext overrides correlationId', () => {
    const traceCtx: TraceContext = {
      traceId: 'trace-002',
      spanId: 'span-002',
    };

    const msg = adapter.sendMessage(
      'agent-a', 'agent-b', 'alert', {},
      { correlationId: 'should-be-overridden', traceContext: traceCtx },
    );

    // traceContext wins
    expect(msg.correlationId!.startsWith('trace:')).toBe(true);
    const extracted = extractTraceContext(msg.correlationId);
    expect(extracted!.traceId).toBe('trace-002');
  });

  it('broadcast() encodes TraceContext into correlationId', () => {
    const traceCtx: TraceContext = {
      traceId: 'trace-003',
      spanId: 'span-003',
    };

    const msg = adapter.broadcast(
      'test-generation', 'alert', { alert: true },
      { from: 'agent-a', traceContext: traceCtx },
    );

    expect(msg.correlationId).toBeDefined();
    expect(msg.correlationId!.startsWith('trace:')).toBe(true);

    const extracted = extractTraceContext(msg.correlationId);
    expect(extracted).toBeDefined();
    expect(extracted!.traceId).toBe('trace-003');
    expect(extracted!.spanId).toBe('span-003');
  });

  it('broadcast() uses plain correlationId when no traceContext provided', () => {
    const msg = adapter.broadcast(
      'test-generation', 'consensus', {},
      { from: 'agent-a', correlationId: 'broadcast-id' },
    );

    expect(msg.correlationId).toBe('broadcast-id');
  });
});

describe('ADR-064: Adapter Latency Benchmark', () => {
  it('sendMessage() round-trip completes in <500ms', () => {
    const adapter = new AgentTeamsAdapter();
    adapter.initialize();
    adapter.registerAgent('sender', 'test-generation');
    adapter.registerAgent('receiver', 'test-generation');

    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      adapter.sendMessage(
        'sender', 'receiver', 'task-assignment',
        { iteration: i },
      );
    }

    const elapsed = performance.now() - start;
    const avgLatency = elapsed / iterations;

    // Each sendMessage should complete well under 500ms
    expect(avgLatency).toBeLessThan(500);
    // In practice, in-memory should be <1ms per message
    expect(avgLatency).toBeLessThan(10);

    // Verify all messages were delivered
    const messages = adapter.receiveMessages('receiver');
    expect(messages.length).toBe(iterations);

    adapter.shutdown();
  });

  it('broadcast() round-trip completes in <500ms', () => {
    const adapter = new AgentTeamsAdapter();
    adapter.initialize();
    adapter.registerAgent('broadcaster', 'coverage-analysis');
    adapter.registerAgent('listener-1', 'coverage-analysis');
    adapter.registerAgent('listener-2', 'coverage-analysis');

    const iterations = 50;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      adapter.broadcast(
        'coverage-analysis', 'alert', { iteration: i },
        { from: 'broadcaster' },
      );
    }

    const elapsed = performance.now() - start;
    const avgLatency = elapsed / iterations;

    expect(avgLatency).toBeLessThan(500);
    expect(avgLatency).toBeLessThan(10);

    // Verify delivery to both listeners (not broadcaster)
    const msgs1 = adapter.receiveMessages('listener-1');
    const msgs2 = adapter.receiveMessages('listener-2');
    expect(msgs1.length).toBe(iterations);
    expect(msgs2.length).toBe(iterations);

    adapter.shutdown();
  });

  it('sendMessage() with traceContext encoding completes in <500ms', () => {
    const adapter = new AgentTeamsAdapter();
    adapter.initialize();
    adapter.registerAgent('traced-sender', 'security-compliance');
    adapter.registerAgent('traced-receiver', 'security-compliance');

    const traceCtx: TraceContext = {
      traceId: 'benchmark-trace',
      spanId: 'benchmark-span',
      parentSpanId: 'benchmark-parent',
    };

    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      adapter.sendMessage(
        'traced-sender', 'traced-receiver', 'finding',
        { iteration: i },
        { traceContext: traceCtx },
      );
    }

    const elapsed = performance.now() - start;
    const avgLatency = elapsed / iterations;

    expect(avgLatency).toBeLessThan(500);

    // Verify trace context survives round-trip
    const messages = adapter.receiveMessages('traced-receiver');
    expect(messages.length).toBe(iterations);
    for (const msg of messages) {
      const extracted = extractTraceContext(msg.correlationId);
      expect(extracted).toBeDefined();
      expect(extracted!.traceId).toBe('benchmark-trace');
    }

    adapter.shutdown();
  });
});
