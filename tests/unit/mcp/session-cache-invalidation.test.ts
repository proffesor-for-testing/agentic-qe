import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPProtocolServer } from '../../../src/mcp/protocol-server';
import { getSessionCache, resetSessionCache } from '../../../src/optimization/session-cache';

describe('MCP session-cache invalidation', () => {
  let server: MCPProtocolServer;
  let previousCache: string | undefined;
  let previousLoopDetection: string | undefined;

  beforeEach(() => {
    previousCache = process.env.AQE_SESSION_CACHE;
    previousLoopDetection = process.env.AQE_LOOP_DETECTION_ENABLED;
    process.env.AQE_SESSION_CACHE = 'on';
    process.env.AQE_LOOP_DETECTION_ENABLED = 'false';
    resetSessionCache();
    getSessionCache({ persistToDb: false });
    server = new MCPProtocolServer();
  });

  afterEach(async () => {
    await server.stop();
    resetSessionCache();
    if (previousCache === undefined) delete process.env.AQE_SESSION_CACHE;
    else process.env.AQE_SESSION_CACHE = previousCache;
    if (previousLoopDetection === undefined) delete process.env.AQE_LOOP_DETECTION_ENABLED;
    else process.env.AQE_LOOP_DETECTION_ENABLED = previousLoopDetection;
  });

  async function call(name: string): Promise<{ success: boolean; data?: unknown }> {
    const response = await server['handleToolsCall']({ name });
    return JSON.parse(response.content[0].text);
  }

  it('refreshes agent_list after agent_spawn and fleet_status after fleet_init', async () => {
    const agents: string[] = [];
    let fleetVersion = 0;
    const list = vi.fn(async () => ({ success: true, data: [...agents] }));
    const status = vi.fn(async () => ({ success: true, data: { version: fleetVersion } }));
    server['registerTool']({
      definition: { name: 'agent_list', description: 'List agents', category: 'agent',
        isConcurrencySafe: true, parameters: [] },
      handler: list,
    });
    server['registerTool']({
      definition: { name: 'agent_spawn', description: 'Spawn agent', category: 'agent', parameters: [] },
      handler: async () => { agents.push('worker-1'); return { success: true }; },
    });
    server['registerTool']({
      definition: { name: 'fleet_status', description: 'Fleet status', category: 'core',
        isConcurrencySafe: true, parameters: [] },
      handler: status,
    });
    server['registerTool']({
      definition: { name: 'fleet_init', description: 'Initialize fleet', category: 'core', parameters: [] },
      handler: async () => { fleetVersion++; return { success: true }; },
    });

    expect((await call('agent_list')).data).toEqual([]);
    expect((await call('agent_list')).data).toEqual([]); // prove the cache was populated
    expect(list).toHaveBeenCalledTimes(1);
    await call('agent_spawn');
    expect((await call('agent_list')).data).toEqual(['worker-1']);
    expect(list).toHaveBeenCalledTimes(2);

    expect((await call('fleet_status')).data).toEqual({ version: 0 });
    expect((await call('fleet_status')).data).toEqual({ version: 0 }); // cached before init
    expect(status).toHaveBeenCalledTimes(1);
    await call('fleet_init');
    expect((await call('fleet_status')).data).toEqual({ version: 1 });
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('invalidates cross-domain reads even when a mutator reports failure after changing state', async () => {
    let fleetVersion = 0;
    const status = vi.fn(async () => ({ success: true, data: { version: fleetVersion } }));
    server['registerTool']({
      definition: { name: 'fleet_status', description: 'Fleet status', category: 'core',
        isConcurrencySafe: true, parameters: [] },
      handler: status,
    });
    server['registerTool']({
      definition: { name: 'agent_spawn', description: 'Spawn agent', category: 'agent', parameters: [] },
      handler: async () => { fleetVersion++; return { success: false, error: 'acknowledgement lost' }; },
    });

    expect((await call('fleet_status')).data).toEqual({ version: 0 });
    expect((await call('agent_spawn')).success).toBe(false);
    expect((await call('fleet_status')).data).toEqual({ version: 1 });
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('does not cache a read that began before an intervening mutation', async () => {
    const agents: string[] = [];
    let announceStart!: () => void;
    let finishRead!: () => void;
    const started = new Promise<void>((resolve) => { announceStart = resolve; });
    const release = new Promise<void>((resolve) => { finishRead = resolve; });
    const list = vi.fn(async () => {
      const snapshot = [...agents];
      if (list.mock.calls.length === 1) {
        announceStart();
        await release;
      }
      return { success: true, data: snapshot };
    });
    server['registerTool']({
      definition: { name: 'agent_list', description: 'List agents', category: 'agent',
        isConcurrencySafe: true, parameters: [] },
      handler: list,
    });
    server['registerTool']({
      definition: { name: 'agent_spawn', description: 'Spawn agent', category: 'agent', parameters: [] },
      handler: async () => { agents.push('worker-1'); return { success: true }; },
    });

    const oldRead = call('agent_list');
    await started;
    await call('agent_spawn');
    finishRead();
    expect((await oldRead).data).toEqual([]);
    expect((await call('agent_list')).data).toEqual(['worker-1']);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
