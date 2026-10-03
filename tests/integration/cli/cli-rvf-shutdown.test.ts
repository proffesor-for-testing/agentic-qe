/** #814: real bundled CLI exits release only their own native stores. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRvfStore, isRvfNativeAvailable } from '../../../src/integrations/ruvector/rvf-native-adapter.js';
import { readLockOwnerPid } from '../../../src/integrations/ruvector/rvf-store-integrity.js';

const bundle = resolve('dist/cli/bundle.js');
const nativeAvailable = isRvfNativeAvailable();
const commands = [['status'], ['agent', 'list'], ['health'], ['memory', 'list']];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aqe-cli-store-exit-'));
  mkdirSync(join(root, 'home'));
  mkdirSync(join(root, '.agentic-qe'));
  writeFileSync(join(root, 'package.json'), '{"name":"cli-exit-fixture","private":true}');
  return root;
}

function run(root: string, args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: join(root, 'home'), AQE_PROJECT_ROOT: root };
  for (const key of Object.keys(env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key)) delete env[key];
  }
  // Fixtures exercise the default persistent backend, never a caller's DB.
  delete env.AQE_MEMORY_BACKEND;
  delete env.AQE_MEMORY_PATH;
  env.AQE_LLM_ROUTER_DISABLED = 'true';
  return spawnSync(process.execPath, [bundle, ...args], { cwd: root, env, encoding: 'utf8', timeout: 45000 });
}

describe.skipIf(!existsSync(bundle) && !process.env.CI)('bundled CLI native store release', () => {
  it.skipIf(!nativeAvailable).each(commands)('%s leaves no owned patterns lock across repeated exits', (...args) => {
    const root = fixture();
    const path = join(root, '.agentic-qe', 'patterns.rvf');
    try {
      createRvfStore(path, 384).close();
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = run(root, args);
        expect(result.error, result.stderr).toBeUndefined();
        expect(result.status, result.stderr).toBe(0);
        expect(existsSync(`${path}.lock`), `${args.join(' ')} left patterns.rvf.lock behind`).toBe(false);
        expect(result.stderr).not.toContain('Removed stale lock file');
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 120000);

  it.skipIf(!nativeAvailable)('does not unlink another live process owner or modify its RVF file', () => {
    const root = fixture();
    const path = join(root, '.agentic-qe', 'patterns.rvf');
    const store = createRvfStore(path, 384);
    try {
      const bytes = readFileSync(path);
      const marker = readFileSync(`${path}.lock`);
      const result = run(root, ['status']);
      expect(result.error, result.stderr).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(readLockOwnerPid(path)).toBe(process.pid);
      expect(readFileSync(path)).toEqual(bytes);
      expect(readFileSync(`${path}.lock`)).toEqual(marker);
    } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
  }, 60000);

  it('version fast path opens no project stores', () => {
    const root = fixture();
    try {
      const result = run(root, ['--version']);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(existsSync(join(root, '.agentic-qe', 'patterns.rvf'))).toBe(false);
      expect(existsSync(join(root, '.agentic-qe', 'memory.db'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
