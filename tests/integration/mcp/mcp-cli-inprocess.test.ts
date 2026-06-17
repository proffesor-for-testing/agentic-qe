/**
 * Integration Regression: `agentic-qe mcp` runs the server IN-PROCESS (issue #528).
 *
 * The `mcp` subcommand used to double-spawn `node dist/mcp/bundle.js` with
 * stdio:'inherit'. With a piped stdin (any programmatic MCP client), the
 * grandchild saw `stdin-eof` right after answering `initialize` and shut down
 * (the Issue #513 guard) before it could serve `tools/list`. The fix runs the
 * entry in-process so the server owns the real stdin — matching the `aqe-mcp`
 * bin. This test drives the BUILT CLI exactly as a stdio client would.
 *
 * Requires the build artifacts (dist/cli/bundle.js + dist/mcp/bundle.js);
 * skips when they are absent so it never fails an unbuilt checkout.
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const CLI_BUNDLE = join(ROOT, 'dist', 'cli', 'bundle.js');
const MCP_BUNDLE = join(ROOT, 'dist', 'mcp', 'bundle.js');
const BUILT = existsSync(CLI_BUNDLE) && existsSync(MCP_BUNDLE);

interface DriveResult {
  initialize: boolean;
  toolsList: boolean;
  toolCount: number;
  exitCode: number | null;
}

/**
 * Spawn `node <args>`, write initialize + initialized + tools/list, then EOF
 * stdin (the exact #528 trigger). Resolve with which responses came back.
 */
function driveMcp(args: string[]): Promise<DriveResult> {
  return new Promise((resolve) => {
    const child = spawn('node', args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'] });
    const result: DriveResult = { initialize: false, toolsList: false, toolCount: 0, exitCode: null };

    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'reg-528', version: '1.0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ];
    child.stdin.write(messages.map((m) => JSON.stringify(m)).join('\n') + '\n');
    child.stdin.end(); // EOF — the premature-shutdown trigger

    let buf = '';
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1 && msg.result) result.initialize = true;
          if (msg.id === 2 && msg.result) {
            result.toolsList = true;
            result.toolCount = (msg.result.tools || []).length;
          }
        } catch { /* server logs non-JSON to stderr; ignore stray stdout lines */ }
      }
    });

    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } resolve(result); }, 45000);
    child.on('exit', (code) => { clearTimeout(timer); result.exitCode = code; resolve(result); });
  });
}

describe.skipIf(!BUILT)('#528 — `agentic-qe mcp` serves tools/list over piped stdin', () => {
  it('answers initialize AND tools/list (not just initialize) when stdin EOFs', async () => {
    // Act
    const res = await driveMcp([CLI_BUNDLE, 'mcp']);

    // Assert — the regression was: initialize answered, tools/list never did.
    expect(res.initialize).toBe(true);
    expect(res.toolsList).toBe(true);
    expect(res.toolCount).toBeGreaterThan(0);
  }, 60000);

  it('exposes the same tool surface as the direct `aqe-mcp` bundle (CLI/MCP parity)', async () => {
    // Act
    const viaCli = await driveMcp([CLI_BUNDLE, 'mcp']);
    const viaBundle = await driveMcp([MCP_BUNDLE]);

    // Assert — both entry paths expose the same tools.
    expect(viaCli.toolsList).toBe(true);
    expect(viaBundle.toolsList).toBe(true);
    expect(viaCli.toolCount).toBe(viaBundle.toolCount);
  }, 90000);
});
