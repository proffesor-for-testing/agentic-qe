/**
 * Agentic QE v3 - Session Durability Middleware
 *
 * IMP-04: Transcript-First Session Durability
 * Middleware factory that registers pre/post/error hooks on the
 * MiddlewareChain to log every tool call lifecycle event into
 * the SessionStore.
 *
 * @module mcp/services/session-durability-middleware
 */

import type { ToolMiddleware, ToolCallContext } from '../middleware/middleware-chain';
import type { SessionStore } from './session-store';

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Creates a ToolMiddleware that appends session entries for every
 * tool call, result, and error. Registers at priority 50.
 *
 * - preToolCall:  appends a `tool_call` entry with state='running'
 * - postToolResult: appends a `tool_result` entry with state='idle'
 * - onError: appends an `error` entry with state='requires_action'
 */
export function createSessionDurabilityMiddleware(store: SessionStore): ToolMiddleware {
  return {
    name: 'session-durability',
    priority: 50,

    async preToolCall(context: ToolCallContext): Promise<ToolCallContext> {
      store.append({
        timestamp: context.timestamp,
        type: 'tool_call',
        toolName: context.toolName,
        params: context.params,
        state: 'running',
      });
      return context;
    },

    async postToolResult(context: ToolCallContext, result: unknown): Promise<unknown> {
      store.append({
        timestamp: Date.now(),
        type: 'tool_result',
        toolName: context.toolName,
        result,
        state: 'idle',
      });
      return result;
    },

    async onError(context: ToolCallContext, error: Error): Promise<void> {
      store.append({
        timestamp: Date.now(),
        type: 'error',
        toolName: context.toolName,
        result: { message: error.message, stack: error.stack },
        state: 'requires_action',
      });
    },
  };
}
