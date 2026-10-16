/**
 * Agentic QE v3 - Dependency resolution for the OSV advisory scan (#1049)
 *
 * Decides, for every direct dependency of a package.json, what can be checked
 * against OSV:
 *
 * - check:     a registry package at a concrete version — the lockfile's
 *              resolved version when the lockfile is in sync with package.json,
 *              else an exact spec. `npm:` aliases resolve to the real package.
 * - local:     a workspace / linked / local-directory package. Not an OSV
 *              subject; listed separately and never makes a scan incomplete.
 * - unchecked: anything that cannot be matched without guessing — a range
 *              with no (in-sync) lockfile resolution, a lockfile out of sync
 *              with package.json, git/URL/tarball sources.
 *
 * The lockfile is looked up from the package directory upwards (never above
 * AQE_PROJECT_ROOT or the git root), so scanning a workspace member directly
 * uses the workspace root's lockfile.
 *
 * Workspace member scanning is not part of 3.15.7 (#1057): at a workspace root
 * only the root's own dependencies are checked and the scan is reported as not
 * complete, with a reason; each member can be scanned directly.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import semver from 'semver';
import { parse as parseYaml } from 'yaml';
import { safeJsonParse } from '@shared/safe-json.js';
import { classifyNpmSpec, exactNpmVersion } from '@shared/security/osv-lookup.js';
import { LOCKFILES, parseLockfile, type LockIndex, type LockfileName } from './lockfile-versions.js';

export interface ResolvedDependency {
  /** Dependency name as declared (the alias name for `npm:` aliases). */
  readonly name: string;
  /** Spec as declared in package.json. */
  readonly spec: string;
  /** Lockfile importer the dependency belongs to ('' = the lockfile root). */
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
  /** A lockfile that exists but could not be read or parsed. */
  readonly error?: string;
  /**
   * Reasons the scan cannot be complete beyond individual packages — today: a
   * workspace root, whose members' dependencies are not scanned (#1057).
   */
  readonly memberErrors: string[];
}

/** The reason a workspace root's scan is not complete (#1057). */
export const WORKSPACE_NOT_SCANNED =
  'workspace member dependencies are not scanned yet (#1057); scan each member directory separately';

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

async function realOrResolved(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Find the lockfile governing `dir`: walk up, but never above the project root
 * (`AQE_PROJECT_ROOT` when `dir` is inside it) nor above the git root.
 */
async function findLockfile(dir: string, env: NodeJS.ProcessEnv = process.env): Promise<{ dir: string; file: LockfileName } | null> {
  let current = await realOrResolved(dir);
  const projectRoot = env.AQE_PROJECT_ROOT ? await realOrResolved(env.AQE_PROJECT_ROOT) : null;
  const boundary = projectRoot && isInside(projectRoot, current) ? projectRoot : null;
  for (;;) {
    for (const file of LOCKFILES) {
      if (await exists(path.join(current, file))) return { dir: current, file };
    }
    if (current === boundary || await exists(path.join(current, '.git'))) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Whether `child` is `root` or inside it (both absolute, real paths). */
function isInside(root: string, child: string): boolean {
  const rel = path.relative(root, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Largest pnpm-workspace.yaml that is read; a larger one counts as a workspace root. */
const MAX_PNPM_WORKSPACE_BYTES = 1024 * 1024;

const nonEmptyArray = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

/**
 * A workspace root, detected without expanding any glob: package.json
 * `workspaces` is a non-empty array or an object with a non-empty `packages`,
 * or a pnpm-workspace.yaml declares workspace packages.
 */
async function isWorkspaceRoot(dir: string, manifest: Manifest): Promise<boolean> {
  const ws = manifest.workspaces;
  if (nonEmptyArray(ws)) return true;
  if (ws !== null && typeof ws === 'object' && nonEmptyArray((ws as { packages?: unknown }).packages)) return true;
  return pnpmDeclaresPackages(path.join(dir, 'pnpm-workspace.yaml'));
}

/**
 * pnpm 10+ keeps project settings (nodeLinker, onlyBuiltDependencies, ...) in
 * pnpm-workspace.yaml even for a single package, so only a file that declares
 * `packages` is a workspace root. Fail closed: an unreadable, oversized,
 * non-regular, dangling or unparsable file, or a `packages` that is not a list,
 * counts as a root. No file, a map without `packages`, or `packages: []` does not.
 */
async function pnpmDeclaresPackages(file: string): Promise<boolean> {
  try {
    await fs.lstat(file);
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ENOENT';
  }
  let doc: unknown;
  try {
    const st = await fs.stat(file); // follows a link; a dangling one throws
    if (!st.isFile() || st.size > MAX_PNPM_WORKSPACE_BYTES) return true;
    const text = await fs.readFile(file, 'utf-8');
    doc = parseYaml(text, { uniqueKeys: false, merge: true, maxAliasCount: 100 });
  } catch {
    return true;
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return true;
  if (!Object.prototype.hasOwnProperty.call(doc, 'packages')) return false;
  const packages = (doc as { packages: unknown }).packages;
  return !Array.isArray(packages) || packages.length > 0;
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
  let lockDir = await realOrResolved(manifestDir);
  const realManifestDir = lockDir;
  let lockfile: string | null = null;
  let error: string | undefined;
  const found = await findLockfile(manifestDir);
  if (found) {
    const member = path.relative(found.dir, realManifestDir).split(path.sep).join('/');
    try {
      const parsed = parseLockfile(found.file, await fs.readFile(path.join(found.dir, found.file), 'utf-8'));
      const rootManifest = member ? await readManifest(path.join(found.dir, 'package.json')).catch(() => ({} as Manifest)) : manifest;
      // A member scanned directly: the root lockfile covers it if it lists the
      // importer (npm/pnpm) or, for yarn, if the root declares workspaces.
      const covers = member === '' || parsed.hasImporter(member) && (parsed.file !== 'yarn.lock'
        || await isWorkspaceRoot(found.dir, rootManifest));
      if (covers) {
        index = parsed;
        lockDir = found.dir;
        lockfile = path.relative(realManifestDir, path.join(found.dir, found.file)).split(path.sep).join('/');
      }
    } catch (e) {
      // #1049 round 4: a malformed lockfile is an error (the scan is not complete), not "no lockfile".
      error = `${path.relative(realManifestDir, path.join(found.dir, found.file)).split(path.sep).join('/')} could not be read or parsed `
        + `(${e instanceof Error ? e.message.slice(0, 120) : 'error'}); versions were not resolved from it`;
    }
  }
  const scannedMember = path.relative(lockDir, realManifestDir).split(path.sep).join('/');

  // #1057: workspace members are not scanned in 3.15.7 — a workspace root is never complete.
  const memberErrors: string[] = await isWorkspaceRoot(realManifestDir, manifest) ? [WORKSPACE_NOT_SCANNED] : [];

  const dependencies: ResolvedDependency[] = [];
  for (const [name, spec] of Object.entries(declaredDependencies(manifest))) {
    dependencies.push(resolveOne(name, spec, scannedMember, index, new Set()));
  }
  return { dependencies, lockfile, memberErrors, ...(error ? { error } : {}) };
}
