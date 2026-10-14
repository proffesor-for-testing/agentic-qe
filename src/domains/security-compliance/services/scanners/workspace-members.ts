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
import { parse as parseYaml } from 'yaml';

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

/**
 * The `packages:` globs of a pnpm-workspace.yaml, parsed as YAML (block or
 * flow sequences, comments, any indentation). Anything else in the file is
 * ignored. A parse error or a `packages` value that is not a list of strings
 * is an error, never an empty list (#1049 round 5).
 */
export function pnpmWorkspacePatterns(text: string): { patterns: string[] } | { error: string } {
  let doc: unknown;
  try {
    doc = parseYaml(text.replace(/^﻿/, ''));
  } catch (error) {
    return { error: `pnpm-workspace.yaml could not be parsed (${error instanceof Error ? error.message.split('\n')[0].slice(0, 120) : 'error'})` };
  }
  if (doc === null || doc === undefined) return { patterns: [] };
  if (typeof doc !== 'object' || Array.isArray(doc)) return { error: 'pnpm-workspace.yaml is not a YAML mapping' };
  const packages = (doc as Record<string, unknown>).packages;
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

/**
 * Symlinks under `root` (relative paths), found by walking real directories
 * only — a link is reported, never descended into. node_modules and .git are
 * skipped; the walk is bounded.
 */
async function listSymlinks(root: string, maxDepth = 12, maxEntries = 50_000): Promise<string[]> {
  const out: string[] = [];
  let seen = 0;
  const walk = async (rel: string, depth: number): Promise<void> => {
    if (depth > maxDepth || seen > maxEntries) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      seen++;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) out.push(child);
      else if (entry.isDirectory()) await walk(child, depth + 1);
    }
  };
  await walk('', 0);
  return out;
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
      try {
        if (!(await fs.stat(path.join(root, link))).isDirectory()) continue;
      } catch {
        continue; // dangling link
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

  const negatedPath = (member: string): boolean => negations.some((n) => workspaceGlobToRegExp(n).test(member));
  const symlinks = positives.length > 0 ? await listSymlinks(root) : [];
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
  const members: string[] = [];
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
    try {
      const realManifest = await fs.realpath(path.join(root, member, 'package.json'));
      if (!isInside(realRoot, realManifest)) {
        excluded.push({ path: member, reason: 'package.json resolves outside the project root (symlink); not scanned' });
        continue;
      }
    } catch { /* no package.json: reported when the manifest is read */ }
    members.push(member);
  }
  return { members: [...new Set(members)], excluded, errors, warnings };
}
