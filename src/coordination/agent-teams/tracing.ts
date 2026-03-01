/**
 * Agentic QE v3 - Distributed Tracing for Agent Teams
 * ADR-064 Phase 3: Learning & Observability
 *
 * Provides trace context propagation across agent messages, enabling
 * end-to-end visibility into multi-agent workflows. Trace contexts are
 * encoded into the existing `correlationId` field on AgentMessage so
 * no schema changes are required.
 *
 * Usage:
 * ```typescript
 * import { createTraceCollector, encodeTraceContext } from './tracing.js';
 *
 * const collector = createTraceCollector();
 *
 * // Start a root trace for an incoming request
 * const { context, span } = collector.startTrace({
 *   operationName: 'generate-tests',
 *   agentId: 'lead-1',
 *   domain: 'test-generation',
 * });
 *
 * // Propagate context via correlationId
 * adapter.sendMessage('lead-1', 'agent-a', 'task-assignment', payload, {
 *   correlationId: encodeTraceContext(context),
 * });
 *
 * // On the receiving side, extract and continue the trace
 * const parentCtx = extractTraceContext(message.correlationId);
 * const child = collector.startSpan({
 *   operationName: 'execute-task',
 *   agentId: 'agent-a',
 *   domain: 'test-generation',
 *   parentContext: parentCtx,
 * });
 *
 * // Complete or fail the span
 * collector.completeSpan(child.span.spanId);
 * ```
 */

import { randomUUID } from 'node:crypto';
import { safeJsonParse } from '../../shared/safe-json.js';

// ============================================================================
// Trace Context
// ============================================================================

/**
 * Trace context propagated across agent messages.
 * Follows W3C Trace Context semantics adapted for in-process agent messaging.
 */
export interface TraceContext {
  /** Root trace ID (same across all spans in a trace) */
  readonly traceId: string;
  /** Current span ID */
  readonly spanId: string;
  /** Parent span ID (undefined for root spans) */
  readonly parentSpanId?: string;
  /** Baggage: key-value pairs propagated through the trace */
  readonly baggage?: Record<string, string>;
}

// ============================================================================
// Trace Span
// ============================================================================

/**
 * A recorded span in the trace, representing a single unit of work
 * performed by an agent within a domain.
 */
export interface TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly operationName: string;
  readonly agentId: string;
  readonly domain: string;
  readonly startTime: number;
  endTime?: number;
  readonly tags: Record<string, string | number | boolean>;
  readonly status: 'active' | 'completed' | 'error';
  readonly errorMessage?: string;
}

// ============================================================================
// Start Span Options
// ============================================================================

/** Options for starting a new span */
export interface StartSpanOptions {
  /** Name of the operation being traced */
  readonly operationName: string;
  /** Agent performing the operation */
  readonly agentId: string;
  /** Domain the operation belongs to */
  readonly domain: string;
  /** Parent trace context (omit to start a root span via startTrace) */
  readonly parentContext?: TraceContext;
  /** Optional tags to attach to the span */
  readonly tags?: Record<string, string | number | boolean>;
}

// ============================================================================
// Trace Collector
// ============================================================================

/**
 * Collects, stores, and queries trace spans across agent workflows.
 * Spans are stored in memory with configurable capacity and automatic
 * purging of completed traces.
 */
export class TraceCollector {
  private readonly spans = new Map<string, TraceSpan>();
  private readonly traceIndex = new Map<string, Set<string>>();
  private readonly maxSpans: number;

  constructor(maxSpans: number = 10_000) {
    this.maxSpans = maxSpans;
  }

  // --------------------------------------------------------------------------
  // Span Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start a new root trace. Creates a fresh traceId and root span.
   *
   * @param options - Operation metadata (parentContext is ignored)
   * @returns The new trace context and root span
   */
  startTrace(
    options: Omit<StartSpanOptions, 'parentContext'>
  ): { context: TraceContext; span: TraceSpan } {
    const traceId = randomUUID();
    const spanId = randomUUID();
    const context: TraceContext = { traceId, spanId };
    const span = this.createSpan(context, options);
    return { context, span };
  }

  /**
   * Start a child span within an existing trace.
   * If `parentContext` is provided, the child inherits the traceId and
   * records the parent's spanId as its parentSpanId.
   * If no parentContext is provided, a new root trace is started.
   *
   * @param options - Operation metadata including optional parent context
   * @returns The new trace context and child span
   */
  startSpan(
    options: StartSpanOptions
  ): { context: TraceContext; span: TraceSpan } {
    const parentContext = options.parentContext;
    const traceId = parentContext?.traceId ?? randomUUID();
    const spanId = randomUUID();
    const context: TraceContext = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      baggage: parentContext?.baggage,
    };
    const span = this.createSpan(context, options);
    return { context, span };
  }

  /**
   * Mark a span as successfully completed.
   *
   * @param spanId - The span to complete
   */
  completeSpan(spanId: string): void {
    const span = this.spans.get(spanId);
    if (span) {
      (span as { endTime: number }).endTime = Date.now();
      (span as { status: string }).status = 'completed';
    }
  }

  /**
   * Mark a span as failed with an error message.
   *
   * @param spanId - The span to fail
   * @param errorMessage - Description of the failure
   */
  failSpan(spanId: string, errorMessage: string): void {
    const span = this.spans.get(spanId);
    if (span) {
      (span as { endTime: number }).endTime = Date.now();
      (span as { status: string }).status = 'error';
      (span as { errorMessage: string }).errorMessage = errorMessage;
    }
  }

  // --------------------------------------------------------------------------
  // Query
  // --------------------------------------------------------------------------

  /**
   * Get all spans belonging to a trace, ordered by start time.
   *
   * @param traceId - The trace to retrieve
   * @returns Spans sorted by startTime (empty if trace not found)
   */
  getTrace(traceId: string): TraceSpan[] {
    const spanIds = this.traceIndex.get(traceId);
    if (!spanIds) return [];
    return Array.from(spanIds)
      .map(id => this.spans.get(id))
      .filter((s): s is TraceSpan => s !== undefined)
      .sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get a single span by its ID.
   *
   * @param spanId - The span to retrieve
   * @returns The span or undefined if not found
   */
  getSpan(spanId: string): TraceSpan | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Get all currently active (not yet completed or failed) spans.
   *
   * @returns Array of active spans
   */
  getActiveSpans(): TraceSpan[] {
    return Array.from(this.spans.values()).filter(s => s.status === 'active');
  }

  /**
   * Get summary statistics about the collector's state.
   *
   * @returns Counts of total spans, active traces, and completed traces
   */
  getStats(): {
    totalSpans: number;
    activeTraces: number;
    completedTraces: number;
  } {
    const activeTraces = new Set<string>();
    const completedTraces = new Set<string>();

    for (const [traceId, spanIds] of this.traceIndex) {
      const spans = Array.from(spanIds)
        .map(id => this.spans.get(id))
        .filter((s): s is TraceSpan => s !== undefined);

      if (spans.some(s => s.status === 'active')) {
        activeTraces.add(traceId);
      } else {
        completedTraces.add(traceId);
      }
    }

    return {
      totalSpans: this.spans.size,
      activeTraces: activeTraces.size,
      completedTraces: completedTraces.size,
    };
  }

  // --------------------------------------------------------------------------
  // Maintenance
  // --------------------------------------------------------------------------

  /**
   * Purge completed traces whose spans are all older than `maxAge` ms.
   * Only removes traces where every span has finished (completed or error)
   * and all end/start timestamps are past the cutoff.
   *
   * @param maxAge - Maximum age in milliseconds
   * @returns Number of spans removed
   */
  purge(maxAge: number): number {
    const cutoff = Date.now() - maxAge;
    let removed = 0;

    for (const [traceId, spanIds] of this.traceIndex) {
      const spans = Array.from(spanIds)
        .map(id => this.spans.get(id))
        .filter((s): s is TraceSpan => s !== undefined);

      const allCompleted = spans.every(s => s.status !== 'active');
      const allOld = spans.every(
        s => (s.endTime ?? s.startTime) < cutoff
      );

      if (allCompleted && allOld) {
        for (const id of spanIds) {
          this.spans.delete(id);
          removed++;
        }
        this.traceIndex.delete(traceId);
      }
    }

    return removed;
  }

  /**
   * Dispose the collector, clearing all stored spans and indexes.
   */
  dispose(): void {
    this.spans.clear();
    this.traceIndex.clear();
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private createSpan(
    context: TraceContext,
    options: Omit<StartSpanOptions, 'parentContext'>
  ): TraceSpan {
    // Enforce max spans limit with auto-purge
    if (this.spans.size >= this.maxSpans) {
      this.purge(60_000);
    }

    const span: TraceSpan = {
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      operationName: options.operationName,
      agentId: options.agentId,
      domain: options.domain,
      startTime: Date.now(),
      tags: options.tags ?? {},
      status: 'active',
    };

    this.spans.set(context.spanId, span);

    let traceSpans = this.traceIndex.get(context.traceId);
    if (!traceSpans) {
      traceSpans = new Set();
      this.traceIndex.set(context.traceId, traceSpans);
    }
    traceSpans.add(context.spanId);

    return span;
  }
}

// ============================================================================
// Context Serialization
// ============================================================================

/** Prefix used to identify trace-encoded correlation IDs */
const TRACE_PREFIX = 'trace:';

/**
 * Extract a TraceContext from an AgentMessage's correlationId field.
 * Returns undefined if the correlationId is not trace-encoded or is malformed.
 *
 * @param correlationId - The correlationId string from an AgentMessage
 * @returns Parsed TraceContext or undefined
 */
export function extractTraceContext(
  correlationId?: string
): TraceContext | undefined {
  if (!correlationId || !correlationId.startsWith(TRACE_PREFIX)) {
    return undefined;
  }

  try {
    const json = correlationId.slice(TRACE_PREFIX.length);
    const parsed = safeJsonParse<Record<string, unknown>>(json);

    if (
      typeof parsed.traceId === 'string' &&
      typeof parsed.spanId === 'string'
    ) {
      return {
        traceId: parsed.traceId,
        spanId: parsed.spanId,
        parentSpanId:
          typeof parsed.parentSpanId === 'string'
            ? parsed.parentSpanId
            : undefined,
      } as TraceContext;
    }
  } catch {
    // Not a trace-encoded correlation ID — return undefined
  }

  return undefined;
}

/**
 * Encode a TraceContext into a correlationId string that can be set on
 * an AgentMessage. The encoding uses a `trace:` prefix followed by JSON.
 *
 * @param context - The trace context to encode
 * @returns Encoded correlationId string
 */
export function encodeTraceContext(context: TraceContext): string {
  return `${TRACE_PREFIX}${JSON.stringify({
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
  })}`;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TraceCollector instance.
 *
 * @param maxSpans - Maximum number of spans to retain (default 10,000)
 * @returns A fresh TraceCollector
 */
export function createTraceCollector(maxSpans?: number): TraceCollector {
  return new TraceCollector(maxSpans);
}
