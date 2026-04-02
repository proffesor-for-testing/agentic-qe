/**
 * Agentic QE v3 - Middleware Chain for MCP Tool Calls
 *
 * IMP-00: Extracts pre/post tool-call extension points from protocol-server.ts
 * so future improvements (IMP-01, 02, 03, 04, 08) can register independently
 * without editing handleToolsCall() or causing merge conflicts.
 *
 * Pattern: Sorted middleware chain with priority ordering.
 * Lower priority number = runs first in pre-hooks, last in post-hooks (onion model).
 */

// ============================================================================
// Types
// ============================================================================

export interface ToolCallContext {
  toolName: string;
  params: Record<string, unknown>;
  timestamp: number;
  sessionId?: string;
  metadata: Record<string, unknown>;
}

export interface ToolMiddleware {
  name: string;
  priority: number;
  preToolCall?(context: ToolCallContext): Promise<ToolCallContext>;
  postToolResult?(context: ToolCallContext, result: unknown): Promise<unknown>;
  onError?(context: ToolCallContext, error: Error): Promise<void>;
}

// ============================================================================
// Middleware Chain
// ============================================================================

export class MiddlewareChain {
  private middlewares: ToolMiddleware[] = [];

  register(mw: ToolMiddleware): void {
    this.middlewares.push(mw);
    this.middlewares.sort((a, b) => a.priority - b.priority);
  }

  unregister(name: string): void {
    this.middlewares = this.middlewares.filter(mw => mw.name !== name);
  }

  getRegistered(): ReadonlyArray<{ name: string; priority: number }> {
    return this.middlewares.map(mw => ({ name: mw.name, priority: mw.priority }));
  }

  async executePreHooks(ctx: ToolCallContext): Promise<ToolCallContext> {
    let current = ctx;
    for (const mw of this.middlewares) {
      if (mw.preToolCall) {
        current = await mw.preToolCall(current);
      }
    }
    return current;
  }

  async executePostHooks(ctx: ToolCallContext, result: unknown): Promise<unknown> {
    let current = result;
    // Post-hooks run in reverse priority order (onion model)
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i];
      if (mw.postToolResult) {
        current = await mw.postToolResult(ctx, current);
      }
    }
    return current;
  }

  async executeErrorHooks(ctx: ToolCallContext, error: Error): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onError) {
        try {
          await mw.onError(ctx, error);
        } catch (hookError) {
          // Error hooks must not crash the chain
          console.error(`[MiddlewareChain] Error in ${mw.name}.onError: ${hookError instanceof Error ? hookError.message : hookError}`);
        }
      }
    }
  }
}
