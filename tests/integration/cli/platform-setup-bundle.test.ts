/** The shipped CLI must be able to load a platform installer from its bundle. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_REGISTRY, type PlatformId } from '../../../src/init/platform-config-generator.js';

const ROOT = join(__dirname, '..', '..', '..');
const CLI_BUNDLE = join(ROOT, 'dist', 'cli', 'bundle.js');
const SKIP = !existsSync(CLI_BUNDLE) && !process.env.CI;

describe.skipIf(SKIP)('bundled platform setup', () => {
  it.each(Object.keys(PLATFORM_REGISTRY) as PlatformId[])(
    'installs %s configuration from the built CLI',
    (platformId) => {
      const projectRoot = mkdtempSync(join(tmpdir(), 'aqe-platform-setup-'));
      try {
        const result = spawnSync(process.execPath, [CLI_BUNDLE, 'platform', 'setup', platformId], {
          cwd: projectRoot,
          encoding: 'utf-8',
          timeout: 20_000,
          env: {
            ...process.env,
            AQE_PROJECT_ROOT: projectRoot,
            AQE_MEMORY_PATH: join(projectRoot, '.agentic-qe'),
          },
        });

        const platform = PLATFORM_REGISTRY[platformId];
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(`${platform.name} configured successfully`);
        expect(existsSync(join(projectRoot, platform.configPath))).toBe(true);
        expect(existsSync(join(projectRoot, platform.rulesPath))).toBe(true);
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    }
  );

  it('exits nonzero when an installer cannot write configuration', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'aqe-platform-setup-fail-'));
    try {
      writeFileSync(join(projectRoot, '.cursor'), 'blocks the configuration directory');
      const result = spawnSync(process.execPath, [CLI_BUNDLE, 'platform', 'setup', 'cursor'], {
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
      expect(result.stdout).toContain('Cursor setup failed');
      expect(result.status).toBe(1);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
