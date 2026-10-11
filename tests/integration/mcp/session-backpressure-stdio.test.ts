/** Owned built-MCP storage pressure preserves tool outcomes and blocks later mutations. */
import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, renameSync, mkdirSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { resumeSession } from '../../../src/mcp/services/session-resume';

it('returns completed large reads, blocks a subsequent mutation, and records the durable gap after recovery', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aqe-backpressure-stdio-'));
  const inference = createServer((_request, response) => { response.writeHead(503); response.end('Owned inference disabled'); });
  await new Promise<void>(resolvePromise => inference.listen(0, '127.0.0.1', resolvePromise));
  const address = inference.address(); if (!address || typeof address === 'string') throw new Error('Missing owned HTTP port');
  const env: NodeJS.ProcessEnv = { ...process.env, AQE_PROJECT_ROOT: root, AQE_HTTP_PORT: '0', AQE_SESSION_CACHE: 'off',
    AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: '1', AQE_SESSION_DURABILITY: 'true',
    AQE_EMBEDDER_ENDPOINT: `http://127.0.0.1:${address.port}` };
  delete env.AQE_MEMORY_BACKEND;
  const child = spawn(process.execPath, [resolve('dist/mcp/bundle.js')], { cwd: root, env, stdio: 'pipe' });
  let stderr = ''; child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  let id = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => { let value: any; try { value = JSON.parse(line); } catch { return; }
    const waiter = pending.get(value.id); if (!waiter) return; clearTimeout(waiter.timer); pending.delete(value.id); waiter.resolve(value); });
  child.on('exit', code => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`MCP exit ${code}: ${stderr.slice(-1000)}`)); } pending.clear(); });
  const request = (method: string, params: Record<string, unknown>) => new Promise<any>((resolvePromise, reject) => {
    const next = ++id; const timer = setTimeout(() => { pending.delete(next); reject(new Error(`MCP timeout ${method}: ${stderr.slice(-1000)}`)); }, 10000);
    pending.set(next, { resolve: resolvePromise, reject, timer }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: next, method, params }) + '\n');
  });
  const call = async (name: string, args: Record<string, unknown>) => {
    const envelope = await request('tools/call', { name, arguments: args });
    expect(envelope.error).toBeUndefined();
    return { envelope: envelope.result, result: JSON.parse(envelope.result.content[0].text) };
  };
  let restore: (() => void) | undefined;
  try {
    expect((await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'owned-pressure-fixture', version: '1' } })).error).toBeUndefined();
    const payload = { text: 'x'.repeat(700 * 1024) };
    expect((await call('memory_store', { key: 'owned-large-value', value: payload, namespace: 'owned-pressure' })).result.success).toBe(true);
    // Let the normal accepted seed rows flush before introducing the owned obstruction.
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
    const directory = join(root, '.agentic-qe', 'sessions');
    const file = join(directory, readdirSync(directory).find(name => name.endsWith('.jsonl'))!);
    renameSync(file, `${file}.saved`); mkdirSync(file);
    restore = () => { rmdirSync(file); renameSync(`${file}.saved`, file); restore = undefined; };
    for (let i = 0; i < 6; i++) {
      const read = await call('memory_retrieve', { key: 'owned-large-value', namespace: 'owned-pressure' });
      expect(read.result.success).toBe(true); expect(read.result.data.value.text.length).toBe(payload.text.length);
    }
    const blocked = await call('memory_store', { key: 'must-not-run', value: { owned: true }, namespace: 'owned-pressure' });
    restore();
    const afterRecovery = await call('memory_retrieve', { key: 'must-not-run', namespace: 'owned-pressure' });
    console.log('Observed blocked mutation success/found:', blocked.result.success, afterRecovery.result.data?.found);
    expect(blocked.envelope.isError).toBe(true);
    expect(afterRecovery.result.data.found).toBe(false);
    expect(stderr).toContain('[MCP] [SessionDurability] transcript incomplete');
    const exited = new Promise<void>(resolvePromise => child.once('exit', () => resolvePromise()));
    await request('shutdown', {});
    await Promise.race([exited, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Owned shutdown timeout')), 5000).unref())]);
    expect(child.exitCode).toBe(0);
    const rows = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const gap = rows.find(row => row.result?.code === 'SESSION_TRANSCRIPT_GAP');
    expect(gap).toMatchObject({ type: 'error', state: 'requires_action' });
    expect(gap.result.rejectedToolResults).toBeGreaterThanOrEqual(1);
    expect(gap.result.rejectedToolCalls).toBeGreaterThanOrEqual(1);
    const resumed = resumeSession(file, { sessionRoot: directory, allowLegacyUnverified: true });
    expect(resumed.canResume).toBe(true);
    expect(resumed.diagnostics.join(' ')).toContain('missing lifecycle entries');
  } finally {
    restore?.();
    if (child.exitCode === null) { const exited = new Promise(resolvePromise => child.once('exit', resolvePromise)); child.kill('SIGKILL'); await exited; }
    reader.close(); for (const waiter of pending.values()) clearTimeout(waiter.timer);
    inference.closeAllConnections(); await new Promise<void>((resolvePromise, reject) => inference.close(error => error ? reject(error) : resolvePromise()));
    rmSync(root, { recursive: true, force: true });
  }
}, 25000);
