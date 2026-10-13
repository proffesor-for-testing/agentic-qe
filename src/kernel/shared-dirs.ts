/**
 * Shared temp/system directory detection and the per-user scratch root (#1006).
 *
 * AQE must never adopt or create a learning store in a directory that many
 * unrelated runs share (the OS temp dir, `/tmp`, `/`, `/home`, ...): every
 * project without a marker below it would then read and pollute one store.
 *
 * Dependency-free (fs/os/path/crypto only) so `project-root` stays light.
 *
 * @module kernel/shared-dirs
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Fixed POSIX system directories that are never a project root. A `.agentic-qe`,
 * `.git` or `package.json` found in one of these is a stray left by another run.
 */
export const POSIX_SYSTEM_DIRS: readonly string[] = [
  '/', '/tmp', '/var/tmp', '/usr/tmp', '/dev/shm', '/run/shm',
  '/private', '/private/tmp', '/private/var', '/private/var/tmp',
  '/var', '/usr', '/etc', '/opt', '/srv', '/mnt', '/media', '/run',
  '/home', '/Users', '/Volumes',
];

/** Platform facts, injectable so Windows/macOS rules are testable anywhere. */
export interface PlatformContext {
  platform: NodeJS.Platform;
  tmpdir: string;
  homedir: string;
  env: NodeJS.ProcessEnv;
  /** Resolve symlinks and (on Windows) 8.3 short names; return input on failure. */
  realpath: (p: string) => string;
}

function nativeRealpath(p: string): string {
  try { return fs.realpathSync.native(p); } catch { return p; }
}

export function currentPlatformContext(): PlatformContext {
  let tmpdir = '';
  let homedir = '';
  try { tmpdir = os.tmpdir(); } catch { /* none configured */ }
  try { homedir = os.homedir(); } catch { /* none configured */ }
  return { platform: process.platform, tmpdir, homedir, env: process.env, realpath: nativeRealpath };
}

function pathApi(platform: NodeJS.Platform): typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix;
}

/**
 * Canonical form for comparing two directory paths on `platform`: absolute,
 * symlinks/8.3 names resolved, no trailing separator, and case-folded on
 * Windows (whose file system is case-insensitive).
 */
export function normalizeForCompare(p: string, ctx: PlatformContext = currentPlatformContext()): string {
  const api = pathApi(ctx.platform);
  let out = api.resolve(ctx.realpath(api.resolve(p)));
  const rootLength = api.parse(out).root.length;
  while (out.length > rootLength && /[\\/]$/.test(out)) out = out.slice(0, -1);
  return ctx.platform === 'win32' ? out.toLowerCase() : out;
}

/** True when `a` and `b` name the same directory on the given platform. */
export function samePath(a: string, b: string, ctx: PlatformContext = currentPlatformContext()): boolean {
  return normalizeForCompare(a, ctx) === normalizeForCompare(b, ctx);
}

/**
 * True for a directory the project-root walk must never cross or adopt: the OS
 * temp dir, a drive root on Windows, or a fixed POSIX system directory.
 */
export function isHardStopDir(dir: string, ctx: PlatformContext = currentPlatformContext()): boolean {
  const api = pathApi(ctx.platform);
  const target = normalizeForCompare(dir, ctx);
  if (ctx.tmpdir && target === normalizeForCompare(ctx.tmpdir, ctx)) return true;
  if (ctx.platform === 'win32') {
    return target === api.parse(target).root.toLowerCase();
  }
  // Compare against the literal and the resolved form (macOS /tmp -> /private/tmp).
  const literal = api.resolve(dir);
  return POSIX_SYSTEM_DIRS.some(sys => sys === literal || normalizeForCompare(sys, ctx) === target);
}

/** True for a sticky world-writable directory (mode 1777, the shape of a shared temp dir). */
export function isStickyWorldWritable(dir: string, ctx: PlatformContext = currentPlatformContext()): boolean {
  if (ctx.platform === 'win32') return false;
  try {
    return (fs.statSync(dir).mode & 0o1002) === 0o1002;
  } catch {
    return false;
  }
}

/**
 * True when `dir` is shared by unrelated runs: a hard-stop directory or a
 * sticky world-writable one. A plain chmod-777 directory (no sticky bit) is
 * not shared: container workspaces often look like that and are real projects.
 */
export function isSharedSystemDir(dir: string, ctx: PlatformContext = currentPlatformContext()): boolean {
  return isHardStopDir(dir, ctx) || isStickyWorldWritable(dir, ctx);
}

/**
 * Per-user cache base for scratch roots:
 * - Windows: `%LOCALAPPDATA%` (or `~/AppData/Local`)
 * - macOS:   `~/Library/Caches`
 * - other:   `$XDG_CACHE_HOME` when absolute, else `~/.cache`
 */
export function userScratchBase(ctx: PlatformContext = currentPlatformContext()): string {
  const api = pathApi(ctx.platform);
  let base: string;
  if (ctx.platform === 'win32') {
    base = ctx.env.LOCALAPPDATA || api.join(ctx.homedir, 'AppData', 'Local');
  } else if (ctx.platform === 'darwin') {
    base = api.join(ctx.homedir, 'Library', 'Caches');
  } else {
    const xdg = ctx.env.XDG_CACHE_HOME;
    base = xdg && api.isAbsolute(xdg) ? xdg : api.join(ctx.homedir, '.cache');
  }
  return api.join(base, 'agentic-qe', 'scratch');
}

/** Stable scratch-root path for `dir`: `<base>/<sha256(canonical dir) first 16 hex>`. */
export function scratchRootPath(dir: string, ctx: PlatformContext = currentPlatformContext()): string {
  const key = createHash('sha256').update(normalizeForCompare(dir, ctx)).digest('hex').slice(0, 16);
  return pathApi(ctx.platform).join(userScratchBase(ctx), key);
}

function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
}

/**
 * Create (or reuse) the private scratch root that stands in for a shared
 * directory with no project marker. The location is stable per user and per
 * directory, so memory persists across runs and no new directory is minted
 * per process; it lives outside every shared dir, so no other walk adopts it.
 * Falls back to `<tmpdir>/agentic-qe-scratch-<uid>/<key>` (0700) when the
 * user cache dir cannot be created.
 */
export function ensureScratchRoot(dir: string, ctx: PlatformContext = currentPlatformContext()): string {
  const preferred = scratchRootPath(dir, ctx);
  try {
    ensurePrivateDir(preferred);
    writeOrigin(preferred, dir);
    return preferred;
  } catch {
    const uid = typeof process.getuid === 'function' ? String(process.getuid()) : 'user';
    const fallbackBase = path.join(ctx.tmpdir || os.tmpdir(), `agentic-qe-scratch-${uid}`);
    const fallback = path.join(fallbackBase, path.basename(preferred));
    ensurePrivateDir(fallbackBase);
    ensurePrivateDir(fallback);
    writeOrigin(fallback, dir);
    return fallback;
  }
}

function writeOrigin(root: string, dir: string): void {
  const origin = path.join(root, 'SCRATCH_ROOT_FOR');
  try {
    if (!fs.existsSync(origin)) fs.writeFileSync(origin, `${path.resolve(dir)}\n`, { mode: 0o600 });
  } catch {
    // Informational only.
  }
}
