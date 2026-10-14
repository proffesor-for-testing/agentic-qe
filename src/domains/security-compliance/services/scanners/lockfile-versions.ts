/**
 * Agentic QE v3 - Lockfile index (#1049)
 *
 * A package.json spec is usually a range; advisories can only be matched
 * against the version actually installed, which the lockfile records. These
 * readers turn a lockfile into a per-importer view (the root is importer '',
 * workspace members are their relative path, e.g. 'packages/a'):
 *
 * - recordedSpec: the spec the lockfile was generated for (npm v2/v3 and pnpm
 *   record it; used to detect a lockfile out of sync with package.json);
 * - resolve: the installed version, whether it is a local/linked package, and
 *   the real package name behind an `npm:` alias.
 *
 * Supported: npm-shrinkwrap.json, package-lock.json (v1-v3), pnpm-lock.yaml
 * (v5-v9, importers or single-project), yarn.lock (classic and berry).
 */

import { safeJsonParse } from '@shared/safe-json.js';

export const LOCKFILES = ['npm-shrinkwrap.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'] as const;
export type LockfileName = typeof LOCKFILES[number];

/** What the lockfile installed for one dependency of one importer. */
export interface LockedEntry {
  /** Installed version (absent for a local/linked package). */
  version?: string;
  /** A workspace / linked / local-directory package. */
  local?: boolean;
  /** The registry package behind an alias (`npm:<real>@…`), when it differs from the dependency name. */
  realName?: string;
}

export interface LockIndex {
  readonly file: LockfileName;
  /** Workspace member importers the lockfile knows (relative paths, '' excluded). */
  members(): string[];
  /**
   * The spec the lockfile records for `name` in `importer`: a string, `undefined`
   * when the importer does not list it, or `null` when this format records no specs.
   */
  recordedSpec(importer: string, name: string): string | undefined | null;
  resolve(importer: string, name: string, spec: string): LockedEntry | undefined;
  /** Whether the lockfile knows this importer (the root '' always). */
  hasImporter(importer: string): boolean;
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

/** Parse a lockfile's text; throws on malformed content. */
export function parseLockfile(file: LockfileName, text: string): LockIndex {
  if (file === 'pnpm-lock.yaml') return pnpmIndex(text);
  if (file === 'yarn.lock') return yarnIndex(text);
  return npmIndex(file, text);
}

// ============================================================================
// npm (package-lock.json / npm-shrinkwrap.json)
// ============================================================================

type NpmPackage = { version?: unknown; link?: unknown; name?: unknown; resolved?: unknown } & Partial<Record<typeof DEP_FIELDS[number], Record<string, unknown>>>;

function npmIndex(file: LockfileName, text: string): LockIndex {
  const lock = safeJsonParse<{ packages?: Record<string, NpmPackage>; dependencies?: Record<string, { version?: unknown }> }>(text);
  if (!lock || typeof lock !== 'object') throw new Error('not a JSON object');
  const packages = lock.packages;
  const prefix = (importer: string) => (importer ? `${importer}/` : '');
  return {
    file,
    members: () => packages ? Object.keys(packages).filter((k) => k !== '' && !k.includes('node_modules/')) : [],
    hasImporter: (importer) => importer === '' || !!packages?.[importer],
    recordedSpec(importer, name) {
      if (!packages) return null; // v1 records no specs
      const pkg = packages[importer];
      if (!pkg) return undefined;
      for (const field of DEP_FIELDS) {
        const v = pkg[field]?.[name];
        if (typeof v === 'string') return v;
      }
      return undefined;
    },
    resolve(importer, name) {
      if (!packages) {
        const v = lock.dependencies?.[name]?.version;
        if (typeof v !== 'string') return undefined;
        const alias = /^npm:((?:@[^/@]+\/)?[^@]+)@(.+)$/.exec(v);
        return alias ? { version: alias[2], realName: alias[1] } : { version: v };
      }
      const entry = packages[`${prefix(importer)}node_modules/${name}`] ?? packages[`node_modules/${name}`];
      if (!entry) return undefined;
      if (entry.link === true) return { local: true };
      const realName = typeof entry.name === 'string' && entry.name !== name ? entry.name : undefined;
      return typeof entry.version === 'string' ? { version: entry.version, ...(realName ? { realName } : {}) } : undefined;
    },
  };
}

// ============================================================================
// pnpm (pnpm-lock.yaml)
// ============================================================================

const unquote = (s: string): string => s.trim().replace(/^['"]|['"]$/g, '');
const indentOf = (line: string): number => line.length - line.trimStart().length;

interface PnpmDep { specifier?: string; version?: string }

/** Read the dependency sections of one importer block (lines [start, end), sections at `base`). */
function pnpmDeps(lines: string[], start: number, end: number, base: number): Map<string, PnpmDep> {
  const deps = new Map<string, PnpmDep>();
  const specifiers = new Map<string, string>();
  let section: 'deps' | 'specifiers' | null = null;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const ind = indentOf(line);
    if (ind === base) {
      const head = line.trim();
      section = /^(dependencies|devDependencies|optionalDependencies):\s*$/.test(head) ? 'deps'
        : /^specifiers:\s*$/.test(head) ? 'specifiers' : null;
      continue;
    }
    if (!section || ind !== base + 2) continue;
    const m = /^(.+?):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const name = unquote(m[1]);
    if (section === 'specifiers') {
      specifiers.set(name, unquote(m[2]));
      continue;
    }
    const dep: PnpmDep = {};
    if (m[2]) {
      dep.version = unquote(m[2]);
    } else {
      for (let j = i + 1; j < end && (lines[j].trim() === '' || indentOf(lines[j]) > ind); j++) {
        const kv = /^(specifier|version):\s*(.+)$/.exec(lines[j].trim());
        if (kv) dep[kv[1] as 'specifier' | 'version'] = unquote(kv[2]);
      }
    }
    deps.set(name, dep);
  }
  for (const [name, spec] of specifiers) {
    const dep = deps.get(name);
    if (dep && dep.specifier === undefined) dep.specifier = spec;
  }
  return deps;
}

function pnpmIndex(text: string): LockIndex {
  const lines = text.split(/\r?\n/);
  const importers = new Map<string, Map<string, PnpmDep>>();
  const importersAt = lines.findIndex((l) => /^importers:\s*$/.test(l));
  if (importersAt >= 0) {
    let end = lines.findIndex((l, i) => i > importersAt && l.trim() !== '' && indentOf(l) === 0);
    if (end < 0) end = lines.length;
    for (let i = importersAt + 1; i < end; i++) {
      const line = lines[i];
      if (indentOf(line) !== 2 || !/:\s*$/.test(line)) continue;
      const key = unquote(line.trim().slice(0, -1));
      let next = lines.findIndex((l, j) => j > i && l.trim() !== '' && indentOf(l) <= 2);
      if (next < 0 || next > end) next = end;
      importers.set(key === '.' ? '' : key, pnpmDeps(lines, i + 1, next, 4));
    }
  } else {
    importers.set('', pnpmDeps(lines, 0, lines.length, 0));
  }
  const parseVersion = (raw: string): LockedEntry => {
    const v = raw.replace(/\(.*$/, '').trim();
    if (v.startsWith('link:') || v.startsWith('file:') || v.startsWith('workspace:')) return { local: true };
    const alias = /^\/?((?:@[^/@]+\/)?[^/@]+)[@/](\d[^\s]*)$/.exec(v);
    if (alias) return { version: alias[2].replace(/_.*$/, ''), realName: alias[1] };
    return { version: v.replace(/_.*$/, '') };
  };
  return {
    file: 'pnpm-lock.yaml',
    members: () => [...importers.keys()].filter((k) => k !== ''),
    hasImporter: (importer) => importer === '' || importers.has(importer),
    recordedSpec(importer, name) {
      const deps = importers.get(importer);
      if (!deps) return undefined;
      const dep = deps.get(name);
      if (!dep) return undefined;
      return dep.specifier ?? null;
    },
    resolve(importer, name) {
      const dep = importers.get(importer)?.get(name);
      return dep?.version ? parseVersion(dep.version) : undefined;
    },
  };
}

// ============================================================================
// yarn (yarn.lock, classic and berry)
// ============================================================================

function yarnIndex(text: string): LockIndex {
  const entries = new Map<string, LockedEntry>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i];
    if (!header || /^\s|^#/.test(header) || !header.trimEnd().endsWith(':')) continue;
    let version = '';
    let resolution = '';
    for (let j = i + 1; j < lines.length && /^\s/.test(lines[j]); j++) {
      const v = /^\s+version:?\s+"?([^"\s]+)"?\s*$/.exec(lines[j]);
      if (v && !version) version = v[1];
      const r = /^\s+resolution:\s+"?([^"\s]+)"?\s*$/.exec(lines[j]);
      if (r) resolution = r[1];
    }
    if (!version) continue;
    const local = version === '0.0.0-use.local' || /@(workspace|link|portal|file):/.test(resolution);
    const realName = /^((?:@[^/@]+\/)?[^@]+)@npm:/.exec(resolution)?.[1];
    for (const raw of header.trimEnd().slice(0, -1).split(',')) {
      const key = unquote(raw);
      entries.set(key, local ? { local: true } : { version, ...(realName && !key.startsWith(`${realName}@`) ? { realName } : {}) });
    }
  }
  return {
    file: 'yarn.lock',
    members: () => [],
    hasImporter: () => true,
    // yarn.lock is matched by `name@spec`, so a changed spec simply finds no entry.
    recordedSpec: () => null,
    resolve: (_importer, name, spec) => entries.get(`${name}@${spec}`) ?? entries.get(`${name}@npm:${spec}`),
  };
}
