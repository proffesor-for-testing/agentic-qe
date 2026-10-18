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

  // #1125: `fleet run scan` used to submit scan-security, which no handler
  // runs. It now runs sast-scan, and a completed scan is judged on what it
  // found: a critical finding is listed and fails the run (review of #1144).
  function fleetScan(source: string) {
    const root = mkdtempSync(join(tmpdir(), 'aqe-fleet-scan-'));
    try {
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src/app.js'), source);
      return spawnSync(process.execPath, [cli, 'fleet', 'run', 'scan', '--target', 'src', '--parallel', '1'], {
        cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_SESSION_CACHE: 'off' },
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  it('lists a critical finding from fleet run scan and fails the run', () => {
    const result = fleetScan('export function run(input) {\n  return eval(input);\n}\n');
    expect(result.error).toBeUndefined();
    expect(result.stdout).toContain('Completed: 1');
    expect(result.stdout).toMatch(/Findings: critical [1-9]/);
    expect(result.stdout).toMatch(/\[critical\] Code Injection via eval\(\) @ .*src\/app\.js:2/);
    expect(result.stdout).toContain('Verdict: FAILED');
    expect(result.status).toBe(1);
  }, 35000);

  it('passes fleet run scan on a file without findings', () => {
    const result = fleetScan('export const add = (a, b) => a + b;\n');
    expect(result.error).toBeUndefined();
    expect(result.stdout).toContain('Findings: critical 0, high 0, medium 0, low 0');
    expect(result.stdout).toContain('Files scanned: 1 (evidence: complete)');
    expect(result.stdout).toContain('Verdict: PASSED');
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 35000);
});
