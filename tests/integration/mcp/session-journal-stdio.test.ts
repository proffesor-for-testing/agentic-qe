/** Actual built MCP stdio requests write a resumable owned transcript. */
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { resumeSession } from '../../../src/mcp/services/session-resume';

it.each([false, true])('preserves built stdio lifecycle rows with owned partial-write injection=%s', async inject => {
  const root = mkdtempSync(join(tmpdir(), 'aqe-journal-stdio-'));
  const env: NodeJS.ProcessEnv = { ...process.env, AQE_JOURNAL_FAULT_ROOT: root, AQE_PROJECT_ROOT: root, AQE_HTTP_PORT: '0', AQE_SESSION_CACHE: 'off',
    AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: '1', AQE_SESSION_DURABILITY: 'true' };
  delete env.AQE_MEMORY_BACKEND;
  const bundle = process.env.AQE_JOURNAL_TEST_BUNDLE ?? resolve('dist/mcp/bundle.js');
  const child = spawn(process.execPath, [...(inject ? ['--require', resolve('tests/fixtures/session-write-fault.cjs')] : []), bundle], { cwd: root, env, stdio: 'pipe' });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => {
    let value: any; try { value = JSON.parse(line); } catch { return; }
    const waiter = pending.get(value.id); if (!waiter) return;
    clearTimeout(waiter.timer); pending.delete(value.id); waiter.resolve(value);
  });
  child.on('exit', code => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`MCP exit ${code}: ${stderr.slice(-2000)}`)); }
    pending.clear();
  });
  const request = (method: string, params: Record<string, unknown>) => new Promise<any>((resolvePromise, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP timeout ${method}: ${stderr.slice(-2000)}`)); }, 10000);
    pending.set(id, { resolve: resolvePromise, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  try {
    const initialized = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'owned-journal-fixture', version: '1' } });
    expect(initialized.error).toBeUndefined();
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    expect((await request('tools/list', {})).result.tools.some((tool: any) => tool.name === 'fleet_status')).toBe(true);
    for (let i = 0; i < 3; i++) {
      const result = await request('tools/call', { name: 'fleet_status', arguments: {} });
      expect(result.error).toBeUndefined();
      // The actual tool response is journaled without invoking an external model.
      expect(result.result.content[0].text).toBeTruthy();
    }
    if (inject) {
      const deadline = Date.now() + 2000;
      while (!stderr.includes('Owned journal partial-write injection') && Date.now() < deadline) {
        await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
      }
      expect(stderr).toContain('Owned journal partial-write injection');
      expect((await request('tools/call', { name: 'fleet_status', arguments: {} })).error).toBeUndefined();
    }
    const exited = new Promise<void>(resolvePromise => child.once('exit', () => resolvePromise()));
    await request('shutdown', {});
    await Promise.race([exited, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Owned MCP shutdown timeout')), 5000).unref())]);
    expect(child.exitCode).toBe(0);
    const directory = join(root, '.agentic-qe', 'sessions');
    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.jsonl$/);
    const path = join(directory, files[0]);
    const rows = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(rows.map(row => row.type)).toEqual(Array.from({ length: inject ? 4 : 3 }, () => ['tool_call', 'tool_result']).flat());
    expect(new Set(rows.map(row => row.uuid)).size).toBe(inject ? 8 : 6);
    expect(rows.map(row => row.parentUuid)).toEqual([null, ...rows.slice(0, -1).map(row => row.uuid)]);
    expect(resumeSession(path, { sessionRoot: directory, allowLegacyUnverified: true }).canResume).toBe(true);
  } finally {
    if (child.exitCode === null) { const exited = new Promise(resolvePromise => child.once('exit', resolvePromise)); child.kill('SIGKILL'); await exited; }
    reader.close();
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
    rmSync(root, { recursive: true, force: true });
  }
}, 20000);
