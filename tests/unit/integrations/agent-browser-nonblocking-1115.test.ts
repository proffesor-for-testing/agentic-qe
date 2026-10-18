/**
 * #1115: the agent-browser executor ran every `npx agent-browser` command with
 * spawnSync (30s default timeout), so a slow browser command froze the MCP
 * server (qe/tests/e2e/execute, qe/visual/compare). A stub `npx` on PATH
 * stands in for the CLI.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  AgentBrowserCommandExecutor,
  isAgentBrowserAvailable,
} from '../../../src/integrations/browser/agent-browser/command-executor.js';

describe.skipIf(process.platform === 'win32')('agent-browser commands do not block the event loop (#1115)', () => {
  let bin: string;

  beforeAll(() => {
    bin = mkdtempSync(join(tmpdir(), 'aqe-1115-agent-browser-'));
    const stub = join(bin, 'npx');
    writeFileSync(stub, `#!${process.execPath}
const args = process.argv.slice(2);
setTimeout(() => {
  if (args.length === 1) process.stdout.write('agent-browser\\nUsage: agent-browser <command>\\n');
  else process.stdout.write(JSON.stringify({ args }) + '\\n');
}, Number(process.env.SLOW_NPX_MS ?? 1500));
`);
    chmodSync(stub, 0o755);
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    if (bin) rmSync(bin, { recursive: true, force: true });
  });

  async function measure<T>(work: () => Promise<T> | T): Promise<{ value: T; maxGap: number }> {
    let maxGap = 0;
    let last = Date.now();
    const ticker = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 25);
    try {
      const value = await work();
      return { value, maxGap: Math.max(maxGap, Date.now() - last) };
    } finally {
      clearInterval(ticker);
    }
  }

  it('keeps serving timers while a command runs, and returns its JSON', async () => {
    const executor = new AgentBrowserCommandExecutor({ sessionName: 's1115' });
    const { value, maxGap } = await measure(() => executor.eval('document.title'));
    expect(value).toEqual({
      success: true,
      data: { args: ['agent-browser', '--session', 's1115', 'eval', 'document.title', '--json'] },
    });
    // The stub takes 1.5s; a synchronous call would show a gap that long.
    expect(maxGap).toBeLessThan(500);
  }, 30000);

  it('keeps serving timers during the availability probe', async () => {
    const { value, maxGap } = await measure(() => isAgentBrowserAvailable());
    expect(value).toBe(true);
    expect(maxGap).toBeLessThan(500);
  }, 30000);

  it('stops a command at its timeout and reports the failure', async () => {
    vi.stubEnv('SLOW_NPX_MS', '20000');
    const executor = new AgentBrowserCommandExecutor({ timeout: 300 });
    const started = Date.now();
    const result = await executor.execute('open', ['https://example.com']);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ETIMEDOUT/);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 30000);
});
