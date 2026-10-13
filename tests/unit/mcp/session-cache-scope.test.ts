/**
 * Issue #998: the MCP result cache was keyed only on build, tool and
 * arguments. A relative target served another project's result, and results
 * that measure mutable project state (coverage, quality, defects, the code
 * index) were replayed for up to an hour after their inputs changed.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPProtocolServer } from '../../../src/mcp/protocol-server';
import { getFleetState } from '../../../src/mcp/handlers/core-handlers';
import { clearProjectRootCache } from '../../../src/kernel/project-root';
import {
  SessionOperationCache, getSessionCache, resetSessionCache,
} from '../../../src/optimization/session-cache';
import { createMockKernel, createMockQueenCoordinator } from './handlers/handler-test-utils';

describe('MCP session cache scope (#998)', () => {
  let server: MCPProtocolServer;
  let savedState: ReturnType<typeof getFleetState>;
  let base: string;
  let projectA: string;
  let projectB: string;
  let id = 0;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-998-')));
    projectA = path.join(base, 'project-a');
    projectB = path.join(base, 'project-b');
    for (const p of [projectA, projectB]) {
      fs.mkdirSync(path.join(p, '.git'), { recursive: true });
      fs.writeFileSync(path.join(p, 'requirements.md'), `# ${path.basename(p)}\n`);
    }
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('AQE_SESSION_CACHE', 'on');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'false');
    vi.stubEnv('AQE_PROJECT_ROOT', projectA);
    clearProjectRootCache();
    resetSessionCache();
    getSessionCache({ persistToDb: false });
    savedState = { ...getFleetState() };
    Object.assign(getFleetState(), {
      initialized: true,
      kernel: createMockKernel(),
      queen: createMockQueenCoordinator(),
      initTime: new Date(),
    });
    server = new MCPProtocolServer();
  });

  afterEach(() => {
    server['sessionStore'].close();
    Object.assign(getFleetState(), savedState);
    resetSessionCache();
    vi.unstubAllEnvs();
    clearProjectRootCache();
    fs.rmSync(base, { recursive: true, force: true });
  });

  async function call(name: string, args: Record<string, unknown> = {}) {
    const response = await server['handleRequest']({
      jsonrpc: '2.0', id: ++id, method: 'tools/call',
      params: { name, arguments: args },
    }) as { content: Array<{ text: string }>; isError?: boolean };
    expect(response.isError).not.toBe(true);
    return JSON.parse(response.content[0].text);
  }

  /** Replace only the handler; keep the tool's real definition and flags. */
  function stub(name: string, produce: () => unknown): void {
    const entry = server['tools'].get(name)!;
    entry.handler = async () => ({ success: true, data: produce() });
  }

  it.each(['cross_phase_query', 'pipeline_validate', 'memory_query', 'requirements_validate'])(
    '%s: the same relative arguments in two projects do not share a cached result',
    async (name) => {
      stub(name, () => ({ root: process.env.AQE_PROJECT_ROOT }));
      const args = name === 'requirements_validate'
        ? { requirementsPath: 'requirements.md' }
        : name === 'pipeline_validate' ? { yaml: 'name: x' }
          : name === 'cross_phase_query' ? { loop: 'tactical' } : { pattern: '*' };

      expect((await call(name, args)).data.root).toBe(projectA);
      vi.stubEnv('AQE_PROJECT_ROOT', projectB);
      clearProjectRootCache();
      expect((await call(name, args)).data.root).toBe(projectB);
    },
  );

  it('still reuses a cached result within one project', async () => {
    let runs = 0;
    stub('pipeline_validate', () => ({ runs: ++runs }));
    expect((await call('pipeline_validate', { yaml: 'name: x' })).data.runs).toBe(1);
    expect((await call('pipeline_validate', { yaml: 'name: x' })).data.runs).toBe(1);
    expect(getSessionCache().getStats().hits).toBe(1);
  });

  it.each(['coverage_analyze_sublinear', 'quality_assess', 'defect_predict', 'code_index'])(
    '%s measures mutable project state and is never replayed from cache',
    async (name) => {
      let observed = 1;
      stub(name, () => ({ observed }));
      const args = name === 'quality_assess' ? {} : { target: '.' };
      expect((await call(name, args)).data.observed).toBe(1);
      observed = 2;
      expect((await call(name, args)).data.observed).toBe(2);
      expect(getSessionCache().getStats().size).toBe(0);
    },
  );

  it('requirements_validate misses the cache when the requirements file changes', async () => {
    const file = path.join(projectA, 'requirements.md');
    let runs = 0;
    stub('requirements_validate', () => ({ runs: ++runs }));
    const args = { requirementsPath: file };
    expect((await call('requirements_validate', args)).data.runs).toBe(1);
    expect((await call('requirements_validate', args)).data.runs).toBe(1);

    fs.writeFileSync(file, '# project-a\n\n- new requirement\n');
    const later = new Date(Date.now() + 5_000);
    fs.utimesSync(file, later, later);
    expect((await call('requirements_validate', args)).data.runs).toBe(2);
  });

  it.each([
    ['a requirements directory', (dir: string) => ({ requirementsPath: dir })],
    ['no path (scans the working directory)', () => ({})],
  ])('requirements_validate reading %s is never cached', async (_label, argsFor) => {
    let runs = 0;
    stub('requirements_validate', () => ({ runs: ++runs }));
    const args = argsFor(projectA);
    expect((await call('requirements_validate', args)).data.runs).toBe(1);
    expect((await call('requirements_validate', args)).data.runs).toBe(2);
    expect(getSessionCache().getStats().size).toBe(0);
  });
});

describe('SessionOperationCache.computeFingerprint scope (#998)', () => {
  it('differs by project root and by resolved input fingerprint', () => {
    const cache = new SessionOperationCache({ persistToDb: false });
    const input = { target: '.' };
    const a = cache.computeFingerprint('code', 'index', input, { projectRoot: '/p/a', cwd: '/p/a' });
    const b = cache.computeFingerprint('code', 'index', input, { projectRoot: '/p/b', cwd: '/p/b' });
    const a2 = cache.computeFingerprint('code', 'index', input, { projectRoot: '/p/a', cwd: '/p/a' });
    const aChanged = cache.computeFingerprint('code', 'index', input, {
      projectRoot: '/p/a', cwd: '/p/a', inputs: { target: { path: '/p/a', mtimeMs: 2 } },
    });
    expect(a).not.toBe(b);
    expect(a).toBe(a2);
    expect(aChanged).not.toBe(a);
  });

  it('defaults the scope to the current project root', () => {
    const cache = new SessionOperationCache({ persistToDb: false });
    vi.stubEnv('AQE_PROJECT_ROOT', '/p/a');
    const a = cache.computeFingerprint('memory', 'retrieve', { key: 'k' });
    vi.stubEnv('AQE_PROJECT_ROOT', '/p/b');
    const b = cache.computeFingerprint('memory', 'retrieve', { key: 'k' });
    vi.unstubAllEnvs();
    expect(a).not.toBe(b);
  });
});
