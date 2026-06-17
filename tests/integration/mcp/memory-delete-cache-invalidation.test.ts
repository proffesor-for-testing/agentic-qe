/**
 * Integration Regression: `memory_delete` is not masked by the session cache (#535).
 *
 * The smoke report saw `memory_delete` return {deleted:true} while an immediate
 * `memory_retrieve` still returned the value (with an *identical* timestamp).
 * Root cause: `memory_retrieve` is isConcurrencySafe → its result is cached by
 * the Issue-#473 session cache, and `memory_delete` did not invalidate it, so
 * the follow-up read served the stale cached "found" result. The delete itself
 * worked. Fix: mutating tools invalidate their domain's cached reads.
 *
 * This drives the BUILT MCP bundle through real JSON-RPC tool calls with the
 * session cache ENABLED (the default) — the condition that exposed the bug.
 * Skips when the bundle is absent so it never fails an unbuilt checkout.
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const MCP_BUNDLE = join(ROOT, 'dist', 'mcp', 'bundle.js');
const BUILT = existsSync(MCP_BUNDLE);
// C3: skip only for local unbuilt checkouts. In CI the bundle MUST exist (the
// workflow builds first) — fail loudly rather than silently skip if it doesn't.
const SKIP = !BUILT && !process.env.CI;

interface ToolResponses { [id: number]: any }

/**
 * Drive the MCP bundle through a fixed JSON-RPC script, returning each
 * tool/call's parsed inner result keyed by request id. Stdin stays open until
 * every scripted response arrives, then the server is killed.
 */
function driveTools(calls: Array<{ id: number; name: string; arguments: Record<string, unknown> }>): Promise<ToolResponses> {
  return new Promise((resolve) => {
    // Cache ON: explicitly clear any "off" inherited from the environment.
    const env = { ...process.env, AQE_SESSION_CACHE: 'on' };
    const child = spawn('node', [MCP_BUNDLE], { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'], env });
    const responses: ToolResponses = {};
    const expected = new Set(calls.map((c) => c.id));

    const script = [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'reg535', version: '1.0' } } },
      { method: 'notifications/initialized' },
      ...calls.map((c) => ({ id: c.id, method: 'tools/call', params: { name: c.name, arguments: c.arguments } })),
    ];
    let i = 0;
    const sendNext = () => {
      if (i >= script.length) return;
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...script[i] }) + '\n');
      i++;
      if (script[i - 1] && (script[i - 1] as { method: string }).method === 'notifications/initialized') sendNext();
    };

    let buf = '';
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg: any;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === undefined) continue;
        if (expected.has(msg.id)) {
          const text = msg.result?.content?.[0]?.text;
          try { responses[msg.id] = JSON.parse(text); } catch { responses[msg.id] = msg.result ?? msg.error; }
        }
        sendNext();
        if (Object.keys(responses).length === expected.size) {
          setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } resolve(responses); }, 100);
        }
      }
    });

    sendNext(); // initialize
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } resolve(responses); }, 45000);
  });
}

describe.skipIf(SKIP)('#535 — memory_delete is not masked by the session cache', () => {
  it('retrieve after delete returns found:false even with the cache enabled', async () => {
    // Arrange + Act — store, read (populates cache), delete, read again.
    const ns = 'reg535';
    const key = 'k1';
    const r = await driveTools([
      { id: 10, name: 'memory_store', arguments: { key, value: 'v535', namespace: ns } },
      { id: 11, name: 'memory_retrieve', arguments: { key, namespace: ns } },
      { id: 12, name: 'memory_delete', arguments: { key, namespace: ns } },
      { id: 13, name: 'memory_retrieve', arguments: { key, namespace: ns } },
    ]);

    // Assert — store + first read succeed, delete reports success, and the
    // post-delete read is a genuine miss (not a stale cache hit).
    expect(r[10]?.data?.stored).toBe(true);
    expect(r[11]?.data?.found).toBe(true);
    expect(r[12]?.data?.deleted).toBe(true);
    expect(r[13]?.data?.found).toBe(false);
  }, 60000);
});
