import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { collectInventory, renderInventory } = require('../../../scripts/ci-inventory.cjs');

function fixture(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'aqe-ci-inventory-'));
  try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('CI inventory evidence (#690)', () => {
  it('reports actual scoped source counts without treating coverage growth as migration progress', () => fixture(root => {
    mkdirSync(join(root, 'tests', 'nested'), { recursive: true });
    writeFileSync(join(root, 'tests', 'one.test.ts'), "it.skip('one', () => {});\n// it.skip example\n");
    writeFileSync(join(root, 'tests', 'nested', 'two.test.ts'), 'x\n'.repeat(601));
    writeFileSync(join(root, 'tests', 'ignored.spec.ts'), 'ignored\n');
    const report = collectInventory({ root, sourceRevision: 'abc123', observedAt: '2026-09-30T00:00:00Z',
      jobs: { journey: { result: 'failure' }, contract: { result: 'skipped' } } });
    expect(report).toMatchObject({ schemaVersion: 'ci-inventory/v1', sourceRevision: 'abc123', status: 'observed',
      interpretation: 'informational', counts: { testFiles: 2, sourceLines: 603, filesOver600Lines: 1, skipSyntaxLines: 2 } });
    const markdown = renderInventory(report);
    expect(markdown).toContain('abc123');
    expect(markdown).toContain('text heuristic');
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
      testFiles: 0, sourceLines: 0, filesOver600Lines: 0, skipSyntaxLines: 0,
    } });
  }));

  it.each(['success', 'failure', 'cancelled', 'skipped'])('preserves upstream job state %s', result => fixture(root => {
    mkdirSync(join(root, 'tests'));
    expect(renderInventory(collectInventory({ root, jobs: { job: { result } } }))).toContain(`| job | ${result} |`);
  }));

  it('does not turn unavailable or malformed job evidence into success', () => fixture(root => {
    mkdirSync(join(root, 'tests'));
    expect(renderInventory(collectInventory({ root, jobs: { job: { result: 'unknown' } } }))).toContain('| job | unavailable |');
    expect(renderInventory(collectInventory({ root }))).toContain('Upstream outcomes unavailable');
  }));

  it('writes JSON and Markdown from one report and fails malformed input clearly', () => fixture(root => {
    mkdirSync(join(root, 'tests'));
    const script = resolve('scripts/ci-inventory.cjs');
    const ok = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: {
      ...process.env, GITHUB_SHA: 'head-sha', CI_JOB_OUTCOMES: '{"test":{"result":"success"}}',
    } });
    expect(ok.status).toBe(0);
    const json = JSON.parse(require('node:fs').readFileSync(join(root, 'ci-metrics.json'), 'utf8'));
    expect(require('node:fs').readFileSync(join(root, 'ci-metrics.md'), 'utf8')).toBe(renderInventory(json));
    const bad = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: {
      ...process.env, CI_JOB_OUTCOMES: 'not JSON',
    } });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('CI_JOB_OUTCOMES');
  }));
});
