/**
 * #1426: a curation marker made test generation apply a pattern without a
 * measured success, permanently: measured failures did not revoke it and no
 * command removed it.
 *   - `aqe learning unmark` removes the marker (dry run unless --apply, with a
 *     backup), keeping the rest of the context;
 *   - once a pattern's measured failed runs outnumber its measured successful
 *     runs, test generation stops applying it and export stops marking it;
 *   - `aqe learning stats` shows curated patterns by origin, and revoked ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

const state = vi.hoisted(() => ({ dbPath: '', json: [] as unknown[] }));
vi.mock('../../../../src/cli/commands/learning-helpers.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/cli/commands/learning-helpers.js')>(),
  getDbPath: () => state.dbPath,
  printJson: (value: unknown) => { state.json.push(value); },
}));

import {
  applyUnmark, curationCountsAt, formatCurationCounts, registerUnmarkCommand, selectUnmark,
} from '../../../../src/cli/commands/learning-curation';
import { queryApplicablePatterns } from '../../../../src/domains/test-generation/services/applicable-patterns';
import { exportContext, selectMeasuredSuccessIds, selectRevokedIds } from '../../../../src/learning/curated-patterns';

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aqe-1426-'));
  mkdirSync(join(dir, '.agentic-qe'));
  state.dbPath = join(dir, '.agentic-qe', 'memory.db');
  state.json = [];
  db = new Database(state.dbPath);
  db.exec(`
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL, domain TEXT NOT NULL,
      name TEXT NOT NULL, description TEXT, usage_count INTEGER DEFAULT 0, quality_score REAL DEFAULT 0,
      context_json TEXT, updated_at TEXT
    );
    CREATE TABLE qe_pattern_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, success INTEGER NOT NULL,
      metrics_json TEXT, feedback TEXT
    );
  `);
});
afterEach(() => {
  if (db.open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

function addPattern(id: string, name: string, context: unknown, domain = 'test-generation'): void {
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, context_json) VALUES (?, 'test-template', ?, ?, ?, ?)`)
    .run(id, domain, domain, name, JSON.stringify(context));
}
let runCounter = 0;
/** One measured test run of `patternId`, written as `rows` usage rows sharing a runId. */
function measuredRun(patternId: string, success: boolean, rows = 1): void {
  const runId = `run-${++runCounter}`;
  for (let i = 0; i < rows; i++) {
    db.prepare('INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, ?, ?)')
      .run(patternId, success ? 1 : 0, JSON.stringify({ outcome: 'measured', outcomeBasis: 'test-results', runId }));
  }
}
function unmeasuredFailure(patternId: string): void {
  db.prepare('INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, 0, ?)')
    .run(patternId, JSON.stringify({ outcome: 'unmeasured', outcomeBasis: 'task-completed' }));
}
const applied = (ref: string) => queryApplicablePatterns(db, 'src/x.ts', [ref]).map((p) => p.id);
const contextOf = (id: string) => JSON.parse((db.prepare('SELECT context_json FROM qe_patterns WHERE id = ?').get(id) as { context_json: string }).context_json);

describe('#1426 measured failures revoke curation (read time, nothing written)', () => {
  it('a curated pattern is not applied once failed runs outnumber successful runs', () => {
    addPattern('c', 'curated', { curation: 'user-store' });
    expect(applied('c')).toEqual(['c']);
    measuredRun('c', false);
    expect(applied('c')).toEqual([]);
    measuredRun('c', true);
    expect(applied('c')).toEqual(['c']); // 1 failed, 1 passed: not outweighed
    measuredRun('c', false);
    expect(applied('c')).toEqual([]);
    expect(contextOf('c')).toEqual({ curation: 'user-store' });
  });

  it('counts runs, not rows: one failed run of many rows does not outweigh two passing runs', () => {
    addPattern('c', 'curated', { curation: 'user-import' });
    measuredRun('c', false, 5);
    measuredRun('c', true);
    measuredRun('c', true);
    expect(applied('c')).toEqual(['c']);
    expect(selectRevokedIds(db).has('c')).toBe(false);
  });

  it('a run with any failed row is a failed run', () => {
    addPattern('c', 'curated', { curation: 'user-import' });
    db.prepare('INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, ?, ?)')
      .run('c', 1, JSON.stringify({ outcome: 'measured', runId: 'mixed' }));
    db.prepare('INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, ?, ?)')
      .run('c', 0, JSON.stringify({ outcome: 'measured', runId: 'mixed' }));
    expect(applied('c')).toEqual([]);
  });

  it('unmeasured failures revoke nothing', () => {
    addPattern('c', 'curated', { curation: 'user-store' });
    for (let i = 0; i < 5; i++) unmeasuredFailure('c');
    expect(applied('c')).toEqual(['c']);
  });

  it('an earlier measured success no longer applies a pattern that mostly fails', () => {
    addPattern('m', 'learned', {});
    measuredRun('m', true);
    expect(applied('m')).toEqual(['m']);
    measuredRun('m', false);
    measuredRun('m', false);
    expect(applied('m')).toEqual([]);
  });

  it('a built-in seed whose tests mostly fail is not applied either', () => {
    addPattern('s', 'unit-test-generation', {});
    expect(applied('s')).toEqual(['s']);
    measuredRun('s', false);
    expect(applied('s')).toEqual([]);
  });

  it('applies to the file-extension lookup too', () => {
    addPattern('k', 'kotlin-curated', { curation: 'user-import', language: 'kotlin' });
    expect(queryApplicablePatterns(db, 'src/Calc.kt', []).map((p) => p.id)).toEqual(['k']);
    measuredRun('k', false);
    expect(queryApplicablePatterns(db, 'src/Calc.kt', []).map((p) => p.id)).toEqual([]);
  });

  it('export writes no marker for a revoked pattern', () => {
    addPattern('c', 'curated', { curation: 'user-store', tags: ['t'] });
    measuredRun('c', false);
    const pattern = { id: 'c', name: 'curated', context: { curation: 'user-store', tags: ['t'] } };
    expect(exportContext(pattern, selectMeasuredSuccessIds(db), selectRevokedIds(db))).toEqual({ tags: ['t'] });
    expect(exportContext(pattern, selectMeasuredSuccessIds(db))).toEqual({ curation: 'user-store', tags: ['t'] });
  });
});

describe('#1426 selectUnmark and applyUnmark', () => {
  beforeEach(() => {
    addPattern('a', 'alpha', { curation: 'user-import', tags: ['x'], language: 'kotlin' });
    addPattern('b', 'beta', { curation: 'user-store' }, 'security-compliance');
    addPattern('b2', 'beta', { curation: 'user-store' });
    addPattern('p', 'plain', { tags: ['y'] });
    addPattern('f', 'fake', { curation: 'automatic' });
  });

  it('selects by id or name, reports names that are not curated or not stored', () => {
    const selection = selectUnmark(db, ['a', 'beta', 'plain', 'fake', 'missing'], {});
    expect(selection.curated.map((c) => c.id).sort()).toEqual(['a', 'b', 'b2']);
    expect(selection.notCurated).toEqual(['plain', 'fake']);
    expect(selection.notFound).toEqual(['missing']);
  });

  it('narrows to one domain', () => {
    const selection = selectUnmark(db, ['beta', 'alpha'], { domain: 'security-compliance' });
    expect(selection.curated.map((c) => c.id)).toEqual(['b']);
    expect(selection.notFound).toEqual(['alpha']);
  });

  it('--all selects every validly curated pattern, in a domain if given', () => {
    expect(selectUnmark(db, [], { all: true }).curated.map((c) => c.id).sort()).toEqual(['a', 'b', 'b2']);
    expect(selectUnmark(db, [], { all: true, domain: 'test-generation' }).curated.map((c) => c.id).sort()).toEqual(['a', 'b2']);
  });

  it('removes only the curation field and records the update', () => {
    const changed = applyUnmark(db, selectUnmark(db, ['a'], {}).curated);
    expect(changed).toEqual(['a']);
    expect(contextOf('a')).toEqual({ tags: ['x'], language: 'kotlin' });
    expect((db.prepare('SELECT updated_at FROM qe_patterns WHERE id = ?').get('a') as { updated_at: string }).updated_at).toBeTruthy();
    expect(contextOf('b')).toEqual({ curation: 'user-store' });
    expect(applied('a')).toEqual([]);
  });

  it('leaves a row alone when it is no longer curated when written', () => {
    const selection = selectUnmark(db, ['a'], {});
    db.prepare('UPDATE qe_patterns SET context_json = ? WHERE id = ?').run(JSON.stringify({ tags: ['changed'] }), 'a');
    expect(applyUnmark(db, selection.curated)).toEqual([]);
    expect(contextOf('a')).toEqual({ tags: ['changed'] });
  });

  it('reads nothing and fails nothing on a database without the pattern table', () => {
    const empty = new Database(':memory:');
    expect(selectUnmark(empty, ['a'], {})).toEqual({ curated: [], notCurated: [], notFound: ['a'] });
    empty.close();
  });
});

describe('#1426 aqe learning unmark (command)', () => {
  async function run(...args: string[]): Promise<Record<string, unknown>> {
    db.close();
    const program = new Command().exitOverride();
    const learning = program.command('learning');
    registerUnmarkCommand(learning);
    process.exitCode = undefined;
    await program.parseAsync(['node', 'aqe', 'learning', 'unmark', ...args, '--json']);
    db = new Database(state.dbPath);
    return state.json.at(-1) as Record<string, unknown>;
  }

  beforeEach(() => {
    addPattern('a', 'alpha', { curation: 'user-import', tags: ['x'] });
    addPattern('p', 'plain', {});
  });
  afterEach(() => { process.exitCode = undefined; });

  it('is a dry run by default: nothing written, no backup', async () => {
    const before = readFileSync(state.dbPath);
    const out = await run('alpha');
    expect(out).toMatchObject({ dryRun: true, unmarked: [], backupPath: undefined });
    expect((out.curated as Array<{ id: string }>).map((c) => c.id)).toEqual(['a']);
    db.close();
    expect(readFileSync(state.dbPath).equals(before)).toBe(true);
    db = new Database(state.dbPath);
    expect(existsSync(join(dir, '.agentic-qe', 'backups'))).toBe(false);
  });

  it('--apply backs up memory.db, then removes the marker', async () => {
    const out = await run('alpha', '--apply');
    expect(out).toMatchObject({ dryRun: false, unmarked: ['a'] });
    expect(String(out.backupPath)).toMatch(/pre-unmark-.*\.db$/);
    expect(readdirSync(join(dir, '.agentic-qe', 'backups')).some((f) => f.startsWith('pre-unmark-'))).toBe(true);
    const backup = new Database(String(out.backupPath), { readonly: true });
    expect(JSON.parse((backup.prepare('SELECT context_json FROM qe_patterns WHERE id = ?').get('a') as { context_json: string }).context_json))
      .toEqual({ curation: 'user-import', tags: ['x'] });
    backup.close();
    expect(contextOf('a')).toEqual({ tags: ['x'] });
  });

  it('--apply --no-backup writes without a backup; nothing to change writes nothing', async () => {
    const out = await run('plain', '--apply', '--no-backup');
    expect(out).toMatchObject({ unmarked: [], notCurated: ['plain'], backupPath: undefined });
    expect(existsSync(join(dir, '.agentic-qe', 'backups'))).toBe(false);
  });

  it('a name that matches nothing exits with an error code', async () => {
    const out = await run('missing');
    expect(out.notFound).toEqual(['missing']);
    expect(process.exitCode).toBe(1);
  });

  it('rejects names together with --all, no names, and a malformed domain', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const args of [['alpha', '--all'], [], ['alpha', '--domain', '../etc']]) {
      state.json = [];
      await run(...args);
      expect(state.json).toEqual([undefined].slice(1));
      expect(process.exitCode).toBe(1);
    }
    errors.mockRestore();
    expect(contextOf('a')).toEqual({ curation: 'user-import', tags: ['x'] });
  });
});

describe('#1426 curation counts for aqe learning stats', () => {
  it('counts curated patterns by origin, and the revoked ones', () => {
    addPattern('i1', 'imported-1', { curation: 'user-import' });
    addPattern('i2', 'imported-2', { curation: 'user-import' });
    addPattern('s1', 'stored-1', { curation: 'user-store' });
    addPattern('x', 'fake', { curation: 'automatic' });
    addPattern('n', 'plain', { tags: ['curation'] });
    measuredRun('i2', false);
    db.close();

    const counts = curationCountsAt(state.dbPath);

    expect(counts).toEqual({ curated: { 'user-import': 2, 'user-store': 1 }, revoked: 1 });
    expect(formatCurationCounts(counts)).toBe(
      '3 (2 imported, 1 stored with "aqe hooks learn"; 1 not applied (measured failures outweigh successes))',
    );
    db = new Database(state.dbPath);
  });

  it('is zero for a missing database', () => {
    const counts = curationCountsAt(join(dir, 'nope.db'));
    expect(counts.revoked).toBe(0);
    expect(formatCurationCounts(counts)).toBe('0');
  });
});
