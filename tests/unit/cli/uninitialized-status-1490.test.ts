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

function runCli(cwd: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}, timeout = 90_000) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...extraEnv };
  for (const key of ['AQE_PROJECT_ROOT', 'AQE_STORAGE_PATH', 'AQE_MEMORY_PATH', 'AQE_MEMORY_BACKEND']) delete env[key];
  return spawnSync(process.execPath, [BUNDLE, ...args], { cwd, env, encoding: 'utf-8', timeout });
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
    expect(result.stderr).toContain(`Found a .agentic-qe at ${join(project, '.agentic-qe')} that is not an initialized AQE store`);
    expect(readdirSync(join(project, '.agentic-qe'))).toEqual([]);
  }, 120_000);

  it('names the resolved leftover .agentic-qe when run from a subdirectory', () => {
    mkdirSync(join(project, '.agentic-qe'));
    mkdirSync(join(project, 'packages', 'app'), { recursive: true });

    const result = runCli(join(project, 'packages', 'app'), ['status']);

    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain(`at ${join(project, '.agentic-qe')} that is not an initialized AQE store`);
    expect(result.stderr).toContain(`Run \`aqe init\` in ${project}`);
    expect(existsSync(join(project, 'packages', 'app', '.agentic-qe'))).toBe(false);
  }, 120_000);

  it('aqe status succeeds after a database-free `aqe init --auto --no-database`', () => {
    // init writes user-level files too; keep them out of the real HOME.
    const home = mkdtempSync(join(tmpdir(), 'aqe-uninit-1490-home-'));
    try {
      const init = runCli(project, [
        'init', '--auto', '--no-database', '--minimal', '--skip-patterns', '--skip-code-index',
        '--no-browser-engine', '--no-statusline',
      ], { HOME: home }, 300_000);
      expect(init.status, init.stdout + init.stderr).toBe(0);
      expect(existsSync(join(project, '.agentic-qe', 'config.yaml'))).toBe(true);

      const status = runCli(project, ['status'], { HOME: home });

      expect(status.status, status.stdout + status.stderr).toBe(0);
      expect(status.stderr).not.toContain(NOT_INITIALIZED);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 420_000);
});
