/**
 * ruflo session helper trust boundary.
 *
 * hook-handler.cjs loads .claude/helpers/session.cjs, which keeps its state in
 * <cwd>/.claude-flow/sessions/current.json — a file the opened project
 * controls. Its fields must never steer where the helper writes: a crafted
 * `id` or a symlinked current.json must not create or overwrite files outside
 * the session directory (e.g. ~/.claude/settings.json, which runs hooks).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SESSION_HELPER = resolve(__dirname, '../../../.claude/helpers/session.cjs');
let base: string;
let project: string;
let sessions: string;
let outside: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'aqe-session-trust-'));
  project = join(base, 'untrusted-project');
  sessions = join(project, '.claude-flow', 'sessions');
  outside = join(base, 'outside');
  mkdirSync(sessions, { recursive: true });
  mkdirSync(outside, { recursive: true });
});

function run(...args: string[]) {
  return spawnSync('node', [SESSION_HELPER, ...args], { cwd: project, encoding: 'utf8', timeout: 15000 });
}

describe('ruflo session helper trust', () => {
  it('does not let a crafted session id write the archive outside the session dir', () => {
    writeFileSync(join(sessions, 'current.json'), JSON.stringify({
      id: '../../../outside/escaped', startedAt: '2026-01-01T00:00:00Z', metrics: {}, hooks: { evil: true },
    }));
    run('end');
    expect(readdirSync(outside)).toEqual([]);
  });

  it('archives a well-formed session under its own id', () => {
    writeFileSync(join(sessions, 'current.json'), JSON.stringify({
      id: 'session-123', startedAt: '2026-01-01T00:00:00Z', metrics: {},
    }));
    run('end');
    expect(existsSync(join(sessions, 'session-123.json'))).toBe(true);
    expect(existsSync(join(sessions, 'current.json'))).toBe(false);
  });

  it('does not write through a symlinked current.json', () => {
    const target = join(outside, 'target.json');
    writeFileSync(target, 'original');
    symlinkSync(target, join(sessions, 'current.json'));
    run('start');
    run('restore');
    run('metric', 'edits');
    expect(readFileSync(target, 'utf8')).toBe('original');
  });

  it('does not create a file through a dangling current.json symlink', () => {
    const target = join(outside, 'created.json');
    symlinkSync(target, join(sessions, 'current.json'));
    run('start');
    expect(existsSync(target)).toBe(false);
  });

  it('does not throw on a corrupted current.json', () => {
    writeFileSync(join(sessions, 'current.json'), '{"id": "session-1", "startedAt": ');
    const result = run('restore');
    expect(result.status).toBe(0);
  });

  it('does not run its CLI when required as a module', () => {
    const result = spawnSync('node', ['-e', `require(${JSON.stringify(SESSION_HELPER)})`, 'start'], {
      cwd: project, encoding: 'utf8', timeout: 15000,
    });
    expect(result.stdout).not.toContain('Usage:');
    expect(existsSync(join(sessions, 'current.json'))).toBe(false);
  });
});
