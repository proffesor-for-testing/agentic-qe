/** #1081: the declared index-code task must execute its supplied paths. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMCPProtocolServer, type MCPProtocolServer } from '../../../src/mcp/protocol-server.js';
import { getFleetState } from '../../../src/mcp/handlers/core-handlers.js';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';
import type { DomainEvent } from '../../../src/shared/types.js';

describe('orchestrated index-code task execution', () => {
  const cwd = process.cwd();
  let root: string;
  let server: MCPProtocolServer;
  const events: DomainEvent[] = [];

  async function call(name: string, args: Record<string, unknown>) {
    const result = await server['handleRequest']({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as { content: Array<{ text: string }> };
    return JSON.parse(result.content[0].text);
  }

  async function terminal(taskId: string) {
    let status;
    for (let i = 0; i < 50; i++) {
      status = await call('task_status', { taskId, detailed: true });
      if (['completed', 'failed', 'cancelled'].includes(status.data.status)) return status;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return status;
  }

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'aqe-orchestrate-index-'));
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, '.home'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/math.js'), 'export function add(a, b) { return a + b; }');
    for (const [key, value] of Object.entries({ HOME: join(root, '.home'), AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_LLM_ROUTER_DISABLED: 'true', AQE_WORKERS_ENABLED: 'false', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_SESSION_CACHE: 'off', npm_config_offline: 'true' })) vi.stubEnv(key, value);
    process.chdir(root);
    resetUnifiedMemory();
    server = createMCPProtocolServer();
    expect((await call('fleet_init', { memoryBackend: 'memory', maxAgents: 4 })).success).toBe(true);
    getFleetState().kernel!.eventBus.subscribe('*', async event => { events.push(event); });
  }, 60000);

  afterAll(async () => {
    await server?.stop();
    resetUnifiedMemory();
    process.chdir(cwd);
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('indexes the requested file exactly once and releases the Queen slot', async () => {
    const before = await call('fleet_status', {});
    const submitted = await call('task_orchestrate', { task: 'index the code knowledge graph', filePaths: ['src/math.js'] });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    const status = await terminal(submitted.data.taskId);
    expect(status.data, JSON.stringify(status)).toMatchObject({ type: 'index-code', status: 'completed', result: { filesIndexed: 1 } });
    const indexed = events.filter(event => event.type === 'code-intelligence.KnowledgeGraphUpdated');
    expect(indexed).toHaveLength(1);
    const after = await call('fleet_status', {});
    expect(after.data.tasks.running).toBe(0);
    expect(after.data.tasks.pending).toBe(0);
    expect(after.data.tasks.completed - before.data.tasks.completed).toBe(1);
  }, 30000);

  it('settles a missing-path request as failed instead of leaking a slot', async () => {
    const submitted = await call('task_orchestrate', { task: 'index the code knowledge graph' });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    const status = await terminal(submitted.data.taskId);
    expect(status.data, JSON.stringify(status)).toMatchObject({ status: 'failed', error: expect.stringContaining('missing paths') });
    const fleet = await call('fleet_status', {});
    expect(fleet.data.tasks.running).toBe(0);
    expect(fleet.data.tasks.pending).toBe(0);
  }, 30000);
});
