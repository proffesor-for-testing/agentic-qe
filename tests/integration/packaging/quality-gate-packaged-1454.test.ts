/**
 * #1454: `aqe quality-gate` and `qe/quality/gate` from the PACKED package, run
 * in a user project that is not the AQE repo. Before the fix the CLI failed
 * with ENOENT on `<project>/verification/anchors/qe-anchor-v1.json`: the anchor
 * was resolved from cwd/the project root and was not in package.json#files.
 *
 * The tarball comes from `npm pack` and is unpacked into a temp dir outside
 * this checkout, so the anchor can only come from the tarball. Runtime
 * dependencies are linked from this checkout's node_modules (offline); the
 * full `npm install` of the tarball is covered by
 * tests/integration/package-exports-esm.integration.test.ts.
 */
import { spawn, spawnSync, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const builtCli = join(repoRoot, 'dist/cli/bundle.js');
const builtMcp = join(repoRoot, 'dist/mcp/bundle.js');
const built = existsSync(builtCli) && existsSync(builtMcp);
const CHECKLISTS = ['A1-inRange', 'A2-letterGrade', 'A3-isBlank', 'A4-countAbove', 'A5-parseBool'];

// In CI a missing build is a failure, never a silent skip.
it.runIf(!!process.env.CI)('has built CLI and MCP bundles to pack (#1454)', () => {
  expect(built, 'dist/cli/bundle.js or dist/mcp/bundle.js is missing: run npm run build first').toBe(true);
});

describe.skipIf(!built && !process.env.CI)('packed agentic-qe quality gate in a user project (#1454)', () => {
  let work: string;
  let pkg: string;
  let project: string;

  const env = () => ({
    ...process.env,
    HOME: join(project, '.home'),
    AQE_PROJECT_ROOT: project,
    AQE_MEMORY_BACKEND: 'memory',
    AQE_LLM_ROUTER_DISABLED: '1',
    AQE_HTTP_PORT: '0',
    AQE_SESSION_CACHE: 'off',
    AQE_LOOP_DETECTION_ENABLED: 'false',
  });

  const aqe = (...args: string[]) => spawnSync(process.execPath, [join(pkg, 'dist/cli/bundle.js'), ...args], {
    cwd: project, env: env(), encoding: 'utf8', timeout: 90_000,
  });

  beforeAll(() => {
    work = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1454-pack-')));
    const packOutput = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', work], {
      cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    const [{ filename }] = JSON.parse(packOutput) as Array<{ filename: string }>;
    execFileSync('tar', ['-xzf', join(work, filename), '-C', work]);
    pkg = join(work, 'package');
    symlinkSync(join(repoRoot, 'node_modules'), join(pkg, 'node_modules'), 'dir');

    project = join(work, 'user-project');
    mkdirSync(join(project, '.git'), { recursive: true });
    mkdirSync(join(project, '.home'), { recursive: true });
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'user-project', private: true }));
  }, 180_000);

  afterAll(() => {
    if (work) rmSync(work, { recursive: true, force: true });
  });

  it('ships the pinned anchor in the tarball', () => {
    const anchor = JSON.parse(readFileSync(join(pkg, 'verification/anchors/qe-anchor-v1.json'), 'utf8')) as { items: Array<{ id: string }> };
    expect(anchor.items.map((i) => i.id)).toEqual(CHECKLISTS);
    expect(existsSync(join(project, 'verification'))).toBe(false);
  });

  it('aqe quality-gate --list works from a user project', () => {
    const run = aqe('quality-gate', '--list', '-F', 'json');
    expect(run.status, run.stderr || run.stdout).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ checklists: CHECKLISTS });
  }, 120_000);

  it('aqe quality-gate --checklist <id> grades against the shipped anchor', () => {
    const run = aqe('quality-gate', '--checklist', 'A1-inRange', '--artifact', "it('x', () => {})", '-F', 'json');
    expect(run.stderr).not.toContain('ENOENT');
    // No oracle result was given, so the mechanical gate fails closed (exit 1).
    expect(run.status, run.stderr || run.stdout).toBe(1);
    const result = JSON.parse(run.stdout) as { verdict: string };
    expect(result.verdict).toBe('fail');

    const unknown = aqe('quality-gate', '--checklist', 'NOPE', '--artifact', 'x');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain(join(pkg, 'verification/anchors/qe-anchor-v1.json'));
  }, 120_000);

  describe('over MCP stdio', () => {
    let child: ChildProcessWithoutNullStreams;
    let nextId = 0;
    let stderr = '';
    const pending = new Map<number, (message: any) => void>();

    const request = (method: string, params: Record<string, unknown>): Promise<any> => {
      const id = ++nextId;
      return new Promise((resolveMessage, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`MCP request timed out: ${method}\n${stderr.slice(-2000)}`));
        }, 60_000);
        pending.set(id, (message) => { clearTimeout(timer); resolveMessage(message); });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    };

    beforeAll(async () => {
      child = spawn(process.execPath, [join(pkg, 'dist/mcp/bundle.js')], { cwd: project, env: env(), stdio: 'pipe' });
      child.stderr.on('data', (data) => { stderr = (stderr + String(data)).slice(-20_000); });
      createInterface({ input: child.stdout }).on('line', (line) => {
        let message: any;
        try { message = JSON.parse(line); } catch { return; }
        const resolveMessage = pending.get(message.id);
        if (!resolveMessage) return;
        pending.delete(message.id);
        resolveMessage(message);
      });
      await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'pack-1454', version: '1' } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    }, 120_000);

    afterAll(async () => {
      if (child?.exitCode === null) {
        const exited = new Promise((r) => child.once('exit', r));
        child.kill('SIGKILL');
        await exited;
      }
    });

    it('the quality gate tool grades against the shipped anchor', async () => {
      const list = await request('tools/list', {});
      const name = (list.result.tools as Array<{ name: string }>).map((t) => t.name).find((n) => /quality.gate$/.test(n));
      expect(name, 'quality gate tool is listed').toBeDefined();

      const response = await request('tools/call', { name, arguments: { checklistId: 'A1-inRange', artifact: "it('x', () => {})" } });
      expect(response.error, JSON.stringify(response.error)).toBeUndefined();
      const payload = JSON.parse(response.result.content[0].text) as { success: boolean; error?: string; data?: { verdict: string } };
      expect(payload.error ?? '').not.toContain('ENOENT');
      expect(payload.success, JSON.stringify(payload)).toBe(true);
      expect(payload.data?.verdict).toBe('fail');
    }, 120_000);
  });
});
