/** Regression for commands that report failure through process.exitCode. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const CLI_BUNDLE = join(ROOT, 'dist', 'cli', 'bundle.js');
const SKIP = !existsSync(CLI_BUNDLE) && !process.env.CI;

describe.skipIf(SKIP)('CLI command exit codes', () => {
  it.each([
    { args: ['platform', 'verify', 'cursor'], message: 'configuration has issues' },
    { args: ['plugin', 'remove', 'nonexistent-plugin'], message: 'Plugin not found' },
    { args: ['plugin', 'install', './does-not-exist'], message: 'Installation failed' },
  ])('exits nonzero when $args reports failure', ({ args, message }) => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'aqe-cli-exit-code-'));
    try {
      const result = spawnSync(process.execPath, [CLI_BUNDLE, ...args], {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 20_000,
        env: {
          ...process.env,
          AQE_PROJECT_ROOT: projectRoot,
          AQE_MEMORY_PATH: join(projectRoot, '.agentic-qe'),
        },
      });

      expect(result.error).toBeUndefined();
      expect(result.stdout + result.stderr).toContain(message);
      expect(result.status).toBe(1);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
