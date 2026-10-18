/**
 * Issue #1066: the worker switches over the real built entry points.
 *
 * - MCP server (dist/mcp/bundle.js, i.e. src/mcp/entry.ts): the wiring had
 *   only manual runs before. AQE_WORKERS_ENABLED=false starts no workers and
 *   prints no unknown-id warning; AQE_DISABLED_WORKERS matches ids without
 *   regard to case.
 * - CLI (`aqe daemon start`, dist/cli/bundle.js): honours
 *   AQE_WORKERS_ENABLED like the MCP server.
 *
 * Every child gets its own temporary project root, so no real store is used.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const MCP_BUNDLE = resolve('dist/mcp/bundle.js');
const CLI_BUNDLE = resolve('dist/cli/bundle.js');
const SKIP = !(existsSync(MCP_BUNDLE) && existsSync(CLI_BUNDLE)) && !process.env.CI;

interface Run {
  child: ChildProcess;
  output: () => string;
  root: string;
}

const runs: Run[] = [];

function start(args: string[], env: Record<string, string>): Run {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1066-')));
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    AQE_PROJECT_ROOT: root,
    AQE_HTTP_PORT: '0',
    AQE_SESSION_CACHE: 'off',
    AQE_LOOP_DETECTION_ENABLED: 'false',
    AQE_LLM_ROUTER_DISABLED: '1',
    ...env,
  };
  delete childEnv.AQE_MEMORY_BACKEND;
  for (const key of ['AQE_WORKERS_ENABLED', 'AQE_DISABLED_WORKERS'] as const) {
    if (!(key in env)) delete childEnv[key];
  }
  const child = spawn(process.execPath, args, { cwd: root, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  const run = { child, output: () => output, root };
  runs.push(run);
  return run;
}

async function waitFor(run: Run, predicate: (output: string) => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate(run.output())) {
    if (Date.now() > deadline) throw new Error(`Timed out. Output:\n${run.output().slice(-3000)}`);
    if (run.child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function stop(run: Run): Promise<void> {
  if (run.child.exitCode === null && run.child.signalCode === null) {
    const exited = new Promise((r) => run.child.once('exit', r));
    run.child.kill('SIGKILL');
    await exited;
  }
  rmSync(run.root, { recursive: true, force: true });
}

afterEach(async () => {
  await Promise.all(runs.splice(0).map(stop));
});

describe.skipIf(SKIP)('#1066 worker switches over the built entry points', () => {
  it('MCP: AQE_WORKERS_ENABLED=false starts no workers and prints no unknown-id warning', async () => {
    const run = start([MCP_BUNDLE], { AQE_WORKERS_ENABLED: 'false', AQE_DISABLED_WORKERS: 'no-such-worker' });

    await waitFor(run, (o) => o.includes('[MCP] Background workers'), 60_000);
    // Shut down through stdin EOF: the shutdown path also constructs the daemon.
    const exited = new Promise((r) => run.child.once('close', r));
    run.child.stdin?.end();
    await exited;

    const output = run.output();
    expect(output).toContain('[AQE] Shutting down');
    expect(output).toContain('[MCP] Background workers disabled (AQE_WORKERS_ENABLED=false)');
    // #1116: covers both "starting" and "started"; the start log changed wording.
    expect(output).not.toContain('[MCP] Background workers start');
    expect(output).not.toContain('[MCP] Quality daemon started');
    expect(output).not.toContain('unknown worker id');
  }, 90_000);

  it('MCP: AQE_DISABLED_WORKERS=Learning-Consolidation disables that worker; the quality daemon does not wait', async () => {
    const run = start([MCP_BUNDLE], { AQE_DISABLED_WORKERS: 'Learning-Consolidation' });

    await waitFor(run, (o) => o.includes('[MCP] Quality daemon started'), 60_000);

    const output = run.output();
    expect(output).toContain('[MCP] Background workers starting (10 workers');
    expect(output).not.toContain('unknown worker id');
  }, 90_000);

  it('CLI: aqe daemon start does not start when AQE_WORKERS_ENABLED=false', async () => {
    const run = start([CLI_BUNDLE, 'daemon', 'start', '--tick-interval', '100', '--ci-interval', '200'], {
      AQE_WORKERS_ENABLED: 'false',
    });

    await waitFor(run, (o) => o.includes('Background workers are disabled'), 60_000);
    await new Promise((r) => setTimeout(r, 500));

    const output = run.output();
    expect(output).toContain('Background workers are disabled (AQE_WORKERS_ENABLED=false); QE Quality Daemon not started');
    expect(output).not.toContain('QE Quality Daemon started');
  }, 90_000);
});
