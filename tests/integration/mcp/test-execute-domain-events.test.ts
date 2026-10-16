/** The single MCP execution owner must retain the domain's lifecycle events. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMCPProtocolServer, type MCPProtocolServer } from '../../../src/mcp/protocol-server.js';
import { getFleetState } from '../../../src/mcp/handlers/core-handlers.js';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';
import type { DomainEvent } from '../../../src/shared/types.js';

describe('caller-owned MCP test domain lifecycle', () => {
  const cwd = process.cwd();
  let root: string;
  let server: MCPProtocolServer;
  const events: DomainEvent[] = [];

  async function call(name: string, args: Record<string, unknown>) {
    const result = await server['handleRequest']({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as { content: Array<{ text: string }> };
    return JSON.parse(result.content[0].text);
  }

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'aqe-mcp-test-events-'));
    mkdirSync(join(root, '.git'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'counter.test.mjs'), `import {it} from 'vitest'; import {appendFileSync} from 'node:fs'; it('records once',()=>appendFileSync('calls.txt','run\\n'));`);
    for (const [key, value] of Object.entries({ AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_LLM_ROUTER_DISABLED: 'true', AQE_WORKERS_ENABLED: 'false', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_SESSION_CACHE: 'off', npm_config_offline: 'true' })) vi.stubEnv(key, value);
    process.chdir(root);
    resetUnifiedMemory();
    server = createMCPProtocolServer();
    expect((await call('fleet_init', { memoryBackend: 'memory', maxAgents: 2 })).success).toBe(true);
    getFleetState().kernel!.eventBus.subscribe('*', async event => { events.push(event); });
  }, 60000);

  afterAll(async () => {
    await server?.stop();
    resetUnifiedMemory();
    process.chdir(cwd);
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('emits one start, completion and learning outcome from one real runner', async () => {
    const result = await call('test_execute_parallel', { testFiles: ['counter.test.mjs'], retryCount: 0, saveResults: false });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(readFileSync(join(root, 'calls.txt'), 'utf8')).toBe('run\n');
    for (const type of ['test-execution.TestRunStarted', 'test-execution.TestRunCompleted', 'AsymmetricLearningOutcome']) {
      expect(events.filter(event => event.type === type), type).toHaveLength(1);
    }
  }, 30000);
});
