/**
 * #1474 review rounds 2–3 — AQE's recorded outputs must never hide the
 * candidate's real content. An output is left out only while it is untracked
 * and holds exactly what AQE wrote. In every case below, changed uncommitted
 * content with an unchanged HEAD still makes the evidence insufficient.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  QUALITY_METRICS,
  inspectQualityEvidence,
  writeQualityEvidence,
} from '../../../../src/domains/quality-assessment/quality-evidence.js';
import {
  recordOutputInCandidate,
  resolveQualityEvidenceCandidate,
  type QualityEvidenceCandidate,
} from '../../../../src/domains/quality-assessment/evidence-candidate.js';
import { createGitCandidateFixture } from '../../../fixtures/quality-evidence-candidates.js';

const fixtures: string[] = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function memory() {
  const store = new Map<string, unknown>();
  const k = (key: string, o?: { namespace?: string }) => `${o?.namespace ?? ''}::${key}`;
  return {
    get: async (key: string, o?: { namespace?: string }) => store.get(k(key, o)),
    set: async (key: string, v: unknown, o?: { namespace?: string }) => { store.set(k(key, o), v); },
  };
}

/** A project with tracked src/add.mjs and package.json. */
function project(): string {
  const dir = createGitCandidateFixture('aqe-registry-1474-');
  fixtures.push(dir);
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'add.mjs'), 'export const add = (a, b) => a + b;\n');
  writeFileSync(join(dir, 'package.json'), '{"name":"fixture","dependencies":{}}\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'sources');
  return dir;
}

function git(dir: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', ...args], { cwd: dir, stdio: 'ignore' });
}

/** #1474 acceptance: measure, change content without committing, gate → insufficient. */
async function expectDirtyChangeIsInsufficient(dir: string, change: () => void): Promise<void> {
  const m = memory();
  const measured = resolveQualityEvidenceCandidate(dir);
  await writeQualityEvidence(m as never, { coverage: 90, testsPassing: 100 }, {
    measuredAt: new Date().toISOString(), source: 'fixture', candidate: measured,
  });
  change();
  const gated = resolveQualityEvidenceCandidate(dir);
  expect(gated.status === 'resolved' && measured.status === 'resolved' && gated.head === measured.head).toBe(true);
  expect(gated.id).not.toBe(measured.id);
  const { problems } = await inspectQualityEvidence(m as never, { candidate: gated });
  expect(problems.find((p) => p.metric === 'coverage')).toMatchObject({ code: 'mismatched' });
}

const registry = (dir: string) => join(dir, '.agentic-qe', 'candidate-ignore.json');

describe('#1474 recorded AQE outputs cannot hide real changes', () => {
  it('-o src: a directory is never recorded, so a bug added to src/add.mjs is still seen', async () => {
    const dir = project();
    expect(recordOutputInCandidate(join(dir, 'src'), dir)).toBe(false);
    expect(existsSync(registry(dir))).toBe(false);
    await expectDirtyChangeIsInsufficient(dir, () =>
      writeFileSync(join(dir, 'src', 'add.mjs'), 'export const add = (a, b) => a - b;\n'));
  });

  it('-o package.json: a tracked file is refused, so a dependency change is still seen', async () => {
    const dir = project();
    expect(recordOutputInCandidate(join(dir, 'package.json'), dir)).toBe(false);
    await expectDirtyChangeIsInsufficient(dir, () =>
      writeFileSync(join(dir, 'package.json'), '{"name":"fixture","dependencies":{"left-pad":"1.0.0"}}\n'));
  });

  it('a failed write records nothing (the path does not exist)', async () => {
    const dir = project();
    expect(recordOutputInCandidate(join(dir, 'never-written.json'), dir)).toBe(false);
    expect(existsSync(registry(dir))).toBe(false);
    await expectDirtyChangeIsInsufficient(dir, () => writeFileSync(join(dir, 'never-written.json'), '{}'));
  });

  it('SF2: untracked source inside the CI output directory that AQE did not write is fingerprinted', async () => {
    const dir = project();
    mkdirSync(join(dir, 'src', 'feature'));
    writeFileSync(join(dir, 'src', 'feature', 'mul.mjs'), 'export const mul = (a, b) => a * b;\n');
    // AQE writes its artifact into the same directory (output.directory: src/feature).
    writeFileSync(join(dir, 'src', 'feature', 'quality-gate.json'), '{}');
    expect(recordOutputInCandidate(join(dir, 'src', 'feature', 'quality-gate.json'), dir)).toBe(true);
    await expectDirtyChangeIsInsufficient(dir, () =>
      writeFileSync(join(dir, 'src', 'feature', 'mul.mjs'), 'export const mul = (a, b) => a + b;\n'));
  });

  it('an output the user overwrites with other content counts again and is reported', async () => {
    const dir = project();
    writeFileSync(join(dir, 'out.json'), '{}');
    expect(recordOutputInCandidate(join(dir, 'out.json'), dir)).toBe(true);
    await expectDirtyChangeIsInsufficient(dir, () => writeFileSync(join(dir, 'out.json'), 'export const x = 1;\n'));
    const candidate = resolveQualityEvidenceCandidate(dir) as QualityEvidenceCandidate & { status: 'resolved' };
    expect(candidate.rejectedIgnores).toEqual([
      { path: 'out.json', reason: 'not left out: its content changed since AQE wrote it' },
    ]);
  });

  it('a recorded output that later becomes tracked is not left out, and is reported', async () => {
    const dir = project();
    writeFileSync(join(dir, 'out.json'), '{}');
    expect(recordOutputInCandidate(join(dir, 'out.json'), dir)).toBe(true);
    git(dir, 'add', 'out.json');
    git(dir, 'commit', '-qm', 'out.json is now a source');
    const candidate = resolveQualityEvidenceCandidate(dir) as QualityEvidenceCandidate & { status: 'resolved' };
    expect(candidate.ignored).toBeUndefined();
    expect(candidate.rejectedIgnores).toEqual([{ path: 'out.json', reason: 'not left out: it is tracked' }]);
    await expectDirtyChangeIsInsufficient(dir, () => writeFileSync(join(dir, 'out.json'), '{"x":1}'));
  });

  it('a recorded output that no longer exists is pruned', () => {
    const dir = project();
    writeFileSync(join(dir, 'gate.json'), '{}');
    expect(recordOutputInCandidate(join(dir, 'gate.json'), dir)).toBe(true);
    unlinkSync(join(dir, 'gate.json'));
    expect(resolveQualityEvidenceCandidate(dir)).not.toHaveProperty('ignored');
    expect(JSON.parse(readFileSync(registry(dir), 'utf-8'))).toEqual({ version: 3, entries: [] });
  });

  it('registries of earlier formats record nothing', async () => {
    const dir = project();
    mkdirSync(join(dir, '.agentic-qe'), { recursive: true });
    writeFileSync(registry(dir), JSON.stringify({ version: 2, entries: [{ path: 'src', kind: 'dir' }] }));
    await expectDirtyChangeIsInsufficient(dir, () =>
      writeFileSync(join(dir, 'src', 'add.mjs'), 'export const add = () => 0;\n'));
    writeFileSync(registry(dir), JSON.stringify(['src']));
    await expectDirtyChangeIsInsufficient(dir, () =>
      writeFileSync(join(dir, 'src', 'add.mjs'), 'export const add = () => 1;\n'));
  });

  it('SF1: a measurement taken before AQE wrote its outputs matches the gate after it', async () => {
    const dir = project();
    const m = memory();
    const measured = resolveQualityEvidenceCandidate(dir);
    await writeQualityEvidence(m as never, { coverage: 90, testsPassing: 100, criticalBugs: 0, codeSmells: 0,
      securityVulnerabilities: 0, technicalDebt: 0, duplications: 0 }, {
      measuredAt: new Date().toISOString(), source: 'fixture', candidate: measured,
    });
    mkdirSync(join(dir, 'reports'));
    for (const name of ['quality-gate.json', 'coverage.json', 'ci-report.md']) {
      writeFileSync(join(dir, 'reports', name), `${name}\n`);
      recordOutputInCandidate(join(dir, 'reports', name), dir);
    }
    const { problems } = await inspectQualityEvidence(m as never, { candidate: resolveQualityEvidenceCandidate(dir) });
    expect(problems).toEqual([]);
    // ...and a real edit afterwards is still seen.
    writeFileSync(join(dir, 'src', 'add.mjs'), 'export const add = (a, b) => a * b;\n');
    const after = await inspectQualityEvidence(m as never, { candidate: resolveQualityEvidenceCandidate(dir) });
    expect(after.problems.map((p) => p.code)).toEqual(QUALITY_METRICS.map(() => 'mismatched'));
    expect(after.problems[0].reason).toContain('uncommitted since the measurement: src/add.mjs');
  });
});

describe('#1474 mismatch message shows the difference, not the first paths', () => {
  it('names the culprit even when many other uncommitted paths are listed first', async () => {
    const dir = project();
    mkdirSync(join(dir, 'coverage'));
    for (let i = 0; i < 150; i += 1) writeFileSync(join(dir, 'coverage', `f${String(i).padStart(3, '0')}.json`), '{}');
    const m = memory();
    const measured = resolveQualityEvidenceCandidate(dir);
    await writeQualityEvidence(m as never, { coverage: 90 }, {
      measuredAt: new Date().toISOString(), source: 'fixture', candidate: measured,
    });
    writeFileSync(join(dir, 'gate.json'), '{}'); // sorts after "coverage/…"
    const { problems } = await inspectQualityEvidence(m as never, { candidate: resolveQualityEvidenceCandidate(dir) });
    const reason = problems.find((p) => p.metric === 'coverage')!.reason;
    expect(reason).toContain('uncommitted since the measurement: gate.json');
    expect(reason).not.toContain('coverage/f000.json');
  });
});
