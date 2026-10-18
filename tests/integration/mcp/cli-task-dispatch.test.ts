import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli/bundle.js');
describe.skipIf(!existsSync(cli) && !process.env.CI)('built CLI domain dispatch', () => {
  it('executes the domain handler instead of leaving an assigned task running forever', () => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-cli-dispatch-'));
    try {
      const result = spawnSync(process.execPath, [cli, 'task', 'submit', 'execute-tests', '--wait', '--timeout', '2000', '--no-progress'], {
        cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_SESSION_CACHE: 'off' },
      });
      expect(result.error).toBeUndefined();
      expect(result.stderr).toContain('Invalid execute-tests payload: missing testFiles or framework');
      expect(result.stderr).not.toContain('Task timed out');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 35000);

  // #1125: fleet run builds the handler payload from the target. An empty
  // project has nothing to generate tests for, so nothing is submitted.
  it('refuses fleet run when the target cannot supply the handler input, as a failed process', () => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-fleet-verdict-'));
    try {
      const result = spawnSync(process.execPath, [cli, 'fleet', 'run', 'test', '--parallel', '1'], {
        cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_SESSION_CACHE: 'off' },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Operation 'test' cannot run: No source files under . to generate tests for.");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 35000);

  // #1125: `fleet run scan` used to submit scan-security, which no handler runs.
  it('runs fleet run scan through the security-compliance sast-scan handler', () => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-fleet-scan-'));
    try {
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src/unsafe.js'), 'export function run(input) {\n  return eval(input);\n}\n');
      const result = spawnSync(process.execPath, [cli, 'fleet', 'run', 'scan', '--target', 'src', '--parallel', '1'], {
        cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_SESSION_CACHE: 'off' },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Successful: 1');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 35000);
});
