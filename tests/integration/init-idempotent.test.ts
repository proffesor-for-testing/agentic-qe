/**
 * Integration test: `aqe init --auto` is a byte-stable convergence step (#778).
 *
 * Spawns the BUILT CLI (dist/cli/bundle.js) three times against the same
 * disposable project — the exact scenario from the issue — and asserts that
 * the second and third runs leave every generated file untouched (same bytes
 * AND same mtime), that no `.claude/settings.json.backup` appears, and that
 * the fresh-install defaults equal the existing-install defaults.
 *
 * Isolation: a scratch HOME/XDG/npm cache/CODEX_HOME and a fake `vibium` on
 * PATH so the browser-engine step reports "already installed" instead of
 * downloading from npm. Assumes `npm run build` has been run.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';

import { ALL_DOMAINS as SHARED_ALL_DOMAINS } from '../../src/shared/types/index.js';
import {
  PROMOTION_MIN_SUCCESS_RATE,
  PROMOTION_THRESHOLD,
} from '../../src/learning/qe-patterns.js';

const CLI_PATH = resolve(__dirname, '..', '..', 'dist', 'cli', 'bundle.js');

/** Runtime state, not generated configuration — SQLite pages churn by design. */
const RUNTIME_STATE = /(^|\/)[^/]+\.db(-wal|-shm|-journal)?$/;

interface FileSnap {
  sha: string;
  mtimeMs: number;
}

function snapshot(root: string): Map<string, FileSnap> {
  const out = new Map<string, FileSnap>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const rel = relative(root, full);
        if (RUNTIME_STATE.test(rel)) continue;
        out.set(rel, {
          sha: createHash('sha256').update(readFileSync(full)).digest('hex'),
          mtimeMs: statSync(full).mtimeMs,
        });
      }
    }
  };
  walk(root);
  return out;
}

function diffSnapshots(a: Map<string, FileSnap>, b: Map<string, FileSnap>): string[] {
  const changes: string[] = [];
  for (const [path, snap] of b) {
    const prev = a.get(path);
    if (!prev) changes.push(`added   ${path}`);
    else if (prev.sha !== snap.sha) changes.push(`content ${path}`);
    else if (prev.mtimeMs !== snap.mtimeMs) changes.push(`mtime   ${path}`);
  }
  for (const path of a.keys()) {
    if (!b.has(path)) changes.push(`removed ${path}`);
  }
  return changes.sort();
}

describe('aqe init --auto idempotence (#778)', () => {
  let base: string;
  let project: string;
  let env: NodeJS.ProcessEnv;
  const settings: string[] = [];
  const snaps: Map<string, FileSnap>[] = [];

  function runInit(): void {
    const res = spawnSync(
      process.execPath,
      [CLI_PATH, 'init', '--auto', '--with-codex', '--codex-guidance', 'compact'],
      { cwd: project, env, encoding: 'utf-8', timeout: 150_000 },
    );
    expect(res.status, `init failed:\n${res.stdout}\n${res.stderr}`).toBe(0);
  }

  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(
        `CLI bundle not found at ${CLI_PATH}. Run \`npm run build\` before running integration tests.`,
      );
    }
    base = mkdtempSync(join(tmpdir(), 'aqe-init-idempotent-'));
    project = join(base, 'project');
    const home = join(base, 'home');
    const bin = join(base, 'bin');
    for (const dir of [project, home, bin, join(base, 'tmp')]) mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(project, 'package.json'),
      '{"name":"aqe-idempotence-repro","version":"1.0.0","type":"module"}\n',
    );
    // Fake Vibium CLI: `vibium --version` and `vibium is-installed` succeed, so
    // the assets phase never shells out to `npm install -g`.
    const fakeVibium = join(bin, 'vibium');
    writeFileSync(fakeVibium, '#!/bin/sh\necho "vibium 26.8.21"\nexit 0\n');
    chmodSync(fakeVibium, 0o755);

    env = {
      PATH: [bin, dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
      LANG: 'en_US.UTF-8',
      CI: '1',
      NO_COLOR: '1',
      HOME: home,
      USERPROFILE: home,
      TMPDIR: join(base, 'tmp'),
      XDG_CONFIG_HOME: join(home, 'config'),
      XDG_STATE_HOME: join(home, 'state'),
      XDG_DATA_HOME: join(home, 'data'),
      XDG_CACHE_HOME: join(home, 'cache'),
      CODEX_HOME: join(home, 'codex'),
      CLAUDE_CONFIG_DIR: join(home, 'claude'),
      npm_config_prefix: join(home, 'npm-prefix'),
      npm_config_cache: join(home, 'npm-cache'),
      AQE_PROJECT_ROOT: project,
      AQE_MEMORY_PATH: join(project, '.agentic-qe', 'memory.db'),
      AQE_STORAGE_PATH: join(project, '.agentic-qe'),
      CLAUDE_FLOW_MEMORY_PATH: join(project, '.swarm'),
      CLAUDE_FLOW_DB_PATH: join(project, '.swarm', 'memory.db'),
      RUFLO_DAEMON_AUTOSTART: '0',
    };

    for (let run = 0; run < 3; run++) {
      runInit();
      settings.push(readFileSync(join(project, '.claude', 'settings.json'), 'utf-8'));
      snaps.push(snapshot(project));
    }
  }, 480_000);

  afterAll(() => {
    if (base) rmSync(base, { recursive: true, force: true });
  });

  it('keeps .claude/settings.json byte-identical across repeat runs', () => {
    expect(settings[1]).toBe(settings[0]);
    expect(settings[2]).toBe(settings[0]);
  });

  it('does not create a settings backup when nothing changed', () => {
    expect(existsSync(join(project, '.claude', 'settings.json.backup'))).toBe(false);
  });

  it('rewrites no generated file (content or mtime) on repeat runs', () => {
    expect(diffSnapshots(snaps[0], snaps[1])).toEqual([]);
    expect(diffSnapshots(snaps[1], snaps[2])).toEqual([]);
  });

  it('writes the canonical domain list and runtime promotion defaults on a fresh install', () => {
    const fresh = JSON.parse(settings[0]);
    const canonicalDomains = SHARED_ALL_DOMAINS.filter((d) => d !== 'coordination');
    expect(fresh.v3Configuration.domains.names).toEqual(canonicalDomains);
    expect(fresh.v3Configuration.domains.total).toBe(canonicalDomains.length);
    expect(fresh.v3Learning.patternPromotion).toEqual({
      threshold: PROMOTION_THRESHOLD,
      successRateMin: PROMOTION_MIN_SUCCESS_RATE,
    });
    expect(fresh.env.AQE_V3_PATTERN_PROMOTION_THRESHOLD).toBe(String(PROMOTION_THRESHOLD));
    expect(fresh.env.AQE_V3_SUCCESS_RATE_THRESHOLD).toBe(String(PROMOTION_MIN_SUCCESS_RATE));
  });

  it('uses the same defaults on the existing-install path as on the fresh path', () => {
    const fresh = JSON.parse(settings[0]);
    const existing = JSON.parse(settings[1]);
    expect(existing.v3Configuration).toEqual(fresh.v3Configuration);
    expect(existing.v3Learning).toEqual(fresh.v3Learning);
    expect(existing.env).toEqual(fresh.env);
    expect(existing.aqe.initialized).toBe(fresh.aqe.initialized);
  });
});
