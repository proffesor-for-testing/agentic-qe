/**
 * Memory Instrumentation - OpenTelemetry spans for memory operations
 *
 * Provides comprehensive tracing for memory store/retrieve/search/delete operations
 * with semantic attributes following OpenTelemetry conventions. Automatically instruments
 * all memory operations with context propagation and performance tracking.
 *
 * @module telemetry/instrumentation/memory
 */

import { Span, SpanStatusCode, trace, context, Context } from '@opentelemetry/api';
import { getTracer } from '../bootstrap';
import { SPAN_NAMES } from '../types';
import { AgentId } from '../../types';

/**
 * Memory store span configuration
 */
export interface MemoryStoreConfig {
  /** Agent performing the memory operation */
  agentId: AgentId;
  /** Memory namespace */
  namespace: string;
  /** Memory key */
  key: string;
  /** Value size in bytes */
  valueSize: number;
  /** Time-to-live in seconds (optional) */
  ttl?: number;
  /** Parent span context */
  parentContext?: Context;
}

/**
 * Memory retrieve span configuration
 */
export interface MemoryRetrieveConfig {
  /** Agent performing the memory operation */
  agentId: AgentId;
  /** Memory namespace */
  namespace: string;
  /** Memory key */
  key: string;
  /** Parent span context */
  parentContext?: Context;
}

/**
 * Memory search span configuration
 */
export interface MemorySearchConfig {
  /** Agent performing the memory operation */
  agentId: AgentId;
  /** Memory namespace */
  namespace: string;
  /** Search pattern (glob or regex) */
  pattern: string;
  /** Maximum number of results */
  limit?: number;
  /** Parent span context */
  parentContext?: Context;
}

/**
 * Memory delete span configuration
 */
export interface MemoryDeleteConfig {
  /** Agent performing the memory operation */
  agentId: AgentId;
  /** Memory namespace */
  namespace: string;
  /** Memory key */
  key: string;
  /** Parent span context */
  parentContext?: Context;
}

/**
 * Memory store operation result
 */
export interface MemoryStoreResult {
  /** Whether the store operation was successful */
  success: boolean;
  /** Operation duration in milliseconds */
  durationMs?: number;
  /** Error if operation failed */
  error?: Error;
}

/**
 * Memory retrieve operation result
 */
export interface MemoryRetrieveResult {
  /** Whether the key was found */
  found: boolean;
  /** Value size in bytes (if found) */
  valueSize?: number;
  /** Operation duration in milliseconds */
  durationMs?: number;
  /** Error if operation failed */
  error?: Error;
}

/**
 * Memory search operation result
 */
export interface MemorySearchResult {
  /** Number of results found */
  resultCount: number;
  /** Operation duration in milliseconds */
  durationMs?: number;
  /** Error if operation failed */
  error?: Error;
}

/**
 * Memory delete operation result
 */
export interface MemoryDeleteResult {
  /** Whether the delete operation was successful */
  success: boolean;
  /** Operation duration in milliseconds */
  durationMs?: number;
  /** Error if operation failed */
  error?: Error;
}

/**
 * Memory operation span manager
 *
 * Manages OpenTelemetry spans for memory operations with automatic
 * context propagation and semantic attribute attachment following
 * OTEL conventions for distributed tracing.
 */
export class MemorySpanManager {
  private readonly tracer = getTracer();
  private activeSpans = new Map<string, Span>();

  /**
   * Start memory store span
   *
   * Records memory store operation with semantic attributes for namespace,
   * key, value size, and optional TTL.
   *
   * @param config - Memory store configuration
   * @returns Active span with context
   */
  startStoreSpan(config: MemoryStoreConfig): { span: Span; context: Context } {
    const { agentId, namespace, key, valueSize, ttl, parentContext } = config;

    const spanContext = parentContext || context.active();
    const span = this.tracer.startSpan(
      SPAN_NAMES.MEMORY_STORE,
      {
        attributes: {
          'memory.operation': 'store',
          'memory.namespace': namespace,
          'memory.key': key,
          'memory.value_size': valueSize,
          'agent.id': agentId.id,
          'agent.type': agentId.type,
          ...(ttl !== undefined && { 'memory.ttl': ttl }),
        },
      },
      spanContext
    );

    // Store span for lifecycle tracking
    const spanKey = `store:${namespace}:${key}`;
    this.activeSpans.set(spanKey, span);

    span.addEvent('memory.store.started', {
      'memory.namespace': namespace,
      'memory.key': key,
      'agent.id': agentId.id,
    });

    // Create context with active span
    const activeContext = trace.setSpan(context.active(), span);

    return { span, context: activeContext };
  }

  /**
   * Complete memory store span
   *
   * @param span - Active span from startStoreSpan
   * @param result - Store operation result
   */
  completeStoreSpan(span: Span, result: MemoryStoreResult): void {
    if (!span) {
      console.warn('[MemorySpanManager] No span provided to completeStoreSpan');
      return;
    }

    // Add performance metrics
    if (result.durationMs !== undefined) {
      span.setAttribute('memory.operation_duration_ms', result.durationMs);
    }

    if (result.success) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent('memory.store.completed', {
        'memory.success': true,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: result.error?.message || 'Memory store failed',
      });
      if (result.error) {
        span.recordException(result.error);
      }
      span.addEvent('memory.store.failed', {
        'error.message': result.error?.message || 'Unknown error',
      });
    }

    span.end();

    // Clean up from active spans
    for (const [key, activeSpan] of this.activeSpans.entries()) {
      if (activeSpan === span) {
        this.activeSpans.delete(key);
        break;
      }
    }
  }

  /**
   * Start memory retrieve span
   *
   * Records memory retrieve operation with semantic attributes for namespace
   * and key lookup.
   *
   * @param config - Memory retrieve configuration
   * @returns Active span with context
   */
  startRetrieveSpan(config: MemoryRetrieveConfig): { span: Span; context: Context } {
    const { agentId, namespace, key, parentContext } = config;

    const spanContext = parentContext || context.active();
    const span = this.tracer.startSpan(
      SPAN_NAMES.MEMORY_RETRIEVE,
      {
        attributes: {
          'memory.operation': 'retrieve',
          'memory.namespace': namespace,
          'memory.key': key,
          'agent.id': agentId.id,
          'agent.type': agentId.type,
        },
      },
      spanContext
    );

    // Store span for lifecycle tracking
    const spanKey = `retrieve:${namespace}:${key}`;
    this.activeSpans.set(spanKey, span);

    span.addEvent('memory.retrieve.started', {
      'memory.namespace': namespace,
      'memory.key': key,
      'agent.id': agentId.id,
    });

    // Create context with active span
    const activeContext = trace.setSpan(context.active(), span);

    return { span, context: activeContext };
  }

  /**
   * Complete memory retrieve span
   *
   * @param span - Active span from startRetrieveSpan
   * @param result - Retrieve operation result
   */
  completeRetrieveSpan(span: Span, result: MemoryRetrieveResult): void {
    if (!span) {
      console.warn('[MemorySpanManager] No span provided to completeRetrieveSpan');
      return;
    }

    // Add result attributes
    span.setAttribute('memory.found', result.found);
    if (result.valueSize !== undefined) {
      span.setAttribute('memory.value_size', result.valueSize);
    }
    if (result.durationMs !== undefined) {
      span.setAttribute('memory.operation_duration_ms', result.durationMs);
    }

    if (result.found && !result.error) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent('memory.retrieve.completed', {
        'memory.found': true,
      });
    } else if (!result.found && !result.error) {
      // Not found is not an error, just unsuccessful retrieval
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent('memory.retrieve.not_found', {
        'memory.found': false,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: result.error?.message || 'Memory retrieve failed',
      });
      if (result.error) {
        span.recordException(result.error);
      }
      span.addEvent('memory.retrieve.failed', {
        'error.message': result.error?.message || 'Unknown error',
      });
    }

    span.end();

    // Clean up from active spans
    for (const [key, activeSpan] of this.activeSpans.entries()) {
      if (activeSpan === span) {
        this.activeSpans.delete(key);
        break;
      }
    }
  }

  /**
   * Start memory search span
   *
   * Records memory search operation with semantic attributes for namespace,
   * search pattern, and result limits.
   *
   * @param config - Memory search configuration
   * @returns Active span with context
   */
  startSearchSpan(config: MemorySearchConfig): { span: Span; context: Context } {
    const { agentId, namespace, pattern, limit, parentContext } = config;

    const spanContext = parentContext || context.active();
    const span = this.tracer.startSpan(
      SPAN_NAMES.MEMORY_SEARCH,
      {
        attributes: {
          'memory.operation': 'search',
          'memory.namespace': namespace,
          'memory.pattern': pattern,
          'agent.id': agentId.id,
          'agent.type': agentId.type,
          ...(limit !== undefined && { 'memory.limit': limit }),
        },
      },
      spanContext
    );

    // Store span for lifecycle tracking
    const spanKey = `search:${namespace}:${pattern}`;
    this.activeSpans.set(spanKey, span);

    span.addEvent('memory.search.started', {
      'memory.namespace': namespace,
      'memory.pattern': pattern,
      'agent.id': agentId.id,
    });

    // Create context with active span
    const activeContext = trace.setSpan(context.active(), span);

    return { span, context: activeContext };
  }

  /**
   * Complete memory search span
   *
   * @param span - Active span from startSearchSpan
   * @param result - Search operation result
   */
  completeSearchSpan(span: Span, result: MemorySearchResult): void {
    if (!span) {
      console.warn('[MemorySpanManager] No span provided to completeSearchSpan');
      return;
    }

    // Add result attributes
    span.setAttribute('memory.result_count', result.resultCount);
    if (result.durationMs !== undefined) {
      span.setAttribute('memory.operation_duration_ms', result.durationMs);
    }

    if (!result.error) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent('memory.search.completed', {
        'memory.result_count': result.resultCount,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: result.error.message || 'Memory search failed',
      });
      span.recordException(result.error);
      span.addEvent('memory.search.failed', {
        'error.message': result.error.message || 'Unknown error',
      });
    }

    span.end();

    // Clean up from active spans
    for (const [key, activeSpan] of this.activeSpans.entries()) {
      if (activeSpan === span) {
        this.activeSpans.delete(key);
        break;
      }
    }
  }

  /**
   * Start memory delete span
   *
   * Records memory delete operation with semantic attributes for namespace
   * and key deletion.
   *
   * @param config - Memory delete configuration
   * @returns Active span with context
   */
  startDeleteSpan(config: MemoryDeleteConfig): { span: Span; context: Context } {
    const { agentId, namespace, key, parentContext } = config;

    const spanContext = parentContext || context.active();
    const span = this.tracer.startSpan(
      'aqe.memory.delete',
      {
        attributes: {
          'memory.operation': 'delete',
          'memory.namespace': namespace,
          'memory.key': key,
          'agent.id': agentId.id,
          'agent.type': agentId.type,
        },
      },
      spanContext
    );

    // Store span for lifecycle tracking
    const spanKey = `delete:${namespace}:${key}`;
    this.activeSpans.set(spanKey, span);

    span.addEvent('memory.delete.started', {
      'memory.namespace': namespace,
      'memory.key': key,
      'agent.id': agentId.id,
    });

    // Create context with active span
    const activeContext = trace.setSpan(context.active(), span);

    return { span, context: activeContext };
  }

  /**
   * Complete memory delete span
   *
   * @param span - Active span from startDeleteSpan
   * @param result - Delete operation result
   */
  completeDeleteSpan(span: Span, result: MemoryDeleteResult): void {
    if (!span) {
      console.warn('[MemorySpanManager] No span provided to completeDeleteSpan');
      return;
    }

    // Add performance metrics
    if (result.durationMs !== undefined) {
      span.setAttribute('memory.operation_duration_ms', result.durationMs);
    }

    if (result.success) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent('memory.delete.completed', {
        'memory.success': true,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: result.error?.message || 'Memory delete failed',
      });
      if (result.error) {
        span.recordException(result.error);
      }
      span.addEvent('memory.delete.failed', {
        'error.message': result.error?.message || 'Unknown error',
      });
    }

    span.end();

    // Clean up from active spans
    for (const [key, activeSpan] of this.activeSpans.entries()) {
      if (activeSpan === span) {
        this.activeSpans.delete(key);
        break;
      }
    }
  }

  /**
   * Record memory operation error
   *
   * Records an error event on the currently active span.
   *
   * @param operation - Operation type (store, retrieve, search, delete)
   * @param namespace - Memory namespace
   * @param key - Memory key (if applicable)
   * @param error - Error that occurred
   */
  recordError(
    operation: 'store' | 'retrieve' | 'search' | 'delete',
    namespace: string,
    key: string | undefined,
    error: Error
  ): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.addEvent('memory.error', {
        'memory.operation': operation,
        'memory.namespace': namespace,
        ...(key && { 'memory.key': key }),
        'error.message': error.message,
        'error.stack': error.stack,
      });
    }
  }

  /**
   * Cleanup all active spans (for graceful shutdown)
   *
   * Ensures all memory operation spans are properly ended during
   * application shutdown or cleanup.
   */
  cleanup(): void {
    for (const [key, span] of this.activeSpans.entries()) {
      console.warn(`[MemorySpanManager] Force-ending orphaned span: ${key}`);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'Span ended during cleanup',
      });
      span.end();
    }
    this.activeSpans.clear();
  }
}

/**
 * Global memory span manager instance
 */
export const memorySpanManager = new MemorySpanManager();

/**
 * Execute function within memory store span context
 *
 * Convenience wrapper that automatically creates, tracks, and completes
 * a memory store span around the provided function.
 *
 * @param config - Memory store configuration
 * @param fn - Function to execute (receives span context)
 * @returns Function result
 *
 * @example
 * const result = await withMemoryStore(
 *   { agentId, namespace: 'aqe', key: 'test-plan', valueSize: 1024 },
 *   async (ctx) => {
 *     return await memoryService.store('test-plan', data);
 *   }
 * );
 */
export async function withMemoryStore<T>(
  config: MemoryStoreConfig,
  fn: (context: Context) => Promise<T>
): Promise<T> {
  const { span, context: spanContext } = memorySpanManager.startStoreSpan(config);
  const startTime = Date.now();

  try {
    const result = await fn(spanContext);
    const durationMs = Date.now() - startTime;

    memorySpanManager.completeStoreSpan(span, {
      success: true,
      durationMs,
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    memorySpanManager.completeStoreSpan(span, {
      success: false,
      durationMs,
      error: error as Error,
    });

    throw error;
  }
}

/**
 * Execute function within memory retrieve span context
 *
 * Convenience wrapper that automatically creates, tracks, and completes
 * a memory retrieve span around the provided function.
 *
 * @param config - Memory retrieve configuration
 * @param fn - Function to execute (receives span context)
 * @returns Function result with found flag
 *
 * @example
 * const { found, value } = await withMemoryRetrieve(
 *   { agentId, namespace: 'aqe', key: 'test-plan' },
 *   async (ctx) => {
 *     return await memoryService.retrieve('test-plan');
 *   }
 * );
 */
export async function withMemoryRetrieve<T>(
  config: MemoryRetrieveConfig,
  fn: (context: Context) => Promise<{ found: boolean; value?: T; valueSize?: number }>
): Promise<{ found: boolean; value?: T; valueSize?: number }> {
  const { span, context: spanContext } = memorySpanManager.startRetrieveSpan(config);
  const startTime = Date.now();

  try {
    const result = await fn(spanContext);
    const durationMs = Date.now() - startTime;

    memorySpanManager.completeRetrieveSpan(span, {
      found: result.found,
      valueSize: result.valueSize,
      durationMs,
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    memorySpanManager.completeRetrieveSpan(span, {
      found: false,
      durationMs,
      error: error as Error,
    });

    throw error;
  }
}

/**
 * Execute function within memory search span context
 *
 * Convenience wrapper that automatically creates, tracks, and completes
 * a memory search span around the provided function.
 *
 * @param config - Memory search configuration
 * @param fn - Function to execute (receives span context)
 * @returns Function result with result count
 *
 * @example
 * const results = await withMemorySearch(
 *   { agentId, namespace: 'aqe', pattern: 'test-*', limit: 10 },
 *   async (ctx) => {
 *     return await memoryService.search('test-*');
 *   }
 * );
 */
export async function withMemorySearch<T>(
  config: MemorySearchConfig,
  fn: (context: Context) => Promise<T[]>
): Promise<T[]> {
  const { span, context: spanContext } = memorySpanManager.startSearchSpan(config);
  const startTime = Date.now();

  try {
    const results = await fn(spanContext);
    const durationMs = Date.now() - startTime;

    memorySpanManager.completeSearchSpan(span, {
      resultCount: results.length,
      durationMs,
    });

    return results;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    memorySpanManager.completeSearchSpan(span, {
      resultCount: 0,
      durationMs,
      error: error as Error,
    });

    throw error;
  }
}

/**
 * Execute function within memory delete span context
 *
 * Convenience wrapper that automatically creates, tracks, and completes
 * a memory delete span around the provided function.
 *
 * @param config - Memory delete configuration
 * @param fn - Function to execute (receives span context)
 * @returns Function result
 *
 * @example
 * await withMemoryDelete(
 *   { agentId, namespace: 'aqe', key: 'test-plan' },
 *   async (ctx) => {
 *     await memoryService.delete('test-plan');
 *   }
 * );
 */
export async function withMemoryDelete<T>(
  config: MemoryDeleteConfig,
  fn: (context: Context) => Promise<T>
): Promise<T> {
  const { span, context: spanContext } = memorySpanManager.startDeleteSpan(config);
  const startTime = Date.now();

  try {
    const result = await fn(spanContext);
    const durationMs = Date.now() - startTime;

    memorySpanManager.completeDeleteSpan(span, {
      success: true,
      durationMs,
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    memorySpanManager.completeDeleteSpan(span, {
      success: false,
      durationMs,
      error: error as Error,
    });

    throw error;
  }
}
