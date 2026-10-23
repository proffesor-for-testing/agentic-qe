import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPProtocolServer } from '../../../src/mcp/protocol-server';
import { getFleetState } from '../../../src/mcp/handlers/core-handlers';
import { resetSessionCache } from '../../../src/optimization/session-cache';
import { createMockKernel, createMockQueenCoordinator } from './handlers/handler-test-utils';

// #1227: polling a task's status is the status protocol, not a loop. The
// production loop detector stays on here; only the Queen is a test double.
describe('loop detection and status polling (#1227)', () => {
  let server: MCPProtocolServer;
  let queen: ReturnType<typeof createMockQueenCoordinator>;
  let savedState: ReturnType<typeof getFleetState>;
  let id = 0;

  beforeEach(() => {
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('AQE_SESSION_CACHE', 'off');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'true');
    resetSessionCache();
    savedState = { ...getFleetState() };
    queen = createMockQueenCoordinator();
    Object.assign(getFleetState(), {
      initialized: true,
      kernel: createMockKernel(),
      queen,
      initTime: new Date(),
    });
    server = new MCPProtocolServer();
  });

  afterEach(() => {
    server['sessionStore'].close();
    Object.assign(getFleetState(), savedState);
    resetSessionCache();
    vi.unstubAllEnvs();
  });

  async function call(name: string, args: Record<string, unknown> = {}) {
    return await server['handleRequest']({
      jsonrpc: '2.0', id: ++id, method: 'tools/call',
      params: { name, arguments: args },
    }) as { content: Array<{ text: string }>; isError?: boolean };
  }

  it('lets a client poll task_status until the task completes', async () => {
    const submitted = await queen.submitTask({ type: 'test-generation', priority: 'p1', payload: {} });
    expect(submitted.success).toBe(true);
    const task = queen._tasks.get(submitted.value)!;
    task.status = 'running';
    task.startedAt = new Date();

    for (let poll = 0; poll < 5; poll++) {
      const response = await call('task_status', { taskId: task.taskId, detailed: true });
      expect(response.isError, response.content[0].text).not.toBe(true);
      expect(JSON.parse(response.content[0].text).data.status).toBe('running');
    }
    task.status = 'completed';
    task.completedAt = new Date();
    const done = await call('task_status', { taskId: task.taskId, detailed: true });
    expect(done.isError).not.toBe(true);
    expect(JSON.parse(done.content[0].text).data.status).toBe('completed');
  });

  it.each(['fleet_status', 'task_list'])('does not block repeated %s polls', async name => {
    for (let poll = 0; poll < 5; poll++) {
      const response = await call(name);
      expect(response.isError, response.content[0].text).not.toBe(true);
    }
  });

  it('still blocks a repeated call to a tool that is not a status poll', async () => {
    const responses = [];
    for (let attempt = 0; attempt < 3; attempt++) responses.push(await call('agent_list'));
    expect(responses[0].isError).not.toBe(true);
    expect(responses[2].isError).toBe(true);
    expect(responses[2].content[0].text).toMatch(/loop/i);
  });
});
