/**
 * Integration tests for `aqe memory` output hygiene.
 *
 * Spawns the built CLI in a fresh project initialised with
 * `aqe init --auto --minimal --skip-code-index` and verifies that:
 *   - by default, memory subcommands print no INFO diagnostics to stderr
 *     (previously ~90 lines of fleet-init logging per invocation);
 *   - LOG_LEVEL / AQE_LOG_LEVEL / AQE_VERBOSE bring the diagnostics back,
 *     on stderr only, so stdout stays machine-readable.
 *
 * These tests assume `npm run build` has been run (they execute the bundle
 * in `dist/cli/bundle.js`).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI_PATH = resolve(__dirname, '..', '..', '..', 'dist', 'cli', 'bundle.js');

/** Log-related variables stripped so each test controls them explicitly. */
const LOG_ENV_KEYS = ['LOG_LEVEL', 'AQE_LOG_LEVEL', 'AQE_VERBOSE', 'AQE_PROJECT_ROOT', 'DEBUG'];

/** Diagnostic line shapes: "[HH:MM:SS.mmm] [INFO ]" and "[UnifiedMemory] ...". */
const INFO_LINE_RE = /\[INFO\s*\]/;
const TAGGED_LINE_RE = /^\[[A-Za-z][\w./:-]*\]\s/m;

let projectDir: string;
let homeDir: string;

function runCli(args: string[], envExtra: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: homeDir, ...envExtra };
  for (const key of LOG_ENV_KEYS) {
    if (!(key in envExtra)) delete env[key];
  }
  const res = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: projectDir,
    encoding: 'utf-8',
    env,
    timeout: 60_000,
  });
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', status: res.status };
}

describe('aqe memory — quiet output', { timeout: 120_000 }, () => {
  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(
        `CLI bundle not found at ${CLI_PATH}. Run \`npm run build\` before running integration tests.`,
      );
    }
    projectDir = mkdtempSync(join(tmpdir(), 'aqe-memory-quiet-'));
    homeDir = mkdtempSync(join(tmpdir(), 'aqe-memory-quiet-home-'));
    writeFileSync(join(projectDir, 'package.json'), '{"name":"memory-quiet","version":"1.0.0"}\n');

    const init = runCli(['init', '--auto', '--minimal', '--skip-code-index']);
    expect(init.status, init.stderr).toBe(0);

    const store = runCli(['memory', 'store', '--key', 'greeting', '--value', 'hello', '--namespace', 'aqe']);
    expect(store.status, store.stderr).toBe(0);
  });

  afterAll(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('should print no INFO lines to stderr for `aqe memory list` by default', () => {
    const res = runCli(['memory', 'list', '--namespace', 'aqe']);

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('greeting');
    expect(res.stderr).not.toMatch(INFO_LINE_RE);
    expect(res.stderr).not.toMatch(TAGGED_LINE_RE);
    expect(res.stderr).not.toContain('Auto-initializing');
    expect(res.stderr).not.toContain('System ready');
  });

  it.each([
    ['store', ['memory', 'store', '--key', 'k2', '--value', 'v2', '--namespace', 'aqe']],
    ['get', ['memory', 'get', '--key', 'greeting', '--namespace', 'aqe']],
    ['search', ['memory', 'search', '--pattern', 'greet*', '--namespace', 'aqe']],
    ['usage', ['memory', 'usage']],
    ['delete', ['memory', 'delete', '--key', 'k2', '--namespace', 'aqe']],
  ])('should keep stderr empty for `aqe memory %s` by default', (_name, args) => {
    const res = runCli(args);

    expect(res.status, res.stderr).toBe(0);
    expect(res.stderr).toBe('');
  });

  it('should keep stdout valid JSON with --json', () => {
    const res = runCli(['memory', 'get', '--key', 'greeting', '--namespace', 'aqe', '--json']);

    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout)).toMatchObject({ success: true, data: { found: true, value: 'hello' } });
  });

  it.each([
    ['LOG_LEVEL=info', { LOG_LEVEL: 'info' }],
    ['AQE_LOG_LEVEL=info', { AQE_LOG_LEVEL: 'info' }],
    ['AQE_VERBOSE=1', { AQE_VERBOSE: '1' }],
  ])('should print diagnostics to stderr only with %s', (_name, env) => {
    const res = runCli(['memory', 'list', '--namespace', 'aqe'], env);

    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/^\[HybridBackend\] Initialized/m);
    expect(res.stdout).not.toMatch(TAGGED_LINE_RE);
  });

  it('should let AQE_LOG_LEVEL override LOG_LEVEL', () => {
    const res = runCli(['memory', 'list', '--namespace', 'aqe'], { LOG_LEVEL: 'info', AQE_LOG_LEVEL: 'error' });

    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
  });
});
