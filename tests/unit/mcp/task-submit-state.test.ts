import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  execution: undefined as undefined | { status: string; error?: string },
}));
vi.mock('../../../src/mcp/handlers/core-handlers', () => ({
  isFleetInitialized: () => true,
  getFleetState: () => ({ queen: {
    submitTask: async () => ({ success: true, value: 'task-1' }),
    getTaskStatus: () => state.execution,
  } }),
}));
import { MCPProtocolServer } from '../../../src/mcp/protocol-server.js';

afterEach(() => { state.execution = undefined; });

describe('task_submit protocol state (#734)', () => {
  it.each(['queued', 'assigned', 'running', 'completed', 'failed', 'cancelled'])('preserves the actual %s state', async status => {
    state.execution = { status, ...(status === 'failed' ? { error: 'runner missing' } : {}) };
    const server = new MCPProtocolServer();
    const response = await server['handleToolsCall']({ name: 'task_submit', arguments: { type: 'execute-tests' } });
    const payload = JSON.parse(response.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe(status);
    if (status === 'failed') expect(payload.data.error).toBe('runner missing');
  });

  it('does not invent a queued state when the accepted task cannot be found', async () => {
    const server = new MCPProtocolServer();
    const response = await server['handleToolsCall']({ name: 'task_submit', arguments: { type: 'execute-tests' } });
    const payload = JSON.parse(response.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('task-1');
  });
});
