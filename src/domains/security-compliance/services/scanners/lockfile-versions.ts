/**
 * Agentic QE v3 - Lockfile version resolution (#1049)
 *
 * A package.json spec is usually a range ("^4.17.15", "<4.17.12"). Advisories
 * can only be matched against the version actually installed, which the
 * lockfile records. These readers return the resolved version of each direct
 * dependency; anything not found stays unresolved (and is then reported as an
 * unchecked package, never guessed from the range).
 *
 * Supported: npm-shrinkwrap.json, package-lock.json (v1-v3), pnpm-lock.yaml
 * (importers and single-project layouts), yarn.lock (classic and berry).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { safeJsonParse } from '@shared/safe-json.js';

export interface LockedVersions {
  /** Direct dependency name -> resolved version, for the names the lockfile resolves. */
  versions: Record<string, string>;
  /** Lockfile the versions came from (basename), or null when none was found. */
  lockfile: string | null;
  /** Why the lockfile that exists could not be read; versions is then empty. */
  error?: string;
}

const LOCKFILES = ['npm-shrinkwrap.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'] as const;

/** Resolve the direct dependencies of `manifestPath` from the first lockfile next to it. */
export async function readLockedVersions(manifestPath: string, specs: Record<string, string>): Promise<LockedVersions> {
  const dir = path.dirname(manifestPath);
  for (const lockfile of LOCKFILES) {
    let text: string;
    try {
      text = await fs.readFile(path.join(dir, lockfile), 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      return { versions: {}, lockfile, error: `${lockfile} could not be read (${(error as NodeJS.ErrnoException).code ?? 'error'})` };
    }
    try {
      const versions = lockfile.endsWith('.json') ? fromNpmLock(text, Object.keys(specs))
        : lockfile === 'pnpm-lock.yaml' ? fromPnpmLock(text, Object.keys(specs))
        : fromYarnLock(text, specs);
      return { versions, lockfile };
    } catch (error) {
      return { versions: {}, lockfile, error: `${lockfile} could not be parsed (${error instanceof Error ? error.message.slice(0, 120) : 'error'})` };
    }
  }
  return { versions: {}, lockfile: null };
}

/** package-lock.json / npm-shrinkwrap.json: v2/v3 `packages["node_modules/<name>"]`, v1 `dependencies[name]`. */
export function fromNpmLock(text: string, names: string[]): Record<string, string> {
  const lock = safeJsonParse<{
    packages?: Record<string, { version?: unknown }>;
    dependencies?: Record<string, { version?: unknown }>;
  }>(text);
  const out: Record<string, string> = {};
  for (const name of names) {
    const v = lock.packages?.[`node_modules/${name}`]?.version ?? lock.dependencies?.[name]?.version;
    if (typeof v === 'string') out[name] = v;
  }
  return out;
}

const unquote = (s: string): string => s.trim().replace(/^['"]|['"]$/g, '');
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** pnpm-lock.yaml: the root importer's (or top-level) dependencies / devDependencies / optionalDependencies. */
export function fromPnpmLock(text: string, names: string[]): Record<string, string> {
  const lines = text.split(/\r?\n/);
  let start = 0;
  let end = lines.length;
  let base = 0;
  const importers = lines.findIndex((l) => /^importers:\s*$/.test(l));
  if (importers >= 0) {
    const root = lines.findIndex((l, i) => i > importers && /^ {2}['"]?\.['"]?:\s*$/.test(l));
    if (root < 0) return {};
    start = root + 1;
    base = 4;
    end = lines.findIndex((l, i) => i > root && l.trim() !== '' && indentOf(l) <= 2);
    if (end < 0) end = lines.length;
  }
  const wanted = new Set(names);
  const out: Record<string, string> = {};
  let section = false;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const ind = indentOf(line);
    if (ind === base) {
      section = /^(dependencies|devDependencies|optionalDependencies):\s*$/.test(line.trim());
      continue;
    }
    if (!section || ind !== base + 2) continue;
    const m = /^(.+?):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const name = unquote(m[1]);
    if (!wanted.has(name)) continue;
    let version = m[2] ? unquote(m[2]) : '';
    if (!version) {
      for (let j = i + 1; j < end && indentOf(lines[j]) > ind; j++) {
        const v = /^version:\s*(.+)$/.exec(lines[j].trim());
        if (v) { version = unquote(v[1]); break; }
      }
    }
    version = version.replace(/\(.*$/, '').replace(/_.*$/, '').trim();
    if (version) out[name] = version;
  }
  return out;
}

/** yarn.lock (classic `version "x"` and berry `version: x`), matched by `name@spec` entries. */
export function fromYarnLock(text: string, specs: Record<string, string>): Record<string, string> {
  const entryVersion = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i];
    if (!header || /^\s|^#/.test(header) || !header.trimEnd().endsWith(':')) continue;
    let version = '';
    for (let j = i + 1; j < lines.length && /^\s/.test(lines[j]); j++) {
      const v = /^\s+version:?\s+"?([^"\s]+)"?\s*$/.exec(lines[j]);
      if (v) { version = v[1]; break; }
    }
    if (!version) continue;
    for (const entry of header.trimEnd().slice(0, -1).split(',')) entryVersion.set(unquote(entry), version);
  }
  const out: Record<string, string> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const v = entryVersion.get(`${name}@${spec}`) ?? entryVersion.get(`${name}@npm:${spec}`);
    if (v) out[name] = v;
  }
  return out;
}
