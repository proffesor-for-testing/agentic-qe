/**
 * #1474 test fixtures: candidates and candidate-bound evidence records.
 *
 * Vitest sets AQE_PROJECT_ROOT to a non-Git temp dir, so a gate that resolves
 * its candidate from the checkout sees `unavailable` unless a test points the
 * root at a Git fixture (`createGitCandidateFixture`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { QualityEvidenceCandidate } from '../../src/domains/quality-assessment/evidence-candidate.js';
import type { QualityEvidenceRecord, QualityMetricName } from '../../src/domains/quality-assessment/quality-evidence.js';

/** A resolved candidate with a deterministic id derived from `label`. */
export function fixtureCandidate(label: string, extra: { dirty?: boolean } = {}): QualityEvidenceCandidate {
  const id = createHash('sha256').update(`fixture:${label}`).digest('hex');
  return {
    status: 'resolved', id, project: `/fixture/${label}`, head: id.slice(0, 40),
    dirty: extra.dirty ?? false, fingerprint: extra.dirty ? id : 'clean',
  };
}

/** A resolved candidate whose id is the one embedded in an evidence key. */
function candidateWithId(id: string): QualityEvidenceCandidate {
  return { status: 'resolved', id, project: '/fixture/keyed', head: id.slice(0, 40), dirty: false, fingerprint: 'clean' };
}

/** A v2 receipt of `metric` bound to `candidate`. */
export function boundRecord(
  metric: QualityMetricName, value: number, candidate: QualityEvidenceCandidate,
  extra: Partial<QualityEvidenceRecord> = {},
): QualityEvidenceRecord {
  return {
    schemaVersion: 2, receiptId: `receipt-${metric}-${candidate.id.slice(0, 8)}`, metric, value,
    measuredAt: new Date().toISOString(), source: 'measured-fixture', candidate, ...extra,
  };
}

/** Parse `quality-evidence:v2:<candidateId>:<metric>:latest`; undefined for any other key. */
export function parseCandidateEvidenceKey(key: string): { candidateId: string; metric: QualityMetricName } | undefined {
  const match = /^quality-evidence:v2:([0-9a-f]{64}):([A-Za-z]+):latest$/.exec(key);
  return match ? { candidateId: match[1], metric: match[2] as QualityMetricName } : undefined;
}

/**
 * For a candidate-qualified evidence key, its metric and a builder of a record
 * bound to the candidate named in the key; undefined for any other key.
 */
export function evidenceKeyFixture(key: string): {
  metric: QualityMetricName;
  record: (value: number, extra?: Partial<QualityEvidenceRecord>) => QualityEvidenceRecord;
} | undefined {
  const parsed = parseCandidateEvidenceKey(key);
  if (!parsed) return undefined;
  return {
    metric: parsed.metric,
    record: (value, extra = {}) => boundRecord(parsed.metric, value, candidateWithId(parsed.candidateId), extra),
  };
}

/**
 * A `memory.get` that answers every candidate-qualified evidence key with a
 * record bound to the candidate named in that key — i.e. fresh evidence of
 * whatever candidate the gate requests.
 */
export function boundEvidenceGet(values: Partial<Record<QualityMetricName, number>>) {
  return async (key: string): Promise<QualityEvidenceRecord | undefined> => {
    const parsed = parseCandidateEvidenceKey(key);
    if (!parsed || values[parsed.metric] === undefined) return undefined;
    return boundRecord(parsed.metric, values[parsed.metric]!, candidateWithId(parsed.candidateId));
  };
}

/** A committed Git work tree to use as AQE_PROJECT_ROOT, so candidates resolve. */
export function createGitCandidateFixture(prefix = 'aqe-candidate-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'fixture');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'index.js'), 'export const a = 1;\n');
  writeFileSync(join(dir, '.gitignore'), 'ci-result.json\n*.log\n');
  git('add', '-A');
  git('commit', '-qm', 'A');
  return dir;
}

/** Commit a change in a Git fixture (moves HEAD to a new candidate). */
export function commitFixtureChange(dir: string, content: string, message = 'change'): void {
  writeFileSync(join(dir, 'index.js'), content);
  execFileSync('git', ['commit', '-qam', message], { cwd: dir, stdio: 'ignore' });
}

/**
 * A `vi.mock` factory for `evidence-candidate` that keeps the real module but
 * resolves every checkout to one fixed candidate — for producer and handler
 * unit tests whose project root is a non-Git temp dir:
 *
 *   vi.mock('<rel>/src/domains/quality-assessment/evidence-candidate', async (importOriginal) =>
 *     (await import('<rel>/tests/fixtures/quality-evidence-candidates')).fixedCandidateModule(importOriginal));
 */
export async function fixedCandidateModule(importOriginal: () => Promise<unknown>): Promise<Record<string, unknown>> {
  const actual = await importOriginal() as Record<string, unknown>;
  const fixed = fixtureCandidate('fixed-checkout');
  return { ...actual, resolveQualityEvidenceCandidate: () => fixed };
}
