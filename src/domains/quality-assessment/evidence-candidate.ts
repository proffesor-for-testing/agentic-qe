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
export const CANDIDATE_SCHEME = 'aqe-candidate/1';

/**
 * Working-tree paths that never belong to the candidate: AQE's own store
 * (evidence writes change `.agentic-qe/memory.db`) and the default CI artifact
 * directory, which `aqe ci run` rewrites before its gate phase.
 */
export const CANDIDATE_IGNORED_PREFIXES: readonly string[] = ['.agentic-qe/', '.aqe-ci-output/'];

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

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
    // Never prompt, never page, never run a user fsmonitor hook.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  });
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

function isIgnored(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/');
  return CANDIDATE_IGNORED_PREFIXES.some((prefix) =>
    p === prefix.slice(0, -1) || p.startsWith(prefix) || p.includes(`/${prefix}`));
}

/** Content digest of one working-tree path (file bytes, link target, or a nested checkout). */
function digestPath(absPath: string, depth: number): string {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(absPath); } catch { return 'deleted'; }
  if (stat.isSymbolicLink()) {
    return `link:${createHash('sha256').update(fs.readlinkSync(absPath)).digest('hex')}`;
  }
  if (stat.isDirectory()) {
    // A submodule or nested repository: its own HEAD and uncommitted content.
    if (depth >= MAX_NESTED_DEPTH) return 'dir';
    try {
      // Only a directory that is itself a work-tree root (not one inside the parent repo).
      if (normalizePath(git(absPath, ['rev-parse', '--show-toplevel']).trim()) !== normalizePath(absPath)) return 'dir';
      return `repo:${gitHead(absPath)}:${fingerprintWorkTree(absPath, depth + 1).fingerprint}`;
    } catch {
      return 'dir';
    }
  }
  if (!stat.isFile()) return `special:${stat.mode}`;
  return `file:${stat.mode & 0o111 ? 'x' : '-'}:${createHash('sha256').update(fs.readFileSync(absPath)).digest('hex')}`;
}

/**
 * Fingerprint the uncommitted state of the work tree: every path `git status`
 * reports (tracked changes and untracked, non-ignored files) with its status
 * code and current content. Two checkouts at the same HEAD with different
 * uncommitted content get different fingerprints.
 */
function fingerprintWorkTree(topLevel: string, depth = 0): { dirty: boolean; fingerprint: string } {
  const raw = git(topLevel, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  const entries: string[] = [];
  for (const entry of raw.split('\0')) {
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const rel = entry.slice(3);
    if (isIgnored(rel)) continue;
    entries.push(`${rel}\0${code}\0${digestPath(path.join(topLevel, rel), depth)}`);
  }
  if (entries.length === 0) return { dirty: false, fingerprint: 'clean' };
  entries.sort();
  return { dirty: true, fingerprint: createHash('sha256').update(entries.join('\n')).digest('hex') };
}

function candidateId(project: string, head: string, fingerprint: string): string {
  return createHash('sha256').update([CANDIDATE_SCHEME, project, head, fingerprint].join('\0')).digest('hex');
}

/**
 * Resolve the candidate of a checkout. Defaults to the AQE project root — the
 * same root whose `.agentic-qe` store holds the evidence.
 */
export function resolveQualityEvidenceCandidate(projectRoot: string = findProjectRoot()): QualityEvidenceCandidate {
  const project = normalizePath(projectRoot);
  let topLevel: string;
  try {
    topLevel = git(project, ['rev-parse', '--show-toplevel']).trim();
    if (!topLevel) throw new Error('empty');
  } catch {
    return {
      status: 'unavailable', id: 'unavailable', project,
      reason: 'the project is not a Git work tree (or git is unavailable), so no candidate identity can be resolved',
    };
  }
  const head = gitHead(topLevel);
  try {
    const { dirty, fingerprint } = fingerprintWorkTree(topLevel);
    return { status: 'resolved', id: candidateId(project, head, fingerprint), project, head, dirty, fingerprint };
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
