/**
 * #1074: the execute-tests handler ran its runner with spawnSync, which froze
 * the MCP server's event loop for the whole test run. runTestRunnerProcess is
 * the async replacement; it must keep spawnSync's observable results while
 * letting timers and other requests run. Uses real child processes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTestRunnerProcess } from '../../../src/shared/test-runner-process.js';

const node = process.execPath;
let dir: string;

beforeAll(() => { dir = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1074-proc-'))); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('runTestRunnerProcess (#1074)', () => {
  it('keeps the event loop responsive while the runner works', async () => {
    let maxGap = 0;
    let last = Date.now();
    const ticker = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 20);
    try {
      const result = await runTestRunnerProcess(node, ['-e', 'setTimeout(() => {}, 1500)'], { cwd: dir, timeout: 10000 });
      expect(result.status).toBe(0);
    } finally {
      // The final gap counts too: a blocked loop resumes with the result
      // already settled, before the interval could fire again.
      maxGap = Math.max(maxGap, Date.now() - last);
      clearInterval(ticker);
    }
    // A blocking spawnSync would show one gap of about 1500ms.
    expect(maxGap).toBeLessThan(500);
  });

  it('reports exit status and captures stdout and stderr as text', async () => {
    const result = await runTestRunnerProcess(node, ['-e', 'process.stdout.write("out é"); process.stderr.write("err"); process.exit(3)'], { cwd: dir, timeout: 10000 });
    expect(result).toEqual({ status: 3, signal: null, stdout: 'out é', stderr: 'err', error: undefined });
  });

  it('runs in the requested cwd with the requested env', async () => {
    const result = await runTestRunnerProcess(node, ['-e', 'process.stdout.write(process.cwd() + "|" + process.env.AQE_1074_PROBE)'], {
      cwd: dir, timeout: 10000, env: { ...process.env, AQE_1074_PROBE: 'set' },
    });
    expect(result.stdout).toBe(`${dir}|set`);
  });

  it('inherits the server environment by default', async () => {
    process.env.AQE_1074_INHERITED = 'inherited';
    try {
      const result = await runTestRunnerProcess(node, ['-e', 'process.stdout.write(String(process.env.AQE_1074_INHERITED))'], { cwd: dir, timeout: 10000 });
      expect(result.stdout).toBe('inherited');
    } finally {
      delete process.env.AQE_1074_INHERITED;
    }
  });

  it('reports a terminating signal', async () => {
    const result = await runTestRunnerProcess(node, ['-e', 'process.kill(process.pid, "SIGKILL")'], { cwd: dir, timeout: 10000 });
    expect(result).toMatchObject({ status: null, signal: 'SIGKILL', error: undefined });
  });

  it('kills the runner and its children on timeout, as ETIMEDOUT with SIGTERM', async () => {
    const marker = join(dir, 'grandchild-survived');
    // The runner starts a grandchild that would write the marker after 1.5s.
    const script = `require("child_process").spawn(process.execPath, ["-e", ${JSON.stringify(`setTimeout(() => require("fs").writeFileSync(${JSON.stringify(marker)}, "x"), 1500)`)}], { stdio: "inherit" }); process.stdout.write("started"); setInterval(() => {}, 1000);`;
    const started = Date.now();
    const result = await runTestRunnerProcess(node, ['-e', script], { cwd: dir, timeout: 300 });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result).toMatchObject({ status: null, signal: 'SIGTERM', stdout: 'started' });
    expect(result.error?.code).toBe('ETIMEDOUT');
    await new Promise(r => setTimeout(r, 1800));
    expect(existsSync(marker)).toBe(false);
  }, 10000);

  it('stops a runner whose output exceeds the buffer limit, as ENOBUFS with output truncated', async () => {
    const result = await runTestRunnerProcess(node, ['-e', 'process.stdout.write("x".repeat(4096)); setInterval(() => {}, 1000)'], {
      cwd: dir, timeout: 10000, maxBuffer: 1024,
    });
    expect(result.error?.code).toBe('ENOBUFS');
    expect(result.stdout).toHaveLength(1024);
    expect(result.status).toBeNull();
  });

  it('reports a runner that cannot start as the spawn error', async () => {
    const result = await runTestRunnerProcess('aqe-1074-no-such-runner', [], { cwd: dir, timeout: 10000 });
    expect(result.status).toBeNull();
    expect(result.error?.code).toBe('ENOENT');
  });

  it('applies spawnSync\'s 1 MiB limit when none is given', async () => {
    const out = join(dir, 'size');
    const result = await runTestRunnerProcess(node, ['-e', `process.stdout.write("y".repeat(1024 * 1024)); require("fs").writeFileSync(${JSON.stringify(out)}, "done")`], { cwd: dir, timeout: 10000 });
    expect(result.error).toBeUndefined();
    expect(result.stdout).toHaveLength(1024 * 1024);
    expect(readFileSync(out, 'utf8')).toBe('done');
  });
});
