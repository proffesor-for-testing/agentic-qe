/**
 * #1422: `aqe learning export` and `export-full` (and the dry runs of
 * `import` and `import-merge`) do not write to memory.db. They used to start
 * the learning system, which seeds patterns into a database it has not seen.
 * #1421: `import` and `import-merge` keep the exported qeDomain, so a round
 * trip into the same database updates rows instead of adding them again.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const mocks = vi.hoisted(() => ({ initializeLearningSystem: vi.fn(), printJson: vi.fn(), getDbPath: vi.fn() }));
vi.mock('../../../../src/cli/commands/learning-helpers.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/cli/commands/learning-helpers.js')>(),
  initializeLearningSystem: mocks.initializeLearningSystem,
  printJson: mocks.printJson,
  getDbPath: mocks.getDbPath,
}));

import { createLearningCommand } from '../../../../src/cli/commands/learning.js';
import { importedDomain, readPatternsReadOnly } from '../../../../src/cli/commands/learning-export-read.js';

const dir = mkdtempSync(join(tmpdir(), 'aqe-1421-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SCHEMA = `
  CREATE TABLE qe_patterns (
    id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL, domain TEXT NOT NULL,
    name TEXT NOT NULL, description TEXT, confidence REAL DEFAULT 0.5, usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0, quality_score REAL DEFAULT 0, tier TEXT DEFAULT 'short-term',
    template_json TEXT, context_json TEXT, created_at TEXT DEFAULT '2026-11-01T00:00:00.000Z',
    last_used_at TEXT, successful_uses INTEGER DEFAULT 0
  );
  CREATE TABLE qe_pattern_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, success INTEGER NOT NULL, metrics_json TEXT, feedback TEXT
  );`;

/** A pattern whose type alone would put it in test-generation, stored in coverage-analysis. */
const ROWS = [
  { id: 'p1', type: 'test-template', domain: 'coverage-analysis', name: 'Coverage gap template', quality: 0.9 },
  { id: 'p2', type: 'test-template', domain: 'test-generation', name: 'AAA Unit Test', quality: 0.5 },
];

function projectDb(): string {
  const file = join(dir, `memory-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(file);
  db.exec(SCHEMA);
  const insert = db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, quality_score, template_json, context_json)
                             VALUES (?, ?, ?, ?, ?, 'd', ?, '{"type":"code","content":"x","variables":[]}', '{"tags":[]}')`);
  for (const r of ROWS) insert.run(r.id, r.type, r.domain, r.domain, r.name, r.quality);
  db.close();
  return file;
}

const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const run = (args: string[]) => createLearningCommand().exitOverride().parseAsync(['node', 'learning', ...args]);
const noLearningSystem = () => mocks.initializeLearningSystem.mockRejectedValue(new Error('learning system must not start'));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('export does not write to memory.db (#1422)', () => {
  it.each(['export', 'export-full'])('%s reads the patterns without starting the learning system', async (command) => {
    const db = projectDb();
    mocks.getDbPath.mockReturnValue(db);
    noLearningSystem();
    const before = digest(db);
    const out = join(dir, `${command}.json`);

    await run([command, '-o', out]);

    expect(mocks.initializeLearningSystem).not.toHaveBeenCalled();
    expect(digest(db)).toBe(before);
    const exported = JSON.parse(readFileSync(out, 'utf8')) as { patterns: Array<{ name: string; qeDomain: string }> };
    expect(exported.patterns.map(p => [p.name, p.qeDomain])).toEqual([
      ['Coverage gap template', 'coverage-analysis'], ['AAA Unit Test', 'test-generation'],
    ]);
  });

  it('export --domain filters by the stored domain', async () => {
    mocks.getDbPath.mockReturnValue(projectDb());
    const out = join(dir, 'domain.json');
    await run(['export', '-o', out, '--domain', 'coverage-analysis']);
    expect((JSON.parse(readFileSync(out, 'utf8')) as { patterns: unknown[] }).patterns).toHaveLength(1);
  });

  it('reads nothing, and creates nothing, when there is no database or no pattern table', () => {
    const missing = join(dir, 'missing.db');
    expect(readPatternsReadOnly(missing)).toEqual([]);
    expect(existsSync(missing)).toBe(false);
    const empty = join(dir, 'empty.db');
    new Database(empty).close();
    expect(readPatternsReadOnly(empty)).toEqual([]);
  });

  it.each([['import'], ['import-merge']])('%s --dry-run does not start the learning system', async (command) => {
    const db = projectDb();
    mocks.getDbPath.mockReturnValue(db);
    noLearningSystem();
    const file = join(dir, `dry-${command}.json`);
    writeFileSync(file, JSON.stringify({ patterns: [{ name: 'n', patternType: 'test-template', qeDomain: 'coverage-analysis', description: 'd', template: {} }] }));
    const before = digest(db);

    await run([command, '-i', file, '--dry-run', '--json']);

    expect(mocks.initializeLearningSystem).not.toHaveBeenCalled();
    expect(digest(db)).toBe(before);
  });
});

describe('import keeps the exported domain (#1421)', () => {
  it('accepts only real QE domains', () => {
    expect(importedDomain('coverage-analysis')).toBe('coverage-analysis');
    expect(importedDomain('not-a-domain')).toBeUndefined();
    expect(importedDomain(undefined)).toBeUndefined();
    expect(importedDomain(42)).toBeUndefined();
  });

  it.each([['import'], ['import-merge']])('%s passes qeDomain to storePattern', async (command) => {
    const storePattern = vi.fn(async () => ({ success: true as const, value: { id: 'x', embedding: [0.1] } }));
    mocks.initializeLearningSystem.mockResolvedValue({ storePattern });
    mocks.getDbPath.mockReturnValue(projectDb());
    const file = join(dir, `domains-${command}.json`);
    writeFileSync(file, JSON.stringify({ patterns: [
      { name: 'kept', patternType: 'test-template', qeDomain: 'coverage-analysis', description: 'd', template: {} },
      { name: 'derived', patternType: 'test-template', qeDomain: 'bogus', description: 'd', template: {} },
    ] }));

    await run([command, '-i', file, '--json']);

    expect(storePattern.mock.calls.map(([o]) => [(o as { name: string }).name, (o as { qeDomain?: string }).qeDomain]))
      .toEqual([['kept', 'coverage-analysis'], ['derived', undefined]]);
  });
});
