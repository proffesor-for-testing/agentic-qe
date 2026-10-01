/** Real bundled MCP lifecycle regression for #801. All stores are owned fixtures. */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRvfStore, isRvfNativeAvailable } from '../../../src/integrations/ruvector/rvf-native-adapter.js';
import { readLockOwnerPid } from '../../../src/integrations/ruvector/rvf-store-integrity.js';

const bundle = resolve('dist/mcp/bundle.js');
const cliBundle = resolve('dist/cli/bundle.js');
const nativeAvailable = isRvfNativeAvailable();
const built = existsSync(bundle) && existsSync(cliBundle);

async function driveMcp(root: string, checkOwner: (pid: number) => void, memoryOnly = false, args = [bundle]) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: join(root, 'home'), AQE_PROJECT_ROOT: root };
  for (const key of Object.keys(env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key)) delete env[key];
  }
  delete env.AQE_MEMORY_BACKEND;
  if (memoryOnly) env.AQE_MEMORY_BACKEND = 'memory';
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', data => { stderr += data.toString(); });
  const closed = new Promise<{ code: number | null; signal: string | null }>((resolveClose, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveClose({ code, signal }));
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 45000);
  try {
    await new Promise<void>((resolveReady, reject) => {
      child.once('error', reject);
      child.once('close', () => reject(new Error(`MCP closed before tools/list: ${stderr}`)));
      child.stdout.on('data', data => {
        stdout += data.toString();
        let newline: number;
        while ((newline = stdout.indexOf('\n')) >= 0) {
          const line = stdout.slice(0, newline); stdout = stdout.slice(newline + 1);
          let message;
          try { message = JSON.parse(line); } catch { continue; }
          if (message.id === 2) {
            if (!message.result?.tools?.length) { reject(new Error('No MCP tools returned')); return; }
            resolveReady();
          }
        }
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'rvf-shutdown-test', version: '1' },
      } }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    });
    checkOwner(child.pid!);
    child.stdin.end();
    const result = await closed;
    expect(result).toEqual({ code: 0, signal: null });
    expect(stderr).toContain('[MCP] Server stopped');
    expect(stderr).not.toContain('Shutdown watchdog fired');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
    clearTimeout(timer);
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aqe-mcp-shutdown-'));
  mkdirSync(join(root, 'home'));
  mkdirSync(join(root, '.agentic-qe'));
  writeFileSync(join(root, 'package.json'), '{"name":"shutdown-fixture","private":true}');
  return root;
}

// Missing bundles fail in CI; native-unavailable environments explicitly skip only native cases.
describe.skipIf(!built && !process.env.CI)('bundled MCP graceful RVF shutdown', () => {
  const routes: Array<[string, string[]]> = [['aqe-mcp', [bundle]], ['aqe mcp', [cliBundle, 'mcp']]];
  it.skipIf(!nativeAvailable).each(routes)(
    '%s releases its native patterns lock on EOF across repeated starts', async (_name, args) => {
    const root = fixture();
    const path = join(root, '.agentic-qe', 'patterns.rvf');
    try {
      const store = createRvfStore(path, 384); store.close();
      for (let i = 0; i < 2; i++) {
        await driveMcp(root, pid => expect(readLockOwnerPid(path)).toBe(pid), false, args);
        expect(existsSync(`${path}.lock`)).toBe(false);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 120000);

  it.skipIf(!nativeAvailable)('preserves a different live owner and its store bytes', async () => {
    const root = fixture();
    const path = join(root, '.agentic-qe', 'patterns.rvf');
    const store = createRvfStore(path, 384);
    try {
      const bytes = readFileSync(path);
      const marker = readFileSync(`${path}.lock`);
      await driveMcp(root, () => expect(readLockOwnerPid(path)).toBe(process.pid));
      expect(readFileSync(path)).toEqual(bytes);
      expect(readFileSync(`${path}.lock`)).toEqual(marker);
    } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
  }, 60000);

  it('shuts down normally when database-free startup opens no native adapter', async () => {
    const root = fixture();
    try {
      await driveMcp(root, () => {}, true);
      expect(existsSync(join(root, '.agentic-qe', 'patterns.rvf.lock'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60000);
});
