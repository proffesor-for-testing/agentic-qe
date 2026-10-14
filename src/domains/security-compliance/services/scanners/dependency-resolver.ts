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
import { MAX_PNPM_WORKSPACE_BYTES, expandWorkspaces, isInside, pnpmWorkspacePatterns, type WorkspaceExpansion } from './workspace-members.js';

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
  /**
   * Workspace problems that leave members unscanned: unreadable/malformed member
   * manifests and patterns that could not be expanded. A non-empty list means
   * the scan is not complete (#1049 round 4).
   */
  readonly memberErrors: string[];
  /** Workspace members dropped because they resolve outside the project root (never scanned). */
  readonly excludedMembers: Array<{ path: string; reason: string }>;
  /** Workspace notes that do not affect completeness (e.g. a pattern matching no directory). */
  readonly workspaceWarnings: string[];
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

/** Workspace globs declared by the root manifest and pnpm-workspace.yaml. */
async function workspacePatterns(root: string, rootManifest: Manifest): Promise<{ patterns: string[]; errors: string[] }> {
  const ws = rootManifest.workspaces;
  const declared = Array.isArray(ws) ? ws : ws && typeof ws === 'object' && Array.isArray((ws as { packages?: unknown }).packages)
    ? (ws as { packages: unknown[] }).packages : [];
  const errors: string[] = [];
  let pnpm: string[] = [];
  let text: string | null = null;
  try {
    const file = path.join(root, 'pnpm-workspace.yaml');
    // #1049 round 6: refuse an oversized file before reading or parsing it.
    const { size } = await fs.stat(file);
    if (size > MAX_PNPM_WORKSPACE_BYTES) {
      errors.push(`pnpm-workspace.yaml is ${size} bytes (limit ${MAX_PNPM_WORKSPACE_BYTES}); not parsed, workspace members may be missing`);
    } else {
      text = await fs.readFile(file, 'utf-8');
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code && code !== 'ENOENT') errors.push(`pnpm-workspace.yaml could not be read (${(e as NodeJS.ErrnoException).code ?? 'error'})`);
  }
  if (text !== null) {
    // #1049 round 5: a real YAML parse; an unparsable file or a non-list `packages` is an error, never [].
    const parsed = pnpmWorkspacePatterns(text);
    if ('error' in parsed) errors.push(`${parsed.error}; workspace members may be missing`);
    else pnpm = parsed.patterns;
  }
  return { patterns: [...declared, ...pnpm].filter((p): p is string => typeof p === 'string'), errors };
}

async function workspaceMembers(root: string, index: LockIndex | null, rootManifest: Manifest): Promise<WorkspaceExpansion> {
  const { patterns, errors } = await workspacePatterns(root, rootManifest);
  const expansion = await expandWorkspaces(root, patterns, index?.members() ?? []);
  return { ...expansion, errors: [...errors, ...expansion.errors] };
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
      const covers = member === '' || parsed.hasImporter(member) && (parsed.file !== 'yarn.lock'
        || (await workspaceMembers(found.dir, null, rootManifest)).members.includes(member));
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

  // At a workspace root, members' own dependencies are scanned too.
  const expansion: WorkspaceExpansion = scannedMember === ''
    ? await workspaceMembers(lockDir, index, manifest) : { members: [], excluded: [], errors: [], warnings: [] };
  const memberManifests = new Map<string, Record<string, string>>();
  const memberErrors: string[] = [...expansion.errors];
  const localNames = new Set<string>();
  for (const member of expansion.members) {
    try {
      const m = await readManifest(path.join(lockDir, member, 'package.json'));
      memberManifests.set(member, declaredDependencies(m));
      if (typeof m.name === 'string') localNames.add(m.name);
    } catch (e) {
      memberErrors.push(`workspace member ${member}/package.json could not be read or parsed (${e instanceof Error ? e.message.slice(0, 80) : 'error'}); its dependencies were not checked`);
    }
  }

  const dependencies: ResolvedDependency[] = [];
  for (const [name, spec] of Object.entries(declaredDependencies(manifest))) {
    dependencies.push(resolveOne(name, spec, scannedMember, index, localNames));
  }
  for (const [member, deps] of memberManifests) {
    for (const [name, spec] of Object.entries(deps)) dependencies.push(resolveOne(name, spec, member, index, localNames));
  }
  return {
    dependencies, lockfile, workspaceMembers: [...memberManifests.keys()], memberErrors,
    excludedMembers: expansion.excluded, workspaceWarnings: expansion.warnings, ...(error ? { error } : {}),
  };
}
