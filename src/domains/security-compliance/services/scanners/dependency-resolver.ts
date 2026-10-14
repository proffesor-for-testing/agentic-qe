/**
 * Agentic QE v3 - Dependency resolution for the OSV advisory scan (#1049)
 *
 * Decides, for every direct dependency of a package.json (and, at a workspace
 * root, of every workspace member), what can be checked against OSV:
 *
 * - check:     a registry package at a concrete version — the lockfile's
 *              resolved version when the lockfile is in sync with package.json,
 *              else an exact spec. `npm:` aliases resolve to the real package.
 * - local:     a workspace / linked / local-directory package. Not an OSV
 *              subject; listed separately and never makes a scan incomplete.
 *              Its own dependencies are scanned as a workspace member.
 * - unchecked: anything that cannot be matched without guessing — a range
 *              with no (in-sync) lockfile resolution, a lockfile out of sync
 *              with package.json, git/URL/tarball sources.
 *
 * The lockfile is looked up from the package directory upwards (stopping at
 * the git root), so scanning a workspace member uses the root lockfile.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import semver from 'semver';
import { safeJsonParse } from '@shared/safe-json.js';
import { classifyNpmSpec, exactNpmVersion } from '@shared/security/osv-lookup.js';
import { LOCKFILES, parseLockfile, type LockIndex, type LockfileName } from './lockfile-versions.js';

export interface ResolvedDependency {
  /** Dependency name as declared (the alias name for `npm:` aliases). */
  readonly name: string;
  /** Spec as declared in package.json. */
  readonly spec: string;
  /** Workspace member the dependency belongs to ('' = the scanned package itself / root). */
  readonly member: string;
  readonly kind: 'check' | 'local' | 'unchecked';
  /** Registry package to check (differs from `name` for aliases). */
  readonly packageName?: string;
  /** Concrete version to check. */
  readonly version?: string;
  /** Lockfile-resolved version, also reported for unchecked packages when known. */
  readonly lockedVersion?: string;
  readonly reason?: string;
}

export interface DependencyResolution {
  readonly dependencies: ResolvedDependency[];
  /** Lockfile used (relative to the scanned package.json directory), or null. */
  readonly lockfile: string | null;
  /** Workspace members whose dependencies were included (relative to the lockfile root). */
  readonly workspaceMembers: string[];
  /** A lockfile that exists but could not be read or parsed. */
  readonly error?: string;
  /** Workspace member manifests that could not be read. */
  readonly memberErrors: string[];
}

const OUT_OF_SYNC = 'lockfile out of sync with package.json';

type Manifest = { name?: unknown; workspaces?: unknown } & Partial<Record<'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies', Record<string, unknown>>>;

/** All declared dependencies of a manifest (later fields win, as npm resolves them). */
export function declaredDependencies(manifest: Manifest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of ['peerDependencies', 'optionalDependencies', 'devDependencies', 'dependencies'] as const) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (typeof spec === 'string') out[name] = spec;
    }
  }
  return out;
}

async function readManifest(file: string): Promise<Manifest> {
  return safeJsonParse<Manifest>(await fs.readFile(file, 'utf-8'));
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Find the lockfile governing `dir`: walk up to the git root (inclusive). */
async function findLockfile(dir: string): Promise<{ dir: string; file: LockfileName } | null> {
  let current = path.resolve(dir);
  for (;;) {
    for (const file of LOCKFILES) {
      if (await exists(path.join(current, file))) return { dir: current, file };
    }
    if (await exists(path.join(current, '.git'))) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Expand simple workspace globs (`packages/*`, `apps/web`) relative to `root`. */
async function expandWorkspaceGlobs(root: string, patterns: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const raw of patterns) {
    const pattern = raw.replace(/\/+$/, '');
    if (pattern.startsWith('!')) continue;
    if (!pattern.includes('*')) {
      if (await exists(path.join(root, pattern, 'package.json'))) out.push(pattern);
      continue;
    }
    const m = /^(.*?)\/?\*\*?$/.exec(pattern);
    if (!m || m[1].includes('*')) continue;
    try {
      for (const entry of await fs.readdir(path.join(root, m[1]), { withFileTypes: true })) {
        const rel = m[1] ? `${m[1]}/${entry.name}` : entry.name;
        if (entry.isDirectory() && await exists(path.join(root, rel, 'package.json'))) out.push(rel);
      }
    } catch { /* missing workspace dir */ }
  }
  return [...new Set(out)];
}

async function workspaceMembers(lockDir: string, index: LockIndex | null, rootManifest: Manifest): Promise<string[]> {
  const fromLock = index?.members() ?? [];
  const ws = rootManifest.workspaces;
  const patterns = Array.isArray(ws) ? ws : ws && typeof ws === 'object' && Array.isArray((ws as { packages?: unknown }).packages)
    ? (ws as { packages: unknown[] }).packages : [];
  let fromPnpmWorkspace: string[] = [];
  try {
    const yaml = await fs.readFile(path.join(lockDir, 'pnpm-workspace.yaml'), 'utf-8');
    fromPnpmWorkspace = [...yaml.matchAll(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$/gm)].map((m) => m[1]);
  } catch { /* not a pnpm workspace */ }
  const fromGlobs = await expandWorkspaceGlobs(lockDir, [...patterns, ...fromPnpmWorkspace].filter((p): p is string => typeof p === 'string'));
  return [...new Set([...fromLock, ...fromGlobs])].filter((m) => m && !m.startsWith('..')).sort();
}

/** Resolve one declared dependency of `member`. */
function resolveOne(
  name: string, spec: string, member: string, index: LockIndex | null, localNames: Set<string>,
): ResolvedDependency {
  const base = { name, spec, member };
  const kind = classifyNpmSpec(spec);
  if (kind.kind === 'local') return { ...base, kind: 'local', reason: 'local package (workspace/link/file directory)' };
  if (kind.kind === 'remote') {
    return { ...base, kind: 'unchecked', reason: `not a registry dependency ("${spec}": git/URL/tarball source); OSV advisories cannot be matched` };
  }
  const packageName = kind.kind === 'alias' ? kind.name : name;
  const rangeSpec = kind.spec;

  const locked = index?.resolve(member, name, spec);
  if (locked?.local || (!locked && localNames.has(name))) {
    return { ...base, kind: 'local', reason: 'workspace package (local source)' };
  }
  if (locked && index) {
    const recorded = index.recordedSpec(member, name);
    const lockedVersion = locked.version ? exactNpmVersion(locked.version) ?? undefined : undefined;
    const specDiffers = recorded === undefined || (recorded !== null && recorded !== spec);
    const unsatisfied = lockedVersion !== undefined && !!semver.validRange(rangeSpec)
      && !semver.satisfies(lockedVersion, rangeSpec, { includePrerelease: true });
    if (specDiffers || unsatisfied) {
      return {
        ...base, kind: 'unchecked', ...(lockedVersion ? { lockedVersion } : {}),
        reason: `${OUT_OF_SYNC} (${index.file} has ${recorded ? `"${recorded}"` : 'no entry'}${lockedVersion ? ` -> ${lockedVersion}` : ''} for "${spec}")`,
      };
    }
    if (lockedVersion) {
      return { ...base, kind: 'check', packageName: locked.realName ?? packageName, version: lockedVersion, lockedVersion };
    }
  }
  const exact = exactNpmVersion(rangeSpec);
  if (exact) return { ...base, kind: 'check', packageName, version: exact };
  return { ...base, kind: 'unchecked', reason: `version range "${spec}", no lockfile resolution` };
}

/**
 * Resolve a `name -> spec` record with caller-supplied resolved versions
 * (programmatic use; no lockfile on disk). Same rules as `resolveDependencies`.
 */
export function resolveFromRecord(
  dependencies: Record<string, string>, lockedVersions: Record<string, string> = {},
): ResolvedDependency[] {
  const index: LockIndex = {
    file: 'package-lock.json',
    members: () => [],
    hasImporter: () => true,
    recordedSpec: () => null,
    resolve: (_importer, name) => (lockedVersions[name] !== undefined ? { version: lockedVersions[name] } : undefined),
  };
  return Object.entries(dependencies).map(([name, spec]) => resolveOne(name, spec, '', index, new Set()));
}

/**
 * Resolve the dependencies to check for the package.json at `manifestPath`.
 * @throws when package.json itself cannot be read or parsed.
 */
export async function resolveDependencies(manifestPath: string): Promise<DependencyResolution> {
  const manifestDir = path.dirname(path.resolve(manifestPath));
  const manifest = await readManifest(manifestPath);

  let index: LockIndex | null = null;
  let lockDir = manifestDir;
  let lockfile: string | null = null;
  let error: string | undefined;
  const found = await findLockfile(manifestDir);
  if (found) {
    const member = path.relative(found.dir, manifestDir).split(path.sep).join('/');
    try {
      const parsed = parseLockfile(found.file, await fs.readFile(path.join(found.dir, found.file), 'utf-8'));
      const rootManifest = member ? await readManifest(path.join(found.dir, 'package.json')).catch(() => ({} as Manifest)) : manifest;
      const covers = member === '' || parsed.hasImporter(member) && (parsed.file !== 'yarn.lock'
        || (await workspaceMembers(found.dir, null, rootManifest)).includes(member));
      if (covers) {
        index = parsed;
        lockDir = found.dir;
        lockfile = path.relative(manifestDir, path.join(found.dir, found.file)).split(path.sep).join('/');
      }
    } catch (e) {
      error = `${found.file} could not be read (${e instanceof Error ? e.message.slice(0, 120) : 'error'})`;
    }
  }
  const scannedMember = path.relative(lockDir, manifestDir).split(path.sep).join('/');

  // At a workspace root, members' own dependencies are scanned too.
  const members = scannedMember === '' ? await workspaceMembers(lockDir, index, manifest) : [];
  const memberManifests = new Map<string, Record<string, string>>();
  const memberErrors: string[] = [];
  const localNames = new Set<string>();
  for (const member of members) {
    try {
      const m = await readManifest(path.join(lockDir, member, 'package.json'));
      memberManifests.set(member, declaredDependencies(m));
      if (typeof m.name === 'string') localNames.add(m.name);
    } catch {
      memberErrors.push(`${member}/package.json could not be read`);
    }
  }

  const dependencies: ResolvedDependency[] = [];
  for (const [name, spec] of Object.entries(declaredDependencies(manifest))) {
    dependencies.push(resolveOne(name, spec, scannedMember, index, localNames));
  }
  for (const [member, deps] of memberManifests) {
    for (const [name, spec] of Object.entries(deps)) dependencies.push(resolveOne(name, spec, member, index, localNames));
  }
  return { dependencies, lockfile, workspaceMembers: [...memberManifests.keys()], memberErrors, ...(error ? { error } : {}) };
}
