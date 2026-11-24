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
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findProjectRoot } from '../../kernel/project-root.js';

/** Version of the candidate-identity scheme; part of every candidate id. */
export const CANDIDATE_SCHEME = 'aqe-candidate/2';

/**
 * Directories under the AQE project root that never belong to the candidate:
 * AQE's own store (evidence writes change `.agentic-qe/memory.db`) and the
 * default CI artifact directory, which `aqe ci run` rewrites before its gate.
 */
export const CANDIDATE_IGNORED_DIRS: readonly string[] = ['.agentic-qe', '.aqe-ci-output'];

/** How many uncommitted paths a candidate lists for diagnostics (not part of the id). */
const LISTED_DIRTY_PATHS = 20;

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
  /** The first uncommitted paths, sorted, for diagnostics; not part of the id. */
  dirtyPaths?: string[];
  /** How many uncommitted paths there are in total. */
  dirtyCount?: number;
}

export interface UnavailableQualityEvidenceCandidate {
  status: 'unavailable';
  id: 'unavailable';
  project: string;
  reason: string;
}

export type QualityEvidenceCandidate = ResolvedQualityEvidenceCandidate | UnavailableQualityEvidenceCandidate;

const GIT_TIMEOUT_MS = 15_000;
/** How deep nested repositories (submodules) are fingerprinted. */
const MAX_NESTED_DEPTH = 3;
const MAX_STDERR = 400;
const HASH_CHUNK = 1024 * 1024;

/**
 * Run git without prompts, optional locks, fsmonitor hooks or the untracked
 * cache (`-c core.fsmonitor=false`), so no user hook runs and the listing is
 * computed from the tree itself. Failures carry git's own stderr (bounded).
 */
function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    });
  } catch (error) {
    const e = error as { stderr?: string | Buffer; code?: string; message?: string };
    const stderr = String(e.stderr ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_STDERR);
    throw new Error(stderr || (e.code === 'ENOENT' ? 'git is not installed' : (e.message ?? 'git failed')));
  }
}

/** The HEAD commit of a work tree, or `unborn` before its first commit. */
function gitHead(cwd: string): string {
  try {
    return git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']).trim() || 'unborn';
  } catch {
    return 'unborn';
  }
}

function normalizePath(p: string): string {
  let real = p;
  try { real = fs.realpathSync.native(p); } catch { real = path.resolve(p); }
  return real.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

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
    ? execFileSync('git', ['-c', 'core.fsmonitor=false', 'hash-object', '--stdin-paths'], {
      cwd: topLevel, input: present.join('\n') + '\n', encoding: 'utf-8', timeout: GIT_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'],
    }).trim().split('\n')
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
): { dirty: boolean; fingerprint: string; paths: string[] } {
  const raw = git(topLevel, [
    'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--ignore-submodules=none',
  ]);
  const entries: string[] = [];
  const paths: string[] = [];
  for (const entry of raw.split('\0')) {
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const rel = entry.slice(3);
    if (isIgnored(rel, rules)) continue;
    paths.push(rel);
    entries.push(`${rel}\0${code}\0${digestPath(path.join(topLevel, rel), depth)}`);
  }
  for (const rel of hiddenChanges(topLevel, rules)) {
    paths.push(rel);
    entries.push(`${rel}\0hidden\0${digestPath(path.join(topLevel, rel), depth)}`);
  }
  if (entries.length === 0) return { dirty: false, fingerprint: 'clean', paths };
  entries.sort();
  paths.sort();
  return { dirty: true, fingerprint: createHash('sha256').update(entries.join('\n')).digest('hex'), paths };
}

function candidateId(project: string, head: string, fingerprint: string): string {
  return createHash('sha256').update([CANDIDATE_SCHEME, project, head, fingerprint].join('\0')).digest('hex');
}

/** Project-relative paths AQE commands registered as their own output (#1474). */
const IGNORE_FILE = path.join('.agentic-qe', 'candidate-ignore.json');
const MAX_REGISTERED = 50;

function readRegistered(project: string): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(project, IGNORE_FILE), 'utf-8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string').slice(0, MAX_REGISTERED) : [];
  } catch {
    return [];
  }
}

/**
 * Leave an AQE command's own output inside the checkout (the configured CI
 * output directory, a `-o` report file) out of every candidate. The path is
 * recorded in the project's `.agentic-qe/candidate-ignore.json`, so producers
 * and gates in any later process exclude it the same way. Paths outside the
 * project are ignored. Never throws.
 */
export function ignorePathInCandidate(absPath: string, projectRoot: string = findProjectRoot()): void {
  try {
    const project = normalizePath(projectRoot);
    const target = path.resolve(absPath);
    const parent = normalizePath(path.dirname(target));
    const rel = path.relative(project, path.join(parent, path.basename(target))).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return;
    const registered = readRegistered(project);
    if (registered.includes(rel) || registered.length >= MAX_REGISTERED) return;
    fs.mkdirSync(path.join(project, '.agentic-qe'), { recursive: true });
    fs.writeFileSync(path.join(project, IGNORE_FILE), JSON.stringify([...registered, rel].sort(), null, 2));
  } catch {
    // Best effort: an unregistered path only makes the gate stricter.
  }
}

function ignoreRules(project: string, topLevel: string): IgnoreRules {
  const projectRel = path.relative(topLevel, project).replace(/\\/g, '/');
  const under = (p: string) => (projectRel ? `${projectRel}/${p}` : p);
  const dirs = CANDIDATE_IGNORED_DIRS.map(under);
  for (const registered of readRegistered(project)) {
    const r = registered.replace(/\/+$/, '');
    if (!r || r.startsWith('..') || path.isAbsolute(r)) continue;
    // A registered path covers itself and, when it is a directory, everything under it.
    dirs.push(under(r));
  }
  return { dirs, files: new Set() };
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
    const { dirty, fingerprint, paths } = fingerprintWorkTree(topLevel, 0, ignoreRules(project, topLevel));
    return {
      status: 'resolved', id: candidateId(project, head, fingerprint), project, head, dirty, fingerprint,
      ...(dirty ? { dirtyPaths: paths.slice(0, LISTED_DIRTY_PATHS), dirtyCount: paths.length } : {}),
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

/** The listed uncommitted paths of a candidate, for messages. */
function listDirty(candidate: ResolvedQualityEvidenceCandidate): string {
  if (!candidate.dirty) return 'none';
  const shown = candidate.dirtyPaths ?? [];
  const more = (candidate.dirtyCount ?? shown.length) - shown.length;
  return shown.length === 0 ? 'unlisted' : `${shown.join(', ')}${more > 0 ? `, … ${more} more` : ''}`;
}

/**
 * Why two candidates differ, in terms a user can act on: a different project,
 * a different commit, or different uncommitted paths (named).
 */
export function explainCandidateDifference(measured: QualityEvidenceCandidate, gated: QualityEvidenceCandidate): string {
  if (measured.status !== 'resolved' || gated.status !== 'resolved') return 'the candidate identity is unavailable';
  if (measured.project !== gated.project) return `it was measured in ${measured.project}, not ${gated.project}`;
  if (measured.head !== gated.head) {
    return `it was measured at commit ${describeCandidate(measured)}, the checkout is at ${describeCandidate(gated)}`
      + (gated.dirty ? ` with uncommitted paths: ${listDirty(gated)}` : '');
  }
  return `same commit, different uncommitted content — uncommitted now: ${listDirty(gated)}; `
    + `at measurement: ${listDirty(measured)}`;
}
