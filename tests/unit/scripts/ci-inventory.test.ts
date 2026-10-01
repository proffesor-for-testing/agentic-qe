import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const require = createRequire(import.meta.url);
const repoRoot = resolve(import.meta.dirname, '../../..');
const script = resolve(repoRoot, 'scripts/ci-inventory.cjs');
const { collectInventory, renderInventory, resolveSourceRevision } = require(script);
const HEAD = '0123456789abcdef0123456789abcdef01234567';
const MERGE = 'fedcba9876543210fedcba9876543210fedcba98';

function fixture(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'aqe-ci-inventory-'));
  try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('CI inventory evidence (#690)', () => {
  it('reports actual scoped source counts without treating coverage growth as migration progress', () => fixture(root => {
    mkdirSync(join(root, 'tests', 'nested'), { recursive: true });
    writeFileSync(join(root, 'tests', 'one.test.ts'),
      "it.skip('one', () => {});\n// it.skip example\nit.skipIf(ci)('two', () => {});\ndescribe.runIf(linux)('three', () => {});\n");
    writeFileSync(join(root, 'tests', 'nested', 'two.test.ts'), 'x\n'.repeat(601));
    writeFileSync(join(root, 'tests', 'ignored.spec.ts'), 'ignored\n');
    const report = collectInventory({ root, sourceRevision: 'abc123', observedAt: '2026-09-30T00:00:00Z',
      jobs: { journey: { result: 'failure' }, contract: { result: 'skipped' } } });
    expect(report).toMatchObject({ schemaVersion: 'ci-inventory/v1', sourceRevision: 'abc123', status: 'observed',
      interpretation: 'informational', counts: {
        testFiles: 2, sourceLines: 605, filesOver600Lines: 1, skipSyntaxLines: 2, conditionalSkipSyntaxLines: 2,
      } });
    const markdown = renderInventory(report);
    expect(markdown).toContain('abc123');
    expect(markdown).toContain('text heuristic');
    expect(markdown).toContain('excludes conditional `skipIf`/`runIf`) | 2 |');
    expect(markdown).toContain('conditional `skipIf`/`runIf` syntax (text heuristic; counted separately) | 2 |');
    expect(markdown).toContain('## Dashboard prerequisite outcomes');
    expect(markdown).toContain('not every Optimized CI job');
    expect(markdown).not.toContain('Upstream checks');
    expect(markdown).toContain('| journey | failure |');
    expect(markdown).toContain('| contract | skipped |');
    expect(markdown).not.toMatch(/reduced|Progress|target:|Migration|--\d/);
  }));

  it('reports missing or partially unreadable discovery as unavailable, with null counts', () => fixture(root => {
    const missing = collectInventory({ root });
    expect(missing).toMatchObject({ status: 'unavailable', counts: null });
    expect(renderInventory(missing)).toContain('unavailable');
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'tests', 'one.test.ts'), 'line\n');
    const failRead = { readdirSync: require('node:fs').readdirSync, readFileSync: () => { throw new Error('unreadable'); } };
    expect(collectInventory({ root }, failRead)).toMatchObject({ status: 'unavailable', counts: null });
  }));

  it('distinguishes an observed empty inventory from missing data', () => fixture(root => {
    mkdirSync(join(root, 'tests'));
    expect(collectInventory({ root })).toMatchObject({ status: 'observed', counts: {
      testFiles: 0, sourceLines: 0, filesOver600Lines: 0, skipSyntaxLines: 0, conditionalSkipSyntaxLines: 0,
    } });
  }));

  it.each(['success', 'failure', 'cancelled', 'skipped'])('preserves upstream job state %s', result => fixture(root => {
    mkdirSync(join(root, 'tests'));
    expect(renderInventory(collectInventory({ root, jobs: { job: { result } } }))).toContain(`| job | ${result} |`);
  }));

  it('does not turn unavailable or malformed job evidence into success', () => fixture(root => {
    mkdirSync(join(root, 'tests'));
    expect(renderInventory(collectInventory({ root, jobs: { job: { result: 'unknown' } } }))).toContain('| job | unavailable |');
    expect(renderInventory(collectInventory({ root }))).toContain('Prerequisite outcomes unavailable');
  }));

  it.each([
    [{ GITHUB_EVENT_NAME: 'pull_request', CI_SOURCE_SHA: HEAD, GITHUB_SHA: MERGE }, HEAD, 'pr-head', 'PR head commit'],
    [{ GITHUB_EVENT_NAME: 'pull_request', GITHUB_SHA: MERGE }, MERGE, 'pr-merge', 'PR merge commit'],
    [{ GITHUB_EVENT_NAME: 'push', CI_SOURCE_SHA: HEAD }, HEAD, 'commit', 'Commit'],
    [{ GITHUB_EVENT_NAME: 'push', GITHUB_SHA: MERGE }, MERGE, 'commit', 'Commit'],
  ])('labels the reported revision by provenance (%o)', (env, sha, kind, label) => fixture(root => {
    mkdirSync(join(root, 'tests'));
    const revision = resolveSourceRevision(env);
    expect(revision).toEqual({ sourceRevision: sha, sourceRevisionKind: kind });
    expect(renderInventory(collectInventory({ root, ...revision }))).toContain(`**${label}`);
    expect(renderInventory(collectInventory({ root, ...revision }))).toContain(`: ${sha}`);
  }));

  it.each([{}, { CI_SOURCE_SHA: 'head-sha' }, { GITHUB_SHA: '<img src=x>' }])(
    'reports a missing or non-hex revision as unavailable (%o)', env => fixture(root => {
      mkdirSync(join(root, 'tests'));
      expect(resolveSourceRevision(env)).toEqual({ sourceRevision: null, sourceRevisionKind: null });
      expect(renderInventory(collectInventory({ root, ...resolveSourceRevision(env) })))
        .toContain('**Source commit**: unavailable');
    }));

  it('writes JSON and Markdown from one report and fails malformed input clearly', () => fixture(root => {
    mkdirSync(join(root, 'tests'));
    const ok = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: {
      ...process.env, GITHUB_EVENT_NAME: 'pull_request', CI_SOURCE_SHA: HEAD, GITHUB_SHA: MERGE,
      CI_JOB_OUTCOMES: '{"test":{"result":"success"}}',
    } });
    expect(ok.status).toBe(0);
    const json = JSON.parse(readFileSync(join(root, 'ci-metrics.json'), 'utf8'));
    expect(json).toMatchObject({ sourceRevision: HEAD, sourceRevisionKind: 'pr-head' });
    expect(readFileSync(join(root, 'ci-metrics.md'), 'utf8')).toBe(renderInventory(json));
    expect(ok.stdout).toContain(`**PR head commit**: ${HEAD}`);
    const bad = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: {
      ...process.env, CI_JOB_OUTCOMES: 'not JSON',
    } });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('CI_JOB_OUTCOMES');
  }));

  it('wires the PR head revision through env and nests the comment headings', () => {
    const workflow = parse(readFileSync(resolve(repoRoot, '.github/workflows/optimized-ci.yml'), 'utf8'));
    const steps: Array<{ name?: string; run?: string; env?: Record<string, string>; with?: { script?: string } }> =
      workflow.jobs.dashboard.steps;
    const inventory = steps.find(step => step.name === 'Generate Test Inventory')!;
    expect(inventory.run).toBe('node scripts/ci-inventory.cjs');
    expect(inventory.env).toMatchObject({
      CI_SOURCE_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
    });
    expect(inventory.env).not.toHaveProperty('GITHUB_SHA');
    const comment = steps.find(step => step.name === 'Comment on PR')!.with!.script!;
    // The report owns the top-level heading; the comment must not add another above it.
    expect(comment).not.toMatch(/^#{1,6} /m);
    fixture(root => {
      mkdirSync(join(root, 'tests'));
      expect(renderInventory(collectInventory({ root })).startsWith('# CI Test Inventory\n')).toBe(true);
    });
  });
});
