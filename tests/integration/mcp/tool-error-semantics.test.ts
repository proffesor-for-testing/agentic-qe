import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMCPProtocolServer, type MCPProtocolServer } from '../../../src/mcp/protocol-server.js';
import type { ToolMiddleware } from '../../../src/mcp/middleware/middleware-chain.js';
import { getPerformanceMonitor } from '../../../src/mcp/performance-monitor.js';

type CallResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

describe('MCP tool error semantics', () => {
  let server: MCPProtocolServer;

  beforeEach(() => {
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'false');
    vi.stubEnv('AQE_SESSION_CACHE', 'off');
    server = createMCPProtocolServer();
  });

  afterEach(async () => {
    await server.stop();
    vi.unstubAllEnvs();
  });

  function register(handler: () => Promise<unknown>): void {
    server['registerTool']({
      definition: {
        name: 'error_semantics_probe',
        description: 'Isolated error-semantics test tool',
        category: 'core',
        parameters: [],
      },
      handler,
    });
  }

  async function call(): Promise<CallResult> {
    return server['handleRequest']({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'error_semantics_probe', arguments: {} },
    }) as Promise<CallResult>;
  }

  it('marks a real registered tool failure as an MCP tool error', async () => {
    const response = await server['handleRequest']({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'fleet_status', arguments: {} },
    }) as CallResult;

    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0].text)).toMatchObject({
      success: false, error: 'Fleet not initialized. Call fleet_init first.',
    });
  });

  it('marks a handler-returned failure as an MCP tool error without changing its text payload', async () => {
    getPerformanceMonitor().reset();
    register(async () => ({ success: false, error: 'Invalid request' }));

    const response = await call();

    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0].text)).toEqual({ success: false, error: 'Invalid request' });
    expect(getPerformanceMonitor().getToolMetrics('error_semantics_probe')?.successCount).toBe(0);
  });

  it('marks thrown handler failures as errors without exposing private details', async () => {
    register(async () => { throw new Error('token=private-secret /private/project/file.ts'); });

    const response = await call();

    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0].text)).toEqual({
      success: false, code: 'tool_execution_error', error: 'Tool execution failed',
    });
    expect(response.content[0].text).not.toContain('private-secret');
    expect(response.content[0].text).not.toContain('/private/project');
  });

  it.each(['preToolCall', 'postToolResult'] as const)(
    'marks a %s middleware exception as an error', async (hook) => {
      register(async () => ({ success: true, data: { status: 'ready' } }));
      server['middlewareChain'].register({
        name: `faulty-${hook}`, priority: 999,
        [hook]: async () => { throw new Error('token=middleware-secret'); },
      } as ToolMiddleware);

      const response = await call();

      expect(response.isError).toBe(true);
      expect(JSON.parse(response.content[0].text).code).toBe('tool_execution_error');
      expect(response.content[0].text).not.toContain('middleware-secret');
    },
  );

  it('marks a failure introduced by post-result middleware as an error', async () => {
    register(async () => ({ success: true, data: { status: 'ready' } }));
    server['middlewareChain'].register({
      name: 'reject-result', priority: 999,
      postToolResult: async () => ({ success: false, error: 'Result rejected' }),
    });

    const response = await call();

    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0].text)).toEqual({
      success: false, error: 'Result rejected',
    });
  });

  it.each([
    ['missing result', undefined],
    ['null result', null],
    ['circular result', (() => { const value: Record<string, unknown> = {}; value.self = value; return value; })()],
  ])('marks a %s as an error before it reaches the client', async (_name, result) => {
    register(async () => result);

    const response = await call();

    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0].text).code).toBe('tool_execution_error');
  });

  it('does not confuse a completed assessment that blocks release with a tool execution error', async () => {
    register(async () => ({ success: true, data: { passed: false, decision: 'block' } }));

    const response = await call();

    expect(response.isError).not.toBe(true);
    expect(JSON.parse(response.content[0].text)).toEqual({
      success: true, data: { passed: false, decision: 'block' },
    });
  });

  it('keeps an unknown tool as a JSON-RPC protocol error', async () => {
    await expect(server['handleRequest']({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'missing_tool', arguments: {} },
    })).rejects.toMatchObject({ code: -32601, message: 'Unknown tool: missing_tool' });
  });
});
