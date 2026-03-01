/**
 * Unit tests for Distributed Tracing — TraceCollector, encodeTraceContext, extractTraceContext
 * ADR-064 Phase 3: Learning & Observability
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TraceCollector,
  createTraceCollector,
  encodeTraceContext,
  extractTraceContext,
} from '../../src/coordination/agent-teams/tracing.js';
import type { TraceContext } from '../../src/coordination/agent-teams/tracing.js';

// ============================================================================
// Helpers
// ============================================================================

/** Default span options used by most tests */
const defaultOpts = {
  operationName: 'test-op',
  agentId: 'agent-1',
  domain: 'test-generation',
} as const;

// ============================================================================
// TraceCollector Tests
// ============================================================================

describe('TraceCollector', () => {
  let collector: TraceCollector;

  beforeEach(() => {
    collector = createTraceCollector();
  });

  // --------------------------------------------------------------------------
  // startTrace
  // --------------------------------------------------------------------------

  describe('startTrace', () => {
    it('creates a root trace with unique traceId and spanId', () => {
      const { context, span } = collector.startTrace(defaultOpts);

      expect(context.traceId).toBeDefined();
      expect(context.spanId).toBeDefined();
      expect(context.traceId).not.toBe(context.spanId);

      expect(span.traceId).toBe(context.traceId);
      expect(span.spanId).toBe(context.spanId);
      expect(span.parentSpanId).toBeUndefined();
      expect(span.operationName).toBe('test-op');
      expect(span.agentId).toBe('agent-1');
      expect(span.domain).toBe('test-generation');
      expect(span.status).toBe('active');
      expect(span.startTime).toBeGreaterThan(0);
    });

    it('creates unique IDs on each call', () => {
      const first = collector.startTrace(defaultOpts);
      const second = collector.startTrace(defaultOpts);

      expect(first.context.traceId).not.toBe(second.context.traceId);
      expect(first.context.spanId).not.toBe(second.context.spanId);
    });
  });

  // --------------------------------------------------------------------------
  // startSpan
  // --------------------------------------------------------------------------

  describe('startSpan', () => {
    it('creates a child span inheriting traceId from parent', () => {
      const root = collector.startTrace(defaultOpts);

      const child = collector.startSpan({
        ...defaultOpts,
        operationName: 'child-op',
        agentId: 'agent-2',
        parentContext: root.context,
      });

      expect(child.context.traceId).toBe(root.context.traceId);
      expect(child.context.spanId).not.toBe(root.context.spanId);
      expect(child.context.parentSpanId).toBe(root.context.spanId);

      expect(child.span.traceId).toBe(root.context.traceId);
      expect(child.span.parentSpanId).toBe(root.context.spanId);
      expect(child.span.operationName).toBe('child-op');
      expect(child.span.agentId).toBe('agent-2');
      expect(child.span.status).toBe('active');
    });

    it('creates a new root trace when no parentContext is provided', () => {
      const { context, span } = collector.startSpan({
        ...defaultOpts,
        operationName: 'orphan-op',
      });

      expect(context.traceId).toBeDefined();
      expect(context.spanId).toBeDefined();
      expect(context.parentSpanId).toBeUndefined();
      expect(span.parentSpanId).toBeUndefined();
      expect(span.operationName).toBe('orphan-op');
      expect(span.status).toBe('active');
    });

    it('propagates baggage from parent context', () => {
      const root = collector.startTrace(defaultOpts);
      const parentWithBaggage: TraceContext = {
        ...root.context,
        baggage: { tenant: 'acme', env: 'test' },
      };

      const child = collector.startSpan({
        ...defaultOpts,
        parentContext: parentWithBaggage,
      });

      expect(child.context.baggage).toEqual({ tenant: 'acme', env: 'test' });
    });
  });

  // --------------------------------------------------------------------------
  // completeSpan
  // --------------------------------------------------------------------------

  describe('completeSpan', () => {
    it('sets endTime and status to completed', () => {
      const { span } = collector.startTrace(defaultOpts);
      expect(span.status).toBe('active');
      expect(span.endTime).toBeUndefined();

      collector.completeSpan(span.spanId);

      const retrieved = collector.getSpan(span.spanId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe('completed');
      expect(retrieved!.endTime).toBeGreaterThan(0);
    });

    it('does nothing for unknown spanId', () => {
      // Should not throw
      collector.completeSpan('nonexistent-span');
    });
  });

  // --------------------------------------------------------------------------
  // failSpan
  // --------------------------------------------------------------------------

  describe('failSpan', () => {
    it('sets status to error and records errorMessage', () => {
      const { span } = collector.startTrace(defaultOpts);

      collector.failSpan(span.spanId, 'Something went wrong');

      const retrieved = collector.getSpan(span.spanId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe('error');
      expect(retrieved!.errorMessage).toBe('Something went wrong');
      expect(retrieved!.endTime).toBeGreaterThan(0);
    });

    it('does nothing for unknown spanId', () => {
      // Should not throw
      collector.failSpan('nonexistent-span', 'err');
    });
  });

  // --------------------------------------------------------------------------
  // getTrace
  // --------------------------------------------------------------------------

  describe('getTrace', () => {
    it('returns all spans for a traceId sorted by startTime', () => {
      const root = collector.startTrace(defaultOpts);

      // Create two children with staggered start times
      const child1 = collector.startSpan({
        ...defaultOpts,
        operationName: 'child-1',
        parentContext: root.context,
      });

      const child2 = collector.startSpan({
        ...defaultOpts,
        operationName: 'child-2',
        parentContext: root.context,
      });

      const spans = collector.getTrace(root.context.traceId);
      expect(spans).toHaveLength(3);
      expect(spans[0].spanId).toBe(root.span.spanId);

      // Verify sorted by startTime (ascending)
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i].startTime).toBeGreaterThanOrEqual(spans[i - 1].startTime);
      }
    });

    it('returns empty array for unknown traceId', () => {
      const spans = collector.getTrace('unknown-trace-id');
      expect(spans).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getSpan
  // --------------------------------------------------------------------------

  describe('getSpan', () => {
    it('returns a single span by spanId', () => {
      const { span } = collector.startTrace(defaultOpts);

      const retrieved = collector.getSpan(span.spanId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.spanId).toBe(span.spanId);
      expect(retrieved!.operationName).toBe(defaultOpts.operationName);
    });

    it('returns undefined for unknown spanId', () => {
      expect(collector.getSpan('does-not-exist')).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getActiveSpans
  // --------------------------------------------------------------------------

  describe('getActiveSpans', () => {
    it('returns only active spans', () => {
      const root = collector.startTrace(defaultOpts);
      const child = collector.startSpan({
        ...defaultOpts,
        operationName: 'child',
        parentContext: root.context,
      });

      // Complete the root span
      collector.completeSpan(root.span.spanId);

      const activeSpans = collector.getActiveSpans();
      expect(activeSpans).toHaveLength(1);
      expect(activeSpans[0].spanId).toBe(child.span.spanId);
      expect(activeSpans[0].status).toBe('active');
    });

    it('returns empty array when all spans are completed', () => {
      const { span } = collector.startTrace(defaultOpts);
      collector.completeSpan(span.spanId);

      expect(collector.getActiveSpans()).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getStats
  // --------------------------------------------------------------------------

  describe('getStats', () => {
    it('counts active and completed traces correctly', () => {
      // Create two traces
      const trace1 = collector.startTrace({ ...defaultOpts, operationName: 'trace-1' });
      const trace2 = collector.startTrace({ ...defaultOpts, operationName: 'trace-2' });

      // Complete all spans in trace 1
      collector.completeSpan(trace1.span.spanId);

      const stats = collector.getStats();
      expect(stats.totalSpans).toBe(2);
      expect(stats.activeTraces).toBe(1);   // trace2 still active
      expect(stats.completedTraces).toBe(1); // trace1 fully completed
    });

    it('treats a trace as active if any span is still active', () => {
      const root = collector.startTrace(defaultOpts);
      const child = collector.startSpan({
        ...defaultOpts,
        operationName: 'child',
        parentContext: root.context,
      });

      // Complete root but leave child active
      collector.completeSpan(root.span.spanId);

      const stats = collector.getStats();
      expect(stats.totalSpans).toBe(2);
      expect(stats.activeTraces).toBe(1);
      expect(stats.completedTraces).toBe(0);
    });

    it('returns zeros on empty collector', () => {
      const stats = collector.getStats();
      expect(stats.totalSpans).toBe(0);
      expect(stats.activeTraces).toBe(0);
      expect(stats.completedTraces).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // purge
  // --------------------------------------------------------------------------

  describe('purge', () => {
    it('removes completed traces older than maxAge', () => {
      // Use vi.spyOn to control Date.now
      const now = 1_000_000;
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      const { span } = collector.startTrace(defaultOpts);
      collector.completeSpan(span.spanId);

      // Advance time past maxAge
      dateSpy.mockReturnValue(now + 120_000);

      const removed = collector.purge(60_000);
      expect(removed).toBe(1);

      // Span should be gone
      expect(collector.getSpan(span.spanId)).toBeUndefined();
      expect(collector.getStats().totalSpans).toBe(0);

      dateSpy.mockRestore();
    });

    it('does not remove active traces', () => {
      const now = 1_000_000;
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      const { span } = collector.startTrace(defaultOpts);
      // Leave span active (do not complete)

      // Advance time
      dateSpy.mockReturnValue(now + 120_000);

      const removed = collector.purge(60_000);
      expect(removed).toBe(0);

      // Span should still exist
      expect(collector.getSpan(span.spanId)).toBeDefined();

      dateSpy.mockRestore();
    });

    it('does not remove recent completed traces', () => {
      const { span } = collector.startTrace(defaultOpts);
      collector.completeSpan(span.spanId);

      // Purge with a large maxAge (traces are not old enough)
      const removed = collector.purge(999_999_999);
      expect(removed).toBe(0);
      expect(collector.getSpan(span.spanId)).toBeDefined();
    });

    it('removes multi-span traces only when all spans are completed and old', () => {
      const now = 1_000_000;
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      const root = collector.startTrace(defaultOpts);
      const child = collector.startSpan({
        ...defaultOpts,
        operationName: 'child',
        parentContext: root.context,
      });

      // Complete root but leave child active
      collector.completeSpan(root.span.spanId);

      dateSpy.mockReturnValue(now + 120_000);

      // Should NOT purge because child is still active
      expect(collector.purge(60_000)).toBe(0);

      // Now complete the child
      collector.completeSpan(child.span.spanId);

      dateSpy.mockReturnValue(now + 240_000);

      // Now purge should remove both
      expect(collector.purge(60_000)).toBe(2);
      expect(collector.getStats().totalSpans).toBe(0);

      dateSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // auto-purge on maxSpans
  // --------------------------------------------------------------------------

  describe('auto-purge when maxSpans limit reached', () => {
    it('triggers purge when span count reaches maxSpans', () => {
      const now = 1_000_000;
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      // Create a collector with a very small limit
      const smallCollector = createTraceCollector(3);

      // Create and complete 3 spans
      const t1 = smallCollector.startTrace({ ...defaultOpts, operationName: 'op-1' });
      smallCollector.completeSpan(t1.span.spanId);

      const t2 = smallCollector.startTrace({ ...defaultOpts, operationName: 'op-2' });
      smallCollector.completeSpan(t2.span.spanId);

      const t3 = smallCollector.startTrace({ ...defaultOpts, operationName: 'op-3' });
      smallCollector.completeSpan(t3.span.spanId);

      // Advance time beyond auto-purge threshold (60s)
      dateSpy.mockReturnValue(now + 120_000);

      // This 4th span should trigger auto-purge (purge with 60_000ms)
      const t4 = smallCollector.startTrace({ ...defaultOpts, operationName: 'op-4' });

      // Old completed traces should be purged; only the new span remains
      const stats = smallCollector.getStats();
      expect(stats.totalSpans).toBe(1);
      expect(smallCollector.getSpan(t4.span.spanId)).toBeDefined();

      dateSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // dispose
  // --------------------------------------------------------------------------

  describe('dispose', () => {
    it('clears all spans and indexes', () => {
      collector.startTrace(defaultOpts);
      collector.startTrace(defaultOpts);

      expect(collector.getStats().totalSpans).toBe(2);

      collector.dispose();

      expect(collector.getStats().totalSpans).toBe(0);
      expect(collector.getActiveSpans()).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // tags
  // --------------------------------------------------------------------------

  describe('tags', () => {
    it('stores tags on span when provided', () => {
      const { span } = collector.startTrace({
        ...defaultOpts,
        tags: { priority: 'high', retryCount: 3, isFlaky: true },
      });

      expect(span.tags).toEqual({ priority: 'high', retryCount: 3, isFlaky: true });
    });

    it('defaults to empty tags object when not provided', () => {
      const { span } = collector.startTrace(defaultOpts);
      expect(span.tags).toEqual({});
    });
  });
});

// ============================================================================
// Context Serialization Tests
// ============================================================================

describe('encodeTraceContext / extractTraceContext', () => {
  it('round-trips: encode then extract returns same context', () => {
    const original: TraceContext = {
      traceId: 'trace-abc-123',
      spanId: 'span-def-456',
      parentSpanId: 'span-parent-789',
    };

    const encoded = encodeTraceContext(original);
    const decoded = extractTraceContext(encoded);

    expect(decoded).toBeDefined();
    expect(decoded!.traceId).toBe(original.traceId);
    expect(decoded!.spanId).toBe(original.spanId);
    expect(decoded!.parentSpanId).toBe(original.parentSpanId);
  });

  it('round-trips context without parentSpanId', () => {
    const original: TraceContext = {
      traceId: 'trace-root',
      spanId: 'span-root',
    };

    const encoded = encodeTraceContext(original);
    const decoded = extractTraceContext(encoded);

    expect(decoded).toBeDefined();
    expect(decoded!.traceId).toBe('trace-root');
    expect(decoded!.spanId).toBe('span-root');
    expect(decoded!.parentSpanId).toBeUndefined();
  });

  it('encoded string starts with trace: prefix', () => {
    const encoded = encodeTraceContext({
      traceId: 't',
      spanId: 's',
    });
    expect(encoded.startsWith('trace:')).toBe(true);
  });

  it('returns undefined for non-trace strings', () => {
    expect(extractTraceContext('some-random-correlation-id')).toBeUndefined();
    expect(extractTraceContext('not-trace-prefixed')).toBeUndefined();
    expect(extractTraceContext('')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(extractTraceContext(undefined)).toBeUndefined();
  });

  it('returns undefined for malformed JSON after trace: prefix', () => {
    expect(extractTraceContext('trace:{invalid-json')).toBeUndefined();
    expect(extractTraceContext('trace:')).toBeUndefined();
    expect(extractTraceContext('trace:null')).toBeUndefined();
  });

  it('returns undefined when JSON lacks required fields', () => {
    // Valid JSON but missing required fields
    expect(extractTraceContext('trace:{"foo":"bar"}')).toBeUndefined();
    expect(extractTraceContext('trace:{"traceId":"t"}')).toBeUndefined();
    expect(extractTraceContext('trace:{"spanId":"s"}')).toBeUndefined();
  });
});
