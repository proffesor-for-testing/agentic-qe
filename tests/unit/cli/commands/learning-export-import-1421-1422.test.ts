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
import { ImportTargets, importedDomain, readPatternsReadOnly } from '../../../../src/cli/commands/learning-export-read.js';

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
  // Agent and hook paths store domains outside the QE domain list.
  { id: 'p3', type: 'workflow', domain: 'general', name: 'coder-general-2026-10', quality: 0.3, tier: 'long-term', confidence: 0.99 },
];

function projectDb(): string {
  const file = join(dir, `memory-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(file);
  db.exec(SCHEMA);
  const insert = db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, quality_score, tier, confidence, template_json, context_json)
                             VALUES (?, ?, ?, ?, ?, 'd', ?, ?, ?, '{"type":"code","content":"x","variables":[]}', '{"tags":[]}')`);
  for (const r of ROWS) insert.run(r.id, r.type, r.domain, r.domain, r.name, r.quality, r.tier ?? 'short-term', r.confidence ?? 0.5);
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
      ['Coverage gap template', 'coverage-analysis'], ['AAA Unit Test', 'test-generation'], ['coder-general-2026-10', 'general'],
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
  it('accepts any domain name, including ones outside the QE domain list', () => {
    expect(importedDomain('coverage-analysis')).toBe('coverage-analysis');
    expect(importedDomain('general')).toBe('general');
    expect(importedDomain('Not A Domain!')).toBeUndefined();
    expect(importedDomain('')).toBeUndefined();
    expect(importedDomain(undefined)).toBeUndefined();
    expect(importedDomain(42)).toBeUndefined();
  });

  it('matches existing rows by name, domain and type, and keeps their tier and confidence', () => {
    const targets = new ImportTargets(readPatternsReadOnly(projectDb()));
    expect(targets.resolve('coder-general-2026-10', 'workflow', 'general'))
      .toEqual({ qeDomain: 'general', exists: true, tier: 'long-term', confidence: 0.99 });
    // Same name in another domain is another row.
    expect(targets.resolve('coder-general-2026-10', 'workflow', 'test-generation')).toEqual({ qeDomain: 'test-generation', exists: false });
    // An older export without a domain matches the single row with that name and type.
    expect(targets.resolve('Coverage gap template', 'test-template', undefined))
      .toEqual({ qeDomain: 'coverage-analysis', exists: true, tier: 'short-term', confidence: 0.5 });
    expect(targets.resolve('new pattern', 'test-template', 'coverage-analysis')).toEqual({ qeDomain: 'coverage-analysis', exists: false });
  });

  it('leaves a name and type that match several rows to the derived domain', () => {
    const db = projectDb();
    const raw = new Database(db);
    raw.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name) VALUES ('p4', 'test-template', 'test-execution', 'test-execution', 'AAA Unit Test')`).run();
    raw.close();
    expect(new ImportTargets(readPatternsReadOnly(db)).resolve('AAA Unit Test', 'test-template', undefined)).toEqual({ qeDomain: undefined, exists: false });
  });

  it.each([['import'], ['import-merge']])('%s passes the domain, and an existing row\'s tier and confidence, to storePattern', async (command) => {
    const storePattern = vi.fn(async () => ({ success: true as const, value: { id: 'x', embedding: [0.1] } }));
    mocks.initializeLearningSystem.mockResolvedValue({ storePattern });
    mocks.getDbPath.mockReturnValue(projectDb());
    const file = join(dir, `domains-${command}.json`);
    writeFileSync(file, JSON.stringify({ patterns: [
      { name: 'coder-general-2026-10', patternType: 'workflow', qeDomain: 'general', tier: 'short-term', confidence: 0.1, description: 'd', template: {} },
      { name: 'new one', patternType: 'test-template', qeDomain: 'coverage-analysis', tier: 'long-term', confidence: 1, description: 'd', template: {} },
      { name: 'derived', patternType: 'test-template', qeDomain: 'Bogus Domain', description: 'd', template: {} },
    ] }));

    await run([command, '-i', file, '--json']);

    const pick = (o: Record<string, unknown>) => [o.name, o.qeDomain, o.tier, o.confidence];
    expect(storePattern.mock.calls.map(([o]) => pick(o as Record<string, unknown>))).toEqual([
      // updates keep the row's own tier and confidence, not the file's
      ['coder-general-2026-10', 'general', 'long-term', 0.99],
      // a new row starts short-term at the default confidence, whatever the file says
      ['new one', 'coverage-analysis', undefined, undefined],
      ['derived', undefined, undefined, undefined],
    ]);
  });

  it('import-merge counts an update only for a row with the same name, domain and type', async () => {
    mocks.initializeLearningSystem.mockResolvedValue({ storePattern: vi.fn(async () => ({ success: true as const, value: { id: 'x', embedding: [0.1] } })) });
    mocks.getDbPath.mockReturnValue(projectDb());
    const file = join(dir, 'merge-counts.json');
    writeFileSync(file, JSON.stringify({ patterns: [
      { name: 'coder-general-2026-10', patternType: 'workflow', qeDomain: 'general', description: 'd', template: {} },
      { name: 'coder-general-2026-10', patternType: 'workflow', qeDomain: 'test-generation', description: 'd', template: {} },
    ] }));

    await run(['import-merge', '-i', file, '--json']);

    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({ imported: 1, updated: 1, skipped: 0 }));
  });
});

describe('PatternStore.create keeps a passed tier (#1421)', () => {
  it('stores the tier an import passes for an existing row', async () => {
    const { PatternStore } = await import('../../../../src/learning/pattern-store.js');
    const memory = { get: vi.fn(async () => undefined), set: vi.fn(async () => {}), delete: vi.fn(async () => true), search: vi.fn(async () => []), has: vi.fn(async () => false) };
    const store = new PatternStore(memory as never, { enableHNSW: false } as never);
    const created = await store.create({
      patternType: 'workflow', name: 'kept', description: 'd', template: { type: 'code', content: 'x', variables: [] },
      qeDomain: 'general' as never, tier: 'long-term', confidence: 0.99,
    });
    expect(created.success && created.value).toMatchObject({ tier: 'long-term', confidence: 0.99, qeDomain: 'general' });
    const defaults = await store.create({ patternType: 'workflow', name: 'new', description: 'd', template: { type: 'code', content: 'x', variables: [] } });
    expect(defaults.success && defaults.value.tier).toBe('short-term');
  });
});
