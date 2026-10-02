import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPProtocolServer } from '../../../src/mcp/protocol-server';
import { getFleetState } from '../../../src/mcp/handlers/core-handlers';
import { getSessionCache, resetSessionCache } from '../../../src/optimization/session-cache';
import { createMockKernel, createMockQueenCoordinator } from './handlers/handler-test-utils';

// Exercise the production protocol cache and task handlers. Only the Queen
// service is controlled so completion can occur between two identical reads.
describe('live MCP polling with the session cache enabled', () => {
  let server: MCPProtocolServer;
  let queen: ReturnType<typeof createMockQueenCoordinator>;
  let savedState: ReturnType<typeof getFleetState>;
  let id = 0;

  beforeEach(() => {
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('AQE_SESSION_CACHE', 'on');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'false');
    resetSessionCache();
    getSessionCache({ persistToDb: false });
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
    const response = await server['handleRequest']({
      jsonrpc: '2.0', id: ++id, method: 'tools/call',
      params: { name, arguments: args },
    }) as { content: Array<{ text: string }>; isError?: boolean };
    expect(response.isError).not.toBe(true);
    return JSON.parse(response.content[0].text);
  }

  async function seedTask() {
    const result = await queen.submitTask({
      type: 'test-generation', priority: 'p1', payload: {},
    });
    expect(result.success).toBe(true);
    const task = queen._tasks.get(result.value)!;
    task.status = 'running';
    task.startedAt = new Date();
    return task;
  }

  it('observes background completion through task_status without another MCP write', async () => {
    const task = await seedTask();
    expect((await call('task_status', { taskId: task.taskId })).data.status).toBe('running');
    task.status = 'completed';
    task.completedAt = new Date();
    expect((await call('task_status', { taskId: task.taskId })).data.status).toBe('completed');
  });

  it('removes completed tasks from repeated running-task listings', async () => {
    const task = await seedTask();
    expect((await call('task_list', { status: 'running' })).data).toHaveLength(1);
    task.status = 'completed';
    expect((await call('task_list', { status: 'running' })).data).toHaveLength(0);
  });

  // Preserve each built-in's actual definition; replace only its service
  // result so a change in live health/metrics can be observed deterministically.
  it.each([
    'fleet_status', 'fleet_health', 'agent_list', 'agent_metrics', 'agent_status',
    'team_list', 'team_health', 'memory_usage', 'routing_metrics', 'routing_economics',
    'infra_healing_status', 'cross_phase_stats', 'pipeline_list', 'session_cache_stats',
    'aqe_health', 'migration_status', 'migration_check',
  ])('refreshes %s rather than replaying its previous live snapshot', async (name) => {
    const entry = server['tools'].get(name)!;
    let observed = 1;
    entry.handler = async () => ({ success: true, data: { observed } });
    expect((await call(name)).data.observed).toBe(1);
    observed = 2;
    expect((await call(name)).data.observed).toBe(2);
    expect(getSessionCache().getStats().size).toBe(0);
  });

  it('ignores already cached live status entries from before an upgrade', async () => {
    const task = await seedTask();
    task.status = 'completed';
    const cache = getSessionCache();
    const args = { taskId: task.taskId };
    cache.set(cache.computeFingerprint('task', 'status', args), 'task', 'status',
      { success: true, data: { status: 'running' } }, 50);
    expect((await call('task_status', args)).data.status).toBe('completed');
  });

  it('continues caching stable memory reads', async () => {
    const get = vi.spyOn(getFleetState().kernel!.memory, 'get');
    await getFleetState().kernel!.memory.set('default:stable', { answer: 42 });
    const first = await call('memory_retrieve', { key: 'stable' });
    const task = await seedTask();
    await call('task_status', { taskId: task.taskId });
    const second = await call('memory_retrieve', { key: 'stable' });
    expect(second).toEqual(first);
    expect(get).toHaveBeenCalledTimes(1);
    expect(getSessionCache().getStats().hits).toBe(1);
  });
});
