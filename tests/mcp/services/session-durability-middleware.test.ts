import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSessionDurabilityMiddleware } from '../../../src/mcp/services/session-durability-middleware';
import type { ToolCallContext } from '../../../src/mcp/middleware/middleware-chain';

function createMockStore() {
  return {
    append: vi.fn(),
    startSession: vi.fn(),
    flush: vi.fn(),
    getEntries: vi.fn().mockReturnValue([]),
  };
}

function createContext(overrides?: Partial<ToolCallContext>): ToolCallContext {
  return {
    toolName: 'test_tool',
    params: { key: 'value' },
    timestamp: Date.now(),
    metadata: {},
    ...overrides,
  };
}

describe('createSessionDurabilityMiddleware', () => {
  beforeEach(() => {
    delete process.env.AQE_SESSION_DURABILITY;
  });

  afterEach(() => {
    delete process.env.AQE_SESSION_DURABILITY;
  });

  it('should return a middleware named "session-durability" at priority 50', () => {
    const store = createMockStore();
    const mw = createSessionDurabilityMiddleware(store as any);

    expect(mw.name).toBe('session-durability');
    expect(mw.priority).toBe(50);
  });

  it('preToolCall should append a tool_call entry', async () => {
    const store = createMockStore();
    const mw = createSessionDurabilityMiddleware(store as any);
    const ctx = createContext();

    const result = await mw.preToolCall!(ctx);

    expect(result).toBe(ctx);
    expect(store.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'test_tool',
        state: 'running',
      }),
    );
  });

  it('postToolResult should append a tool_result entry and pass through result', async () => {
    const store = createMockStore();
    const mw = createSessionDurabilityMiddleware(store as any);
    const ctx = createContext();
    const toolResult = { data: 'hello' };

    const result = await mw.postToolResult!(ctx, toolResult);

    expect(result).toBe(toolResult);
    expect(store.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_result',
        toolName: 'test_tool',
        state: 'idle',
        result: toolResult,
      }),
    );
  });

  it('onError should append an error entry with message and stack', async () => {
    const store = createMockStore();
    const mw = createSessionDurabilityMiddleware(store as any);
    const ctx = createContext();
    const error = new Error('something broke');

    await mw.onError!(ctx, error);

    expect(store.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        toolName: 'test_tool',
        state: 'requires_action',
        result: expect.objectContaining({ message: 'something broke' }),
      }),
    );
  });

  describe('kill switch: AQE_SESSION_DURABILITY=false', () => {
    it('preToolCall should be a no-op when disabled', async () => {
      process.env.AQE_SESSION_DURABILITY = 'false';
      const store = createMockStore();
      const mw = createSessionDurabilityMiddleware(store as any);
      const ctx = createContext();

      const result = await mw.preToolCall!(ctx);

      expect(result).toBe(ctx);
      expect(store.append).not.toHaveBeenCalled();
    });

    it('postToolResult should pass through without logging when disabled', async () => {
      process.env.AQE_SESSION_DURABILITY = 'false';
      const store = createMockStore();
      const mw = createSessionDurabilityMiddleware(store as any);
      const ctx = createContext();

      const result = await mw.postToolResult!(ctx, 'data');

      expect(result).toBe('data');
      expect(store.append).not.toHaveBeenCalled();
    });

    it('onError should be a no-op when disabled', async () => {
      process.env.AQE_SESSION_DURABILITY = 'false';
      const store = createMockStore();
      const mw = createSessionDurabilityMiddleware(store as any);

      await mw.onError!(createContext(), new Error('test'));

      expect(store.append).not.toHaveBeenCalled();
    });
  });
});
