/**
 * #1474: AQE's own output inside the checkout, left out of candidates by content.
 *
 * `aqe ci run` writes artifacts into its output directory (and an optional `-o`
 * report) and `aqe quality --gate -o` writes its report into the checkout. Those
 * writes must not change the candidate between a run's measurements and its
 * gate, yet nothing else may ever be hidden. So each write AQE completes is
 * recorded as a manifest entry, path → sha256 of exactly what AQE wrote, in
 * `.agentic-qe/candidate-ignore.json`.
 *
 * At resolution, an uncommitted path is left out only when it is in the
 * manifest, is still an untracked regular file, and its current content hash
 * equals the recorded one. Then it contributes exactly what it would if it
 * were absent, so the exclusion is NOT part of the candidate id: a measurement
 * taken before AQE wrote its output matches a gate run after it. Anything else
 * is fingerprinted normally — files AQE did not write (even inside its output
 * directory), files changed since AQE wrote them, and tracked content.
 *
 * Recording is refused for a path outside the project or the project itself, a
 * path that is not a regular file, and tracked content. Entries whose file is
 * gone are pruned; entries that are not applied are reported.
 *
 * @module domains/quality-assessment/candidate-ignore-registry
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, normalizePath, trackedUnder } from './candidate-git.js';

const IGNORE_FILE = path.join('.agentic-qe', 'candidate-ignore.json');
const REGISTRY_VERSION = 3;
const MAX_ENTRIES = 500;
const HASH_CHUNK = 1024 * 1024;

/**
 * Directories under the AQE project root that never belong to the candidate:
 * AQE's own store (evidence writes change `.agentic-qe/memory.db`) and the
 * default CI artifact directory, which `aqe ci run` rewrites before its gate.
 */
export const CANDIDATE_IGNORED_DIRS: readonly string[] = ['.agentic-qe', '.aqe-ci-output'];

/** One file AQE wrote: path relative to the AQE project root and the sha256 of what it wrote. */
export interface CandidateOutputEntry {
  path: string;
  sha256: string;
}

/** A recorded output that was not left out, and why. */
export interface RejectedCandidateIgnore {
  path: string;
  reason: string;
}

/** sha256 of a file, streamed in bounded chunks. */
export function sha256File(absPath: string): string {
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

function registryPath(project: string): string {
  return path.join(project, IGNORE_FILE);
}

function readEntries(project: string): CandidateOutputEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(project), 'utf-8')) as { version?: unknown; entries?: unknown };
    // Any other shape (earlier builds' lists and prefix entries) records nothing.
    if (parsed?.version !== REGISTRY_VERSION || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter((e): e is CandidateOutputEntry =>
      !!e && typeof e === 'object' && typeof (e as CandidateOutputEntry).path === 'string'
      && /^[0-9a-f]{64}$/.test(String((e as CandidateOutputEntry).sha256)),
    ).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function writeEntries(project: string, entries: CandidateOutputEntry[]): void {
  fs.mkdirSync(path.join(project, '.agentic-qe'), { recursive: true });
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(registryPath(project), JSON.stringify({ version: REGISTRY_VERSION, entries: sorted }, null, 2));
}

/** A project-relative path that stays inside the project and is not the project itself. */
function projectRelative(project: string, absPath: string): string | undefined {
  const target = path.resolve(absPath);
  const resolved = path.join(normalizePath(path.dirname(target)), path.basename(target));
  const rel = path.relative(project, resolved).replace(/\\/g, '/');
  if (!rel || rel === '.' || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  return rel;
}

function fromTop(project: string, topLevel: string, rel: string): string {
  return path.relative(topLevel, path.join(project, rel)).replace(/\\/g, '/');
}

function isGitIgnored(topLevel: string, relFromTop: string): boolean {
  try {
    git(topLevel, ['check-ignore', '-q', '--', relFromTop]);
    return true; // exit 0: ignored
  } catch {
    return false;
  }
}

function isRegularFile(absPath: string): boolean {
  try { return fs.lstatSync(absPath).isFile(); } catch { return false; }
}

/**
 * Record a file AQE has just written successfully, with the hash of its
 * content now. Call it after every AQE write into the checkout (a CI artifact,
 * a `-o` report); a rewrite updates the hash. Refused — the gate only gets
 * stricter — for a path outside the project, the project itself, anything that
 * is not a regular file, and tracked content. Never throws.
 */
export function recordCandidateOutput(absPath: string, projectRoot: string): boolean {
  try {
    const project = normalizePath(projectRoot);
    const rel = projectRelative(project, absPath);
    if (!rel || !isRegularFile(path.join(project, rel))) return false;
    // Already outside every candidate: nothing to record.
    if (CANDIDATE_IGNORED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) return true;
    const topLevel = normalizePath(git(project, ['rev-parse', '--show-toplevel']).trim());
    const top = fromTop(project, topLevel, rel);
    if (trackedUnder(topLevel, [top]).length > 0) return false;
    if (isGitIgnored(topLevel, top)) return true; // never part of a candidate anyway
    const entries = readEntries(project).filter((e) => e.path !== rel);
    if (entries.length >= MAX_ENTRIES) return false;
    writeEntries(project, [...entries, { path: rel, sha256: sha256File(path.join(project, rel)) }]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The recorded outputs that are left out of this checkout's candidate now
 * (top-level-relative path → recorded hash) and the ones that are not. A
 * recorded file that no longer exists is pruned from the manifest (best effort).
 */
export function effectiveCandidateIgnores(project: string, topLevel: string): {
  excluded: Map<string, string>;
  rejected: RejectedCandidateIgnore[];
} {
  const entries = readEntries(project);
  const excluded = new Map<string, string>();
  const rejected: RejectedCandidateIgnore[] = [];
  const kept = entries.filter((e) => fs.existsSync(path.join(project, e.path)));
  const tracked = new Set(trackedUnder(topLevel, kept.map((e) => fromTop(project, topLevel, e.path))));
  for (const entry of kept) {
    const abs = path.join(project, entry.path);
    const top = fromTop(project, topLevel, entry.path);
    let why: string | undefined;
    if (tracked.has(top)) why = 'it is tracked';
    else if (!isRegularFile(abs)) why = 'it is no longer a regular file';
    else {
      try {
        if (sha256File(abs) !== entry.sha256) why = 'its content changed since AQE wrote it';
      } catch {
        why = 'it could not be read';
      }
    }
    if (why) rejected.push({ path: entry.path, reason: `not left out: ${why}` });
    else excluded.set(top, entry.sha256);
  }
  if (kept.length !== entries.length) {
    try { writeEntries(project, kept); } catch { /* pruning is best effort */ }
  }
  return { excluded, rejected };
}
