/**
 * #1474: the identity of the candidate a quality measurement describes.
 *
 * A candidate is the normalized project identity plus the exact checkout:
 * the Git HEAD and a content fingerprint of the working tree's uncommitted
 * changes. Producers bind every evidence record to the candidate observed when
 * they record the measurement; the measured gate resolves the candidate it is
 * asked to judge from the checkout independently and accepts only evidence
 * bound to that same candidate.
 *
 * Outside a Git work tree (or without a usable `git`) there is no defined
 * candidate, so it is reported as `unavailable` and the gate cannot pass.
 *
 * @module domains/quality-assessment/evidence-candidate
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findProjectRoot } from '../../kernel/project-root.js';
import { git, gitHead, normalizePath } from './candidate-git.js';
import {
  CANDIDATE_IGNORED_DIRS,
  effectiveCandidateIgnores,
  registerCandidateIgnore,
  type CandidateIgnoreEntry,
  type RejectedCandidateIgnore,
} from './candidate-ignore-registry.js';

export { CANDIDATE_IGNORED_DIRS } from './candidate-ignore-registry.js';

/** Version of the candidate-identity scheme; part of every candidate id. */
export const CANDIDATE_SCHEME = 'aqe-candidate/3';


/** How many uncommitted paths a candidate lists, with digests, for diagnostics (not part of the id). */
const LISTED_DIRTY_PATHS = 100;
/** How many first-segment groups of uncommitted paths a candidate lists. */
const LISTED_DIRTY_GROUPS = 200;

/** Digest per first path segment over all uncommitted paths, so any difference can be located. */
function groupDigests(digests: Map<string, string>): Record<string, string> {
  const groups = new Map<string, string[]>();
  for (const [rel, digest] of [...digests.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const slash = rel.indexOf('/');
    const key = slash > 0 && slash < rel.length - 1 ? rel.slice(0, slash + 1) : rel;
    groups.set(key, [...(groups.get(key) ?? []), `${rel}:${digest}`]);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, LISTED_DIRTY_GROUPS)
    .map(([key, items]) => [key, createHash('sha256').update(items.join('\n')).digest('hex').slice(0, 12)]));
}

export interface ResolvedQualityEvidenceCandidate {
  status: 'resolved';
  /** Stable id over scheme, project, HEAD and fingerprint; keys the evidence. */
  id: string;
  /** Normalized project identity: real path of the AQE project root. */
  project: string;
  /** Git HEAD commit, or `unborn` in a repository without commits. */
  head: string;
  /** Whether the working tree had uncommitted changes (outside ignored paths). */
  dirty: boolean;
  /** sha256 over the status and content of every uncommitted path; `clean` when none. */
  fingerprint: string;
  /** The first uncommitted paths (sorted) with a short content digest each, for diagnostics. */
  dirtyDigests?: Record<string, string>;
  /** How many uncommitted paths there are in total. */
  dirtyCount?: number;
  /** Every uncommitted path grouped by its first path segment (`coverage/`, `gate.json`) → digest. */
  dirtyGroups?: Record<string, string>;
  /** Registered AQE output paths left out of this candidate (part of the id). */
  ignored?: string[];
  /** Registered paths that were not applied (e.g. they now hold tracked content). */
  rejectedIgnores?: RejectedCandidateIgnore[];
}

export interface UnavailableQualityEvidenceCandidate {
  status: 'unavailable';
  id: 'unavailable';
  project: string;
  reason: string;
}

export type QualityEvidenceCandidate = ResolvedQualityEvidenceCandidate | UnavailableQualityEvidenceCandidate;

/** How deep nested repositories (submodules) are fingerprinted. */
const MAX_NESTED_DEPTH = 3;
const HASH_CHUNK = 1024 * 1024;

/** Paths (relative to the Git top level, `/`-separated) a candidate leaves out. */
interface IgnoreRules { dirs: string[]; files: Set<string> }

function isIgnored(relPath: string, rules: IgnoreRules): boolean {
  const p = relPath.replace(/\\/g, '/').replace(/\/+$/, '');
  return rules.files.has(p) || rules.dirs.some((dir) => p === dir || p.startsWith(`${dir}/`));
}

/** sha256 of a file, streamed in bounded chunks. */
function hashFile(absPath: string): string {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(HASH_CHUNK);
  const fd = fs.openSync(absPath, 'r');
  try {
    let read: number;
    while ((read = fs.readSync(fd, buffer, 0, HASH_CHUNK, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * Content digest of one working-tree path: file bytes, link target, a nested
 * checkout, or a deterministic marker (`deleted`, `unreadable:<code>`).
 */
function digestPath(absPath: string, depth: number): string {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(absPath); } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'deleted' : `unreadable:${code ?? 'unknown'}`;
  }
  try {
    if (stat.isSymbolicLink()) {
      return `link:${createHash('sha256').update(fs.readlinkSync(absPath)).digest('hex')}`;
    }
    if (stat.isDirectory()) return digestNestedRepo(absPath, depth);
    if (!stat.isFile()) return `special:${stat.mode}`;
    return `file:${stat.mode & 0o111 ? 'x' : '-'}:${hashFile(absPath)}`;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? 'deleted' : `unreadable:${code ?? 'unknown'}`;
  }
}

/** A submodule or nested repository: its own HEAD and uncommitted content. */
function digestNestedRepo(absPath: string, depth: number): string {
  if (depth >= MAX_NESTED_DEPTH) return 'dir';
  try {
    // Only a directory that is itself a work-tree root (not one inside the parent repo).
    if (normalizePath(git(absPath, ['rev-parse', '--show-toplevel']).trim()) !== normalizePath(absPath)) return 'dir';
    return `repo:${gitHead(absPath)}:${fingerprintWorkTree(absPath, depth + 1, { dirs: [], files: new Set() }).fingerprint}`;
  } catch {
    return 'dir';
  }
}

/**
 * Index entries git status does not report on: assume-unchanged (lowercase tag)
 * and skip-worktree (`S`) files whose working copy differs from the index. A
 * skip-worktree file absent from disk (sparse checkout) is not a change.
 */
function hiddenChanges(topLevel: string, rules: IgnoreRules): string[] {
  const flagged: string[] = [];
  const indexBlob = new Map<string, string>();
  for (const entry of git(topLevel, ['ls-files', '-v', '-s', '-z']).split('\0')) {
    // "<tag> <mode> <object> <stage>\t<path>"
    const match = /^(\S) \d+ ([0-9a-f]+) \d\t(.+)$/s.exec(entry);
    if (!match) continue;
    const [, tag, blob, rel] = match;
    if (!(tag === 'S' || /^[a-z]$/.test(tag)) || isIgnored(rel, rules)) continue;
    if (tag === 'S' && !fs.existsSync(path.join(topLevel, rel))) continue;
    flagged.push(rel);
    indexBlob.set(rel, blob);
  }
  if (flagged.length === 0) return [];
  const present = flagged.filter((rel) => fs.existsSync(path.join(topLevel, rel)));
  const hashed = present.length > 0
    ? git(topLevel, ['hash-object', '--stdin-paths'], present.join('\n') + '\n').trim().split('\n')
    : [];
  const current = new Map(present.map((rel, i) => [rel, hashed[i]]));
  return flagged.filter((rel) => current.get(rel) !== indexBlob.get(rel));
}

/**
 * Fingerprint the uncommitted state of the work tree: every path `git status`
 * reports (tracked changes, untracked non-ignored files, submodules) plus
 * assume-unchanged / skip-worktree files that differ from the index, each with
 * its status code and current content. Two checkouts at the same HEAD with
 * different uncommitted content get different fingerprints.
 */
function fingerprintWorkTree(
  topLevel: string, depth: number, rules: IgnoreRules,
): { dirty: boolean; fingerprint: string; digests: Map<string, string> } {
  const raw = git(topLevel, [
    'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--ignore-submodules=none',
  ]);
  const entries: string[] = [];
  const digests = new Map<string, string>();
  const add = (rel: string, code: string) => {
    const entry = `${rel}\0${code}\0${digestPath(path.join(topLevel, rel), depth)}`;
    entries.push(entry);
    digests.set(rel, createHash('sha256').update(entry).digest('hex').slice(0, 12));
  };
  for (const entry of raw.split('\0')) {
    if (entry.length < 4) continue;
    const rel = entry.slice(3);
    if (!isIgnored(rel, rules)) add(rel, entry.slice(0, 2));
  }
  for (const rel of hiddenChanges(topLevel, rules)) add(rel, 'hidden');
  if (entries.length === 0) return { dirty: false, fingerprint: 'clean', digests };
  entries.sort();
  return { dirty: true, fingerprint: createHash('sha256').update(entries.join('\n')).digest('hex'), digests };
}

function candidateId(project: string, head: string, fingerprint: string, ignored: readonly string[]): string {
  return createHash('sha256')
    .update([CANDIDATE_SCHEME, project, head, fingerprint, ...ignored].join('\0')).digest('hex');
}

/**
 * Leave an AQE command's own output (written successfully just before) out of
 * every later candidate. `kind: 'dir'` only for an AQE output directory. See
 * {@link registerCandidateIgnore} for what is refused. Never throws.
 */
export function ignorePathInCandidate(
  absPath: string, kind: 'file' | 'dir' = 'file', projectRoot: string = findProjectRoot(),
): boolean {
  return registerCandidateIgnore(absPath, kind, projectRoot);
}

function ignoreRules(project: string, topLevel: string): IgnoreRules & {
  ignored: string[]; rejected: RejectedCandidateIgnore[];
} {
  const projectRel = path.relative(topLevel, project).replace(/\\/g, '/');
  const dirs = CANDIDATE_IGNORED_DIRS.map((dir) => (projectRel ? `${projectRel}/${dir}` : dir));
  const files = new Set<string>();
  const { applied, rejected } = effectiveCandidateIgnores(project, topLevel);
  for (const entry of applied as CandidateIgnoreEntry[]) {
    if (entry.kind === 'dir') dirs.push(entry.path); else files.add(entry.path);
  }
  const ignored = applied.map((e) => `${e.kind}:${e.path}`).sort();
  return { dirs, files, ignored, rejected };
}

/**
 * Resolve the candidate of a checkout. Defaults to the AQE project root — the
 * same root whose `.agentic-qe` store holds the evidence.
 */
export function resolveQualityEvidenceCandidate(projectRoot: string = findProjectRoot()): QualityEvidenceCandidate {
  const project = normalizePath(projectRoot);
  let topLevel: string;
  try {
    topLevel = normalizePath(git(project, ['rev-parse', '--show-toplevel']).trim());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: 'unavailable', id: 'unavailable', project,
      reason: `the project is not a Git work tree, or git could not read it (git: ${detail}). `
        + 'In a CI container whose checkout is owned by another user, run '
        + '`git config --global --add safe.directory <checkout>` first',
    };
  }
  const head = gitHead(topLevel);
  try {
    const rules = ignoreRules(project, topLevel);
    const { dirty, fingerprint, digests } = fingerprintWorkTree(topLevel, 0, rules);
    const listed = [...digests.keys()].sort().slice(0, LISTED_DIRTY_PATHS);
    return {
      status: 'resolved', id: candidateId(project, head, fingerprint, rules.ignored),
      project, head, dirty, fingerprint,
      ...(dirty ? {
        dirtyDigests: Object.fromEntries(listed.map((p) => [p, digests.get(p)!])),
        dirtyCount: digests.size,
        dirtyGroups: groupDigests(digests),
      } : {}),
      ...(rules.ignored.length > 0 ? { ignored: rules.ignored } : {}),
      ...(rules.rejected.length > 0 ? { rejectedIgnores: rules.rejected } : {}),
    };
  } catch (error) {
    return {
      status: 'unavailable', id: 'unavailable', project,
      reason: `the working tree could not be fingerprinted (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

/** True when a value has the shape of a candidate this module produced. */
export function isQualityEvidenceCandidate(value: unknown): value is QualityEvidenceCandidate {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  if (typeof c.project !== 'string') return false;
  if (c.status === 'unavailable') return c.id === 'unavailable' && typeof c.reason === 'string';
  return c.status === 'resolved' && typeof c.id === 'string' && /^[0-9a-f]{64}$/.test(c.id)
    && typeof c.head === 'string' && typeof c.fingerprint === 'string' && typeof c.dirty === 'boolean';
}

/** Short human form of a candidate for messages. */
export function describeCandidate(candidate: QualityEvidenceCandidate): string {
  if (candidate.status === 'unavailable') return 'unavailable';
  const head = candidate.head === 'unborn' ? 'unborn' : candidate.head.slice(0, 12);
  return `${head}${candidate.dirty ? `+dirty:${candidate.fingerprint.slice(0, 12)}` : ''}`;
}

const DIFF_SHOWN = 10;

function listPaths(paths: string[]): string {
  const shown = paths.slice(0, DIFF_SHOWN).join(', ');
  return paths.length > DIFF_SHOWN ? `${shown}, … ${paths.length - DIFF_SHOWN} more` : shown;
}

/** Keys of two digest maps that were added, removed or whose digest changed. */
function diffKeys(before: Record<string, string>, now: Record<string, string>) {
  return {
    added: Object.keys(now).filter((k) => !(k in before)),
    removed: Object.keys(before).filter((k) => !(k in now)),
    changed: Object.keys(now).filter((k) => k in before && before[k] !== now[k]),
  };
}

/**
 * The uncommitted paths that differ between two candidates at the same commit:
 * located by first path segment over ALL uncommitted paths, then refined to
 * files where both candidates list them.
 */
function describeDirtyDifference(measured: ResolvedQualityEvidenceCandidate, gated: ResolvedQualityEvidenceCandidate): string {
  const groups = diffKeys(measured.dirtyGroups ?? {}, gated.dirtyGroups ?? {});
  const files = diffKeys(measured.dirtyDigests ?? {}, gated.dirtyDigests ?? {});
  // A group that changed is named by its changed files when both lists cover them.
  const refine = (group: string) => {
    if (!group.endsWith('/')) return [group];
    const inGroup = [...files.added, ...files.removed, ...files.changed].filter((f) => f.startsWith(group));
    return inGroup.length > 0 ? inGroup : [group];
  };
  const parts = [
    groups.added.length ? `uncommitted since the measurement: ${listPaths(groups.added.flatMap(refine))}` : '',
    groups.removed.length ? `no longer uncommitted: ${listPaths(groups.removed.flatMap(refine))}` : '',
    groups.changed.length ? `content changed: ${listPaths(groups.changed.flatMap(refine))}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : 'the uncommitted content differs';
}

/**
 * Why two candidates differ, in terms a user can act on: a different project,
 * a different commit, different excluded AQE outputs, or the uncommitted paths
 * that were added, removed or changed since the measurement.
 */
export function explainCandidateDifference(measured: QualityEvidenceCandidate, gated: QualityEvidenceCandidate): string {
  if (measured.status !== 'resolved' || gated.status !== 'resolved') return 'the candidate identity is unavailable';
  if (measured.project !== gated.project) return `it was measured in ${measured.project}, not ${gated.project}`;
  if (measured.head !== gated.head) {
    return `it was measured at commit ${describeCandidate(measured)}, the checkout is at ${describeCandidate(gated)}`;
  }
  const ignoredBefore = (measured.ignored ?? []).join(', ') || 'none';
  const ignoredNow = (gated.ignored ?? []).join(', ') || 'none';
  if (ignoredBefore !== ignoredNow) {
    return `same commit, but the excluded AQE outputs differ (at measurement: ${ignoredBefore}; now: ${ignoredNow})`;
  }
  return `same commit, different uncommitted content — ${describeDirtyDifference(measured, gated)}`;
}
