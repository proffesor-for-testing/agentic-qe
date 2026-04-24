/**
 * Integration tests for `aqe upgrade`.
 *
 * Spawns the built CLI binary and verifies that:
 *   - `aqe upgrade --json` emits a valid, shaped JSON report.
 *   - The human renderer produces expected section headers and markers.
 *   - Exit codes follow the contract: 0/1/2 based on dep state + --strict.
 *
 * These tests assume `npm run build` has been run (they execute the bundle
 * in `dist/cli/bundle.js`). They do NOT re-run the build — doing so here
 * would make them slow and duplicate CI work.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CLI_PATH = resolve(__dirname, '..', '..', '..', 'dist', 'cli', 'bundle.js');

function runCli(args: string[], envExtra: NodeJS.ProcessEnv = {}): {
  stdout: string;
  stderr: string;
  status: number | null;
} {
  const res = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...envExtra },
    // Give it a wide timeout — upgrade is fast but bundle import can take
    // a second on a cold FS.
    timeout: 20_000,
  });
  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    status: res.status,
  };
}

describe('aqe upgrade — integration', () => {
  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(
        `CLI bundle not found at ${CLI_PATH}. Run \`npm run build\` before running integration tests.`,
      );
    }
  });

  it('emits a valid JSON report with --json', () => {
    const res = runCli(['upgrade', '--json']);
    expect(res.status === 0 || res.status === 1).toBe(true);
    // The JSON payload is everything before the first newline after the last `}`.
    // The CLI prints exactly one JSON object followed by '\n'.
    const parsed = JSON.parse(res.stdout);

    // Top-level shape
    expect(parsed).toMatchObject({
      aqeVersion: expect.any(String),
      platform: {
        os: expect.any(String),
        arch: expect.any(String),
        node: expect.stringMatching(/^v\d+\./),
      },
      natives: expect.any(Array),
      flags: expect.any(Object),
      envOverrides: expect.any(Array),
      recommendations: expect.any(Array),
      summary: {
        requiredOk: expect.any(Boolean),
        optionalMissingCount: expect.any(Number),
        optionalLoadedCount: expect.any(Number),
      },
    });

    // Natives shape — at least one entry, each with a status in the allowed set
    expect(parsed.natives.length).toBeGreaterThan(0);
    for (const n of parsed.natives) {
      expect(n.packageName).toEqual(expect.any(String));
      expect(['loaded', 'missing', 'required-missing']).toContain(n.status);
    }

    // Flags we expose in the report
    for (const key of [
      'useRVFPatternStore',
      'useSublinearSolver',
      'useNativeHNSW',
      'useGraphMAEEmbeddings',
      'useQEFlashAttention',
    ]) {
      expect(parsed.flags).toHaveProperty(key);
      expect(typeof parsed.flags[key]).toBe('boolean');
    }
  }, 30_000);

  it('human output carries the expected section headers', () => {
    const res = runCli(['upgrade']);
    expect(res.status === 0 || res.status === 1).toBe(true);
    expect(res.stdout).toContain('aqe upgrade');
    expect(res.stdout).toContain('Native bindings:');
    expect(res.stdout).toContain('Flag state');
    expect(res.stdout).toContain('Recommendations:');
    expect(res.stdout).toContain('Summary:');
  }, 30_000);

  it('exit code matches the contract: 0 or 1 when required deps OK', () => {
    const res = runCli(['upgrade', '--json']);
    expect([0, 1]).toContain(res.status);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.summary.requiredOk).toBe(true);
  }, 30_000);

  it('--strict produces a distinct exit code when optionals are missing', () => {
    const normal = runCli(['upgrade', '--json']);
    const strict = runCli(['upgrade', '--json', '--strict']);

    const parsed = JSON.parse(normal.stdout);
    if (parsed.summary.optionalMissingCount > 0) {
      expect(normal.status).toBe(0);
      expect(strict.status).toBe(1);
    } else {
      // Fully loaded environment: both should be 0.
      expect(normal.status).toBe(0);
      expect(strict.status).toBe(0);
    }
  }, 30_000);

  it('reports any RUVECTOR_* env overrides in the JSON output', () => {
    const res = runCli(['upgrade', '--json'], {
      RUVECTOR_USE_RVF_PATTERN_STORE: 'true',
    });
    const parsed = JSON.parse(res.stdout);
    const found = parsed.envOverrides.find(
      (o: { envVar: string }) => o.envVar === 'RUVECTOR_USE_RVF_PATTERN_STORE',
    );
    expect(found).toBeDefined();
    expect(found.value).toBe('true');
    expect(found.flagName).toBe('useRVFPatternStore');
  }, 30_000);
});
