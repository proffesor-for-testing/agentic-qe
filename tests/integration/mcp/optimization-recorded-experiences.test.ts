/** Registered MCP optimization uses stored observations, never synthesized input. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { LearningCoordinatorService } from '../../../src/domains/learning-optimization/services/learning-coordinator';

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP optimize consumes recorded observations over stdio', () => {
  let child: ChildProcessWithoutNullStreams;
  let root: string;
  let nextId = 0;
  let stderr = '';
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  function request(method: string, params: Record<string, unknown>): Promise<any> {
    const id = ++nextId;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}\n${stderr.slice(-2000)}`));
      }, 60000);
      pending.set(id, { resolve: resolvePromise, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async function call(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const response = await request('tools/call', { name, arguments: args });
    expect(response.error, `${name}: ${JSON.stringify(response.error)}`).toBeUndefined();
    return JSON.parse(response.result.content[0].text);
  }

  beforeAll(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-recorded-optimize-')));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'fake-home'));
    mkdirSync(join(root, '.agentic-qe'));
    resetUnifiedMemory();
    const priorRoot = process.env.AQE_PROJECT_ROOT;
    process.env.AQE_PROJECT_ROOT = root;
    let backend: MemoryBackend | undefined;
    try {
      ({ backend } = await createMemoryBackend({
        type: 'sqlite', sqlite: { path: join(root, '.agentic-qe', 'memory.db'), walMode: true },
      }, true));
      const recorder = new LearningCoordinatorService({ memory: backend }, { enableLLMSynthesis: false });
      for (let i = 0; i < 25; i++) {
        const saved = await recorder.recordExperience({
          agentId: { value: 'synthetic-stdio-agent', domain: 'test-generation', type: 'specialist' },
          domain: 'test-generation', action: 'synthetic-stdio-fixture',
          state: { context: {}, metrics: {} },
          result: { success: false, outcome: { coverage: i + 1 }, duration: 1 }, reward: -1,
        });
        if (!saved.success) throw saved.error;
      }
    } finally {
      await backend?.dispose();
      resetUnifiedMemory();
      if (priorRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
      else process.env.AQE_PROJECT_ROOT = priorRoot;
    }
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: join(root, 'fake-home'), AQE_PROJECT_ROOT: root, AQE_HTTP_PORT: '0',
      AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: '1', COST_TRACKING_DB_PATH: join(root, 'cost.sqlite') };
    delete env.AQE_MEMORY_BACKEND;
    for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY',
      'OPENROUTER_API_KEY', 'AQE_LLM_API_KEY', 'PORTKEY_API_KEY']) delete env[key];
    child = spawn(process.execPath, [bundle], { cwd: root, env, stdio: 'pipe' });
    child.stderr.on('data', data => { stderr += String(data); });
    createInterface({ input: child.stdout }).on('line', line => {
      let message: any;
      try { message = JSON.parse(line); } catch { return; }
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    });
    child.on('exit', code => {
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`Server exited ${code}: ${stderr.slice(-2000)}`));
      }
      pending.clear();
    });
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'recorded-optimization-fixture', version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  }, 120000);

  afterAll(async () => {
    if (child?.exitCode === null) {
      const exited = new Promise(resolvePromise => child.once('exit', resolvePromise));
      child.kill('SIGKILL');
      await exited;
    }
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('lists the actual tool and reports all 25 stored observations', async () => {
    const listed = await request('tools/list', {});
    expect(listed.result.tools.some((tool: { name: string }) => tool.name === 'qe/learning/optimize')).toBe(true);
    const result = await call('qe/learning/optimize', {
      action: 'optimize', domain: 'test-generation',
      objective: { metric: 'coverage', direction: 'maximize' },
    });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data.optimizeResult).toMatchObject({
      inputSource: 'recorded-experiences', experiencesUsed: 25, strategiesEvaluated: 1,
    });
  }, 120000);
});
