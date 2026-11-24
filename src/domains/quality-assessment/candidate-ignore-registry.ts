/**
 * #1474: AQE commands' own output inside the checkout, left out of candidates.
 *
 * `aqe ci run` writes its artifacts (its configured output directory, a `-o`
 * report) and `aqe quality --gate -o` its report into the checkout. Without
 * exclusion those writes change the candidate between a run's measurements and
 * its gate. Such paths are recorded in `.agentic-qe/candidate-ignore.json` so
 * every producer and gate excludes them the same way.
 *
 * The registry can never hide the candidate's real content:
 *   - a path is registered only after the command wrote it successfully, and
 *     only when it holds no tracked content (`git ls-files` is empty for it);
 *   - a `file` entry matches exactly that path; only an AQE output directory is
 *     a `dir` entry;
 *   - at every resolution, an entry that no longer exists is pruned and an entry
 *     that now matches tracked content (or changed kind) is not applied and is
 *     reported as rejected;
 *   - the effective list is part of the candidate id and its provenance.
 *
 * @module domains/quality-assessment/candidate-ignore-registry
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { git, normalizePath, trackedUnder } from './candidate-git.js';

const IGNORE_FILE = path.join('.agentic-qe', 'candidate-ignore.json');

/**
 * Directories under the AQE project root that never belong to the candidate:
 * AQE's own store (evidence writes change `.agentic-qe/memory.db`) and the
 * default CI artifact directory, which `aqe ci run` rewrites before its gate.
 */
export const CANDIDATE_IGNORED_DIRS: readonly string[] = ['.agentic-qe', '.aqe-ci-output'];
const REGISTRY_VERSION = 2;
const MAX_ENTRIES = 50;

export interface CandidateIgnoreEntry {
  /** Path relative to the AQE project root, `/`-separated. */
  path: string;
  /** `file`: exactly this file. `dir`: an AQE output directory and everything under it. */
  kind: 'file' | 'dir';
}

/** A registered entry that was not applied, and why. */
export interface RejectedCandidateIgnore {
  path: string;
  reason: string;
}

function registryPath(project: string): string {
  return path.join(project, IGNORE_FILE);
}

function readEntries(project: string): CandidateIgnoreEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(project), 'utf-8')) as { version?: unknown; entries?: unknown };
    // Any other shape (including the unversioned list of an earlier build) registers nothing.
    if (parsed?.version !== REGISTRY_VERSION || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter((e): e is CandidateIgnoreEntry =>
      !!e && typeof e === 'object' && typeof (e as CandidateIgnoreEntry).path === 'string'
      && ((e as CandidateIgnoreEntry).kind === 'file' || (e as CandidateIgnoreEntry).kind === 'dir'),
    ).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function writeEntries(project: string, entries: CandidateIgnoreEntry[]): void {
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

function isGitIgnored(topLevel: string, relFromTop: string): boolean {
  try {
    git(topLevel, ['check-ignore', '-q', '--', relFromTop]);
    return true; // exit 0: ignored
  } catch {
    return false;
  }
}

/** Why an entry may not be applied in this checkout, or undefined when it may. */
function disqualify(project: string, topLevel: string, entry: CandidateIgnoreEntry): string | undefined {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(path.join(project, entry.path)); } catch { return 'missing'; }
  if (entry.kind === 'file' && !stat.isFile()) return 'no longer a regular file';
  if (entry.kind === 'dir' && !stat.isDirectory()) return 'no longer a directory';
  const fromTop = path.relative(topLevel, path.join(project, entry.path)).replace(/\\/g, '/');
  if (trackedUnder(topLevel, [fromTop]).length > 0) return 'it holds tracked content';
  return undefined;
}

/**
 * Record a command's own output after it was written successfully. Refused
 * (silently — the gate only gets stricter) for a path outside the project, the
 * project itself, a missing path, a path of the other kind, or any path that
 * holds tracked content. Never throws.
 */
export function registerCandidateIgnore(absPath: string, kind: 'file' | 'dir', projectRoot: string): boolean {
  try {
    const project = normalizePath(projectRoot);
    const rel = projectRelative(project, absPath);
    if (!rel) return false;
    const topLevel = normalizePath(git(project, ['rev-parse', '--show-toplevel']).trim());
    const entry: CandidateIgnoreEntry = { path: rel, kind };
    if (disqualify(project, topLevel, entry)) return false;
    // Already outside every candidate: a built-in exclusion or a path Git ignores.
    // Registering it would only change the candidate id for nothing.
    if (CANDIDATE_IGNORED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) return true;
    if (isGitIgnored(topLevel, path.relative(topLevel, path.join(project, rel)).replace(/\\/g, '/'))) return true;
    const entries = readEntries(project);
    if (entries.some((e) => e.path === rel && e.kind === kind)) return true;
    if (entries.length >= MAX_ENTRIES) return false;
    writeEntries(project, [...entries.filter((e) => e.path !== rel), entry]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The registered entries that apply to this checkout now (top-level-relative)
 * and the ones that do not. Entries that no longer exist are pruned from the
 * registry (best effort).
 */
export function effectiveCandidateIgnores(project: string, topLevel: string): {
  applied: CandidateIgnoreEntry[];
  rejected: RejectedCandidateIgnore[];
} {
  const entries = readEntries(project);
  const applied: CandidateIgnoreEntry[] = [];
  const rejected: RejectedCandidateIgnore[] = [];
  const kept: CandidateIgnoreEntry[] = [];
  for (const entry of entries) {
    const why = disqualify(project, topLevel, entry);
    if (why === 'missing') continue; // pruned
    kept.push(entry);
    if (why) {
      rejected.push({ path: entry.path, reason: `not applied: ${why}` });
      continue;
    }
    applied.push({
      path: path.relative(topLevel, path.join(project, entry.path)).replace(/\\/g, '/'),
      kind: entry.kind,
    });
  }
  if (kept.length !== entries.length) {
    try { writeEntries(project, kept); } catch { /* pruning is best effort */ }
  }
  return { applied, rejected };
}
