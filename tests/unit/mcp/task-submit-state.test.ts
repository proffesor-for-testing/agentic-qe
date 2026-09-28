import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  execution: undefined as undefined | { status: string; error?: string },
  submitted: [] as unknown[],
}));
vi.mock('../../../src/mcp/handlers/core-handlers', () => ({
  isFleetInitialized: () => true,
  getFleetState: () => ({ queen: {
    submitTask: async (task: unknown) => { state.submitted.push(task); return { success: true, value: 'task-1' }; },
    getTaskStatus: () => state.execution,
  } }),
}));
import { MCPProtocolServer } from '../../../src/mcp/protocol-server.js';

afterEach(() => { state.execution = undefined; state.submitted = []; });

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

  // #734 D: parity with `aqe task submit --domain` — unknown domains are rejected.
  it.each([
    [['no-such-domain']],
    [['coverage-analysis', 'no-such-domain']],
    ['coverage-analysis'],
  ])('rejects invalid targetDomains %j without submitting', async (targetDomains) => {
    const server = new MCPProtocolServer();
    const response = await server['handleToolsCall']({
      name: 'task_submit', arguments: { type: 'analyze-coverage', targetDomains },
    });
    const payload = JSON.parse(response.content[0].text);
    expect(response.isError).toBe(true);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('Unknown domain');
    expect(payload.error).toContain('Valid domains: ');
    expect(state.submitted).toHaveLength(0);
  });

  it('passes known targetDomains through to the coordinator', async () => {
    state.execution = { status: 'running' };
    const server = new MCPProtocolServer();
    const response = await server['handleToolsCall']({
      name: 'task_submit', arguments: { type: 'analyze-coverage', targetDomains: ['coverage-analysis'] },
    });
    expect(JSON.parse(response.content[0].text).success).toBe(true);
    expect(state.submitted).toEqual([expect.objectContaining({ targetDomains: ['coverage-analysis'] })]);
  });
});
