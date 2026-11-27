/**
 * #1490: `aqe status` and `aqe health` refuse in a project that was never
 * initialized, and leave it unchanged. Runs the BUILT CLI, since the bug was
 * startup ordering (token tracking created `.agentic-qe` before the check).
 *
 * Skipped when dist/cli/bundle.js has not been built.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BUNDLE = resolve(__dirname, '../../../dist/cli/bundle.js');
const NOT_INITIALIZED = 'AQE system not initialized in this directory.';

function runCli(cwd: string, args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  for (const key of ['AQE_PROJECT_ROOT', 'AQE_STORAGE_PATH', 'AQE_MEMORY_PATH', 'AQE_MEMORY_BACKEND']) delete env[key];
  return spawnSync(process.execPath, [BUNDLE, ...args], { cwd, env, encoding: 'utf-8', timeout: 90_000 });
}

describe.skipIf(!existsSync(BUNDLE))('built CLI in an uninitialized project (#1490)', () => {
  let project: string;

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'aqe-uninit-1490-'));
    spawnSync('git', ['init', '-q'], { cwd: project });
    writeFileSync(join(project, 'package.json'), '{"name":"x"}');
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it.each(['status', 'health'])('aqe %s exits 1 with "not initialized" and creates no .agentic-qe', (command) => {
    const result = runCli(project, [command]);

    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain(NOT_INITIALIZED);
    expect(result.stdout).toContain('Run `aqe init` first');
    expect(existsSync(join(project, '.agentic-qe'))).toBe(false);
  }, 120_000);

  it.each(['status', 'health'])('aqe %s treats a leftover empty .agentic-qe as uninitialized and adds nothing', (command) => {
    mkdirSync(join(project, '.agentic-qe'));

    const result = runCli(project, [command]);

    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain(NOT_INITIALIZED);
    expect(readdirSync(join(project, '.agentic-qe'))).toEqual([]);
  }, 120_000);
});
