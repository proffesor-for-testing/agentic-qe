/**
 * #1474 — the measured gate evaluates only evidence bound to the candidate it
 * judges. A frozen fixture keeps values, timestamps and sources fixed and
 * varies only the subject each receipt is bound to.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  QUALITY_EVIDENCE_NAMESPACE,
  QUALITY_METRICS,
  describeVerdictProvenance,
  evaluateQualityEvidence,
  inspectQualityEvidence,
  loadQualityEvidenceSet,
  writeQualityEvidence,
  InsufficientQualityEvidenceError,
  type QualityEvidenceValues,
  type QualityMetricName,
} from '../../../../src/domains/quality-assessment/quality-evidence.js';
import {
  ignorePathInCandidate,
  resolveQualityEvidenceCandidate,
  type QualityEvidenceCandidate,
} from '../../../../src/domains/quality-assessment/evidence-candidate.js';
import {
  commitFixtureChange,
  createGitCandidateFixture,
  fixtureCandidate,
} from '../../../fixtures/quality-evidence-candidates.js';

function createMemory() {
  const store = new Map<string, unknown>();
  const k = (key: string, o?: { namespace?: string }) => `${o?.namespace ?? 'default'}::${key}`;
  return {
    store,
    get: async (key: string, o?: { namespace?: string }) => store.get(k(key, o)),
    set: async (key: string, v: unknown, o?: { namespace?: string }) => { store.set(k(key, o), v); },
  };
}

/** The frozen fixture: identical values, timestamps and sources for every subject. */
const FROZEN = {
  measuredAt: '2026-11-20T10:00:00.000Z',
  now: Date.parse('2026-11-20T11:00:00.000Z'),
  values: {
    coverage: 91, testsPassing: 100, criticalBugs: 0, codeSmells: 3,
    securityVulnerabilities: 0, technicalDebt: 1, duplications: 1,
  } satisfies QualityEvidenceValues,
  source: (metric: QualityMetricName) => `fixture-${metric}-analyzer`,
};

const A = fixtureCandidate('A');
const B = fixtureCandidate('B');

/** Record each metric as its own, independent measurement bound to `candidate`. */
async function measure(
  memory: ReturnType<typeof createMemory>, candidate: QualityEvidenceCandidate,
  metrics: readonly QualityMetricName[] = QUALITY_METRICS,
): Promise<void> {
  for (const metric of metrics) {
    await writeQualityEvidence(memory as never, { [metric]: FROZEN.values[metric] }, {
      measuredAt: FROZEN.measuredAt, source: FROZEN.source(metric), candidate,
    });
  }
}

function gate(memory: ReturnType<typeof createMemory>, candidate: QualityEvidenceCandidate) {
  return inspectQualityEvidence(memory as never, { candidate, now: FROZEN.now });
}

const fixtures: string[] = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('#1474 candidate-bound measured evidence (frozen fixture)', () => {
  it('all A evidence evaluates and passes for candidate A, recording its receipts', async () => {
    const memory = createMemory();
    await measure(memory, A);
    const set = await loadQualityEvidenceSet(memory as never, { candidate: A, now: FROZEN.now });
    expect(set.values).toEqual(FROZEN.values);
    expect(evaluateQualityEvidence(set.values).passed).toBe(true);
    expect(set.candidate).toEqual(A);
    for (const metric of QUALITY_METRICS) {
      expect(set.receipts[metric]).toMatchObject({
        metric, key: `quality-evidence:v2:${A.id}:${metric}:latest`,
        measuredAt: FROZEN.measuredAt, source: FROZEN.source(metric),
      });
      // The referenced receipt is stored immutably and is bound to A.
      expect(memory.store.get(`${QUALITY_EVIDENCE_NAMESPACE}::quality-evidence:receipt:${set.receipts[metric].receiptId}`))
        .toMatchObject({ metric, candidate: A });
    }
  });

  it('all A evidence is insufficient for candidate B (every metric mismatched)', async () => {
    const memory = createMemory();
    await measure(memory, A);
    const { values, problems } = await gate(memory, B);
    expect(values).toEqual({});
    expect(problems.map((p) => p.code)).toEqual(QUALITY_METRICS.map(() => 'mismatched'));
    expect(problems[0].reason).toMatch(/different|not the candidate being gated/i);
    await expect(loadQualityEvidenceSet(memory as never, { candidate: B, now: FROZEN.now }))
      .rejects.toBeInstanceOf(InsufficientQualityEvidenceError);
  });

  it('mixed evidence (two A, five B) is insufficient for candidate B', async () => {
    const memory = createMemory();
    await measure(memory, B, QUALITY_METRICS.slice(2));
    await measure(memory, A, QUALITY_METRICS.slice(0, 2));
    const { values, problems } = await gate(memory, B);
    expect(problems).toEqual([
      expect.objectContaining({ metric: 'coverage', code: 'mismatched' }),
      expect.objectContaining({ metric: 'testsPassing', code: 'mismatched' }),
    ]);
    expect(Object.keys(values)).toEqual(QUALITY_METRICS.slice(2));
  });

  it('seven independently measured B records evaluate and pass for candidate B', async () => {
    const memory = createMemory();
    await measure(memory, A);
    await measure(memory, B);
    const { values, problems, receipts } = await gate(memory, B);
    expect(problems).toEqual([]);
    expect(values).toEqual(FROZEN.values);
    expect(new Set(Object.values(receipts).map((r) => r!.receiptId)).size).toBe(7);
  });

  it('legacy (unbound) evidence alone is insufficient, with a legacy-unbound reason', async () => {
    const memory = createMemory();
    for (const metric of QUALITY_METRICS) {
      await memory.set(`quality-evidence:${metric}:latest`, {
        schemaVersion: 1, metric, value: FROZEN.values[metric], measuredAt: FROZEN.measuredAt, source: FROZEN.source(metric),
      }, { namespace: QUALITY_EVIDENCE_NAMESPACE });
    }
    const { problems } = await gate(memory, A);
    expect(problems.map((p) => p.code)).toEqual(QUALITY_METRICS.map(() => 'legacy-unbound'));
    expect(problems[0].reason).toMatch(/legacy.*re-run the measurement/i);
  });

  it('stale evidence for the right candidate is insufficient', async () => {
    const memory = createMemory();
    await measure(memory, A);
    const { problems } = await inspectQualityEvidence(memory as never, {
      candidate: A, now: Date.parse(FROZEN.measuredAt) + 25 * 60 * 60 * 1000,
    });
    expect(problems.map((p) => p.code)).toEqual(QUALITY_METRICS.map(() => 'stale'));
  });

  it('an unavailable candidate is insufficient for every metric', async () => {
    const memory = createMemory();
    await measure(memory, A);
    const unavailable: QualityEvidenceCandidate = { status: 'unavailable', id: 'unavailable', project: '/x', reason: 'not a Git work tree' };
    const { problems } = await gate(memory, unavailable);
    expect(problems).toHaveLength(7);
    expect(problems.every((p) => p.code === 'candidate-unavailable')).toBe(true);
  });

  it('interleaved A/B writes never yield a mixed set; a partial B publication is insufficient', async () => {
    const memory = createMemory();
    // A publishes all seven while B publishes only four, interleaved metric by metric.
    for (const [i, metric] of QUALITY_METRICS.entries()) {
      await measure(memory, A, [metric]);
      if (i % 2 === 0) await measure(memory, B, [metric]);
    }
    const forA = await gate(memory, A);
    expect(forA.problems).toEqual([]);
    for (const metric of QUALITY_METRICS) {
      const receipt = forA.receipts[metric]!;
      expect(memory.store.get(`${QUALITY_EVIDENCE_NAMESPACE}::quality-evidence:receipt:${receipt.receiptId}`))
        .toMatchObject({ candidate: { id: A.id } });
    }
    const forB = await gate(memory, B);
    expect(Object.keys(forB.values)).toEqual(['coverage', 'criticalBugs', 'securityVulnerabilities', 'duplications']);
    expect(forB.problems.map((p) => p.metric)).toEqual(['testsPassing', 'codeSmells', 'technicalDebt']);
    expect(forB.problems.every((p) => p.code === 'mismatched')).toBe(true);
  });

  it('keeps the #1027 failing-run pairing safeguard for candidate-bound evidence', async () => {
    const memory = createMemory();
    await measure(memory, A);
    await writeQualityEvidence(memory as never, { coverage: 88 }, {
      measuredAt: FROZEN.measuredAt, source: 'failing-run', runId: 'run-x', runStatus: 'failed', candidate: A,
    });
    const { values, problems } = await gate(memory, A);
    expect(values.coverage).toBeUndefined();
    expect(problems).toEqual([expect.objectContaining({ metric: 'coverage', code: 'unpaired-failed-run' })]);
  });

  it('a threshold change re-evaluates the same receipts into a new verdict', async () => {
    const memory = createMemory();
    await measure(memory, A);
    const set = await loadQualityEvidenceSet(memory as never, { candidate: A, now: FROZEN.now });
    const lenient = { ...evaluateQualityEvidence(set.values), ...describeVerdictProvenance(set) };
    const strict = { ...evaluateQualityEvidence(set.values, { coverage: 95 }), ...describeVerdictProvenance(set, { coverage: 95 }) };
    expect(lenient.passed).toBe(true);
    expect(strict.passed).toBe(false);
    expect(strict.receipts).toEqual(lenient.receipts);
    expect(strict.thresholds.coverage.value).toBe(95);
    expect(lenient.thresholds.coverage.value).toBe(80);
  });
});

describe('#1474 candidate resolution from a real checkout', () => {
  it('resolves a clean Git checkout to its HEAD', () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    const candidate = resolveQualityEvidenceCandidate(dir);
    expect(candidate).toMatchObject({ status: 'resolved', dirty: false, fingerprint: 'clean' });
    expect(candidate.status === 'resolved' && candidate.head).toMatch(/^[0-9a-f]{40}$/);
  });

  it('changed dirty-tree content with an unchanged HEAD is a different candidate, so its evidence is insufficient', async () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    writeFileSync(join(dir, 'index.js'), 'export const a = 2;\n');
    const first = resolveQualityEvidenceCandidate(dir);
    const memory = createMemory();
    await measure(memory, first);
    writeFileSync(join(dir, 'index.js'), 'export const a = 3;\n');
    const second = resolveQualityEvidenceCandidate(dir);
    expect(first.status === 'resolved' && second.status === 'resolved').toBe(true);
    if (first.status !== 'resolved' || second.status !== 'resolved') return;
    expect(second.head).toBe(first.head);
    expect(first.dirty && second.dirty).toBe(true);
    expect(second.id).not.toBe(first.id);
    const { problems } = await gate(memory, second);
    expect(problems.map((p) => p.code)).toEqual(QUALITY_METRICS.map(() => 'mismatched'));
    expect((await gate(memory, first)).problems).toEqual([]);
  });

  it('an untracked file changes the candidate; AQE store and CI artifact writes do not', () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    const clean = resolveQualityEvidenceCandidate(dir);
    mkdirSync(join(dir, '.agentic-qe'));
    writeFileSync(join(dir, '.agentic-qe', 'memory.db'), 'x');
    mkdirSync(join(dir, '.aqe-ci-output'));
    writeFileSync(join(dir, '.aqe-ci-output', 'quality-gate.json'), '{}');
    expect(resolveQualityEvidenceCandidate(dir).id).toBe(clean.id);
    appendFileSync(join(dir, 'new-file.js'), 'export {};\n');
    expect(resolveQualityEvidenceCandidate(dir).id).not.toBe(clean.id);
  });

  it('a new commit is a different candidate', () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    const before = resolveQualityEvidenceCandidate(dir);
    commitFixtureChange(dir, 'export const a = 9;\n');
    const after = resolveQualityEvidenceCandidate(dir);
    expect(after.id).not.toBe(before.id);
    expect(after).toMatchObject({ status: 'resolved', dirty: false });
  });

  it('a directory outside any Git work tree has an unavailable candidate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aqe-nongit-'));
    fixtures.push(dir);
    expect(resolveQualityEvidenceCandidate(dir)).toMatchObject({ status: 'unavailable', id: 'unavailable' });
  });
});

describe('#1474 candidate resolution edge cases', () => {
  it('uncommitted content inside a nested repository changes the candidate', () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    const nested = join(dir, 'vendor-lib');
    mkdirSync(nested);
    execFileSync('git', ['init', '-q'], { cwd: nested });
    writeFileSync(join(nested, 'lib.js'), 'one\n');
    const first = resolveQualityEvidenceCandidate(dir);
    writeFileSync(join(nested, 'lib.js'), 'two\n');
    const second = resolveQualityEvidenceCandidate(dir);
    expect(first.status).toBe('resolved');
    expect(second.id).not.toBe(first.id);
  });

  it('binds a receipt to the checkout as it is when the producer records it', async () => {
    // Known limit: an edit made while a measurement runs is not detected; the
    // receipt describes the tree at write time, and the gate compares with that.
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    const atStart = resolveQualityEvidenceCandidate(dir);
    writeFileSync(join(dir, 'index.js'), 'export const a = 42;\n'); // edited mid-measurement
    const atWrite = resolveQualityEvidenceCandidate(dir);
    const memory = createMemory();
    await measure(memory, atWrite);
    expect((await gate(memory, atWrite)).problems).toEqual([]);
    expect((await gate(memory, atStart)).problems.every((p) => p.code === 'mismatched')).toBe(true);
  });
});

describe('#1474 review — candidate robustness and diagnostics', () => {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });

  it('a registered command output path (custom CI dir, -o file) is excluded in every later resolution', () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    const clean = resolveQualityEvidenceCandidate(dir);
    ignorePathInCandidate(join(dir, 'reports', 'ci'), dir);
    ignorePathInCandidate(join(dir, 'gate.json'), dir);
    ignorePathInCandidate(join(tmpdir(), 'outside.json'), dir); // outside the project: ignored
    mkdirSync(join(dir, 'reports', 'ci'), { recursive: true });
    writeFileSync(join(dir, 'reports', 'ci', 'quality-gate.json'), '{}');
    writeFileSync(join(dir, 'gate.json'), '{}');
    expect(resolveQualityEvidenceCandidate(dir).id).toBe(clean.id);
    writeFileSync(join(dir, 'reports', 'other.json'), '{}');
    expect(resolveQualityEvidenceCandidate(dir).id).not.toBe(clean.id);
  });

  it('.agentic-qe and .aqe-ci-output are excluded only at the AQE project root', () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    const clean = resolveQualityEvidenceCandidate(dir);
    mkdirSync(join(dir, 'pkg', '.aqe-ci-output'), { recursive: true });
    writeFileSync(join(dir, 'pkg', '.aqe-ci-output', 'x.json'), '{}');
    const nested = resolveQualityEvidenceCandidate(dir);
    expect(nested.id).not.toBe(clean.id);
    mkdirSync(join(dir, '.aqe-ci-output'));
    writeFileSync(join(dir, '.aqe-ci-output', 'x.json'), '{}');
    expect(resolveQualityEvidenceCandidate(dir).id).toBe(nested.id);
  });

  it('names the uncommitted paths when evidence was measured on other uncommitted content', async () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    const measured = resolveQualityEvidenceCandidate(dir);
    const memory = createMemory();
    await measure(memory, measured);
    writeFileSync(join(dir, 'gate.json'), '{}'); // e.g. `aqe quality --gate -F json > gate.json`
    const { problems } = await gate(memory, resolveQualityEvidenceCandidate(dir));
    expect(problems[0]).toMatchObject({ code: 'mismatched' });
    expect(problems[0].reason).toContain('uncommitted now: gate.json');
  });

  it('an unreadable file is folded into the fingerprint as a marker, not an unavailable candidate', () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    writeFileSync(join(dir, 'secret.txt'), 'x');
    chmodSync(join(dir, 'secret.txt'), 0o000);
    try {
      const first = resolveQualityEvidenceCandidate(dir);
      expect(first).toMatchObject({ status: 'resolved', dirty: true });
      expect(resolveQualityEvidenceCandidate(dir).id).toBe(first.id);
    } finally {
      chmodSync(join(dir, 'secret.txt'), 0o644);
    }
  });

  it('detects edits to assume-unchanged and skip-worktree files', () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    writeFileSync(join(dir, 'b.js'), 'b\n');
    git(dir, 'add', 'b.js');
    git(dir, '-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 'b');
    git(dir, 'update-index', '--assume-unchanged', 'index.js');
    git(dir, 'update-index', '--skip-worktree', 'b.js');
    const clean = resolveQualityEvidenceCandidate(dir);
    expect(clean).toMatchObject({ dirty: false });
    writeFileSync(join(dir, 'index.js'), 'export const a = 99;\n');
    const hiddenA = resolveQualityEvidenceCandidate(dir);
    expect(hiddenA.id).not.toBe(clean.id);
    writeFileSync(join(dir, 'b.js'), 'changed\n');
    expect(resolveQualityEvidenceCandidate(dir).id).not.toBe(hiddenA.id);
  });

  it('never runs a configured fsmonitor hook', () => {
    const dir = createGitCandidateFixture();
    fixtures.push(dir);
    const marker = join(dir, '..', `fsmonitor-ran-${Date.now()}`);
    writeFileSync(join(dir, 'hook.sh'), `#!/bin/sh\ntouch '${marker}'\n`);
    chmodSync(join(dir, 'hook.sh'), 0o755);
    git(dir, 'config', 'core.fsmonitor', join(dir, 'hook.sh'));
    resolveQualityEvidenceCandidate(dir);
    expect(existsSync(marker)).toBe(false);
  });

  it("an unavailable candidate carries git's own error (e.g. dubious ownership) and the safe.directory hint", () => {
    const dir = mkdtempSync(join(tmpdir(), 'aqe-badgit-'));
    fixtures.push(dir);
    writeFileSync(join(dir, '.git'), 'gitdir: /nonexistent/aqe-1474\n');
    const candidate = resolveQualityEvidenceCandidate(dir);
    expect(candidate.status).toBe('unavailable');
    if (candidate.status !== 'unavailable') return;
    expect(candidate.reason).toMatch(/not a git repository|nonexistent/i);
    expect(candidate.reason).toContain('safe.directory');
  });
});
