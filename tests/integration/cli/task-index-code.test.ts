/** #1081: the public index-code task must execute rather than await a timeout. */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli/bundle.js');

function execute(type: string, payload: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), 'aqe-index-task-cli-'));
  try {
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, '.home'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/math.js'), 'export function add(a,b) { return a+b; }');
    return spawnSync(process.execPath, [cli, 'task', 'submit', type, '--domain', 'code-intelligence', '--payload', JSON.stringify(payload), '--wait', '--timeout', '5000', '--no-progress'], {
      cwd: root, encoding: 'utf8', timeout: 12000,
      env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, HOME: join(root, '.home'),
        AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_LLM_ROUTER_DISABLED: 'true',
        AQE_WORKERS_ENABLED: 'false', AQE_SESSION_CACHE: 'off', NO_COLOR: '1' },
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('built CLI code-index task alias', () => {
  it.each(['index-code', 'index'])('executes %s against the requested file', type => {
    const result = execute(type, { paths: ['src/math.js'] });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout + result.stderr).toContain('Task completed successfully');
    expect(result.stdout + result.stderr).not.toContain('Task timed out');
  }, 15000);

  it('reports a missing payload as a terminal error', () => {
    const result = execute('index-code', {});
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toContain('Invalid index payload: missing paths');
    expect(result.stderr + result.stdout).not.toContain('Task timed out');
  }, 15000);
});
