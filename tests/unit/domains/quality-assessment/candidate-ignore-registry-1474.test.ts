/**
 * #1474 re-review BLOCK — the candidate-ignore registry must never hide the
 * candidate's real content. In every case below, changed uncommitted content
 * with an unchanged HEAD still makes the evidence insufficient.
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
  ignorePathInCandidate,
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

describe('#1474 candidate-ignore registry cannot hide real changes', () => {
  it('-o src: a tracked source directory is refused, so a bug added to src/add.mjs is still seen', async () => {
    const dir = project();
    expect(ignorePathInCandidate(join(dir, 'src'), 'file', dir)).toBe(false);
    expect(ignorePathInCandidate(join(dir, 'src'), 'dir', dir)).toBe(false);
    expect(existsSync(registry(dir))).toBe(false);
    await expectDirtyChangeIsInsufficient(dir, () =>
      writeFileSync(join(dir, 'src', 'add.mjs'), 'export const add = (a, b) => a - b;\n'));
  });

  it('-o package.json: a tracked file is refused, so a dependency change is still seen', async () => {
    const dir = project();
    expect(ignorePathInCandidate(join(dir, 'package.json'), 'file', dir)).toBe(false);
    await expectDirtyChangeIsInsufficient(dir, () =>
      writeFileSync(join(dir, 'package.json'), '{"name":"fixture","dependencies":{"left-pad":"1.0.0"}}\n'));
  });

  it('a failed write registers nothing (the path does not exist)', async () => {
    const dir = project();
    expect(ignorePathInCandidate(join(dir, 'never-written.json'), 'file', dir)).toBe(false);
    expect(existsSync(registry(dir))).toBe(false);
    await expectDirtyChangeIsInsufficient(dir, () => writeFileSync(join(dir, 'never-written.json'), '{}'));
  });

  it('a stale entry that later matches tracked content is not applied, and is reported', async () => {
    const dir = project();
    writeFileSync(join(dir, 'out.json'), '{}');
    expect(ignorePathInCandidate(join(dir, 'out.json'), 'file', dir)).toBe(true);
    git(dir, 'add', 'out.json');
    git(dir, 'commit', '-qm', 'out.json is now a source');
    const candidate = resolveQualityEvidenceCandidate(dir) as QualityEvidenceCandidate & { status: 'resolved' };
    expect(candidate.ignored).toBeUndefined();
    expect(candidate.rejectedIgnores).toEqual([{ path: 'out.json', reason: 'not applied: it holds tracked content' }]);
    await expectDirtyChangeIsInsufficient(dir, () => writeFileSync(join(dir, 'out.json'), '{"x":1}'));
  });

  it('a registered dir that later gains tracked content is not applied', async () => {
    const dir = project();
    mkdirSync(join(dir, 'reports'));
    writeFileSync(join(dir, 'reports', 'a.json'), '{}');
    expect(ignorePathInCandidate(join(dir, 'reports'), 'dir', dir)).toBe(true);
    git(dir, 'add', 'reports/a.json');
    git(dir, 'commit', '-qm', 'track a report');
    await expectDirtyChangeIsInsufficient(dir, () => writeFileSync(join(dir, 'reports', 'a.json'), '{"y":2}'));
  });

  it('an entry whose path no longer exists is pruned', () => {
    const dir = project();
    writeFileSync(join(dir, 'gate.json'), '{}');
    expect(ignorePathInCandidate(join(dir, 'gate.json'), 'file', dir)).toBe(true);
    unlinkSync(join(dir, 'gate.json'));
    expect(resolveQualityEvidenceCandidate(dir)).not.toHaveProperty('ignored');
    expect(JSON.parse(readFileSync(registry(dir), 'utf-8'))).toEqual({ version: 2, entries: [] });
  });

  it('an unversioned registry from an earlier build registers nothing', async () => {
    const dir = project();
    mkdirSync(join(dir, '.agentic-qe'), { recursive: true });
    writeFileSync(registry(dir), JSON.stringify(['src']));
    await expectDirtyChangeIsInsufficient(dir, () =>
      writeFileSync(join(dir, 'src', 'add.mjs'), 'export const add = () => 0;\n'));
  });

  it('every metric still mismatches after an applied registration and an unrelated dirty change', async () => {
    const dir = project();
    writeFileSync(join(dir, 'gate.json'), '{}');
    ignorePathInCandidate(join(dir, 'gate.json'), 'file', dir);
    const m = memory();
    const measured = resolveQualityEvidenceCandidate(dir);
    await writeQualityEvidence(m as never, { coverage: 90, testsPassing: 100, criticalBugs: 0, codeSmells: 0,
      securityVulnerabilities: 0, technicalDebt: 0, duplications: 0 }, {
      measuredAt: new Date().toISOString(), source: 'fixture', candidate: measured,
    });
    writeFileSync(join(dir, 'src', 'add.mjs'), 'export const add = (a, b) => a * b;\n');
    const { problems } = await inspectQualityEvidence(m as never, { candidate: resolveQualityEvidenceCandidate(dir) });
    expect(problems.map((p) => p.code)).toEqual(QUALITY_METRICS.map(() => 'mismatched'));
    expect(problems[0].reason).toContain('uncommitted since the measurement: src/add.mjs');
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
