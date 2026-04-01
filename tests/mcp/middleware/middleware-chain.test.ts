/**
 * IMP-00: Middleware Chain Tests
 * Verifies the middleware chain correctly executes pre/post/error hooks
 * in priority order with onion-model semantics.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MiddlewareChain,
  type ToolMiddleware,
  type ToolCallContext,
} from '../../../src/mcp/middleware/middleware-chain';

function createContext(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    toolName: overrides.toolName ?? 'test_tool',
    params: overrides.params ?? { query: 'test' },
    timestamp: overrides.timestamp ?? Date.now(),
    metadata: overrides.metadata ?? {},
  };
}

describe('MiddlewareChain', () => {
  describe('register / unregister', () => {
    it('should register middleware and report it', () => {
      const chain = new MiddlewareChain();
      chain.register({ name: 'alpha', priority: 10 });
      chain.register({ name: 'beta', priority: 5 });

      const registered = chain.getRegistered();
      expect(registered).toHaveLength(2);
      expect(registered[0].name).toBe('beta');
      expect(registered[1].name).toBe('alpha');
    });

    it('should unregister middleware by name', () => {
      const chain = new MiddlewareChain();
      chain.register({ name: 'alpha', priority: 10 });
      chain.register({ name: 'beta', priority: 5 });
      chain.unregister('beta');

      expect(chain.getRegistered()).toHaveLength(1);
      expect(chain.getRegistered()[0].name).toBe('alpha');
    });
  });

  describe('executePreHooks', () => {
    it('should run pre-hooks in priority order (low number first)', async () => {
      const chain = new MiddlewareChain();
      const order: string[] = [];

      chain.register({
        name: 'second',
        priority: 20,
        async preToolCall(ctx) {
          order.push('second');
          return ctx;
        },
      });

      chain.register({
        name: 'first',
        priority: 10,
        async preToolCall(ctx) {
          order.push('first');
          return ctx;
        },
      });

      const ctx = createContext();
      await chain.executePreHooks(ctx);

      expect(order).toEqual(['first', 'second']);
    });

    it('should pass modified context through the chain', async () => {
      const chain = new MiddlewareChain();

      chain.register({
        name: 'enricher',
        priority: 10,
        async preToolCall(ctx) {
          return { ...ctx, metadata: { ...ctx.metadata, enriched: true } };
        },
      });

      const ctx = createContext();
      const result = await chain.executePreHooks(ctx);

      expect(result.metadata.enriched).toBe(true);
    });

    it('should return context unchanged when no pre-hooks exist', async () => {
      const chain = new MiddlewareChain();
      const ctx = createContext();
      const result = await chain.executePreHooks(ctx);

      expect(result).toBe(ctx);
    });
  });

  describe('executePostHooks', () => {
    it('should run post-hooks in reverse priority order (onion model)', async () => {
      const chain = new MiddlewareChain();
      const order: string[] = [];

      chain.register({
        name: 'inner',
        priority: 10,
        async postToolResult(ctx, result) {
          order.push('inner');
          return result;
        },
      });

      chain.register({
        name: 'outer',
        priority: 20,
        async postToolResult(ctx, result) {
          order.push('outer');
          return result;
        },
      });

      const ctx = createContext();
      await chain.executePostHooks(ctx, { data: 'test' });

      expect(order).toEqual(['outer', 'inner']);
    });

    it('should pass modified result through the chain', async () => {
      const chain = new MiddlewareChain();

      chain.register({
        name: 'transformer',
        priority: 10,
        async postToolResult(_ctx, result) {
          return { ...(result as Record<string, unknown>), transformed: true };
        },
      });

      const ctx = createContext();
      const result = await chain.executePostHooks(ctx, { data: 'original' });

      expect(result).toEqual({ data: 'original', transformed: true });
    });

    it('should return result unchanged when no post-hooks exist', async () => {
      const chain = new MiddlewareChain();
      const ctx = createContext();
      const original = { data: 'test' };
      const result = await chain.executePostHooks(ctx, original);

      expect(result).toBe(original);
    });
  });

  describe('executeErrorHooks', () => {
    it('should call all error hooks even if one throws', async () => {
      const chain = new MiddlewareChain();
      const hook1 = vi.fn().mockRejectedValue(new Error('hook1 failed'));
      const hook2 = vi.fn().mockResolvedValue(undefined);

      chain.register({ name: 'failing', priority: 10, onError: hook1 });
      chain.register({ name: 'working', priority: 20, onError: hook2 });

      const ctx = createContext();
      const error = new Error('tool failed');

      // Should not throw
      await chain.executeErrorHooks(ctx, error);

      expect(hook1).toHaveBeenCalledWith(ctx, error);
      expect(hook2).toHaveBeenCalledWith(ctx, error);
    });

    it('should handle empty chain gracefully', async () => {
      const chain = new MiddlewareChain();
      const ctx = createContext();

      // Should not throw
      await chain.executeErrorHooks(ctx, new Error('test'));
    });
  });

  describe('middleware without all hooks', () => {
    it('should skip middleware that only has preToolCall', async () => {
      const chain = new MiddlewareChain();
      const preFn = vi.fn().mockImplementation(async (ctx: ToolCallContext) => ctx);

      chain.register({ name: 'pre-only', priority: 10, preToolCall: preFn });

      const ctx = createContext();

      await chain.executePreHooks(ctx);
      expect(preFn).toHaveBeenCalledTimes(1);

      // Post and error should not crash
      const result = await chain.executePostHooks(ctx, { data: 'test' });
      expect(result).toEqual({ data: 'test' });

      await chain.executeErrorHooks(ctx, new Error('test'));
    });
  });
});
