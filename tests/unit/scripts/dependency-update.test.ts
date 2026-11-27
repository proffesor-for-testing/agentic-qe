// Issue #1403: the scheduled dependency updater must fail closed and classify
// every lockfile transition. Pure helpers are tested directly; `main()` is run
// as a subprocess against a temp repo with a stub `npm` on PATH, so nothing
// touches the registry or this repo's lockfile.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-expect-error — .mjs sibling script, no type decls
import { classifyTransitions, decideDisposition, renderMarkdown, auditUsable, cell } from '../../../scripts/dependency-update.mjs';

type Pkgs = Record<string, Record<string, unknown>>;
const lock = (packages: Pkgs) =>
  JSON.stringify({ name: 'fx', version: '1.0.0', lockfileVersion: 3, requires: true, packages }, null, 2);
const reg = (name: string, version: string, extra: Record<string, unknown> = {}) => ({
  version,
  resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`,
  integrity: `sha512-${name}-${version}`,
  ...extra,
});
const ROOT_ENTRY = {
  name: 'fx',
  version: '1.0.0',
  dependencies: { '@claude-flow/security': '^3.0.0' },
  optionalDependencies: { 'opt-native': '^1.0.0' },
};

// The #1399 shape: one security upgrade, one downgrade, one removal, one nested addition.
const BEFORE_1399 = lock({
  '': ROOT_ENTRY,
  'node_modules/@claude-flow/security': reg('@claude-flow/security', '3.0.6', { dev: true }),
  'node_modules/@claude-flow/shared': reg('@claude-flow/shared', '3.0.6', { dev: true }),
  'node_modules/helmet': reg('helmet', '7.2.0', { dev: true }),
  'node_modules/opt-native': reg('opt-native', '1.0.0', { optional: true }),
});
const AFTER_1399 = lock({
  '': ROOT_ENTRY,
  'node_modules/@claude-flow/security': reg('@claude-flow/security', '3.0.7', { dev: true }),
  'node_modules/@claude-flow/security/node_modules/zod': reg('zod', '4.6.7', { dev: true }),
  'node_modules/@claude-flow/shared': reg('@claude-flow/shared', '3.0.3', { dev: true }),
  'node_modules/opt-native': reg('opt-native', '1.0.0', { optional: true }),
});

const okAudit = { ok: true, findings: [], totals: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } };
const kinds = (ts: Array<{ kind: string; path: string }>) => Object.fromEntries(ts.map((t) => [t.path, t.kind]));

describe('classifyTransitions', () => {
  it('should_classifyUpgradeDowngradeAddedRemoved_when_given1399ShapedLocks', () => {
    const ts = classifyTransitions(BEFORE_1399, AFTER_1399);
    expect(kinds(ts)).toEqual({
      'node_modules/@claude-flow/security': 'UPGRADE',
      'node_modules/@claude-flow/security/node_modules/zod': 'ADDED',
      'node_modules/@claude-flow/shared': 'DOWNGRADE',
      'node_modules/helmet': 'REMOVED',
    });
    const shared = ts.find((t: any) => t.name === '@claude-flow/shared');
    expect(shared).toMatchObject({ from: '3.0.6', to: '3.0.3', direct: false, scope: 'dev' });
    expect(ts.find((t: any) => t.name === '@claude-flow/security')).toMatchObject({ direct: true });
  });

  it('should_keepAddedAndRemoved_when_packageCountIsUnchanged', () => {
    const before = lock({ '': ROOT_ENTRY, 'node_modules/a': reg('a', '1.0.0') });
    const after = lock({ '': ROOT_ENTRY, 'node_modules/b': reg('b', '1.0.0') });
    expect(kinds(classifyTransitions(before, after))).toEqual({ 'node_modules/a': 'REMOVED', 'node_modules/b': 'ADDED' });
  });

  it('should_reportReplaced_when_aliasTargetSourceOrIntegrityChanges', () => {
    const before = lock({
      '': ROOT_ENTRY,
      'node_modules/alias': { ...reg('real-a', '1.0.0'), name: 'real-a' },
      'node_modules/gitdep': reg('gitdep', '1.0.0'),
      'node_modules/same': reg('same', '2.0.0'),
      'node_modules/weird': { version: 'not-semver', resolved: 'file:../weird' },
    });
    const after = lock({
      '': ROOT_ENTRY,
      'node_modules/alias': { ...reg('real-b', '1.0.1'), name: 'real-b' },
      'node_modules/gitdep': { version: '1.0.0', resolved: 'git+ssh://git@github.com/x/gitdep.git#abc' },
      'node_modules/same': { ...reg('same', '2.0.0'), integrity: 'sha512-other' },
      'node_modules/weird': { version: 'also-not-semver', resolved: 'file:../weird' },
    });
    expect(kinds(classifyTransitions(before, after))).toEqual({
      'node_modules/alias': 'REPLACED',
      'node_modules/gitdep': 'REPLACED',
      'node_modules/same': 'REPLACED',
      'node_modules/weird': 'REPLACED',
    });
  });

  it('should_returnNothing_when_locksAreIdentical', () => {
    expect(classifyTransitions(BEFORE_1399, BEFORE_1399)).toEqual([]);
  });

  it('should_throw_when_lockfileIsUnparseable', () => {
    expect(() => classifyTransitions('{not json', AFTER_1399)).toThrow(/lockfile/i);
    expect(() => classifyTransitions(BEFORE_1399, JSON.stringify({ lockfileVersion: 3 }))).toThrow(/packages/);
  });
});

describe('auditUsable', () => {
  it('should_rejectUnparsedOrTotalsFreeAudits_when_npmFailed', () => {
    expect(auditUsable(okAudit)).toBe(true);
    expect(auditUsable({ ok: false, findings: [], totals: {} })).toBe(false);
    expect(auditUsable({ ok: true, findings: [], totals: {} })).toBe(false);
  });
});

describe('decideDisposition', () => {
  const base = {
    command: { status: 0, signal: null },
    lockChanged: true,
    transitions: [{ kind: 'UPGRADE' }, { kind: 'ADDED' }],
    auditBefore: okAudit,
    auditAfter: okAudit,
    droppedOptionals: [],
  };

  it('should_admit_when_onlyUpgradesAndAdditions', () => {
    expect(decideDisposition(base).disposition).toBe('ADMITTED');
  });

  it('should_requireReview_when_anyDowngradeRemovalOrReplacement', () => {
    for (const kind of ['DOWNGRADE', 'REMOVED', 'REPLACED']) {
      const d = decideDisposition({ ...base, transitions: [{ kind: 'UPGRADE' }, { kind }] });
      expect(d.disposition).toBe('REVIEW_REQUIRED');
      expect(d.reasons.join(' ')).toContain(kind);
    }
  });

  it('should_requireReview_when_lockChangedWithoutVersionTransitions', () => {
    expect(decideDisposition({ ...base, transitions: [] }).disposition).toBe('REVIEW_REQUIRED');
  });

  it('should_reportNoChange_when_lockUnchangedAndCommandSucceeded', () => {
    expect(decideDisposition({ ...base, lockChanged: false, transitions: [] }).disposition).toBe('NO_CHANGE');
  });

  it('should_reject_when_commandFailsSignalsAuditBreaksOrOptionalDropped', () => {
    const cases = [
      { command: { status: 1, signal: null } },
      { command: { status: null, signal: 'SIGTERM' } },
      { auditBefore: { ok: false, findings: [], totals: {} } },
      { auditAfter: { ok: true, findings: [], totals: {} } },
      { droppedOptionals: ['opt-native'] },
    ];
    for (const c of cases) {
      const d = decideDisposition({ ...base, ...c });
      expect(d.disposition, JSON.stringify(c)).toBe('REJECTED');
      expect(d.reasons.length).toBeGreaterThan(0);
    }
  });

  it('should_reject_when_commandFailsEvenIfLockIsUnchanged', () => {
    expect(decideDisposition({ ...base, command: { status: 1, signal: null }, lockChanged: false, transitions: [] }).disposition).toBe('REJECTED');
  });
});

describe('renderMarkdown', () => {
  it('should_listDowngradesAndRemovalsUpFront_when_reviewRequired', () => {
    const transitions = classifyTransitions(BEFORE_1399, AFTER_1399);
    const report = {
      mode: 'security',
      disposition: 'REVIEW_REQUIRED',
      reasons: ['1 DOWNGRADE, 1 REMOVED'],
      command: { argv: ['npm', 'audit', 'fix', '--package-lock-only'], status: 0, signal: null },
      transitions,
      counts: { UPGRADE: 1, DOWNGRADE: 1, ADDED: 1, REMOVED: 1, REPLACED: 0 },
      audit: { before: { usable: true, critical: 0, high: 0, moderate: 0, low: 0 }, after: { usable: true, critical: 0, high: 0, moderate: 0, low: 0 } },
      optionalDeps: { tracked: 1, dropped: [] },
    };
    const md = renderMarkdown(report);
    expect(md).toMatch(/REVIEW REQUIRED/);
    const review = md.slice(md.indexOf('## Review required'), md.indexOf('## All transitions'));
    expect(review).toContain('`@claude-flow/shared`');
    expect(review).toContain('DOWNGRADE');
    expect(review).toContain('`helmet`');
    expect(review).not.toContain('`@claude-flow/security`');
    // Every transition appears exactly once in the full table.
    const rows = md.slice(md.indexOf('## All transitions')).split('\n').filter((l: string) => /^\| (UPGRADE|DOWNGRADE|ADDED|REMOVED|REPLACED) /.test(l));
    expect(rows).toHaveLength(transitions.length);
    expect(md).toContain('### Required check (issue #401)');
  });
});

/** Split a Markdown table row on pipes that are not escaped (preceded by an even number of backslashes). */
function splitRow(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let backslashes = 0;
  for (const ch of row) {
    if (ch === '|' && backslashes % 2 === 0) { cells.push(current); current = ''; }
    else current += ch;
    backslashes = ch === '\\' ? backslashes + 1 : 0;
  }
  cells.push(current);
  return cells.slice(1, -1); // drop the empty edges outside the leading and trailing pipe
}

describe('cell (CodeQL js/incomplete-sanitization)', () => {
  const nasty = 'npm ERR! a\\|b\nnext line\r\nends with \\';

  it('should_escapeBackslashesBeforePipesAndFlattenNewlines_when_valueIsHostile', () => {
    expect(cell(nasty)).toBe('npm ERR! a\\\\\\|b next line ends with \\\\');
    expect(cell('')).toBe('—');
    expect(cell(null)).toBe('—');
  });

  it('should_renderOneIntactCell_when_tableValueHasEscapedPipeTrailingBackslashAndNewline', () => {
    const transitions = [{
      path: 'node_modules/x\\|y', name: 'x\\|y\\', kind: 'REPLACED', from: '1.0.0', to: 'a\\|b\n', fromSource: 'registry',
      toSource: 'file', detail: nasty, scope: 'prod', direct: false, requiredBy: ['p\\', 'q|r'],
    }];
    const md = renderMarkdown({
      mode: 'security', disposition: 'REVIEW_REQUIRED', reasons: ['1 REPLACED'],
      command: { argv: ['npm', 'audit', 'fix', '--package-lock-only'], status: 0, signal: null },
      transitions, counts: { UPGRADE: 0, DOWNGRADE: 0, ADDED: 0, REMOVED: 0, REPLACED: 1 },
      audit: { before: { usable: true, critical: 0, high: 0, moderate: 0, low: 0 }, after: { usable: true, critical: 0, high: 0, moderate: 0, low: 0 } },
      optionalDeps: { tracked: 0, dropped: [] },
    });
    const rows = md.split('\n').filter((l: string) => l.startsWith('| REPLACED '));
    expect(rows).toHaveLength(2); // one in "Review required", one in "All transitions"; no row was split by a newline
    expect(splitRow(rows[0])).toHaveLength(7);
    expect(splitRow(rows[1])).toHaveLength(7);
    expect(splitRow(rows[0])[6].trim()).toBe(cell(nasty));
  });
});

// ---------------------------------------------------------------------------
// main(): subprocess with a stub npm (POSIX only; the workflow runs on ubuntu)
// ---------------------------------------------------------------------------
const SCRIPT_DIR = resolve(process.cwd(), 'scripts');

describe.skipIf(process.platform === 'win32')('dependency-update main (stub npm)', () => {
  let dir: string;
  let bin: string;

  function setup(opts: { fixStatus?: number; fixWrites?: string | null; auditOut?: string; initialLock?: string }) {
    writeFileSync(join(dir, 'package-lock.json'), opts.initialLock ?? BEFORE_1399);
    writeFileSync(join(dir, 'after.json'), opts.fixWrites ?? '');
    writeFileSync(join(dir, 'audit.json'), opts.auditOut ?? JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: okAudit.totals } }));
    writeFileSync(
      join(bin, 'npm'),
      [
        '#!/usr/bin/env bash',
        'case "$*" in',
        `  "audit fix --package-lock-only"|"update --package-lock-only") ${opts.fixWrites ? 'cp after.json package-lock.json;' : ''} echo "stub: fix" >&2; exit ${opts.fixStatus ?? 0};;`,
        '  "audit --json") cat audit.json; exit 0;;',
        '  *) echo "stub npm: unexpected $*" >&2; exit 2;;',
        'esac',
      ].join('\n'),
    );
    chmodSync(join(bin, 'npm'), 0o755);
  }

  function runMain() {
    const r = spawnSync(process.execPath, [join(dir, 'scripts', 'dependency-update.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: join(dir, 'gh-output') },
    });
    const reportPath = join(dir, 'reports', 'dependency-update.json');
    const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
    const ghOutput = existsSync(join(dir, 'gh-output')) ? readFileSync(join(dir, 'gh-output'), 'utf8') : '';
    return { status: r.status, stderr: r.stderr, report, ghOutput };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1403-'));
    bin = join(dir, 'bin');
    mkdirSync(bin);
    mkdirSync(join(dir, 'scripts'));
    cpSync(join(SCRIPT_DIR, 'dependency-update.mjs'), join(dir, 'scripts', 'dependency-update.mjs'));
    cpSync(join(SCRIPT_DIR, 'dependency-audit.mjs'), join(dir, 'scripts', 'dependency-audit.mjs'));
    // The script imports `semver`; resolve it from this repo's install.
    symlinkSync(resolve(process.cwd(), 'node_modules'), join(dir, 'node_modules'), 'dir');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fx', version: '1.0.0', optionalDependencies: { 'opt-native': '^1.0.0' } }));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('should_rejectAndRestoreExactBytes_when_auditFixExitsNonzeroAfterWritingLock', () => {
    setup({ fixStatus: 1, fixWrites: AFTER_1399 });
    const { status, report, ghOutput } = runMain();
    expect(status).toBe(1);
    expect(report.disposition).toBe('REJECTED');
    expect(report.command).toMatchObject({ status: 1 });
    expect(report.reasons.join(' ')).toMatch(/exited with status 1/);
    expect(readFileSync(join(dir, 'package-lock.json'), 'utf8')).toBe(BEFORE_1399);
    expect(ghOutput).toContain('disposition=REJECTED');
  });

  it('should_reject_when_auditOutputIsUnparseable', () => {
    setup({ fixWrites: AFTER_1399, auditOut: 'npm ERR! network' });
    const { status, report } = runMain();
    expect(status).toBe(1);
    expect(report.disposition).toBe('REJECTED');
    expect(report.reasons.join(' ')).toMatch(/audit/i);
    expect(readFileSync(join(dir, 'package-lock.json'), 'utf8')).toBe(BEFORE_1399);
  });

  it('should_reject_when_updatedLockfileIsUnparseable', () => {
    setup({ fixWrites: '{"truncated": ' });
    const { status, report } = runMain();
    expect(status).toBe(1);
    expect(report.disposition).toBe('REJECTED');
    expect(report.reasons.join(' ')).toMatch(/lockfile/i);
    expect(readFileSync(join(dir, 'package-lock.json'), 'utf8')).toBe(BEFORE_1399);
  });

  it('should_rejectAndRestore_when_optionalPlatformDepIsPruned', () => {
    const pruned = lock({ '': ROOT_ENTRY, 'node_modules/@claude-flow/security': reg('@claude-flow/security', '3.0.7') });
    setup({ fixWrites: pruned });
    const { status, report } = runMain();
    expect(status).toBe(1);
    expect(report.disposition).toBe('REJECTED');
    expect(report.reasons.join(' ')).toContain('opt-native');
    expect(readFileSync(join(dir, 'package-lock.json'), 'utf8')).toBe(BEFORE_1399);
  });

  it('should_requireReviewAndKeepLock_when_1399ShapedUpdateSucceeds', () => {
    setup({ fixWrites: AFTER_1399 });
    const { status, report, ghOutput } = runMain();
    expect(status).toBe(0);
    expect(report.disposition).toBe('REVIEW_REQUIRED');
    expect(report.counts).toMatchObject({ UPGRADE: 1, DOWNGRADE: 1, ADDED: 1, REMOVED: 1, REPLACED: 0 });
    expect(readFileSync(join(dir, 'package-lock.json'), 'utf8')).toBe(AFTER_1399);
    expect(ghOutput).toContain('disposition=REVIEW_REQUIRED');
    expect(readFileSync(join(dir, 'reports', 'dependency-update.md'), 'utf8')).toMatch(/DOWNGRADE/);
  });

  it('should_reportNoChange_when_nothingMoves', () => {
    setup({});
    const { status, report } = runMain();
    expect(status).toBe(0);
    expect(report.disposition).toBe('NO_CHANGE');
    expect(report.transitions).toEqual([]);
  });
});
