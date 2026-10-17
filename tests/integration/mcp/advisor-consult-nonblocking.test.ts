/**
 * #1074: advisor_consult shelled out to `aqe llm advise` with execFileSync and
 * a 60s timeout, so the MCP server answered no other request until the advisor
 * returned. A stub `aqe` on PATH stands in for the advisor CLI.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createMCPProtocolServer, type MCPProtocolServer } from '../../../src/mcp/protocol-server.js';

describe.skipIf(process.platform === 'win32')('advisor_consult does not block the MCP server (#1074)', () => {
  let bin: string;
  let server: MCPProtocolServer;

  async function call(name: string, args: Record<string, unknown>) {
    const result = await server['handleRequest']({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as { content: Array<{ text: string }> };
    return JSON.parse(result.content[0].text);
  }

  beforeAll(() => {
    bin = mkdtempSync(join(tmpdir(), 'aqe-1074-advisor-'));
    const stub = join(bin, 'aqe');
    writeFileSync(stub, `#!${process.execPath}\nsetTimeout(() => process.stdout.write(JSON.stringify({ advice: 'stub', args: process.argv.slice(2) }) + '\\n'), 1500);\n`);
    chmodSync(stub, 0o755);
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
    server = createMCPProtocolServer();
  });

  afterAll(async () => {
    await server?.stop();
    vi.unstubAllEnvs();
    if (bin) rmSync(bin, { recursive: true, force: true });
  });

  it('keeps serving timers while the advisor CLI runs, and returns its JSON', async () => {
    let maxGap = 0;
    let last = Date.now();
    const ticker = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 25);
    let result: Record<string, unknown>;
    try {
      result = await call('advisor_consult', { agent: 'qe-test-architect', task: 'plan tests' });
    } finally {
      // The final gap counts too: a blocked loop resumes with the result
      // already settled, before the interval could fire again.
      maxGap = Math.max(maxGap, Date.now() - last);
      clearInterval(ticker);
    }
    expect(result).toMatchObject({ advice: 'stub', args: expect.arrayContaining(['llm', 'advise', '--agent', 'qe-test-architect', '--json']) });
    // The stub takes 1.5s; a synchronous call would show a gap that long.
    expect(maxGap).toBeLessThan(500);
  }, 30000);
});
