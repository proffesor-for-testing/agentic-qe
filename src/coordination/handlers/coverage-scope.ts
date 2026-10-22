/**
 * The project's own coverage scope (#1154 review).
 *
 * A file the coverage tool is configured to leave out (vitest
 * `coverage.exclude: ['src/**\/index.ts']`, jest `'!src/**\/index.ts'` in
 * `collectCoverageFrom`) is not "unmeasured": it was never meant to be
 * measured. Counting it would fail every verdict on a normal project.
 *
 * The scope is read STATICALLY from literal string arrays. Config files are
 * never executed (they are code from the analyzed repository). When a config
 * declares a coverage scope that is not a literal, the scope is reported as
 * unreadable rather than guessed.
 *
 * Sources, first match wins:
 *   - vitest.config.* / vite.config.*  `coverage: { include, exclude }`
 *   - jest.config.* / package.json "jest"  `collectCoverageFrom` (`!` = exclude),
 *     `coveragePathIgnorePatterns` (regular expressions)
 *   - .nycrc / .nycrc.json / package.json "nyc", .c8rc / .c8rc.json /
 *     package.json "c8"  `include`, `exclude`
 */

import * as fs from 'fs';
import * as path from 'path';
import { readConfinedTextSync } from '../../shared/io/confined-read.js';

export interface CoverageScope {
  /** The config the scope was read from, relative to the project root. */
  source: string;
  /** False when the config declares a scope that is not a literal string array. */
  readable: boolean;
  include: string[];
  exclude: string[];
  /** jest `coveragePathIgnorePatterns`, matched against the absolute path. */
  ignorePatterns: RegExp[];
}

const JS_EXTS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];
const VITEST_CONFIGS = [...JS_EXTS.map(e => `vitest.config.${e}`), ...JS_EXTS.map(e => `vite.config.${e}`)];
const JEST_CONFIGS = [...JS_EXTS.map(e => `jest.config.${e}`), 'jest.config.json'];
const NYC_CONFIGS = ['.nycrc', '.nycrc.json'];
const C8_CONFIGS = ['.c8rc', '.c8rc.json'];

// ============================================================================
// Glob matching (no glob library is a runtime dependency)
// ============================================================================

function escapeRe(s: string): string {
  return s.replace(/[.+^$()|[\]\\]/g, '\\$&');
}

/** Glob body → regex source: `**`, `*`, `?` and non-nested `{a,b}`. */
function globSource(glob: string): string {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) { re += '\\{'; continue; }
      re += `(?:${glob.slice(i + 1, end).split(',').map(globSource).join('|')})`;
      i = end;
    } else {
      re += escapeRe(c);
    }
  }
  return re;
}

/**
 * A pattern matches a project-relative POSIX path, or any path under it when it
 * names a directory (nyc/test-exclude treat `src` as `src/**`).
 */
export function globToRegExp(pattern: string): RegExp {
  const body = pattern.replace(/^<rootDir>\//, '').replace(/^\.\//, '').replace(/\/+$/, '');
  return new RegExp(`^${globSource(body)}(?:/.*)?$`);
}

// ============================================================================
// Static extraction of literal arrays from config source
// ============================================================================

/** Remove comments, leaving string literals (which may contain `/*`) intact. */
function stripComments(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const start = i;
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      out += src.slice(start, i + 1);
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 1;
    } else {
      out += c;
    }
  }
  return out;
}

/** Index just past the bracket matching the one at `open`, skipping strings. */
function matchingClose(src: string, open: number): number {
  const pairs: Record<string, string> = { '[': ']', '{': '}', '(': ')' };
  const stack: string[] = [];
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (pairs[c]) {
      stack.push(pairs[c]);
    } else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

/** Split a bracket body on top-level commas. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < body.length && body[i] !== c; i++) if (body[i] === '\\') i++;
    } else if ('[{('.includes(c)) depth++;
    else if (']})'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  parts.push(body.slice(start));
  return parts.map(p => p.trim()).filter(p => p.length > 0);
}

const STRING_LITERAL = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$|^`([^`$\\]*)`$/;

/**
 * The value of `key:` in `src` as a literal string array. `undefined` when the
 * key is absent, `null` when it is present but not a literal. A spread of the
 * tool's own defaults (`...coverageConfigDefaults.exclude`) is skipped: those
 * are tests and config files, which are never counted anyway.
 */
function literalArray(src: string, key: string): string[] | null | undefined {
  const m = new RegExp(`(?:^|[\\s,{])['"]?${key}['"]?\\s*:\\s*`).exec(src);
  if (!m) return undefined;
  const at = m.index + m[0].length;
  if (src[at] === "'" || src[at] === '"') {
    const single = STRING_LITERAL.exec(src.slice(at, matchingStringEnd(src, at)));
    return single ? [single[2] ?? single[3]] : null;
  }
  if (src[at] !== '[') return null;
  const end = matchingClose(src, at);
  if (end === -1) return null;
  const values: string[] = [];
  for (const el of splitTopLevel(src.slice(at + 1, end - 1))) {
    if (/^\.\.\.[\w$.]*defaults?\b/i.test(el)) continue;
    const lit = STRING_LITERAL.exec(el);
    if (!lit) return null;
    values.push(lit[2] ?? lit[3]);
  }
  return values;
}

function matchingStringEnd(src: string, at: number): number {
  let i = at + 1;
  for (; i < src.length && src[i] !== src[at]; i++) if (src[i] === '\\') i++;
  return i + 1;
}

// ============================================================================
// Readers
// ============================================================================

function readText(file: string): string | null {
  try { return readConfinedTextSync(file, { outsideRoot: 'allow' }); } catch { return null; }
}

function readJson(file: string): Record<string, unknown> | null {
  const text = readText(file);
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const strings = (v: unknown): string[] | null | undefined =>
  v === undefined ? undefined
    : typeof v === 'string' ? [v]
      : Array.isArray(v) && v.every(e => typeof e === 'string') ? v as string[] : null;

function scope(source: string, parts: {
  include?: string[] | null; exclude?: string[] | null; collectFrom?: string[] | null; ignore?: string[] | null;
}): CoverageScope {
  const readable = [parts.include, parts.exclude, parts.collectFrom, parts.ignore].every(p => p !== null);
  const collect = parts.collectFrom ?? [];
  const ignorePatterns: RegExp[] = [];
  for (const p of parts.ignore ?? []) {
    try { ignorePatterns.push(new RegExp(p)); } catch { /* jest would reject it too */ }
  }
  return {
    source, readable, ignorePatterns,
    include: [...(parts.include ?? []), ...collect.filter(g => !g.startsWith('!'))],
    exclude: [...(parts.exclude ?? []), ...collect.filter(g => g.startsWith('!')).map(g => g.slice(1))],
  };
}

function fromVitest(name: string, text: string): CoverageScope | null {
  const src = stripComments(text);
  const m = /(?:^|[\s,{])['"]?coverage['"]?\s*(?::\s*|(?=[,}]))/.exec(src);
  if (!m) return null;
  const at = m.index + m[0].length;
  // `coverage,` shorthand or `coverage: options`: declared, not readable.
  if (!m[0].includes(':') || src[at] !== '{') return scope(name, { include: null });
  const end = matchingClose(src, at);
  const block = end === -1 ? '' : src.slice(at, end);
  return scope(name, { include: literalArray(block, 'include'), exclude: literalArray(block, 'exclude') });
}

function fromJestText(name: string, text: string): CoverageScope | null {
  const src = stripComments(text);
  const collectFrom = literalArray(src, 'collectCoverageFrom');
  const ignore = literalArray(src, 'coveragePathIgnorePatterns');
  if (collectFrom === undefined && ignore === undefined) return null;
  return scope(name, { collectFrom, ignore });
}

function fromJsonKeys(name: string, obj: Record<string, unknown> | undefined): CoverageScope | null {
  if (!obj || typeof obj !== 'object') return null;
  if ('collectCoverageFrom' in obj || 'coveragePathIgnorePatterns' in obj) {
    return scope(name, { collectFrom: strings(obj.collectCoverageFrom), ignore: strings(obj.coveragePathIgnorePatterns) });
  }
  if ('include' in obj || 'exclude' in obj) {
    return scope(name, { include: strings(obj.include), exclude: strings(obj.exclude) });
  }
  return null;
}

/** The coverage scope configured for the project at `projectRoot`; `null` when none is configured. */
export function readCoverageScope(projectRoot: string): CoverageScope | null {
  for (const name of VITEST_CONFIGS) {
    const text = readText(path.join(projectRoot, name));
    if (text !== null) {
      const found = fromVitest(name, text);
      if (found) return found;
    }
  }
  for (const name of JEST_CONFIGS) {
    const file = path.join(projectRoot, name);
    if (!fs.existsSync(file)) continue;
    const found = name.endsWith('.json')
      ? fromJsonKeys(name, readJson(file) ?? undefined)
      : fromJestText(name, readText(file) ?? '');
    if (found) return found;
  }
  const pkg = readJson(path.join(projectRoot, 'package.json'));
  const fromPkg = fromJsonKeys('package.json "jest"', pkg?.jest as Record<string, unknown> | undefined);
  if (fromPkg) return fromPkg;
  for (const [names, key] of [[NYC_CONFIGS, 'nyc'], [C8_CONFIGS, 'c8']] as const) {
    for (const name of names) {
      const obj = readJson(path.join(projectRoot, name));
      const found = fromJsonKeys(name, obj ?? undefined);
      if (found) return found;
      // A config that exists but is not JSON (e.g. YAML) cannot be read.
      if (!obj && fs.existsSync(path.join(projectRoot, name))) return scope(name, { include: null });
    }
    const found = fromJsonKeys(`package.json "${key}"`, pkg?.[key] as Record<string, unknown> | undefined);
    if (found) return found;
  }
  return null;
}

/** Is `file` inside the configured coverage scope? Everything is, with no scope. */
export function inCoverageScope(scope: CoverageScope | null, file: string, projectRoot: string): boolean {
  if (!scope) return true;
  const rel = path.relative(projectRoot, file).split(path.sep).join('/');
  if (scope.include.length > 0 && !scope.include.some(g => globToRegExp(g).test(rel))) return false;
  if (scope.exclude.some(g => globToRegExp(g).test(rel))) return false;
  const posixAbs = file.split(path.sep).join('/');
  const rootPosix = projectRoot.split(path.sep).join('/');
  return !scope.ignorePatterns.some(re =>
    re.test(posixAbs) || re.test(posixAbs.replace(rootPosix, '<rootDir>')));
}
