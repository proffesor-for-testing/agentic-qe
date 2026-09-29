/**
 * Integration regression for #734 cases C and D, driven through the built CLI
 * because the defect is the process exit code a script or CI job observes.
 *
 * C: a detached `task submit` (no --wait) must not report success for a task
 *    that lives only in this process and is abandoned on exit.
 * D: an unknown --domain must be rejected with a nonzero exit.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli/bundle.js');

function runCli(args: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'aqe-task-submit-'));
  try {
    return spawnSync(process.execPath, [cli, ...args], {
      cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_SESSION_CACHE: 'off', NO_COLOR: '1' },
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe.skipIf(!existsSync(cli) && !process.env.CI)('built CLI task submit honesty (#734)', () => {
  it('D: rejects an unknown --domain with a nonzero exit and no task ID', () => {
    const result = runCli(['task', 'submit', 'analyze-coverage', '--domain', 'no-such-domain', '--wait', '--no-progress']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown domain: no-such-domain');
    expect(result.stderr).toContain('coverage-analysis');
    expect(result.stdout).not.toMatch(/ID: task_/);
  }, 35000);

  it('D: rejects an unknown --domain on a detached submit too', () => {
    const result = runCli(['task', 'submit', 'analyze-coverage', '--domain', 'no-such-domain', '--no-progress']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown domain: no-such-domain');
  }, 35000);

  it('C: refuses a detached submit instead of printing an ID for abandoned work', () => {
    const result = runCli(['task', 'submit', 'analyze-coverage', '--domain', 'coverage-analysis', '--no-progress']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not persisted');
    expect(result.stderr).toContain('--wait');
    expect(result.stdout).not.toMatch(/ID: task_/);
  }, 35000);
});
