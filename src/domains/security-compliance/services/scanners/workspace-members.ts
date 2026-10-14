/**
 * Agentic QE v3 - workspace member discovery for the dependency scan (#1049)
 *
 * Expands npm / yarn `workspaces` and `pnpm-workspace.yaml` `packages:` globs
 * (`*`, `**`, multi-segment, braces; `!negations` honoured; node_modules
 * skipped; symlinks not followed) into member directories, and keeps only
 * members whose real path is inside the workspace root. A pattern that cannot
 * be expanded is an error (the scan is then not complete), never a silent skip.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'tinyglobby';

export interface WorkspaceExpansion {
  /** Member directories, relative to the root, '/'-separated, sorted. */
  readonly members: string[];
  /** Members dropped because they resolve outside the root (never scanned, never sent to OSV). */
  readonly excluded: Array<{ path: string; reason: string }>;
  /** Patterns or members that could not be expanded or verified. */
  readonly errors: string[];
}

const toPosix = (p: string): string => p.split(path.sep).join('/');

/** Whether `child` is `root` or inside it (both absolute, already real paths). */
export function isInside(root: string, child: string): boolean {
  const rel = path.relative(root, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Read the `packages:` list of a pnpm-workspace.yaml (and nothing else). */
export function pnpmWorkspacePatterns(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^packages:\s*(#.*)?$/.test(l));
  if (start < 0) {
    const inline = yaml.match(/^packages:\s*\[(.*)\]\s*$/m);
    return inline ? inline[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
  }
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) break; // next top-level key
    const m = /^\s+-\s*['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/** Normalise a workspace pattern; null when it points outside the root. */
function normalisePattern(raw: string): string | null {
  const p = path.posix.normalize(raw.replace(/\\/g, '/').trim()).replace(/\/+$/, '');
  if (!p || p === '.' || p === '..' || p.startsWith('../') || path.posix.isAbsolute(p)) return null;
  return p;
}

/**
 * Expand workspace patterns under `root` and keep members whose real path is
 * inside `root`. Explicit `extraMembers` (e.g. from a lockfile) are verified too.
 */
export async function expandWorkspaces(
  root: string, patterns: string[], extraMembers: string[] = [],
): Promise<WorkspaceExpansion> {
  if (patterns.length === 0 && extraMembers.length === 0) return { members: [], excluded: [], errors: [] };
  const errors: string[] = [];
  const excluded: Array<{ path: string; reason: string }> = [];
  const negations: string[] = [];
  const positives: string[] = [];
  for (const raw of patterns) {
    const negated = raw.trim().startsWith('!');
    const body = negated ? raw.trim().slice(1) : raw;
    if (path.posix.normalize(body.replace(/\\/g, '/').trim()).replace(/\/+$/, '') === '.') continue; // the root itself
    const p = normalisePattern(body);
    if (p === null) {
      if (!negated) excluded.push({ path: raw, reason: 'workspace pattern points outside the project root' });
      continue;
    }
    (negated ? negations : positives).push(p);
  }

  const candidates = new Set<string>();
  for (const pattern of positives) {
    try {
      const found = await glob(`${pattern}/package.json`, {
        cwd: root,
        ignore: ['**/node_modules/**', ...negations.map((n) => `${n}/package.json`)],
        followSymbolicLinks: false,
        expandDirectories: false,
        dot: false,
      });
      for (const file of found) candidates.add(toPosix(path.posix.dirname(toPosix(file))));
    } catch (error) {
      errors.push(`workspace pattern "${pattern}" could not be expanded (${error instanceof Error ? error.message.slice(0, 120) : 'error'})`);
    }
  }
  const negated = (member: string): boolean => negations.some((n) => {
    try {
      return path.posix.matchesGlob ? path.posix.matchesGlob(member, n) : member === n;
    } catch {
      return member === n;
    }
  });
  for (const member of extraMembers) {
    const p = normalisePattern(member);
    if (p === null) excluded.push({ path: member, reason: 'workspace member points outside the project root' });
    else if (!negated(p)) candidates.add(p);
  }

  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch (error) {
    return { members: [], excluded, errors: [...errors, `workspace root could not be resolved (${(error as NodeJS.ErrnoException).code ?? 'error'})`] };
  }
  const members: string[] = [];
  for (const member of [...candidates].sort()) {
    let real: string;
    try {
      real = await fs.realpath(path.join(root, member));
    } catch {
      continue; // a lockfile member whose directory no longer exists: nothing to scan
    }
    if (!isInside(realRoot, real)) {
      excluded.push({ path: member, reason: 'resolves outside the project root (symlink or ../); not scanned' });
      continue;
    }
    if (member.split('/').includes('node_modules')) continue;
    members.push(member);
  }
  return { members, excluded, errors };
}
