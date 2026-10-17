/**
 * #1096: MCP code-index entry points stay inside the project, count only files
 * they really indexed, and validate their input. Real temp project, real
 * symlink to a file outside it, real protocol-server request handling.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMCPProtocolServer, type MCPProtocolServer } from '../../../src/mcp/protocol-server.js';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';

describe('MCP code indexing confinement (#1096)', () => {
  const cwd = process.cwd();
  let base: string;
  let root: string;
  let server: MCPProtocolServer;

  async function call(name: string, args: Record<string, unknown>) {
    const result = await server['handleRequest']({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as { content: Array<{ text: string }> };
    return JSON.parse(result.content[0].text);
  }

  async function settle(taskId: string) {
    let status;
    for (let i = 0; i < 100; i++) {
      status = await call('task_status', { taskId, detailed: true });
      if (['completed', 'failed', 'cancelled'].includes(status.data.status)) return status.data;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return status.data;
  }

  beforeAll(async () => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1096-mcp-')));
    root = join(base, 'proj');
    mkdirSync(join(root, '.git'), { recursive: true });
    mkdirSync(join(root, '.home'));
    mkdirSync(join(root, 'src', 'adir.ts'), { recursive: true });
    mkdirSync(join(base, 'outside'));
    writeFileSync(join(root, 'src', 'ok.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    writeFileSync(join(base, 'outside', 'secret.ts'), "export const SECRET_TOKEN_1096 = 'outside-the-project';\n");
    symlinkSync(join('..', '..', 'outside', 'secret.ts'), join(root, 'src', 'leak.ts'));
    for (const [key, value] of Object.entries({ HOME: join(root, '.home'), AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_LLM_ROUTER_DISABLED: 'true', AQE_WORKERS_ENABLED: 'false', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_SESSION_CACHE: 'off', npm_config_offline: 'true' })) vi.stubEnv(key, value);
    process.chdir(root);
    resetUnifiedMemory();
    server = createMCPProtocolServer();
    expect((await call('fleet_init', { memoryBackend: 'memory', maxAgents: 4 })).success).toBe(true);
  }, 60000);

  afterAll(async () => {
    await server?.stop();
    resetUnifiedMemory();
    process.chdir(cwd);
    vi.unstubAllEnvs();
    if (base) rmSync(base, { recursive: true, force: true });
  });

  it('code_index fails when its target is a symlink out of the project', async () => {
    const result = await call('code_index', { target: 'src/leak.ts', saveResults: false });

    expect(result.success, JSON.stringify(result)).toBe(false);
    expect(result.error).toContain('Nothing was indexed');
    expect(result.error).toContain('outside-project-root');
  }, 30000);

  it('code_index on a directory with no source files reports 0 files, not a fabricated count', async () => {
    mkdirSync(join(root, 'empty'));

    const result = await call('code_index', { target: 'empty', saveResults: false });

    expect(result, JSON.stringify(result)).toMatchObject({ success: true, data: { filesIndexed: 0 } });
  }, 30000);

  it('task_submit index counts only the in-project file and lists the skipped ones', async () => {
    const submitted = await call('task_submit', {
      type: 'index',
      targetDomains: ['code-intelligence'],
      payload: { paths: ['src/ok.ts', 'src/leak.ts', 'src/missing.ts', 'src/adir.ts'] },
    });
    const task = await settle(submitted.data.taskId);

    expect(task, JSON.stringify(task)).toMatchObject({
      status: 'completed',
      result: {
        filesIndexed: 1,
        skipped: [
          { path: 'src/leak.ts', reason: 'outside-project-root' },
          { path: 'src/missing.ts', reason: 'not-found' },
          { path: 'src/adir.ts', reason: 'not-a-file' },
        ],
      },
    });
  }, 30000);

  it('search does not return the content of the file outside the project', async () => {
    const submitted = await call('task_submit', {
      type: 'search',
      targetDomains: ['code-intelligence'],
      payload: { query: 'SECRET_TOKEN_1096', type: 'exact' },
    });
    const task = await settle(submitted.data.taskId);

    expect(task.status).toBe('completed');
    expect(JSON.stringify(task)).not.toContain('outside-the-project');
  }, 30000);

  it('task_submit index fails when every path is blocked', async () => {
    const submitted = await call('task_submit', {
      type: 'index',
      targetDomains: ['code-intelligence'],
      payload: { paths: ['src/leak.ts'] },
    });
    const task = await settle(submitted.data.taskId);

    expect(task.status).toBe('failed');
    expect(task.error).toContain('Nothing was indexed: 0 of 1 requested path(s) indexed - src/leak.ts (outside-project-root)');
  }, 30000);

  it('task_submit rejects a non-array paths value up front', async () => {
    const result = await call('task_submit', {
      type: 'index',
      targetDomains: ['code-intelligence'],
      payload: { paths: 'src/ok.ts' },
    });

    expect(result).toMatchObject({
      success: false,
      error: "Invalid index payload: 'paths' must be an array of file paths, got string",
    });
  });

  it('task_orchestrate rejects a non-array filePaths value up front', async () => {
    const result = await call('task_orchestrate', { task: 'index the code knowledge graph', filePaths: 'src/ok.ts' });

    expect(result).toMatchObject({
      success: false,
      error: "Invalid task_orchestrate params: 'filePaths' must be an array of file paths, got string",
    });
  });
});
