/**
 * #1075, CLI side of the MCP-CLI parity: `aqe task submit` accepted task types
 * that no domain plugin executes, printed a task ID and then waited out the
 * whole --timeout on a task that could never finish ("Task timed out").
 * The built CLI must reject such a type up front with the reason, and still
 * run a handled type to completion.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli/bundle.js');

function runCli(args: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'aqe-1075-cli-'));
  try {
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, '.home'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'aqe-1075-cli', version: '1.0.0', type: 'module' }));
    writeFileSync(join(root, 'src/math.js'), 'export function add(a, b) { return a + b; }');
    const started = Date.now();
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, HOME: join(root, '.home'), AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory',
        AQE_HTTP_PORT: '0', AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false',
        AQE_LLM_ROUTER_DISABLED: '1', NO_COLOR: '1' },
    });
    return { ...result, elapsedMs: Date.now() - started };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe.skipIf(!existsSync(cli) && !process.env.CI)('built CLI task submit rejects task types no domain executes (#1075)', () => {
  it.each(['assess-quality', 'scan-security'])('rejects %s up front instead of waiting out --timeout', type => {
    const result = runCli(['task', 'submit', type, '--wait', '--timeout', '30000', '--no-progress']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`No handler for task type '${type}'`);
    expect(result.stderr).toContain('supported:');
    expect(result.stdout).not.toMatch(/ID: task_/);
    expect(result.stdout + result.stderr).not.toContain('Task timed out');
    expect(result.elapsedMs).toBeLessThan(30000);
  }, 100000);

  it('still runs a handled type to completion', () => {
    const result = runCli(['task', 'submit', 'index', '--domain', 'code-intelligence',
      '--payload', JSON.stringify({ paths: ['src/math.js'] }), '--wait', '--timeout', '30000', '--no-progress']);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout + result.stderr).toContain('Task completed successfully');
  }, 100000);
});
