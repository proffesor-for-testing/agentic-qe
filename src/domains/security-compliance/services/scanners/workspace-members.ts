/**
 * Agentic QE v3 - workspace member discovery for the dependency scan (#1049)
 *
 * Expands npm / yarn `workspaces` and `pnpm-workspace.yaml` `packages:` globs
 * (`*`, `**`, multi-segment, braces; `!negations` honoured; node_modules
 * skipped) into member directories, and keeps only members whose real path
 * (directory and package.json) is inside the workspace root. Symlinked member
 * directories are resolved: inside the root they are members, outside they are
 * excluded. A pattern that cannot be expanded is an error (the scan is then
 * not complete), never a silent skip.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'tinyglobby';
import { parseDocument, isMap, isScalar } from 'yaml';

export interface WorkspaceExpansion {
  /** Member directories, relative to the root, '/'-separated, sorted. */
  readonly members: string[];
  /** Members dropped because they resolve outside the root (never scanned, never sent to OSV). */
  readonly excluded: Array<{ path: string; reason: string }>;
  /** Patterns or members that could not be expanded or verified: the scan is not complete. */
  readonly errors: string[];
  /** Notes that do not affect completeness (e.g. a pattern matching no directory). */
  readonly warnings: string[];
}

const toPosix = (p: string): string => p.split(path.sep).join('/');
const NODE_MODULES_IGNORE = '**/node_modules/**';

/** Whether `child` is `root` or inside it (both absolute, already real paths). */
export function isInside(root: string, child: string): boolean {
  const rel = path.relative(root, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** pnpm-workspace.yaml files are tiny; a larger one is refused rather than parsed (#1049 round 6). */
export const MAX_PNPM_WORKSPACE_BYTES = 1024 * 1024;

/**
 * The `packages:` globs of a pnpm-workspace.yaml, parsed as YAML (block or
 * flow sequences, comments, any indentation, `<<` merge keys). Anything else
 * in the file is ignored. A parse error, an oversized file, a duplicate
 * `packages` key or a `packages` value that is not a list of strings is an
 * error, never an empty list.
 */
export function pnpmWorkspacePatterns(raw: string): { patterns: string[] } | { error: string } {
  if (Buffer.byteLength(raw, 'utf-8') > MAX_PNPM_WORKSPACE_BYTES) {
    return { error: `pnpm-workspace.yaml is larger than ${MAX_PNPM_WORKSPACE_BYTES} bytes; not parsed` };
  }
  const text = raw.replace(/^\uFEFF/, '');
  let js: unknown;
  try {
    // uniqueKeys:false — the library's duplicate-key check is quadratic; duplicates
    // of `packages` are detected below instead. merge:true resolves `<<: *anchor`.
    const doc = parseDocument(text, { uniqueKeys: false, merge: true });
    if (doc.errors.length > 0) throw doc.errors[0];
    if (isMap(doc.contents)) {
      const packagesKeys = doc.contents.items.filter((pair) => isScalar(pair.key) && pair.key.value === 'packages').length;
      if (packagesKeys > 1) return { error: 'pnpm-workspace.yaml has more than one "packages" key' };
    }
    js = doc.toJS({ maxAliasCount: 100 });
  } catch (error) {
    return { error: `pnpm-workspace.yaml could not be parsed (${error instanceof Error ? error.message.split('\n')[0].slice(0, 120) : 'error'})` };
  }
  if (js === null || js === undefined) return { patterns: [] };
  if (typeof js !== 'object' || Array.isArray(js)) return { error: 'pnpm-workspace.yaml is not a YAML mapping' };
  const packages = (js as Record<string, unknown>).packages;
  if (packages === undefined || packages === null) return { patterns: [] };
  if (!Array.isArray(packages) || !packages.every((p) => typeof p === 'string')) {
    return { error: 'pnpm-workspace.yaml "packages" is not a list of strings' };
  }
  return { patterns: packages as string[] };
}

/** Normalise a workspace pattern; '' for the root itself, null when it points outside the root. */
function normalisePattern(raw: string): string | null {
  const p = path.posix.normalize(raw.replace(/\\/g, '/').trim()).replace(/\/+$/, '');
  if (p === '.' || p === '') return '';
  if (p === '..' || p.startsWith('../') || path.posix.isAbsolute(p)) return null;
  return p;
}

/** A workspace glob (`*`, `**`, `?`, `{a,b}`) as a whole-path RegExp, for matching symlink paths. */
export function workspaceGlobToRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      const slash = pattern[i + 2] === '/';
      re += slash ? '(?:[^/]+/)*' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = pattern.indexOf('}', i);
      if (end < 0) { re += '\\{'; continue; }
      re += `(?:${pattern.slice(i + 1, end).split(',').map((alt) => alt.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const SYMLINK_WALK_LIMITS = { maxDepth: 12, maxEntries: 50_000 } as const;

/**
 * Where a pattern's symlinks can be: under its literal prefix (`packages` for
 * `packages/*`), at most `depth` levels down (`null` = unbounded, for `**`).
 * Round 7: the walk never leaves pattern scope, so unrelated deep trees
 * (Android build/, Rust target/) cannot hit a limit.
 */
export function patternScope(pattern: string): { base: string; depth: number | null } {
  const segments = pattern.split('/');
  const firstGlob = segments.findIndex((seg) => /[*?{}[\]()!]/.test(seg));
  if (firstGlob < 0) return { base: pattern, depth: 0 };
  const base = segments.slice(0, firstGlob).join('/');
  return { base, depth: segments.slice(firstGlob).some((seg) => seg.includes('**')) ? null : segments.length - firstGlob };
}

/**
 * Symlinks within a pattern's scope (relative to `root`), found by walking real
 * directories only — a link is reported, never descended into. node_modules
 * and dot-directories are skipped, as the glob does. A bounded-depth pattern
 * stops at its own depth (+1, to see a symlinked package.json) without that
 * counting as truncation; only a `**` pattern can hit the walk limits, and
 * `truncated` then says the scope was not fully searched.
 */
async function listSymlinks(
  root: string, scope: { base: string; depth: number | null },
  limits: { maxDepth: number; maxEntries: number } = SYMLINK_WALK_LIMITS,
): Promise<{ links: string[]; truncated: string | null }> {
  const links: string[] = [];
  let seen = 0;
  let truncated: string | null = null;
  // Round 7 re-check: bounded scopes walk exactly to the pattern's depth (no entries cap: the
  // scope is the pattern itself); only `**` scopes use the walk limits.
  const maxDepth = scope.depth === null ? limits.maxDepth : scope.depth;
  const bounded = scope.depth !== null;
  /** A candidate member directory at the pattern's depth: only its package.json is looked at. */
  const checkManifest = async (dir: string): Promise<void> => {
    try {
      if ((await fs.lstat(path.join(root, dir, 'package.json'))).isSymbolicLink()) links.push(`${dir}/package.json`);
    } catch { /* no package.json */ }
  };
  const walk = async (rel: string, depth: number): Promise<void> => {
    if (truncated) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!bounded && ++seen > limits.maxEntries) {
        truncated = `under "${scope.base || '.'}" stopped after ${limits.maxEntries} entries`;
        return;
      }
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) links.push(child);
      else if (entry.isDirectory()) {
        if (bounded && depth + 1 === maxDepth) {
          await checkManifest(child); // a member directory: never read beyond its package.json
          continue;
        }
        if (depth + 1 > maxDepth) {
          if (scope.depth === null) {
            truncated = `under "${scope.base || '.'}" stopped at depth ${limits.maxDepth} (${child})`;
            return;
          }
          continue; // beyond this pattern's own depth: out of scope
        }
        await walk(child, depth + 1);
        if (truncated) return;
      }
    }
  };
  const start = scope.base;
  if (start) {
    // The literal prefix itself may be a link (or missing).
    try {
      const st = await fs.lstat(path.join(root, start));
      if (st.isSymbolicLink()) return { links: [start], truncated: null };
      if (!st.isDirectory()) return { links, truncated: null };
    } catch {
      return { links, truncated: null };
    }
  }
  if (bounded && maxDepth === 0) {
    await checkManifest(start);
    return { links, truncated: null };
  }
  await walk(start, 0);
  return { links, truncated };
}

/** Directories (or symlinks to directories) matched by `pattern` that hold a package.json. */
async function matchMembers(
  root: string, pattern: string, ignore: string[], symlinks: string[], isNegated: (p: string) => boolean,
): Promise<{ dirs: string[]; files: string[] }> {
  // Real directories with a package.json (symlinks are not followed while walking).
  const found = await glob(`${pattern}/package.json`, { cwd: root, ignore, followSymbolicLinks: false, expandDirectories: false, dot: false });
  const dirs = found.map((f) => toPosix(path.posix.dirname(toPosix(f))));
  // Symlinks are not returned by the walk above: a symlinked member directory,
  // or a member whose package.json is a symlink, is matched here and its real
  // path is checked by the caller (inside the root: member; outside: excluded).
  const re = workspaceGlobToRegExp(pattern);
  for (const link of symlinks) {
    const dir = link.endsWith('/package.json') ? link.slice(0, -'/package.json'.length) : link;
    if (!re.test(dir) || isNegated(dir)) continue;
    if (dir === link) {
      // A symlinked directory is a member only if it holds a package.json —
      // the same rule as for real directories (round 6: a linked asset
      // directory is not a package).
      try {
        if (!(await fs.stat(path.join(root, link))).isDirectory()) continue;
        if (!(await fs.stat(path.join(root, link, 'package.json'))).isFile()) continue;
      } catch {
        continue; // dangling link, or no package.json
      }
    }
    dirs.push(dir);
  }
  const files = dirs.length > 0 ? [] : (await glob(pattern, { cwd: root, ignore, followSymbolicLinks: false, expandDirectories: false, dot: false, onlyFiles: true }))
    .map(toPosix);
  return { dirs, files };
}

/**
 * Expand workspace patterns under `root` and keep members whose real path is
 * inside `root`. Explicit `extraMembers` (e.g. from a lockfile) are verified too.
 */
export async function expandWorkspaces(
  root: string, patterns: string[], extraMembers: string[] = [],
  limits: { maxDepth: number; maxEntries: number } = SYMLINK_WALK_LIMITS,
): Promise<WorkspaceExpansion> {
  if (patterns.length === 0 && extraMembers.length === 0) return { members: [], excluded: [], errors: [], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const excluded: Array<{ path: string; reason: string }> = [];
  const negations: string[] = [];
  const positives: string[] = [];
  for (const raw of patterns) {
    const negated = raw.trim().startsWith('!');
    const p = normalisePattern(negated ? raw.trim().slice(1) : raw);
    if (p === '') continue; // the root itself is not a member
    if (p === null) {
      if (!negated) excluded.push({ path: raw, reason: 'workspace pattern points outside the project root' });
      continue;
    }
    (negated ? negations : positives).push(p);
  }
  const ignore = [NODE_MODULES_IGNORE, ...negations, ...negations.map((n) => `${n}/package.json`)];

  // `!dir/**` also excludes `dir` itself (a symlinked dir is matched as `dir`).
  const negatedPath = (member: string): boolean => negations.some((n) => workspaceGlobToRegExp(n).test(member)
    || (n.endsWith('/**') && workspaceGlobToRegExp(n.slice(0, -3)).test(member)));
  const symlinkSet = new Set<string>();
  for (const pattern of positives) {
    const scoped = await listSymlinks(root, patternScope(pattern), limits);
    for (const link of scoped.links) symlinkSet.add(link);
    if (scoped.truncated) errors.push(`workspace symlink search ${scoped.truncated}; symlinked workspace members may be missing`);
  }
  const symlinks = [...symlinkSet];
  const candidates = new Set<string>();
  for (const pattern of positives) {
    try {
      const { dirs, files } = await matchMembers(root, pattern, ignore, symlinks, negatedPath);
      for (const d of dirs) candidates.add(d);
      if (dirs.length === 0) {
        warnings.push(files.length > 0
          ? `workspace pattern "${pattern}" matches file(s), not package directories; no member added`
          : `workspace pattern "${pattern}" matches no package directory`);
      }
    } catch (error) {
      errors.push(`workspace pattern "${pattern}" could not be expanded (${error instanceof Error ? error.message.slice(0, 120) : 'error'})`);
    }
  }
  for (const member of extraMembers) {
    const p = normalisePattern(member);
    if (p === null) excluded.push({ path: member, reason: 'workspace member points outside the project root' });
    else if (p !== '' && !negatedPath(p)) candidates.add(p);
  }

  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch (error) {
    return { members: [], excluded, errors: [...errors, `workspace root could not be resolved (${(error as NodeJS.ErrnoException).code ?? 'error'})`], warnings };
  }
  // One member per real directory: a link to a sibling member is not scanned twice.
  // Prefer the path that is the directory itself over a link to it.
  const byRealDir = new Map<string, string>();
  for (const member of [...candidates].sort()) {
    if (member === '' || member === '.' || member.split('/').includes('node_modules')) continue;
    let realDir: string;
    try {
      realDir = await fs.realpath(path.join(root, member));
    } catch {
      continue; // a lockfile member whose directory no longer exists: nothing to scan
    }
    if (!isInside(realRoot, realDir)) {
      excluded.push({ path: member, reason: 'resolves outside the project root (symlink or ../); not scanned' });
      continue;
    }
    if (realDir === realRoot) continue; // a link back to the root is the root, not a member
    if (toPosix(path.relative(realRoot, realDir)).split('/').includes('node_modules')) continue; // a link into node_modules
    try {
      const realManifest = await fs.realpath(path.join(root, member, 'package.json'));
      if (!isInside(realRoot, realManifest)) {
        excluded.push({ path: member, reason: 'package.json resolves outside the project root (symlink); not scanned' });
        continue;
      }
    } catch { /* no package.json: reported when the manifest is read */ }
    const existing = byRealDir.get(realDir);
    const isDirect = toPosix(path.relative(realRoot, realDir)) === member;
    if (existing === undefined || isDirect) byRealDir.set(realDir, member);
  }
  return { members: [...byRealDir.values()].sort(), excluded, errors, warnings };
}
