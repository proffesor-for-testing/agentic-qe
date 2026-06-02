/**
 * Resilient hook shim contract (#510 item 5).
 *
 * .claude/hooks/aqe-hook.sh wraps the AQE bundle hooks so that, per ruflo's
 * hook-shim discipline, a hook NEVER blocks a Claude Code turn and NEVER dumps
 * init noise into the transcript:
 *   - always exits 0 (even on missing bundle / bad subcommand);
 *   - swallows stderr;
 *   - emits ONLY the --json contract on stdout (drops leading [hooks]/[RVF]
 *     init-noise lines).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(__dirname, '../../..');
const SHIM = resolve(REPO_ROOT, '.claude/hooks/aqe-hook.sh');

/** Run the shim, returning { stdout, stderr, code } and never throwing on non-zero. */
function runShim(args: string[], projectDir: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execFileSync('sh', [SHIM, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      encoding: 'utf-8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout?.toString() ?? '', stderr: e.stderr?.toString() ?? '', code: e.status ?? 1 };
  }
}

describe('aqe-hook.sh resilient shim (#510 item 5)', () => {
  it('exists and is executable', () => {
    expect(existsSync(SHIM)).toBe(true);
  });

  it('exits 0 and emits nothing when the bundle is missing (never blocks a turn)', () => {
    const r = runShim(['route', '--task', 'x', '--json'], '/nonexistent-project-root');
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('exits 0 on an unknown subcommand and never leaks stderr to the caller', () => {
    const r = runShim(['__definitely_not_a_hook__', '--json'], '.');
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
  });

  // JSON-extraction contract, tested deterministically against a FAKE bundle
  // that brackets the JSON with init noise (leading) AND async noise (trailing)
  // — the exact shape real AQE hooks produce — without the slow cold-start of
  // the real bundle.
  describe('strips noise around the JSON (fake bundle)', () => {
    let tmp: string;
    afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

    function withFakeBundle(body: string): { stdout: string; code: number } {
      tmp = mkdtempSync(join(tmpdir(), 'aqe-shim-'));
      mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
      // The shim runs `node "$BUNDLE" hooks "$@"`; this fake ignores args.
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

    // Portability: a user's project has node_modules/.bin/aqe (the installed
    // binary), not a dist/ build. The shim must resolve that, and prefer it over
    // a dist bundle if both are present.
    it('resolves node_modules/.bin/aqe (installed-project case) and prefers it over dist', () => {
      tmp = mkdtempSync(join(tmpdir(), 'aqe-shim-'));
      // Installed-binary form (a user project).
      mkdirSync(join(tmp, 'node_modules', '.bin'), { recursive: true });
      const bin = join(tmp, 'node_modules', '.bin', 'aqe');
      writeFileSync(bin, `#!/usr/bin/env sh\nprintf '%s\\n' '{ "from": "local-bin" }'\n`);
      chmodSync(bin, 0o755);
      // A dist bundle is ALSO present — the shim must prefer the local bin.
      mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
      writeFileSync(join(tmp, 'dist', 'cli', 'bundle.js'), `console.log(JSON.stringify({ from: 'dist' }));`);

      const r = runShim(['route', '--json'], tmp);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({ from: 'local-bin' });
    });
  });
});
