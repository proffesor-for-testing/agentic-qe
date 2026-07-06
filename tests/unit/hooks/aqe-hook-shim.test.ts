/**
 * Resilient hook shim contract (#510 item 5).
 *
 * .claude/hooks/aqe-hook.cjs (a cross-platform Node shim) wraps the AQE bundle
 * hooks so that, per ruflo's hook-shim discipline, a hook NEVER blocks a Claude
 * Code turn and NEVER dumps init noise into the transcript:
 *   - always exits 0 (even on missing bundle / bad subcommand / crash);
 *   - swallows stderr;
 *   - emits ONLY the --json contract on stdout (drops leading [hooks]/[RVF]
 *     init-noise lines AND trailing async daemon logs);
 *   - resolves a PROJECT-LOCAL AQE bundle (installed dep, then source build).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(__dirname, '../../..');
const SHIM = resolve(REPO_ROOT, '.claude/hooks/aqe-hook.cjs');

/** Run the shim via node, returning { stdout, stderr, code }; never throws on non-zero. */
function runShim(
  args: string[],
  projectDir: string,
  extraEnv: Record<string, string> = {},
): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execFileSync('node', [SHIM, ...args], {
      cwd: REPO_ROOT,
      // AQE_HOOK_NPX=0 disables the npx fallback so the no-local-bundle cases
      // no-op deterministically instead of reaching the network.
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, AQE_HOOK_NPX: '0', ...extraEnv },
      encoding: 'utf-8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '', code: e.status ?? 1 };
  }
}

describe('aqe-hook.cjs resilient shim (#510 item 5)', () => {
  it('exists', () => {
    expect(existsSync(SHIM)).toBe(true);
  });

  it('exits 0 and emits nothing when no project-local AQE exists (never blocks a turn)', () => {
    const r = runShim(['route', '--task', 'x', '--json'], '/nonexistent-project-root');
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('exits 0 on an unknown subcommand and never leaks stderr to the caller', () => {
    // Copy the REAL built bundle into a tmpdir rather than pointing projectDir
    // at '.' (the repo) — using the repo root here would make this test's
    // expected-failure (EMPTY-RESULT: unknown subcommand exits non-zero with
    // no JSON) write a real line to the actual project's hooks-health.log on
    // every test run, polluting it with test noise instead of real findings.
    const tmp = mkdtempSync(join(tmpdir(), 'aqe-shim-'));
    try {
      mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
      const realBundle = resolve(REPO_ROOT, 'dist/cli/bundle.js');
      writeFileSync(join(tmp, 'dist', 'cli', 'bundle.js'), readFileSync(realBundle));
      const r = runShim(['__definitely_not_a_hook__', '--json'], tmp);
      expect(r.code).toBe(0);
      expect(r.stderr).toBe('');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // JSON-extraction contract, tested deterministically against a FAKE bundle
  // that brackets the JSON with init noise (leading) AND async noise (trailing).
  describe('strips noise around the JSON (fake bundle)', () => {
    let tmp: string;
    afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

    function withFakeBundle(body: string): { stdout: string; code: number } {
      tmp = mkdtempSync(join(tmpdir(), 'aqe-shim-'));
      mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
      // The shim runs `node "<bundle>" hooks "$@"`; this fake ignores args.
      writeFileSync(join(tmp, 'dist', 'cli', 'bundle.js'), body);
      return runShim(['route', '--json'], tmp);
    }

    it('drops leading init noise AND trailing async noise, leaving valid JSON', () => {
      const r = withFakeBundle(`
        console.log('[hooks] CoherenceService initialized with WASM engines');
        console.log('[RvfPatternStore] Initialized: .agentic-qe/patterns.rvf (dim=384)');
        console.log(JSON.stringify({ recommendedAgent: 'qe-test-architect', ok: true }, null, 2));
        console.log('[hooks] async dream log printed AFTER the json');
      `);
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed).toEqual({ recommendedAgent: 'qe-test-architect', ok: true });
      expect(/\[(hooks|RVF|RvfPatternStore)\]/.test(r.stdout)).toBe(false);
    });

    it('exits 0 and emits nothing when the bundle crashes', () => {
      const r = withFakeBundle(`console.error('boom'); process.exit(2);`);
      expect(r.code).toBe(0);
      expect(r.stdout.trim()).toBe('');
    });

    it('swallows stderr noise from the bundle (does not leak to the caller)', () => {
      const r = withFakeBundle(`
        console.error('[hooks] noisy stderr line');
        console.log(JSON.stringify({ ok: true }));
      `);
      expect(r.code).toBe(0);
      expect(r.stderr).toBe('');
      expect(JSON.parse(r.stdout)).toEqual({ ok: true });
    });

    // Portability: a user's project has the bundle under
    // node_modules/agentic-qe/dist/, not at ./dist/. The shim must resolve that,
    // and prefer it over a local source build if both are present.
    it('resolves node_modules/agentic-qe/dist (installed-project case) and prefers it over ./dist', () => {
      tmp = mkdtempSync(join(tmpdir(), 'aqe-shim-'));
      const installed = join(tmp, 'node_modules', 'agentic-qe', 'dist', 'cli');
      mkdirSync(installed, { recursive: true });
      writeFileSync(join(installed, 'bundle.js'), `console.log(JSON.stringify({ from: 'installed' }));`);
      // A source build is ALSO present — the installed dep must win.
      mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
      writeFileSync(join(tmp, 'dist', 'cli', 'bundle.js'), `console.log(JSON.stringify({ from: 'source' }));`);

      const r = runShim(['route', '--json'], tmp);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({ from: 'installed' });
    });
  });

  // Postmortem regression tests (2026-06-02): the shim's own SPAWN_TIMEOUT_MS
  // was previously unbounded and unobserved — a slow/hung child was killed
  // only by the Claude Code harness's OUTER timeout, which kills this whole
  // process too, so nothing ever got logged. routing_outcomes silently
  // stopped receiving writes for a month with zero trace. These tests assert
  // the shim now (a) still never blocks a turn and (b) leaves a durable,
  // inspectable record of *why* an invocation produced no output.
  describe('hooks-health.log observability (2026-06-02 postmortem)', () => {
    let tmp: string;
    afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

    function healthLog(projectDir: string): string {
      const p = join(projectDir, '.agentic-qe', 'hooks-health.log');
      return existsSync(p) ? readFileSync(p, 'utf-8') : '';
    }

    it('logs a TIMEOUT entry and still exits 0/empty when the child exceeds AQE_HOOK_TIMEOUT_MS', () => {
      tmp = mkdtempSync(join(tmpdir(), 'aqe-shim-'));
      mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
      // Fake bundle that outlives the (tiny, test-only) spawn timeout.
      writeFileSync(
        join(tmp, 'dist', 'cli', 'bundle.js'),
        `setTimeout(() => console.log(JSON.stringify({ ok: true })), 5000);`,
      );
      const r = runShim(['route', '--json'], tmp, { AQE_HOOK_TIMEOUT_MS: '200' });
      expect(r.code).toBe(0);
      expect(r.stdout.trim()).toBe('');
      const log = healthLog(tmp);
      expect(log).toContain('TIMEOUT');
      expect(log).toContain('cmd=route');
      expect(log).toContain('NOT captured');
    });

    it('logs an EMPTY-RESULT entry when the child exits non-zero with no JSON payload', () => {
      tmp = mkdtempSync(join(tmpdir(), 'aqe-shim-'));
      mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
      // Mirrors routing-hooks.ts's "No task provided" throw when $PROMPT
      // resolves empty — exits non-zero, prints nothing parseable.
      writeFileSync(
        join(tmp, 'dist', 'cli', 'bundle.js'),
        `console.error('Error: No task provided.'); process.exit(1);`,
      );
      const r = runShim(['route', '--json'], tmp);
      expect(r.code).toBe(0);
      expect(r.stdout.trim()).toBe('');
      const log = healthLog(tmp);
      expect(log).toContain('EMPTY-RESULT');
      expect(log).toContain('cmd=route');
    });

    it('forwards stdin to the child (2026-07-05 regression: Claude Code delivers hook events via stdin JSON, not $PROMPT)', () => {
      tmp = mkdtempSync(join(tmpdir(), 'aqe-shim-'));
      mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
      // Fake bundle that echoes back whatever it received on stdin — proves
      // the shim no longer discards it (previously stdio: ['ignore', ...]).
      writeFileSync(
        join(tmp, 'dist', 'cli', 'bundle.js'),
        `
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (c) => { data += c; });
        process.stdin.on('end', () => { console.log(JSON.stringify({ receivedStdin: data })); });
        `,
      );
      const stdout = execFileSync('node', [SHIM, 'route', '--json'], {
        cwd: REPO_ROOT,
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, AQE_HOOK_NPX: '0' },
        input: JSON.stringify({ prompt: 'find flaky tests in the coverage module' }),
        encoding: 'utf-8',
        timeout: 60_000,
      });
      expect(JSON.parse(stdout)).toEqual({
        receivedStdin: JSON.stringify({ prompt: 'find flaky tests in the coverage module' }),
      });
    });

    it('does NOT log anything when the child succeeds normally', () => {
      tmp = mkdtempSync(join(tmpdir(), 'aqe-shim-'));
      mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
      writeFileSync(
        join(tmp, 'dist', 'cli', 'bundle.js'),
        `console.log(JSON.stringify({ ok: true }));`,
      );
      const r = runShim(['route', '--json'], tmp);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({ ok: true });
      expect(existsSync(join(tmp, '.agentic-qe', 'hooks-health.log'))).toBe(false);
    });
  });
});
