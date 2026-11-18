/**
 * #1458: a small, dependency-free glob for patterns AQE does not fully control.
 *
 * `tinyglobby` pulled in picomatch, whose extglob handling has a ReDoS advisory
 * with no fixed release (GHSA-fc5q-39xc-vjpf). The claim verifier globbed a
 * `fileGlob` taken from the claim itself. This module supports the syntax those
 * patterns need and nothing more:
 *
 *   `**` (any number of directories), `*`, `?`, `[abc]` / `[a-z]` / `[!x]`,
 *   and `{a,b}` braces (nested, at most MAX_BRACE_EXPANSIONS alternatives).
 *
 * Extglobs (`+(`, `*(`, `@(`, `?(`, `!(`), absolute patterns and `..` segments are
 * rejected, so a pattern cannot reach outside `cwd`. Like picomatch's default,
 * `*` and `**` do not match names starting with a dot unless the pattern segment
 * starts with one. Matching uses no regular expressions: a greedy wildcard matcher
 * with one backtrack point, linear-times-pattern in the worst case, at both the
 * character and the path-segment level.
 *
 * Directories matching an ignore pattern are not descended into. A symbolic link
 * is followed only when its target is inside `cwd` and is not a directory already
 * on the current path, so a link can neither leave the search root nor loop. (A
 * link to a sibling directory is followed, as tinyglobby did: both paths are listed.)
 */
import { readdir, realpath, stat } from 'node:fs/promises';
import { join, relative, isAbsolute, resolve, sep } from 'node:path';

export const MAX_BRACE_EXPANSIONS = 256;
const MAX_PATTERN_LENGTH = 1024;

export class UnsafeGlobError extends Error {
  readonly pattern: string;
  constructor(pattern: string, reason: string) {
    super(`Unsupported glob pattern ${JSON.stringify(pattern.slice(0, 80))}: ${reason}`);
    this.name = 'UnsafeGlobError';
    this.pattern = pattern;
  }
}

/** Expand `{a,b}` braces; `a{b,c{d,e}}` → ab, acd, ace. */
export function expandBraces(pattern: string): string[] {
  const open = findTopBrace(pattern);
  if (!open) return [pattern];
  const { start, end, parts } = open;
  const out: string[] = [];
  for (const part of parts) {
    for (const expanded of expandBraces(pattern.slice(0, start) + part + pattern.slice(end + 1))) {
      out.push(expanded);
      if (out.length > MAX_BRACE_EXPANSIONS) {
        throw new UnsafeGlobError(pattern, `more than ${MAX_BRACE_EXPANSIONS} brace alternatives`);
      }
    }
  }
  return out;
}

function findTopBrace(pattern: string): { start: number; end: number; parts: string[] } | null {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== '{') continue;
    let depth = 0;
    const commas: number[] = [];
    for (let j = i; j < pattern.length; j++) {
      const c = pattern[j];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          if (commas.length === 0) break; // `{x}` is literal
          const bounds = [i, ...commas, j];
          const parts = bounds.slice(0, -1).map((b, k) => pattern.slice(b + 1, bounds[k + 1]));
          return { start: i, end: j, parts };
        }
      } else if (c === ',' && depth === 1) commas.push(j);
    }
  }
  return null;
}

type Token =
  | { kind: 'lit'; ch: string }
  | { kind: 'any' }
  | { kind: 'star' }
  | { kind: 'class'; negate: boolean; items: Array<[string, string]> };

interface Segment {
  globstar: boolean;
  tokens: Token[];
  /** The pattern segment starts with a literal dot, so it may match a dotfile. */
  dot: boolean;
}

function compileSegment(segment: string): Segment {
  if (segment === '**') return { globstar: true, tokens: [], dot: false };
  const tokens: Token[] = [];
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === '*') {
      while (segment[i + 1] === '*') i++;
      tokens.push({ kind: 'star' });
    } else if (c === '?') {
      tokens.push({ kind: 'any' });
    } else if (c === '[' && classEnd(segment, i) !== -1) {
      const end = classEnd(segment, i);
      let body = segment.slice(i + 1, end);
      const negate = body.startsWith('!') || body.startsWith('^');
      if (negate) body = body.slice(1);
      const items: Array<[string, string]> = [];
      for (let k = 0; k < body.length; k++) {
        if (body[k + 1] === '-' && k + 2 < body.length) {
          items.push([body[k], body[k + 2]]);
          k += 2;
        } else items.push([body[k], body[k]]);
      }
      tokens.push({ kind: 'class', negate, items });
      i = end;
    } else {
      tokens.push({ kind: 'lit', ch: c });
    }
  }
  return { globstar: false, tokens, dot: segment.startsWith('.') };
}

/** Index of the `]` closing the class opened at `open`; a `]` first (after `!`/`^`) is a member. */
function classEnd(segment: string, open: number): number {
  let i = open + 1;
  if (segment[i] === '!' || segment[i] === '^') i++;
  return segment.indexOf(']', i + 1);
}

function tokenMatches(token: Token, ch: string): boolean {
  if (token.kind === 'lit') return token.ch === ch;
  if (token.kind === 'any') return true;
  if (token.kind === 'class') {
    const hit = token.items.some(([lo, hi]) => ch >= lo && ch <= hi);
    return token.negate ? !hit : hit;
  }
  return false;
}

/**
 * One segment against one name: greedy matching with a single backtrack point
 * for the last `*`, O(name × pattern) in the worst case, never exponential.
 */
function matchSegment(segment: Segment, name: string): boolean {
  if (name.startsWith('.') && !segment.dot) return false;
  const t = segment.tokens;
  let ti = 0;
  let ni = 0;
  let starTi = -1;
  let starNi = 0;
  while (ni < name.length) {
    if (ti < t.length && t[ti].kind === 'star') {
      starTi = ti++;
      starNi = ni;
    } else if (ti < t.length && tokenMatches(t[ti], name[ni])) {
      ti++;
      ni++;
    } else if (starTi !== -1) {
      ti = starTi + 1;
      ni = ++starNi;
    } else {
      return false;
    }
  }
  while (ti < t.length && t[ti].kind === 'star') ti++;
  return ti === t.length;
}

/** Path segments against pattern segments, with `**` matching any number of (non-dot) segments. */
function matchSegments(pattern: Segment[], path: string[]): boolean {
  let pi = 0;
  let si = 0;
  let starPi = -1;
  let starSi = 0;
  while (si < path.length) {
    if (pi < pattern.length && pattern[pi].globstar) {
      starPi = pi++;
      starSi = si;
    } else if (pi < pattern.length && matchSegment(pattern[pi], path[si])) {
      pi++;
      si++;
    } else if (starPi !== -1 && !path[starSi].startsWith('.')) {
      pi = starPi + 1;
      si = ++starSi;
    } else {
      return false;
    }
  }
  while (pi < pattern.length && pattern[pi].globstar) pi++;
  return pi === pattern.length;
}

/** Whether a file below directory `dirParts` could still match `pattern`. */
function couldContain(pattern: Segment[], dirParts: string[], pi = 0, di = 0): boolean {
  for (; di < dirParts.length; di++) {
    const part = dirParts[di];
    if (pi >= pattern.length) return false;
    if (pattern[pi].globstar) {
      // `**` absorbs any number of non-dot directories; a dot directory must be
      // matched by a later segment that names the dot (`.git` is never entered for `**/*.ts`).
      if (!part.startsWith('.')) return true;
      return couldContain(pattern, dirParts, pi + 1, di);
    }
    // The last segment names the file, so a directory must match an earlier one.
    if (pi === pattern.length - 1 || !matchSegment(pattern[pi], part)) return false;
    pi++;
  }
  return pi < pattern.length;
}

/** Reject what this glob does not support, before any matching. */
export function assertSafePattern(pattern: string): void {
  if (pattern.length === 0) throw new UnsafeGlobError(pattern, 'empty');
  if (pattern.length > MAX_PATTERN_LENGTH) throw new UnsafeGlobError(pattern, 'too long');
  if (/[+*@?!]\(/.test(pattern)) throw new UnsafeGlobError(pattern, 'extglob syntax is not supported');
  if (pattern.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pattern) || pattern.includes('\\')) {
    throw new UnsafeGlobError(pattern, 'must be a relative path with / separators');
  }
  if (pattern.split('/').includes('..')) throw new UnsafeGlobError(pattern, '".." would leave the search root');
}

function compileSegments(pattern: string): Segment[][] {
  assertSafePattern(pattern);
  return expandBraces(pattern)
    // An empty brace alternative must not join segments: `{a,}/**` is `a/**` or nothing.
    .filter((p) => !p.startsWith('/') && !p.includes('//'))
    // `./src/*.ts` and `src/./a.ts` mean `src/*.ts` and `src/a.ts`.
    .map((p) => p.split('/').filter((x) => x !== '' && x !== '.'))
    .filter((parts) => parts.length > 0)
    .map((parts) => parts.map(compileSegment));
}

/** A matcher for one pattern (braces expanded); paths are relative and `/`-separated. */
export function compileGlob(pattern: string): (relPath: string) => boolean {
  const compiled = compileSegments(pattern);
  return (relPath) => {
    const parts = relPath.split('/');
    return compiled.some((segments) => matchSegments(segments, parts));
  };
}

export interface SafeGlobOptions {
  /** Directory the pattern is relative to. */
  cwd: string;
  /** Patterns of files or directories to leave out (`node_modules/**`, `** /*.test.ts`). */
  ignore?: string[];
  /** Return absolute paths (default: relative to cwd). */
  absolute?: boolean;
}

const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

/** Files under `cwd` matching `pattern` (or any of several), as sorted `/`-separated paths. */
export async function safeGlob(pattern: string | string[], options: SafeGlobOptions): Promise<string[]> {
  const compiled = (Array.isArray(pattern) ? pattern : [pattern]).flatMap(compileSegments);
  const matches = (rel: string) => {
    const parts = rel.split('/');
    return compiled.some((segments) => matchSegments(segments, parts));
  };
  const worthEntering = (rel: string) => {
    const parts = rel.split('/');
    return compiled.some((segments) => couldContain(segments, parts));
  };
  const ignores = (options.ignore ?? []).flatMap(compileSegments);
  const ignored = (rel: string) => {
    const parts = rel.split('/');
    return ignores.some((segments) => matchSegments(segments, parts));
  };
  // A directory is left out (not entered) only by an ignore ending in `/**` whose
  // prefix matches it: `node_modules/**`, `**/dist/**`. `**/*.test.ts` or a bare
  // name ignore files, as tinyglobby did.
  const dirIgnores = ignores
    .filter((segments) => segments.length > 1 && segments[segments.length - 1].globstar)
    .map((segments) => segments.slice(0, -1));
  const ignoredDir = (rel: string) => {
    const parts = rel.split('/');
    return dirIgnores.some((prefix) => matchSegments(prefix, parts));
  };

  const cwd = resolve(options.cwd);
  let root: string;
  try {
    root = await realpath(cwd);
  } catch {
    return []; // no search root: nothing matches
  }
  // Each directory reached through a symbolic link is entered through a link at
  // most once, so links pointing at each other cannot multiply the walk.
  const linkedDirs = new Set<string>();
  const found: string[] = [];
  // `realDir` is the real path of `relDir`; ancestors are the real paths above it.
  const walk = async (relDir: string, realDir: string, ancestors: Set<string>): Promise<void> => {
    let entries;
    try {
      entries = await readdir(relDir ? join(cwd, relDir) : cwd, { withFileTypes: true });
    } catch {
      return; // unreadable directory: nothing to match there
    }
    const subdirs: Array<Promise<void>> = [];
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      let real = join(realDir, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          const target = await realpath(join(cwd, rel));
          real = target;
          if (!inside(root, target)) continue;
          const info = await stat(target);
          isDir = info.isDirectory();
          isFile = info.isFile();
          if (isDir) {
            if (ancestors.has(target) || linkedDirs.has(target)) continue; // a loop, or already entered by a link
            if (ignoredDir(rel) || !worthEntering(rel)) continue;
            linkedDirs.add(target);
          }
        } catch {
          continue; // dangling link
        }
      }
      if (isDir) {
        if (ignoredDir(rel) || !worthEntering(rel)) continue;
        if (ancestors.has(real)) continue;
        subdirs.push(walk(rel, real, new Set([...ancestors, real])));
      } else if (isFile && matches(rel) && !ignored(rel)) {
        found.push(rel);
      }
    }
    await Promise.all(subdirs);
  };
  await walk('', root, new Set([root]));
  // Sorted, so results (and callers that take the first N) are deterministic;
  // tinyglobby returned crawl order. Paths through a link keep the link's path.
  found.sort();
  return options.absolute ? found.map((rel) => `${cwd}/${rel}`.split(sep).join('/')) : found;
}
