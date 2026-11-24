/**
 * #1474: the bounded, hook-free git invocations candidate resolution uses.
 *
 * @module domains/quality-assessment/candidate-git
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const GIT_TIMEOUT_MS = 15_000;
const MAX_STDERR = 400;
/** No fsmonitor hook and no untracked cache: listings come from the tree itself. */
const SAFE_CONFIG = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false'];

/**
 * Run git without prompts, optional locks, fsmonitor hooks or the untracked
 * cache, so no user hook runs. Failures carry git's own stderr (bounded).
 */
export function git(cwd: string, args: string[], input?: string): string {
  try {
    return execFileSync('git', [...SAFE_CONFIG, ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      ...(input !== undefined ? { input } : {}),
      stdio: [input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    });
  } catch (error) {
    const e = error as { stderr?: string | Buffer; code?: string; message?: string };
    const stderr = String(e.stderr ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_STDERR);
    throw new Error(stderr || (e.code === 'ENOENT' ? 'git is not installed' : (e.message ?? 'git failed')));
  }
}

/** The HEAD commit of a work tree, or `unborn` before its first commit. */
export function gitHead(cwd: string): string {
  try {
    return git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']).trim() || 'unborn';
  } catch {
    return 'unborn';
  }
}

/** `/`-separated, without trailing slashes — linear string handling, no regex backtracking. */
export function toSlashPath(p: string): string {
  const slashed = p.split('\\').join('/');
  let end = slashed.length;
  while (end > 0 && slashed[end - 1] === '/') end -= 1;
  return slashed.slice(0, end);
}

/** Real path, `/`-separated, without a trailing slash. */
export function normalizePath(p: string): string {
  let real = p;
  try { real = fs.realpathSync.native(p); } catch { real = path.resolve(p); }
  return toSlashPath(real) || '/';
}

/**
 * Tracked paths (relative to `topLevel`) at or under each given path. Literal
 * pathspecs, so no glob in a registered name widens the match.
 */
export function trackedUnder(topLevel: string, relPaths: readonly string[]): string[] {
  if (relPaths.length === 0) return [];
  const out = git(topLevel, ['ls-files', '-z', '--', ...relPaths.map((p) => `:(literal)${p}`)]);
  return out.split('\0').filter(Boolean);
}
